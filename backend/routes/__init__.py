"""
Routes package initialization
"""
from routes.chat import router as chat_router
from routes.test_gen import router as test_router
from routes.config import router as config_router

__all__ = ['chat_router', 'test_router', 'config_router']
