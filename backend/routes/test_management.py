"""
Test Management Routes - API endpoints for managing generated test scripts
"""
import os
import json
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

router = APIRouter(prefix="/api/tests", tags=["Test Management"])


class SaveTestRequest(BaseModel):
    filename: str
    content: str
    folder_path: str
    metadata: Optional[Dict[str, Any]] = None


class TestFileInfo(BaseModel):
    filename: str
    path: str
    size: int
    modified: str
    test_type: Optional[str] = None


@router.get("/saved")
async def list_saved_tests(folder: Optional[str] = None):
    """List all saved .robot test files in the specified folder"""
    search_folder = folder or os.getcwd()
    
    try:
        p = Path(search_folder)
        if not p.exists():
            return {"files": [], "folder": search_folder, "error": "Folder not found"}
        
        robot_files = []
        for f in p.rglob("*.robot"):
            stat = f.stat()
            robot_files.append({
                "filename": f.name,
                "path": str(f),
                "relative_path": str(f.relative_to(p)),
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
        
        # Sort by modified date (newest first)
        robot_files.sort(key=lambda x: x["modified"], reverse=True)
        
        return {
            "files": robot_files,
            "folder": search_folder,
            "count": len(robot_files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file")
async def read_test_file(path: str):
    """Read content of a specific .robot test file"""
    try:
        p = Path(path)
        if not p.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        if not p.suffix == ".robot":
            raise HTTPException(status_code=400, detail="Only .robot files are supported")
        
        content = p.read_text(encoding="utf-8")
        return {
            "filename": p.name,
            "path": str(p),
            "content": content,
            "size": len(content)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/file")
async def delete_test_file(path: str):
    """Delete a specific .robot test file"""
    try:
        p = Path(path)
        if not p.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        if not p.suffix == ".robot":
            raise HTTPException(status_code=400, detail="Only .robot files can be deleted")
        
        p.unlink()
        return {"deleted": True, "path": str(p)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
