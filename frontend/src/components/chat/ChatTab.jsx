import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Trash2, Copy, Check, Bot, User, Search, BookOpen, FolderOpen } from 'lucide-react';
import { streamChat, deleteChatHistory, saveChatMessage } from '../../utils/api';
import { useToast } from '../../App';

function generateSessionId() {
  return 'session_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ─── Code Block with Copy ──────────────────────────────────────── */
function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace('language-', '') || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <button className="code-copy-btn" onClick={handleCopy}>
        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
      <pre>
        <code className={className}>{children}</code>
      </pre>
      {lang && <span className="badge badge-primary" style={{ position: 'absolute', top: 8, left: 8, fontSize: '0.65rem' }}>{lang}</span>}
    </div>
  );
}

/* ─── Single Message ────────────────────────────────────────────── */
function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="chat-avatar">
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="chat-bubble">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const isInline = !className;
                if (isInline) return <code {...props}>{children}</code>;
                return <CodeBlock className={className}>{children}</CodeBlock>;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

/* ─── Typing Indicator ──────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="chat-message assistant">
      <div className="chat-avatar"><Bot size={16} /></div>
      <div className="chat-bubble">
        <div className="typing-indicator">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

/* ─── Welcome ───────────────────────────────────────────────────────────── */
function WelcomeScreen({ onHintClick }) {
  const hints = [
    { icon: '🔍', text: 'What CAN keywords are available in our framework?' },
    { icon: '📂', text: 'Show me DLT logging resources for BMW Telematics' },
    { icon: '🧪', text: 'How to use UART Library for IVI testing?' },
    { icon: '📡', text: 'List all HMI test patterns from knowledge base' },
    { icon: '📋', text: 'What test cases exist for CNeCall feature?' },
    { icon: '⚙️', text: 'Explain our Robot Framework project structure' },
  ];

  return (
    <div className="welcome-screen">
      <Search size={48} style={{ color: 'var(--primary)', opacity: 0.6 }} />
      <h2>Knowledge Search</h2>
      <p>Search project knowledge, framework resources, and test patterns.
        <br/>Ask about any project, feature, or protocol — powered by RAG.</p>
      <div className="welcome-hints">
        {hints.map((h, i) => (
          <div key={i} className="welcome-hint" onClick={() => onHintClick(h.text)}>
            <span>{h.icon}</span> {h.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Chat Tab ─────────────────────────────────────────────── */
export default function ChatTab({ model }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState(() => generateSessionId());
  const [useRag, setUseRag] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const controllerRef = useRef(null);
  const toast = useToast();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }
  };

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || streaming) return;

    const userMsg = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Append empty assistant message for streaming
    const assistantIdx = messages.length + 1;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    // Persist user message to MongoDB (fire-and-forget)
    saveChatMessage(sessionId, 'user', trimmed).catch(() => {});

    const payload = {
      message: trimmed,
      session_id: sessionId,
      model,
      mode: 'chat',
      use_rag: useRag,
    };

    controllerRef.current = await streamChat(
      payload,
      (chunk) => {
        const text = chunk.chunk || chunk.content || chunk.text || chunk.delta || '';
        if (text) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            return updated;
          });
        }
      },
      () => {
        setStreaming(false);
        // Persist final assistant response to MongoDB
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.content) {
            saveChatMessage(sessionId, 'assistant', last.content).catch(() => {});
          }
          return prev;
        });
      },
      (err) => {
        setStreaming(false);
        // If the assistant message is still empty, update it with an error or remove it
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: `⚠️ Error: ${err.message}. Make sure the backend is running at http://localhost:8000`,
            };
          }
          return updated;
        });
        toast(`Failed to send message: ${err.message}`, 'error');
      }
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = async () => {
    try {
      await deleteChatHistory(sessionId);
      setMessages([]);
      toast('Chat history cleared', 'success');
    } catch {
      setMessages([]);
      toast('Local history cleared', 'info');
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={18} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: 600 }}>Knowledge Search</span>
          <span className="badge badge-primary">{model}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={clearHistory} title="Clear history">
          <Trash2 size={14} /> Clear
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !streaming ? (
          <WelcomeScreen onHintClick={(h) => sendMessage(h)} />
        ) : (
          messages.map((msg, i) => <ChatMessage key={i} message={msg} />)
        )}
        {streaming && messages[messages.length - 1]?.content === '' && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {/* RAG toggle */}
        <div className="chat-modes">
          <button
            className={`mode-pill ${useRag ? 'rag-on' : 'rag-off'}`}
            onClick={() => setUseRag(!useRag)}
            title={useRag ? 'RAG is ON — click to disable' : 'RAG is OFF — click to enable'}
          >
            {useRag ? '📚 RAG ON' : '📚 RAG OFF'}
          </button>
        </div>

        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder="Search knowledge base — ask about projects, features, protocols, keywords..."
            rows={1}
            disabled={streaming}
          />
          <button
            className="chat-send-btn"
            onClick={() => sendMessage()}
            disabled={!input.trim() || streaming}
            title="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
