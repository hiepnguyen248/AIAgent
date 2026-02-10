# AI Agent Hub

AI-powered test automation platform for automotive embedded systems. Generate, review, and improve Robot Framework tests with AI assistance using LangChain agents.

## 🚀 Features

- **AI Chat**: Interactive chat with AI about test automation (powered by LangChain/LangGraph agents)
- **Generate Test Script**: Generate Robot Framework tests for CAN, UART, DLT, HMI
- **Review Test**: AI-powered code review and improvements
- **Config**: Configure LLM providers (EXACODE/Ollama) and CodeBeamer integration
- **About**: Quick start guide and documentation

## 📋 Tech Stack

### Backend
- **Python 3.11+**
- **FastAPI** - Web framework & REST API
- **LangChain** + **LangGraph** - AI agent orchestration
- **LangChain-OpenAI** - OpenAI-compatible LLM integration
- **Pydantic** + **Pydantic-Settings** - Data validation & config management
- **HTTPX** / **Requests** - HTTP clients
- **Uvicorn** - ASGI server

### Frontend
- **React 18** - UI framework
- **Vite 5** - Build tool & dev server
- **Lucide React** - Icon library

## 🛠️ Installation

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and configure your settings:
```bash
cp .env.example .env
```

### Frontend

```bash
cd frontend
npm install
```

## 🚀 Running the Application

### Start Backend

```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

### Start Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## ⚙️ Configuration

### LLM Providers

**LGE EXACODE** (default):
- Base URL: `http://exacode-chat.lge.com/v1`
- Model: `Chat-EXACODE-A`
- Requires API key

**Ollama** (local):
- Base URL: `http://localhost:11434`
- Models: `llama3:8b`, `qwen3:8b`

### CodeBeamer

- URL: Your CodeBeamer instance
- Auth: Username/Password (Basic Auth)

## 📁 Project Structure

```
AIAgent/
├── backend/
│   ├── main.py                  # FastAPI entry point
│   ├── config.py                # Pydantic settings management
│   ├── .env.example             # Environment variables template
│   ├── requirements.txt         # Python dependencies
│   ├── routes/
│   │   ├── __init__.py          # Router registration
│   │   ├── chat.py              # Chat API endpoints
│   │   ├── config.py            # Config API endpoints
│   │   └── test_gen.py          # Test generation API endpoints
│   └── services/
│       ├── __init__.py          # Service exports
│       ├── llm_service.py       # LLM provider abstraction
│       ├── agent_service.py     # LangChain/LangGraph agents
│       ├── codebeamer_service.py # CodeBeamer integration
│       ├── markdown_service.py  # Markdown processing
│       └── test_generator.py    # Robot Framework test generation
├── frontend/
│   ├── index.html               # HTML entry point
│   ├── package.json             # Node.js dependencies
│   ├── vite.config.js           # Vite configuration
│   └── src/
│       ├── main.jsx             # React entry point
│       ├── App.jsx              # Main app with sidebar navigation
│       ├── index.css            # Design system & styling
│       └── components/
│           ├── ChatTab.jsx      # AI Chat interface
│           ├── GenerateTab.jsx  # Test script generation
│           ├── ReviewTab.jsx    # Code review interface
│           ├── ConfigTab.jsx    # Settings & configuration
│           └── AboutTab.jsx     # About & documentation
└── README.md
```

## 📝 License

MIT License - © 2026 AI Agent Hub
