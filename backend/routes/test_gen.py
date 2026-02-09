"""
Test Generation Routes - API endpoints for Robot Framework test generation
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from pathlib import Path

from services.llm_service import llm_service

from services.test_generator import test_generator
from services.agent_service import agent_service
from services.markdown_service import markdown_service
from services.codebeamer_service import get_codebeamer_service


router = APIRouter(prefix="/api/test", tags=["Test Generation"])


class GenerateTestRequest(BaseModel):
    test_name: str
    description: str
    test_type: str = "generic"  # can, uart, dlt, hmi, generic
    parameters: Dict[str, Any] = {}
    libraries: Optional[List[str]] = None
    resource_path: str = "common_resources.robot"
    tags: Optional[List[str]] = None
    use_ai: bool = False  # Use AI to enhance test generation


class GenerateFromDescriptionRequest(BaseModel):
    description: str
    test_type: str = "generic"
    additional_context: Optional[str] = None


class ReviewTestRequest(BaseModel):
    test_code: str
    focus_areas: Optional[List[str]] = None
    model: Optional[str] = None


class ImproveTestRequest(BaseModel):
    test_code: str
    improvement_request: str
    model: Optional[str] = None


def configure_llm_for_model(model_id: str):
    """Configure LLM service based on model ID from frontend"""
    if model_id == 'exacode':
        try:
            from config import settings
            if not settings.exacode_api_key:
                raise ValueError("EXACODE API key not configured. Set it in Configuration tab.")
            llm_service.configure(
                provider="exacode",
                api_key=settings.exacode_api_key,
                base_url=settings.exacode_base_url,
                model=settings.exacode_model
            )
        except Exception as e:
            raise ValueError(f"EXACODE not configured: {str(e)}")
    elif model_id == 'ollama-llama3':
        llm_service.configure(
            provider="ollama",
            base_url="http://localhost:11434",
            model="llama3:8b"
        )
    elif model_id == 'ollama-qwen3':
        llm_service.configure(
            provider="ollama",
            base_url="http://localhost:11434",
            model="qwen3:8b"
        )
    else:
        llm_service.configure(
            provider="ollama",
            base_url="http://localhost:11434",
            model="llama3:8b"
        )


class TestResponse(BaseModel):
    test_code: str
    validation: Dict[str, Any]


class ReviewResponse(BaseModel):
    feedback: str
    suggestions: List[str]


class SaveFileRequest(BaseModel):
    folder_path: str
    filename: str
    content: str


@router.get("/templates")
async def get_templates():
    """Get available test templates"""
    return {
        "templates": test_generator.get_available_templates(),
        "description": {
            "CAN": "CAN bus communication tests",
            "UART": "UART/Serial protocol tests",
            "DLT": "DLT logging verification tests",
            "HMI": "HMI/UI interaction tests",
            "Generic": "Generic test template"
        }
    }


@router.post("/generate", response_model=TestResponse)
async def generate_test(request: GenerateTestRequest):
    """Generate Robot Framework test from parameters"""
    try:
        test_code = test_generator.generate_test(
            test_type=request.test_type,
            test_name=request.test_name,
            description=request.description,
            parameters=request.parameters,
            libraries=request.libraries,
            resource_path=request.resource_path,
            tags=request.tags
        )
        
        # Optionally enhance with AI
        if request.use_ai:
            try:
                enhanced = await agent_service.improve_test(
                    test_code,
                    "Enhance this test with better assertions and edge case handling"
                )
                test_code = enhanced
            except Exception:
                # If AI enhancement fails, use original
                pass
        
        validation = test_generator.validate_test(test_code)
        
        return TestResponse(test_code=test_code, validation=validation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-ai")
async def generate_test_ai(request: GenerateFromDescriptionRequest):
    """Generate test using AI from natural language description"""
    try:
        test_code = await agent_service.generate_test(
            request.description,
            request.test_type,
            request.additional_context
        )
        
        validation = test_generator.validate_test(test_code)
        
        return TestResponse(test_code=test_code, validation=validation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/review")
async def review_test(request: ReviewTestRequest):
    """Review test code and provide feedback"""
    try:
        # Configure LLM based on selected model
        model_id = request.model or 'ollama-llama3'
        configure_llm_for_model(model_id)
        
        feedback = await agent_service.review_test(
            request.test_code,
            request.focus_areas
        )
        
        # Extract suggestions from feedback
        suggestions = []
        lines = feedback.split('\n')
        for line in lines:
            if line.strip().startswith('-') or line.strip().startswith('•'):
                suggestions.append(line.strip()[1:].strip())
        
        return ReviewResponse(feedback=feedback, suggestions=suggestions)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/improve")
async def improve_test(request: ImproveTestRequest):
    """Improve test code based on request"""
    try:
        # Configure LLM based on selected model
        model_id = request.model or 'ollama-llama3'
        configure_llm_for_model(model_id)
        
        improved_code = await agent_service.improve_test(
            request.test_code,
            request.improvement_request
        )
        
        validation = test_generator.validate_test(improved_code)
        
        return TestResponse(test_code=improved_code, validation=validation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate")
async def validate_test(request: ReviewTestRequest):
    """Validate Robot Framework test syntax"""
    validation = test_generator.validate_test(request.test_code)
    return validation


@router.post("/import-markdown")
async def import_markdown(file: UploadFile = File(...)):
    """Import markdown file and extract test resources"""
    try:
        content = await file.read()
        content_str = content.decode('utf-8')
        
        parsed = markdown_service.load_content(content_str, file.filename)
        
        return {
            "filename": file.filename,
            "prompts": parsed.get('prompts', []),
            "libraries": parsed.get('libraries', []),
            "resources": parsed.get('resources', []),
            "keywords": parsed.get('keywords', []),
            "code_blocks": len(parsed.get('code_blocks', []))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codebeamer/test-cases/{tracker_id}")
async def get_codebeamer_test_cases(tracker_id: int):
    """Get test cases from CodeBeamer tracker"""
    service = get_codebeamer_service()
    if not service:
        raise HTTPException(
            status_code=400,
            detail="CodeBeamer not configured. Please configure in Settings."
        )
    
    try:
        test_cases = service.get_test_cases(tracker_id)
        return {"tracker_id": tracker_id, "test_cases": test_cases}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codebeamer/item/{item_id}")
async def get_codebeamer_item(item_id: int):
    """Get single item from CodeBeamer"""
    service = get_codebeamer_service()
    if not service:
        raise HTTPException(
            status_code=400,
            detail="CodeBeamer not configured"
        )
    
    try:
        item = service.get_item(item_id)
        return item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codebeamer/testcase/{tc_id}")
async def get_codebeamer_testcase_by_id(tc_id: str):
    """Get test case from CodeBeamer by Test Case ID string (e.g., TC-001)"""
    service = get_codebeamer_service()
    if not service:
        raise HTTPException(
            status_code=400,
            detail="CodeBeamer not configured. Please configure in Config tab."
        )
    
    try:
        # Search for test case by ID pattern
        test_case = service.search_by_name(tc_id)
        if test_case:
            return {
                "id": tc_id,
                "name": test_case.get("name", ""),
                "feature": test_case.get("feature", test_case.get("parent", {}).get("name", "")),
                "precondition": test_case.get("precondition", ""),
                "steps": test_case.get("testSteps", test_case.get("description", "")),
                "expected": test_case.get("expectedResult", ""),
                "priority": test_case.get("priority", {}).get("name", ""),
                "status": test_case.get("status", {}).get("name", "")
            }
        return {"id": tc_id, "name": tc_id, "error": "Test case not found in CodeBeamer"}
    except Exception as e:
        # Return basic structure even on error so generation can continue
        return {"id": tc_id, "name": tc_id, "error": str(e)}


class DryRunRequest(BaseModel):
    test_code: str


@router.post("/dry-run")
async def dry_run_test(request: DryRunRequest):
    """Perform dry-run validation of Robot Framework test syntax"""
    try:
        validation = test_generator.validate_test(request.test_code)
        
        # More detailed syntax checking
        errors = []
        warnings = []
        
        lines = request.test_code.split('\n')
        has_settings = False
        has_test_cases = False
        has_keywords = False
        
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            
            # Check for section headers
            if stripped.startswith('*** Settings ***'):
                has_settings = True
            elif stripped.startswith('*** Test Cases ***'):
                has_test_cases = True
            elif stripped.startswith('*** Keywords ***'):
                has_keywords = True
            
            # Check for common issues
            if stripped.startswith('[') and not stripped.endswith(']'):
                if ']' not in stripped:
                    errors.append(f"Line {i}: Unclosed bracket in '{stripped[:30]}...'")
            
            # Check indentation (Robot Framework uses 2+ spaces)
            if line and not line.startswith(' ') and not line.startswith('*') and not line.startswith('#'):
                if not stripped.startswith('[') and stripped and not stripped.startswith('$'):
                    # Could be a test case name which is OK
                    pass
        
        if not has_test_cases and '*** Test Cases ***' not in request.test_code:
            warnings.append("Missing *** Test Cases *** section")
        
        success = len(errors) == 0 and validation.get("valid", True)
        
        return {
            "success": success,
            "output": "Syntax validation complete.\n" + 
                      f"Settings section: {'Found' if has_settings else 'Not found'}\n" +
                      f"Test Cases section: {'Found' if has_test_cases else 'Not found'}\n" +
                      f"Keywords section: {'Found' if has_keywords else 'Not found'}",
            "errors": errors + validation.get("errors", []),
            "warnings": warnings + validation.get("warnings", [])
        }
    except Exception as e:
        return {
            "success": False,
            "output": f"Validation error: {str(e)}",
            "errors": [str(e)],
            "warnings": []
        }


@router.post("/save-file")
async def save_test_file(request: SaveFileRequest):
    """Save generated test file to specified folder"""
    try:
        folder = Path(request.folder_path)
        
        # Create folder if not exists
        if not folder.exists():
            folder.mkdir(parents=True, exist_ok=True)
        
        if not folder.is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {request.folder_path}")
        
        # Sanitize filename
        filename = request.filename.replace('/', '_').replace('\\', '_')
        if not filename.endswith('.robot'):
            filename += '.robot'
        
        file_path = folder / filename
        
        # Write file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)
        
        return {
            "success": True,
            "file_path": str(file_path),
            "message": f"Saved to {file_path}"
        }
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: Cannot write to {request.folder_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

