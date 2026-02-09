"""
LLM Service - Abstraction layer for multiple LLM providers
Supports: LGE EXACODE API, Ollama (Llama3:8B, Qwen3:8B)
"""
import httpx
from typing import AsyncGenerator, List, Dict, Any, Optional
from abc import ABC, abstractmethod
import json


class BaseLLMProvider(ABC):
    """Base class for LLM providers"""
    
    @abstractmethod
    async def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request and get response"""
        pass
    
    @abstractmethod
    async def stream_chat(self, messages: List[Dict[str, str]], **kwargs) -> AsyncGenerator[str, None]:
        """Stream chat response"""
        pass


class ExacodeLLMProvider(BaseLLMProvider):
    """LGE EXACODE API Provider"""
    
    def __init__(self, api_key: str, base_url: str = "http://exacode-chat.lge.com/v1", model: str = "Chat-EXACODE-A"):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.model = model
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'X-Title': 'AI Automation Hub',
            'X-Model': model
        }
    
    async def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request to EXACODE"""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": False,
                    **kwargs
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    
    async def stream_chat(self, messages: List[Dict[str, str]], **kwargs) -> AsyncGenerator[str, None]:
        """Stream chat response from EXACODE"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                    **kwargs
                }
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue


class OllamaLLMProvider(BaseLLMProvider):
    """Ollama Local LLM Provider"""
    
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3:8b"):
        self.base_url = base_url.rstrip('/')
        self.model = model
    
    async def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request to Ollama"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": False,
                    **kwargs
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"]
    
    async def stream_chat(self, messages: List[Dict[str, str]], **kwargs) -> AsyncGenerator[str, None]:
        """Stream chat response from Ollama"""
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                    **kwargs
                }
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            content = data.get("message", {}).get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue


class LLMService:
    """Main LLM Service - Factory pattern for providers"""
    
    _instance: Optional['LLMService'] = None
    _provider: Optional[BaseLLMProvider] = None
    
    def __init__(self):
        pass
    
    @classmethod
    def get_instance(cls) -> 'LLMService':
        if cls._instance is None:
            cls._instance = LLMService()
        return cls._instance
    
    def configure(self, provider: str, **config):
        """Configure the LLM provider"""
        if provider == "exacode":
            self._provider = ExacodeLLMProvider(
                api_key=config.get("api_key", ""),
                base_url=config.get("base_url", "http://exacode-chat.lge.com/v1"),
                model=config.get("model", "Chat-EXACODE-A")
            )
        elif provider == "ollama":
            self._provider = OllamaLLMProvider(
                base_url=config.get("base_url", "http://localhost:11434"),
                model=config.get("model", "llama3:8b")
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    @property
    def provider(self) -> BaseLLMProvider:
        if self._provider is None:
            raise RuntimeError("LLM provider not configured. Call configure() first.")
        return self._provider
    
    async def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request"""
        return await self.provider.chat(messages, **kwargs)
    
    async def stream_chat(self, messages: List[Dict[str, str]], **kwargs) -> AsyncGenerator[str, None]:
        """Stream chat response"""
        async for chunk in self.provider.stream_chat(messages, **kwargs):
            yield chunk


# Singleton instance
llm_service = LLMService.get_instance()
