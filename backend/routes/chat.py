"""
Chat Routes - API endpoints for AI chat functionality
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json

from services.agent_service import agent_service
from services.llm_service import llm_service


router = APIRouter(prefix="/api/chat", tags=["Chat"])


class ChatRequest(BaseModel):
    message: str
    session_id: str
    model: Optional[str] = None  # Model selection from frontend
    context: Optional[str] = None
    stream: bool = False
    mode: str = "chat"           # "chat" | "req_tc" | "test_script"
    use_rag: bool = True         # RAG toggle
    deep: bool = False           # Deep mode (multi-step reasoning)


class ChatResponse(BaseModel):
    response: str
    session_id: str
    model_used: Optional[str] = None


class HistoryResponse(BaseModel):
    session_id: str
    messages: List[Dict[str, str]]


def configure_llm_for_model(model_id: str):
    """Configure LLM service based on model ID from frontend"""
    if model_id == 'exacode':
        # Check if EXACODE is properly configured
        try:
            from config import settings
            if not settings.exacode_api_key:
                raise ValueError("EXACODE API key not configured. Please set it in Configuration tab.")
            llm_service.configure(
                provider="exacode",
                api_key=settings.exacode_api_key,
                base_url=settings.exacode_base_url,
                model=settings.exacode_model
            )
        except Exception as e:
            raise ValueError(f"EXACODE not configured: {str(e)}")
    elif model_id == 'ollama-gemma4':
        from config import settings
        llm_service.configure(
            provider="ollama",
            base_url=settings.ollama_base_url,
            model="gemma4:latest"
        )
    elif model_id == 'ollama-llama3':
        from config import settings
        llm_service.configure(
            provider="ollama",
            base_url=settings.ollama_base_url,
            model="llama3:8b"
        )
    elif model_id == 'ollama-qwen3':
        from config import settings
        llm_service.configure(
            provider="ollama",
            base_url=settings.ollama_base_url,
            model="qwen3:8b"
        )
    else:
        # Default to Gemma 4
        from config import settings
        llm_service.configure(
            provider="ollama",
            base_url=settings.ollama_base_url,
            model="gemma4:latest"
        )


@router.post("/send", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """Send a chat message and get response (supports mode, RAG toggle, deep mode)"""
    try:
        # Configure LLM based on selected model
        model_id = request.model or 'ollama-gemma4'
        configure_llm_for_model(model_id)
        
        # Deep mode: use multi-step pipeline (non-streaming)
        if request.deep and request.mode in ('req_tc', 'test_script'):
            from services.deep_generation_service import deep_service
            
            # Get RAG context if enabled
            rag_context = ""
            if request.use_rag:
                try:
                    from services.rag_service import get_rag_service
                    rag = get_rag_service()
                    if rag:
                        rag_context = rag.search_formatted(request.message, top_k=10)
                except Exception:
                    pass
            
            result = await deep_service.generate_deep(
                input_text=request.message,
                mode=request.mode,
                rag_context=rag_context,
            )
            
            # Log usage
            _log_usage("deep_generate", model_id, request.mode)
            
            return ChatResponse(
                response=result.output,
                session_id=request.session_id,
                model_used=model_id
            )
        
        # Map mode to agent type
        agent_type = _mode_to_agent_type(request.mode)
        
        if request.stream:
            # Return streaming response
            async def generate():
                async for chunk in agent_service.stream_chat(
                    request.message,
                    request.session_id,
                    request.context,
                    use_rag=request.use_rag,
                    mode=agent_type,
                ):
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                yield "data: [DONE]\n\n"
                
                # Log usage
                _log_usage("chat_stream", model_id, request.mode)
            
            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "X-Accel-Buffering": "no",
                    "Transfer-Encoding": "chunked",
                    "Content-Encoding": "identity",
                }
            )
        else:
            response = await agent_service.chat(
                request.message,
                request.session_id,
                request.context,
                use_rag=request.use_rag,
                mode=agent_type,
            )
            
            # Log usage
            _log_usage("chat", model_id, request.mode)
            
            return ChatResponse(
                response=response, 
                session_id=request.session_id,
                model_used=model_id
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _mode_to_agent_type(mode: str) -> str:
    """Map frontend mode to agent service prompt type"""
    return {
        "chat": "chat",
        "req_tc": "req_tc",
        "test_script": "test_generator",
    }.get(mode, "chat")


def _log_usage(action: str, model_id: str, mode: str):
    """Log usage to MongoDB (fire-and-forget)"""
    try:
        from services.db_service import get_db_service
        db = get_db_service()
        if db and db.is_connected:
            db.log_usage(
                action=action,
                model=model_id,
                mode=mode,
                input_tokens=0,  # Will be populated from LLM response later
                output_tokens=0,
            )
    except Exception:
        pass


@router.post("/stream")
async def stream_message(request: ChatRequest):
    """Stream chat response (supports mode, RAG toggle)"""
    model_id = request.model or 'ollama-gemma4'
    try:
        configure_llm_for_model(model_id)
    except ValueError as e:
        async def error_gen():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")
    
    agent_type = _mode_to_agent_type(request.mode)
    
    async def generate():
        try:
            async for chunk in agent_service.stream_chat(
                request.message,
                request.session_id,
                request.context,
                use_rag=request.use_rag,
                mode=agent_type,
            ):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield "data: [DONE]\n\n"
            _log_usage("chat_stream", model_id, request.mode)
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Transfer-Encoding": "chunked",
            "Content-Encoding": "identity",
        }
    )


@router.get("/history/{session_id}", response_model=HistoryResponse)
async def get_history(session_id: str):
    """Get chat history — from MongoDB if available, fallback to in-memory"""
    # Try MongoDB first
    try:
        from services.db_service import get_db_service
        db = get_db_service()
        if db and db.is_connected:
            messages = db.get_session_messages(session_id)
            if messages:
                return HistoryResponse(session_id=session_id, messages=messages)
    except Exception:
        pass
    
    # Fallback to in-memory
    messages = agent_service.get_session_history(session_id)
    return HistoryResponse(session_id=session_id, messages=messages)


@router.post("/history/{session_id}/save")
async def save_message(session_id: str, payload: dict):
    """Save a message to persistent MongoDB history"""
    try:
        from services.db_service import get_db_service
        db = get_db_service()
        if db and db.is_connected:
            db.save_message(
                session_id=session_id,
                role=payload.get("role", "user"),
                content=payload.get("content", ""),
                user_id=payload.get("user_id", "anonymous"),
            )
            return {"status": "saved"}
        return {"status": "db_unavailable"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/sessions")
async def list_sessions(user_id: str = "anonymous"):
    """List recent chat sessions for a user (auto-expired after 30 days)"""
    try:
        from services.db_service import get_db_service
        db = get_db_service()
        if db and db.is_connected:
            return db.list_sessions(user_id=user_id)
        return []
    except Exception:
        return []


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    """Clear chat history for a session (both in-memory and MongoDB)"""
    agent_service.clear_session(session_id)
    try:
        from services.db_service import get_db_service
        db = get_db_service()
        if db and db.is_connected:
            db.delete_session(session_id)
    except Exception:
        pass
    return {"message": "History cleared", "session_id": session_id}
