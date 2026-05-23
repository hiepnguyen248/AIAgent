"""
AI Automation Hub - Main FastAPI Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import get_settings
from routes import chat_router, test_router, config_router, rag_router, test_management_router, codebeamer_router, dashboard_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    settings = get_settings()
    print(f"Starting AI Automation Hub...")
    print(f"  LLM Provider: {settings.llm_provider}")
    print(f"  EXACODE URL: {settings.exacode_base_url}")
    print(f"  Ollama URL: {settings.ollama_base_url}")
    
    # Auto-configure LLM service from .env settings
    from services.llm_service import llm_service
    try:
        if settings.llm_provider == "exacode" and settings.exacode_api_key:
            llm_service.configure(
                provider="exacode",
                api_key=settings.exacode_api_key,
                base_url=settings.exacode_base_url,
                model=settings.exacode_model
            )
            print(f"  [OK] EXACODE configured (model: {settings.exacode_model})")
        elif settings.llm_provider in ("ollama", "gemma4"):
            llm_service.configure(
                provider="ollama",
                base_url=settings.ollama_base_url,
                model=settings.ollama_model
            )
            print(f"  [OK] Ollama configured (model: {settings.ollama_model})")
    except Exception as e:
        print(f"  [!] LLM auto-configure failed: {e}")
    
    # Auto-configure CodeBeamer from .env settings
    if settings.codebeamer_url and settings.codebeamer_username and settings.codebeamer_password:
        from services.codebeamer_service import configure_codebeamer
        try:
            configure_codebeamer(
                url=settings.codebeamer_url,
                username=settings.codebeamer_username,
                password=settings.codebeamer_password,
                ssl_verify=settings.codebeamer_ssl_verify
            )
            print(f"  [OK] CodeBeamer configured ({settings.codebeamer_url})")
        except Exception as e:
            print(f"  [!] CodeBeamer auto-configure failed: {e}")
    
    # Auto-configure RAG service
    try:
        from services.rag_service import configure_rag
        rag = configure_rag(
            persist_dir=settings.rag_persist_dir,
            chunk_size=settings.rag_chunk_size,
            chunk_overlap=settings.rag_chunk_overlap,
            embedding_provider=settings.rag_embedding_provider,
            embedding_model=settings.rag_embedding_model,
            ollama_base_url=settings.rag_ollama_base_url
        )
        print(f"  [OK] RAG service configured ({settings.rag_embedding_provider}: {settings.rag_embedding_model})")
    except Exception as e:
        print(f"  [!] RAG auto-configure failed: {e}")
    
    # Auto-configure MongoDB
    try:
        from services.db_service import configure_db
        db = configure_db(
            mongo_uri=settings.mongo_uri,
            db_name=settings.mongo_db
        )
        if db.is_connected:
            print(f"  [OK] MongoDB configured ({settings.mongo_db})")
        else:
            print(f"  [!] MongoDB not connected (non-blocking)")
    except Exception as e:
        print(f"  [!] MongoDB auto-configure failed: {e} (non-blocking)")
    
    yield
    # Shutdown
    print("Shutting down AI Automation Hub...")
    try:
        from services.db_service import get_db_service
        db = get_db_service()
        if db:
            db.close()
    except Exception:
        pass



app = FastAPI(
    title="AI Automation Hub",
    description="AI-powered test automation platform for automotive embedded systems",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat_router)
app.include_router(test_router)
app.include_router(config_router)
app.include_router(rag_router)
app.include_router(test_management_router)
app.include_router(codebeamer_router)
app.include_router(dashboard_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "AI Automation Hub",
        "version": "1.1.0",
        "status": "running",
        "endpoints": {
            "chat": "/api/chat",
            "test": "/api/test",
            "config": "/api/config",
            "rag": "/api/rag",
            "dashboard": "/api/dashboard",
            "docs": "/docs"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
