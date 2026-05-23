"""
Observability Service - LLM tracing with Langfuse
Tracks: token usage, latency, input/output, errors for every LLM call.
"""
import time
import uuid
from typing import Optional, Dict, Any, AsyncGenerator
from functools import wraps


class ObservabilityService:
    """
    Thin wrapper around Langfuse for LLM tracing.
    Gracefully degrades to a no-op when Langfuse is not configured or unavailable.
    """

    _instance: Optional["ObservabilityService"] = None
    _langfuse = None
    _enabled: bool = False

    def __init__(self):
        pass

    @classmethod
    def get_instance(cls) -> "ObservabilityService":
        if cls._instance is None:
            cls._instance = ObservabilityService()
        return cls._instance

    def configure(
        self,
        public_key: str,
        secret_key: str,
        host: str = "https://cloud.langfuse.com",
        enabled: bool = True,
    ):
        """Initialize Langfuse client. Safe to call multiple times."""
        if not enabled or not public_key or not secret_key:
            print("[Observability] Langfuse disabled or missing credentials — tracing is OFF")
            self._enabled = False
            return

        try:
            from langfuse import Langfuse

            self._langfuse = Langfuse(
                public_key=public_key,
                secret_key=secret_key,
                host=host,
            )
            self._enabled = True
            print(f"[Observability] Langfuse initialized → {host}")
        except ImportError:
            print("[Observability] langfuse package not installed — tracing is OFF")
            self._enabled = False
        except Exception as e:
            print(f"[Observability] Langfuse init error: {e} — tracing is OFF")
            self._enabled = False

    @property
    def enabled(self) -> bool:
        return self._enabled and self._langfuse is not None

    # ──────────────────────────────────────────────────────────────────────────
    # Public Tracing API
    # ──────────────────────────────────────────────────────────────────────────

    def start_trace(
        self,
        name: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Any]:
        """Create a new Langfuse trace. Returns a trace object or None."""
        if not self.enabled:
            return None
        try:
            return self._langfuse.trace(
                name=name,
                session_id=session_id,
                user_id=user_id,
                metadata=metadata or {},
            )
        except Exception as e:
            print(f"[Observability] start_trace error: {e}")
            return None

    def trace_llm_call(
        self,
        trace,
        name: str,
        model: str,
        messages: list,
        response: str,
        latency_ms: float,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Record a completed (non-streaming) LLM generation on an existing trace."""
        if not self.enabled or trace is None:
            return
        try:
            trace.generation(
                name=name,
                model=model,
                input=messages,
                output=response,
                metadata={
                    "latency_ms": round(latency_ms, 2),
                    **(metadata or {}),
                },
            )
        except Exception as e:
            print(f"[Observability] trace_llm_call error: {e}")

    def trace_error(
        self,
        trace,
        error: Exception,
        name: str = "error",
    ):
        """Record an error event on a trace."""
        if not self.enabled or trace is None:
            return
        try:
            trace.event(
                name=name,
                level="ERROR",
                status_message=str(error),
            )
        except Exception as e:
            print(f"[Observability] trace_error error: {e}")

    def flush(self):
        """Force-flush pending events to Langfuse (useful on shutdown)."""
        if not self.enabled:
            return
        try:
            self._langfuse.flush()
        except Exception as e:
            print(f"[Observability] flush error: {e}")

    # ──────────────────────────────────────────────────────────────────────────
    # Convenience: wrap an async chat call with automatic tracing
    # ──────────────────────────────────────────────────────────────────────────

    async def traced_chat(
        self,
        llm_service,
        messages: list,
        session_id: Optional[str] = None,
        agent_type: str = "chat",
        **kwargs,
    ) -> str:
        """
        Call llm_service.chat() and automatically record the trace.
        Falls back to raw call if tracing fails.
        """
        trace = self.start_trace(
            name=f"llm.{agent_type}",
            session_id=session_id,
            metadata={"agent_type": agent_type},
        )
        t0 = time.time()
        try:
            response = await llm_service.chat(messages, **kwargs)
            latency_ms = (time.time() - t0) * 1000
            model = getattr(getattr(llm_service, "_provider", None), "model", "unknown")
            self.trace_llm_call(
                trace=trace,
                name="generation",
                model=model,
                messages=messages,
                response=response,
                latency_ms=latency_ms,
            )
            return response
        except Exception as e:
            self.trace_error(trace, e)
            raise

    async def traced_stream_chat(
        self,
        llm_service,
        messages: list,
        session_id: Optional[str] = None,
        agent_type: str = "chat",
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """
        Stream from llm_service.stream_chat() and trace on completion.
        Falls back to raw stream if tracing fails.
        """
        trace = self.start_trace(
            name=f"llm.stream.{agent_type}",
            session_id=session_id,
            metadata={"agent_type": agent_type},
        )
        t0 = time.time()
        full_response = ""
        model = getattr(getattr(llm_service, "_provider", None), "model", "unknown")
        try:
            async for chunk in llm_service.stream_chat(messages, **kwargs):
                full_response += chunk
                yield chunk
        except Exception as e:
            self.trace_error(trace, e)
            raise
        finally:
            latency_ms = (time.time() - t0) * 1000
            if full_response:
                self.trace_llm_call(
                    trace=trace,
                    name="stream_generation",
                    model=model,
                    messages=messages,
                    response=full_response,
                    latency_ms=latency_ms,
                    metadata={"streaming": True},
                )


# Singleton
observability_service = ObservabilityService.get_instance()
