"""
Agent Service - LangChain/LangGraph agents for test generation and review
"""
from typing import Dict, List, Any, Optional, AsyncGenerator
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder


# System prompts for different agent types
SYSTEM_PROMPTS = {
    "chat": """You are an AI assistant specializing in automotive embedded system testing.
You help engineers with:
- Test case analysis and optimization
- Framework analysis and understanding libraries, resources, mapping with test cases.
- Robot Framework test development based on analysis and understanding of test cases and framework.
- Code review and best practices

Be concise, technical, and provide practical examples when helpful.""",

    "test_generator": """You are an expert Robot Framework test generator for automotive embedded systems.

Your role is to generate high-quality, executable Robot Framework test cases based on:
1. Test case pre-conditions, test steps, expected results from CodeBeamer
2. Framework analysis and understanding libraries, resources, mapping with test cases from .md files.
3. Review test scripts and provide feedback and suggestions for improvement base on test cases and framework.

Guidelines:
- Use proper Robot Framework syntax and structure
- Include appropriate setup and teardown
- Add meaningful documentation and tags
- Use variables for configurable values
- Follow automotive testing best practices

Output ONLY the Robot Framework code, no explanations.""",

    "test_reviewer": """You are an expert Robot Framework test reviewer for automotive embedded systems.

Your role is to review and improve test cases by checking:
1. Syntax correctness
2. Proper use of keywords and libraries
3. Test coverage and edge cases
4. Documentation completeness
5. Best practices for automotive testing

Provide specific, actionable feedback with examples of improvements."""
}


class ConversationMemory:
    """Simple conversation memory for agents"""
    
    def __init__(self, max_messages: int = 20):
        self.messages: List[Dict[str, str]] = []
        self.max_messages = max_messages
    
    def add_message(self, role: str, content: str):
        """Add a message to memory"""
        self.messages.append({"role": role, "content": content})
        # Keep only last N messages
        if len(self.messages) > self.max_messages:
            self.messages = self.messages[-self.max_messages:]
    
    def get_messages(self) -> List[Dict[str, str]]:
        """Get all messages"""
        return self.messages.copy()
    
    def clear(self):
        """Clear memory"""
        self.messages = []


class AgentService:
    """Main agent service using LangChain patterns"""
    
    def __init__(self):
        self.memories: Dict[str, ConversationMemory] = {}
        self.system_prompts = SYSTEM_PROMPTS
        self._llm_service = None
    
    @property
    def llm_service(self):
        if self._llm_service is None:
            from services.llm_service import llm_service
            self._llm_service = llm_service
        return self._llm_service
    
    def get_or_create_memory(self, session_id: str) -> ConversationMemory:
        """Get or create conversation memory for a session"""
        if session_id not in self.memories:
            self.memories[session_id] = ConversationMemory()
        return self.memories[session_id]
    
    def _build_messages(
        self,
        agent_type: str,
        user_message: str,
        session_id: Optional[str] = None,
        context: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Build message list for LLM"""
        messages = []
        
        # Add system prompt
        system_prompt = self.system_prompts.get(agent_type, self.system_prompts["chat"])
        if context:
            system_prompt += f"\n\nContext:\n{context}"
        messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history if session exists
        if session_id:
            memory = self.get_or_create_memory(session_id)
            messages.extend(memory.get_messages())
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        
        return messages
    
    async def chat(
        self,
        message: str,
        session_id: str,
        context: Optional[str] = None
    ) -> str:
        """General chat with conversation memory"""
        messages = self._build_messages("chat", message, session_id, context)
        
        # Get response
        response = await self.llm_service.chat(messages)
        
        # Update memory
        memory = self.get_or_create_memory(session_id)
        memory.add_message("user", message)
        memory.add_message("assistant", response)
        
        return response
    
    async def stream_chat(
        self,
        message: str,
        session_id: str,
        context: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat response"""
        messages = self._build_messages("chat", message, session_id, context)
        
        full_response = ""
        async for chunk in self.llm_service.stream_chat(messages):
            full_response += chunk
            yield chunk
        
        # Update memory after streaming complete
        memory = self.get_or_create_memory(session_id)
        memory.add_message("user", message)
        memory.add_message("assistant", full_response)
    
    async def generate_test(
        self,
        test_case_description: str,
        test_type: str = "generic",
        additional_context: Optional[str] = None
    ) -> str:
        """Generate Robot Framework test from description"""
        context = f"""
Test Type: {test_type}
{f'Additional Context: {additional_context}' if additional_context else ''}
"""
        messages = self._build_messages("test_generator", test_case_description, context=context)
        return await self.llm_service.chat(messages)
    
    async def review_test(
        self,
        test_code: str,
        focus_areas: Optional[List[str]] = None
    ) -> str:
        """Review and provide feedback on test code"""
        focus = ""
        if focus_areas:
            focus = f"\nFocus on these areas: {', '.join(focus_areas)}"
        
        prompt = f"""Please review this Robot Framework test:{focus}

```robot
{test_code}
```

Provide specific feedback on issues and improvements."""
        
        messages = self._build_messages("test_reviewer", prompt)
        return await self.llm_service.chat(messages)
    
    async def improve_test(
        self,
        test_code: str,
        improvement_request: str
    ) -> str:
        """Improve test code based on request"""
        prompt = f"""Improve this Robot Framework test based on the following request:

Request: {improvement_request}

Original test:
```robot
{test_code}
```

Output ONLY the improved Robot Framework code."""
        
        messages = self._build_messages("test_generator", prompt)
        return await self.llm_service.chat(messages)
    
    def clear_session(self, session_id: str):
        """Clear session memory"""
        if session_id in self.memories:
            self.memories[session_id].clear()
    
    def get_session_history(self, session_id: str) -> List[Dict[str, str]]:
        """Get session conversation history"""
        if session_id in self.memories:
            return self.memories[session_id].get_messages()
        return []


# Global instance
agent_service = AgentService()
