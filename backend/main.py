"""
AI Automation Hub - Main FastAPI Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import get_settings
from routes import chat_router, test_router, config_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    settings = get_settings()
    print(f"Starting AI Automation Hub...")
    print(f"  LLM Provider: {settings.llm_provider}")
    print(f"  EXACODE URL: {settings.exacode_base_url}")
    print(f"  Ollama URL: {settings.ollama_base_url}")
    yield
    # Shutdown
    print("Shutting down AI Automation Hub...")


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


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "AI Automation Hub",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "chat": "/api/chat",
            "test": "/api/test",
            "config": "/api/config",
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
