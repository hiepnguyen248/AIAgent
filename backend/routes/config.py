"""
Config Routes - API endpoints for application configuration
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal

from config import get_settings, update_settings
from services.llm_service import llm_service
from services.codebeamer_service import configure_codebeamer, get_codebeamer_service


router = APIRouter(prefix="/api/config", tags=["Configuration"])


class LLMConfigRequest(BaseModel):
    provider: Literal["exacode", "ollama"]
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


class CodeBeamerConfigRequest(BaseModel):
    url: str
    username: str
    password: str
    ssl_verify: bool = True


class ConfigResponse(BaseModel):
    success: bool
    message: str


@router.get("/current")
async def get_current_config():
    """Get current configuration (without sensitive data)"""
    settings = get_settings()
    return {
        "llm": {
            "provider": settings.llm_provider,
            "exacode": {
                "base_url": settings.exacode_base_url,
                "model": settings.exacode_model,
                "configured": bool(settings.exacode_api_key)
            },
            "ollama": {
                "base_url": settings.ollama_base_url,
                "model": settings.ollama_model
            }
        },
        "codebeamer": {
            "url": settings.codebeamer_url,
            "configured": bool(settings.codebeamer_username and settings.codebeamer_password),
            "ssl_verify": settings.codebeamer_ssl_verify
        }
    }


@router.post("/llm", response_model=ConfigResponse)
async def configure_llm(config: LLMConfigRequest):
    """Configure LLM provider"""
    try:
        settings = get_settings()
        
        if config.provider == "exacode":
            update_settings(
                llm_provider="exacode",
                exacode_api_key=config.api_key or settings.exacode_api_key,
                exacode_base_url=config.base_url or settings.exacode_base_url,
                exacode_model=config.model or settings.exacode_model
            )
            llm_service.configure(
                provider="exacode",
                api_key=config.api_key or settings.exacode_api_key,
                base_url=config.base_url or settings.exacode_base_url,
                model=config.model or settings.exacode_model
            )
        elif config.provider == "ollama":
            update_settings(
                llm_provider="ollama",
                ollama_base_url=config.base_url or settings.ollama_base_url,
                ollama_model=config.model or settings.ollama_model
            )
            llm_service.configure(
                provider="ollama",
                base_url=config.base_url or settings.ollama_base_url,
                model=config.model or settings.ollama_model
            )
        
        return ConfigResponse(success=True, message=f"LLM configured: {config.provider}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/codebeamer", response_model=ConfigResponse)
async def configure_codebeamer_endpoint(config: CodeBeamerConfigRequest):
    """Configure CodeBeamer connection"""
    try:
        update_settings(
            codebeamer_url=config.url,
            codebeamer_username=config.username,
            codebeamer_password=config.password,
            codebeamer_ssl_verify=config.ssl_verify
        )
        
        configure_codebeamer(
            url=config.url,
            username=config.username,
            password=config.password,
            ssl_verify=config.ssl_verify
        )
        
        return ConfigResponse(success=True, message="CodeBeamer configured successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TestLLMRequest(BaseModel):
    provider: Literal["exacode", "ollama"]
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


@router.post("/test-llm")
async def test_llm_connection(config: TestLLMRequest):
    """Test LLM connection with provided config (fresh test, not cached)"""
    import httpx
    
    try:
        if config.provider == "exacode":
            # EXACODE requires API key
            if not config.api_key:
                return {
                    "success": False,
                    "error": "API key is required for EXACODE",
                    "provider": "exacode"
                }
            
            base_url = (config.base_url or "http://exacode-chat.lge.com/v1").rstrip('/')
            model = config.model or "Chat-EXACODE-A"
            
            # Test actual API call
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        'Authorization': f'Bearer {config.api_key}',
                        'Content-Type': 'application/json',
                        'X-Title': 'AI Automation Hub',
                        'X-Model': model
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Hello"}],
                        "stream": False
                    }
                )
                
                if response.status_code == 200:
                    return {
                        "success": True,
                        "message": f"Connected! Model \"{model}\" is ready.",
                        "provider": "exacode"
                    }
                elif response.status_code == 401:
                    return {
                        "success": False,
                        "error": "Invalid API key (401 Unauthorized)",
                        "provider": "exacode"
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Connection failed: HTTP {response.status_code}",
                        "provider": "exacode"
                    }
                    
        elif config.provider == "ollama":
            base_url = (config.base_url or "http://localhost:11434").rstrip('/')
            model = config.model or "llama3:8b"
            
            # Test Ollama connection
            async with httpx.AsyncClient(timeout=30.0) as client:
                # First check if Ollama is running
                try:
                    tags_response = await client.get(f"{base_url}/api/tags")
                    if tags_response.status_code != 200:
                        return {
                            "success": False,
                            "error": "Ollama server not responding",
                            "provider": "ollama"
                        }
                except Exception:
                    return {
                        "success": False,
                        "error": "Cannot connect to Ollama. Is it running?",
                        "provider": "ollama"
                    }
                
                # Test chat endpoint
                response = await client.post(
                    f"{base_url}/api/chat",
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Hi"}],
                        "stream": False
                    }
                )
                
                if response.status_code == 200:
                    return {
                        "success": True,
                        "message": f"Connected! Model \"{model}\" is ready.",
                        "provider": "ollama"
                    }
                else:
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("error", f"HTTP {response.status_code}")
                    return {
                        "success": False,
                        "error": f"Model error: {error_msg}",
                        "provider": "ollama"
                    }
        else:
            return {
                "success": False,
                "error": f"Unknown provider: {config.provider}",
                "provider": config.provider
            }
            
    except httpx.TimeoutException:
        return {
            "success": False,
            "error": "Connection timeout - server not responding",
            "provider": config.provider
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "provider": config.provider
        }


@router.post("/test-codebeamer")
async def test_codebeamer_connection():
    """Test CodeBeamer connection"""
    service = get_codebeamer_service()
    if not service:
        return {
            "success": False,
            "error": "CodeBeamer not configured"
        }
    
    try:
        projects = service.list_projects(page_size=1)
        if isinstance(projects, dict) and projects.get('error'):
            return {
                "success": False,
                "error": projects.get('message', 'Unknown error')
            }
        return {
            "success": True,
            "message": "Connection successful",
            "stats": service.get_stats()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/ollama/models")
async def get_ollama_models():
    """Get available Ollama models"""
    import httpx
    settings = get_settings()
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m.get('name', '') for m in data.get('models', [])]
                return {"models": models}
            return {"models": [], "error": "Failed to fetch models"}
    except Exception as e:
        return {"models": [], "error": str(e)}
