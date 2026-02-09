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
        # Default to Ollama Llama3
        llm_service.configure(
            provider="ollama",
            base_url="http://localhost:11434",
            model="llama3:8b"
        )


@router.post("/send", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """Send a chat message and get response"""
    try:
        # Configure LLM based on selected model
        model_id = request.model or 'ollama-llama3'
        configure_llm_for_model(model_id)
        
        if request.stream:
            # Return streaming response
            async def generate():
                async for chunk in agent_service.stream_chat(
                    request.message,
                    request.session_id,
                    request.context
                ):
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                yield "data: [DONE]\n\n"
            
            return StreamingResponse(
                generate(),
                media_type="text/event-stream"
            )
        else:
            response = await agent_service.chat(
                request.message,
                request.session_id,
                request.context
            )
            return ChatResponse(
                response=response, 
                session_id=request.session_id,
                model_used=model_id
            )
    except ValueError as e:
        # Configuration error
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def stream_message(request: ChatRequest):
    """Stream chat response"""
    # Configure LLM based on selected model
    model_id = request.model or 'ollama-llama3'
    try:
        configure_llm_for_model(model_id)
    except ValueError as e:
        async def error_gen():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")
    
    async def generate():
        try:
            async for chunk in agent_service.stream_chat(
                request.message,
                request.session_id,
                request.context
            ):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


@router.get("/history/{session_id}", response_model=HistoryResponse)
async def get_history(session_id: str):
    """Get chat history for a session"""
    messages = agent_service.get_session_history(session_id)
    return HistoryResponse(session_id=session_id, messages=messages)


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    """Clear chat history for a session"""
    agent_service.clear_session(session_id)
    return {"message": "History cleared", "session_id": session_id}
