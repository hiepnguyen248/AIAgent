import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  FolderOpen,
  Radio,
  Search,
  Send,
  Settings,
  Trash2,
  User,
} from 'lucide-react';
import { streamChat, deleteChatHistory, saveChatMessage } from '../../utils/api';
import { useToast } from '../../App';

function generateSessionId() {
  return 'session_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

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
      <button className="code-copy-btn" onClick={handleCopy} type="button">
        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
      <pre>
        <code className={className}>{children}</code>
      </pre>
      {lang && <span className="badge badge-primary code-lang">{lang}</span>}
    </div>
  );
}

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

function WelcomeScreen({ onHintClick }) {
  const hints = [
    { icon: Search, text: 'What CAN keywords are available in our framework?' },
    { icon: FolderOpen, text: 'Show me DLT logging resources for BMW Telematics' },
    { icon: Radio, text: 'How do I use the UART library for IVI testing?' },
    { icon: BookOpen, text: 'List all HMI test patterns from the knowledge base' },
    { icon: ClipboardList, text: 'What test cases exist for the CNeCall feature?' },
    { icon: Settings, text: 'Explain our Robot Framework project structure' },
  ];

  return (
    <div className="welcome-screen">
      <Search size={42} />
      <h2>Knowledge Search</h2>
      <p>Ask about project docs, framework resources, protocol details, and test patterns.</p>
      <div className="welcome-hints">
        {hints.map((hint) => {
          const Icon = hint.icon;
          return (
            <button key={hint.text} className="welcome-hint" onClick={() => onHintClick(hint.text)} type="button">
              <Icon size={15} /> <span>{hint.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setStreaming(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    saveChatMessage(sessionId, 'user', trimmed).catch(() => {});

    controllerRef.current = await streamChat(
      {
        message: trimmed,
        session_id: sessionId,
        model,
        mode: 'chat',
        use_rag: useRag,
      },
      (chunk) => {
        const textChunk = chunk.chunk || chunk.content || chunk.text || chunk.delta || '';
        if (textChunk) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + textChunk };
            }
            return updated;
          });
        }
      },
      () => {
        setStreaming(false);
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
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: `Error: ${err.message}. Make sure the backend is running at http://localhost:8000`,
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
        <div className="chat-title">
          <Search size={18} />
          <span>Knowledge Search</span>
          <span className="badge badge-primary">{model}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={clearHistory} title="Clear history" type="button">
          <Trash2 size={14} /> Clear
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !streaming ? (
          <WelcomeScreen onHintClick={(hint) => sendMessage(hint)} />
        ) : (
          messages.map((msg, i) => <ChatMessage key={i} message={msg} />)
        )}
        {streaming && messages[messages.length - 1]?.content === '' && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-modes">
          <button
            className={`mode-pill ${useRag ? 'rag-on' : 'rag-off'}`}
            onClick={() => setUseRag(!useRag)}
            title={useRag ? 'RAG is on' : 'RAG is off'}
            type="button"
          >
            <BookOpen size={14} /> {useRag ? 'RAG on' : 'RAG off'}
          </button>
        </div>

        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about projects, features, protocols, keywords..."
            rows={1}
            disabled={streaming}
          />
          <button
            className="chat-send-btn"
            onClick={() => sendMessage()}
            disabled={!input.trim() || streaming}
            title="Send message"
            type="button"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
