from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
from services.codebeamer_service import get_codebeamer_service
import re

router = APIRouter(prefix="/api/codebeamer", tags=["codebeamer"])

@router.get("/testcase/{item_id}")
async def get_test_case(item_id: int):
    service = get_codebeamer_service()
    if not service:
        raise HTTPException(status_code=503, detail="CodeBeamer service not configured")
    
    item = service.get_item_safe(item_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Test case {item_id} not found or access denied")
    
    def clean_html(text):
        if not text or not isinstance(text, str):
            return ""
        return re.sub(r'<[^>]+>', '', text).strip()

    name = item.get("name", "")
    description = clean_html(item.get("description", ""))
    precondition = clean_html(item.get("preAction", ""))
    
    steps_list = []
    expected_list = []
    if "testSteps" in item:
        for i, step in enumerate(item.get("testSteps", []), 1):
            action = clean_html(step.get("action", ""))
            result = clean_html(step.get("expectedResult", ""))
            step_str = f"{i}. {action}"
            if result:
                step_str += f"\n   Expected: {result}"
                expected_list.append(f"{i}. {result}")
            steps_list.append(step_str)
    
    steps_str = "\n".join(steps_list)
    expected_str = "\n".join(expected_list)
    
    return {
        "id": item.get("id"),
        "name": name,
        "description": description,
        "status": item.get("status", {}).get("name", "Unknown"),
        "precondition": precondition,
        "steps": steps_str,
        "expected": expected_str
    }
