import { useState, useEffect } from 'react';
import { Settings, Sun, Moon } from 'lucide-react';

const MODELS = [
  { value: 'exacode', label: 'EXACODE' },
  { value: 'ollama-gemma4', label: 'Ollama Gemma4' },
  { value: 'ollama-llama3', label: 'Ollama Llama3' },
  { value: 'ollama-qwen3', label: 'Ollama Qwen3' },
];

export default function TopBar({ title, model, onModelChange, theme, onToggleTheme }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = () => {
      fetch('http://localhost:8000/api/config/current')
        .then((r) => { setConnected(r.ok); })
        .catch(() => setConnected(false));
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{title}</span>
      </div>
      <div className="topbar-right">
        <div className="model-selector">
          <select value={model} onChange={(e) => onModelChange(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="connection-status">
          <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{ fontSize: '0.82rem', gap: 6 }}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button className="btn btn-ghost btn-sm" title="Settings">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
