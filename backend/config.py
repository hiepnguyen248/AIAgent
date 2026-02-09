"""
AI Automation Hub - Configuration Management
"""
import os
from typing import Optional, Literal
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment or config file"""
    
    # App Settings
    app_name: str = "AI Automation Hub"
    debug: bool = False
    
    # LLM Provider Settings
    llm_provider: Literal["exacode", "ollama"] = "exacode"
    
    # LGE EXACODE Settings
    exacode_api_key: str = ""
    exacode_base_url: str = "http://exacode-chat.lge.com/v1"
    exacode_model: str = "Chat-EXACODE-A"
    
    # Ollama Settings
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3:8b"  # or qwen3:8b
    
    # CodeBeamer Settings
    codebeamer_url: str = ""
    codebeamer_username: str = ""
    codebeamer_password: str = ""
    codebeamer_ssl_verify: bool = True
    
    # Rate Limiting
    max_calls_per_minute: int = 60
    cache_ttl: int = 300
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()


def update_settings(**kwargs):
    """Update settings at runtime"""
    global settings
    for key, value in kwargs.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    return settings


def get_settings() -> Settings:
    """Get current settings"""
    return settings
