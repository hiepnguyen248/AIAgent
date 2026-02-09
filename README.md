# AI Automation Hub

AI-powered test automation platform for automotive embedded systems. Generate, review, and improve Robot Framework tests with AI assistance.

## 🚀 Features

- **AI Chat**: Interactive chat with AI about test automation
- **Generate Test**: Generate Robot Framework tests for CAN, UART, DLT, HMI
- **Review Test**: AI-powered code review and improvements
- **Config**: Configure LLM (EXACODE/Ollama) and CodeBeamer
- **About**: Quick start guide and documentation

## 📋 Requirements

- Python 3.11+
- Node.js 18+
- (Optional) Ollama for local LLM

## 🛠️ Installation

### Backend

```bash
cd backend
pip install -r requirements.txt
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
uvicorn main:app --reload --port 8000
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
ai-automation-hub/
├── backend/
│   ├── main.py              # FastAPI entry
│   ├── config.py            # Configuration
│   ├── routes/              # API endpoints
│   └── services/            # Business logic
│       ├── llm_service.py   # LLM abstraction
│       ├── agent_service.py # LangChain agents
│       ├── codebeamer_service.py
│       ├── markdown_service.py
│       └── test_generator.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main app
│   │   ├── index.css        # Design system
│   │   └── components/      # Tab components
│   └── package.json
└── README.md
```

## 📝 License

MIT License - © 2026 AI Automation Hub
