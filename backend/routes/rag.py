"""
RAG Routes - API endpoints for RAG document management and search
Supports multi-format uploads: MD, TXT, PDF, HTML, JSON
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.rag_service import get_rag_service, RAGService

router = APIRouter(prefix="/api/rag", tags=["rag"])

# Supported file extensions
SUPPORTED_EXTENSIONS = {'.md', '.txt', '.pdf', '.html', '.htm', '.json', '.robot', '.resource', '.py'}


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    filter_type: Optional[str] = None


class IndexTestCaseRequest(BaseModel):
    tc_id: str
    tc_data: dict


class IndexTextRequest(BaseModel):
    content: str
    source_name: str


class IndexFolderRequest(BaseModel):
    folder_path: str
    extensions: list[str] | None = None
    recursive: bool = True


class IndexPathsRequest(BaseModel):
    paths: list[str]  # List of file or folder paths
    extensions: list[str] | None = None


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload and index a document (supports MD, TXT, PDF, HTML, JSON)"""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    # Validate file extension
    filename = file.filename or "unknown.txt"
    ext = '.' + filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    try:
        file_bytes = await file.read()
        file_type = RAGService._detect_file_type(filename)

        if file_type == 'pdf':
            # PDF is binary, pass bytes directly
            result = await rag.index_document_async(file_bytes, filename, file_type='pdf')
        else:
            # Text-based formats, decode to string
            text = file_bytes.decode('utf-8')
            result = await rag.index_document_async(text, filename, file_type=file_type)

        return result
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File encoding error. Please ensure the file is UTF-8 encoded.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index-text")
async def index_text(request: IndexTextRequest):
    """Index raw text/markdown content"""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    try:
        result = await rag.index_markdown_async(request.content, request.source_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index-testcase")
async def index_test_case(request: IndexTestCaseRequest):
    """Index a CodeBeamer test case"""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    try:
        result = await rag.index_test_case_async(request.tc_id, request.tc_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search(request: SearchRequest):
    """Search indexed documents"""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    try:
        results = await rag.search_async(request.query, request.top_k)
        return {
            "query": request.query,
            "results": [
                {
                    "content": r.content,
                    "metadata": r.metadata,
                    "score": round(1 - r.score, 4) if r.score < 1 else 0
                }
                for r in results
            ],
            "count": len(results)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents")
async def list_documents():
    """List all indexed documents"""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    try:
        docs = rag.get_documents()
        return {"documents": docs, "count": len(docs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{source_name:path}")
async def delete_document(source_name: str):
    """Delete a document by source name"""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    try:
        result = rag.delete_document(source_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats():
    """Get RAG service statistics"""
    rag = get_rag_service()
    if not rag:
        return {
            "initialized": False,
            "total_chunks": 0,
            "total_documents": 0,
            "documents": [],
            "supported_formats": list(SUPPORTED_EXTENSIONS)
        }

    try:
        stats = rag.get_stats()
        stats["initialized"] = True
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear")
async def clear_all():
    """Clear all indexed data"""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    try:
        rag.clear_all()
        return {"status": "cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index-paths")
async def index_paths(request: IndexPathsRequest):
    """Index a list of paths (files or folders) into RAG knowledge base.
    Each path is auto-detected: files are indexed directly, folders are scanned recursively."""
    rag = get_rag_service()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG service not initialized")

    if not request.paths:
        raise HTTPException(status_code=400, detail="No paths provided")

    try:
        result = await rag.index_paths_async(
            paths=request.paths,
            extensions=request.extensions
        )

        if result.get('error'):
            raise HTTPException(status_code=400, detail=result['error'])

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
