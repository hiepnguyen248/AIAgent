import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2, Loader2, Cpu } from 'lucide-react';

const MODEL_OPTIONS = [
    { id: 'exacode', name: 'EXACODE', description: 'LGE EXACODE API' },
    { id: 'ollama-llama3', name: 'Llama3:8B', description: 'Local Ollama' },
    { id: 'ollama-qwen3', name: 'Qwen3:8B', description: 'Local Ollama' },
];

const getWelcomeMessage = (modelName) => `Hello! I'm **${modelName}** - an AI assistant specializing in automotive embedded system testing! I help engineers with:

• **Robot Framework test development**: I can assist with creating test cases, writing test steps, and executing tests using Robot Framework.
• **Embedded system testing**: I'm familiar with various communication protocols and can provide guidance on testing interfaces.
• **Test case analysis and optimization**: I can help analyze test results, identify bottlenecks, and optimize test cases for improved performance.
• **Code review and best practices**: I can review code snippets, provide suggestions for improvement, and share knowledge of best practices in automotive embedded system development.

I'm here to assist you with your testing needs. What's on your mind?`;

function ChatTab() {
    const [selectedModel, setSelectedModel] = useState('exacode');
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId] = useState(() => `session-${Date.now()}`);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    // Set initial message based on selected model
    useEffect(() => {
        const modelName = MODEL_OPTIONS.find(m => m.id === selectedModel)?.name || 'AI';
        setMessages([{
            id: Date.now(),
            role: 'assistant',
            content: getWelcomeMessage(modelName)
        }]);
    }, [selectedModel]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: input.trim()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    session_id: sessionId,
                    model: selectedModel,
                    stream: false
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to send message');
            }

            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: 'assistant',
                content: data.response
            }]);
        } catch (error) {
            console.error('Chat error:', error);
            const modelName = MODEL_OPTIONS.find(m => m.id === selectedModel)?.name || 'AI';
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: 'assistant',
                content: `⚠️ **Connection Error**\n\n${error.message}\n\n**Please check:**\n• Backend is running (port 8000)\n• ${selectedModel === 'exacode' ? 'EXACODE API key is configured in Config tab' : 'Ollama is running locally'}\n• Model "${modelName}" is available`
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const clearHistory = async () => {
        try {
            await fetch(`/api/chat/history/${sessionId}`, { method: 'DELETE' });
            const modelName = MODEL_OPTIONS.find(m => m.id === selectedModel)?.name || 'AI';
            setMessages([{
                id: Date.now(),
                role: 'assistant',
                content: `Chat history cleared. I'm **${modelName}**. How can I help you?`
            }]);
        } catch (error) {
            console.error('Failed to clear history:', error);
        }
    };

    // Render markdown-like text
    const renderContent = (content) => {
        return content.split('\n').map((line, i) => {
            // Bold text
            let formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            return (
                <span key={i}>
                    <span dangerouslySetInnerHTML={{ __html: formattedLine }} />
                    {i < content.split('\n').length - 1 && <br />}
                </span>
            );
        });
    };

    const currentModel = MODEL_OPTIONS.find(m => m.id === selectedModel);

    return (
        <div>
            <div className="page-header">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="page-title">AI Chat</h1>
                        <p className="page-subtitle">Chat with AI about test automation</p>
                    </div>
                    <div className="flex gap-2">
                        {/* Model Selector */}
                        <div style={{ position: 'relative' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowModelSelector(!showModelSelector)}
                            >
                                <Cpu size={16} />
                                {currentModel?.name}
                            </button>

                            {showModelSelector && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: '8px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-md)',
                                        boxShadow: 'var(--shadow-lg)',
                                        zIndex: 50,
                                        minWidth: '200px',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {MODEL_OPTIONS.map(model => (
                                        <button
                                            key={model.id}
                                            onClick={() => {
                                                setSelectedModel(model.id);
                                                setShowModelSelector(false);
                                            }}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'flex-start',
                                                width: '100%',
                                                padding: '12px 16px',
                                                border: 'none',
                                                background: selectedModel === model.id ? 'var(--bg-tertiary)' : 'transparent',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                borderBottom: '1px solid var(--border-light)'
                                            }}
                                        >
                                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {model.name}
                                            </span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                {model.description}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button className="btn btn-ghost" onClick={clearHistory}>
                            <Trash2 size={18} />
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            <div className="chat-container">
                <div className="chat-messages">
                    {messages.map(message => (
                        <div
                            key={message.id}
                            className={`chat-message ${message.role}`}
                        >
                            <div className="chat-avatar">
                                {message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}
                            </div>
                            <div className="chat-bubble">
                                {renderContent(message.content)}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="chat-message assistant">
                            <div className="chat-avatar">
                                <Bot size={18} />
                            </div>
                            <div className="chat-bubble">
                                <div className="typing-indicator">
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                <div className="chat-input-area">
                    <form onSubmit={handleSubmit} className="chat-input-wrapper">
                        <textarea
                            ref={textareaRef}
                            className="chat-input"
                            placeholder="Type your message... (Shift+Enter for new line)"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                        />
                        <button
                            type="submit"
                            className="chat-send-btn"
                            disabled={!input.trim() || isLoading}
                        >
                            {isLoading ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default ChatTab;
