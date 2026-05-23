# Implemented Features — AIGenTS Platform

This document summarizes the active features, services, and integrations successfully implemented and running in the **AIGenTS** test automation platform.

---

## 🚀 Active Workspace Features

### 1. AI Chat & Assistant (`ChatTab.jsx` & `/api/chat`)
- **Multi-Model Support**: Connects to both LGE EXACODE API (`Chat-EXACODE-A`) and local Ollama models (`gemma4`, `llama3`, `qwen3`).
- **Contextual Reasoning**: Employs LangChain and LangGraph agent frameworks to drive multi-turn reasoning and context retrieval.
- **Real-time Streaming**: Uses Server-Sent Events (SSE) to stream agent responses to the user instantly.

### 2. Automated Test Generation (`TestPipelineTab.jsx` & `/api/test`)
- **Dual Ingestion Input**:
  - **Manual Mode**: Generates complete Robot Framework `.robot` test scripts from plain-text descriptions.
  - **CodeBeamer Mode**: Directly fetches active test cases from CodeBeamer ALM (tracker IDs) and transforms requirements into executable test suites.
- **Embedded Templates**: Supports target test templates for:
  - **CAN**: Controller Area Network communication.
  - **UART**: Universal Asynchronous Receiver-Transmitter serial protocol.
  - **DLT**: Diagnostic Log and Trace logging.
  - **HMI**: Human-Machine Interface UI tests.
- **Monaco Code Editor**: Includes full syntax highlighting, word-wrap, and live editing for generated Robot files.
- **Syntax & Dry-run Validation**: Automates structural validation for keywords, bracket matching, section headers (`*** Settings ***`, `*** Test Cases ***`), and indentation.
- **Auto-Improvement & Healing**: AI-powered single-click code improvements and execution log analysis for error recovery.

### 3. RAG Knowledge Base (`RagTab.jsx` & `/api/rag`)
- **Multi-Format Processing**: Auto-detects, parses, and indexes:
  - Markdown (`.md`), plain text (`.txt`), PDF (`.pdf`), HTML (`.html`/`.htm`), JSON (`.json`).
  - Robot Framework (`.robot`, `.resource`) files.
  - Python scripts (`.py`) utilizing AST for signature and docstring parsing.
- **Vector Ingestion Pipeline**:
  - Employs **ChromaDB** with a persistent local SQLite storage.
  - Uses Ollama embeddings (`qwen3-embedding`) or `sentence-transformers` to represent text semantically.
- **Context Injection**: Automatically performs semantic search on queries and embeds relevant reference documents into LLM prompt templates during test generation.

### 4. Configuration & Settings (`ConfigTab.jsx` & `/api/config`)
- **LLM Configuration**: Manage base URLs, API keys, and active model selections dynamically.
- **CodeBeamer ALM Config**: Authenticates SSL connections and retrieves tracker credentials (username/password).
- **Service Integration**: Exposes status probes to verify active network connections to AI endpoints and database servers.

---

## 📋 Architecture & Tech Stack

### Backend
- **FastAPI**: Lightweight web framework driving REST endpoints and SSE streams.
- **LangChain & LangGraph**: Agentic reasoning, semantic tool definitions, and memory managers.
- **ChromaDB**: In-memory and persistent vector indexer.
- **Uvicorn**: High-performance ASGI server.

### Frontend
- **React 18** (Vite-powered): SPA layout utilizing a premium responsive dark theme.
- **Monaco Editor React**: Embeds VS Code's core editor engine.
- **Lucide Icons**: Modern high-fidelity icon library.
