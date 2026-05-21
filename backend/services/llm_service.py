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
    """LGE EXACODE API Provider - Uses OpenAI client with custom headers"""
    
    def __init__(self, api_key: str, base_url: str = "http://exacode-chat.lge.com/v1", model: str = "Chat-EXACODE-A"):
        from openai import AsyncOpenAI
        
        self.model = model
        custom_headers = {
            'X-Title': 'EXACODE SWE(API)',
            'X-Model': model
        }
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            http_client=httpx.AsyncClient(headers=custom_headers, timeout=120.0)
        )

    @staticmethod
    def _normalize_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        Merge system prompt into the first user message so the EXACODE backend
        (LiteLLM → qwen3.5:35b) never receives a 'system' role message.

        LiteLLM's Qwen chat-template handler re-inserts the system content at
        the wrong position when there is existing conversation history, which
        causes:  "System message must be at the beginning."

        Transforming:
          [system, user1, assistant1, user2]
        Into:
          [user("[System]\n...\n\n[User]\nuser1"), assistant1, user2]
        """
        if not messages:
            return messages

        msgs = [dict(m) for m in messages]  # shallow copy each dict

        # Collect and remove all system messages
        system_parts = []
        non_system = []
        for m in msgs:
            if m["role"] == "system":
                system_parts.append(m["content"])
            else:
                non_system.append(m)

        if not system_parts:
            return non_system

        system_text = "\n\n".join(system_parts)

        # Prepend to the first user message, or insert a standalone user message
        if non_system and non_system[0]["role"] == "user":
            non_system[0]["content"] = (
                f"[System Instructions]\n{system_text}\n\n"
                f"[User]\n{non_system[0]['content']}"
            )
        else:
            non_system.insert(0, {
                "role": "user",
                "content": f"[System Instructions]\n{system_text}"
            })

        return non_system

    async def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request to EXACODE"""
        kwargs.pop('stream', None)
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=self._normalize_messages(messages),
            temperature=kwargs.pop('temperature', 0.2),
            **kwargs
        )
        return response.choices[0].message.content or ""
    
    async def stream_chat(self, messages: List[Dict[str, str]], **kwargs) -> AsyncGenerator[str, None]:
        """Stream chat response from EXACODE"""
        kwargs.pop('stream', None)
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=self._normalize_messages(messages),
            stream=True,
            temperature=kwargs.pop('temperature', 0.2),
            **kwargs
        )
        async for chunk in response:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content


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
