import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import ChatTab from './components/chat/ChatTab';
import TestPipelineTab from './components/pipeline/TestPipelineTab';
import RagTab from './components/rag/RagTab';
import ConfigTab from './components/config/ConfigTab';
import AboutTab from './components/about/AboutTab';

/* ─── Toast Context ─────────────────────────────────────────────── */
const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' && <span>✓</span>}
            {t.type === 'error' && <span>✕</span>}
            {t.type === 'info' && <span>ℹ</span>}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── Placeholder Components ───────────────────────────────────── */
function DashboardTab() {
  return (
    <div style={{padding: '40px', textAlign: 'center', color: 'var(--text-secondary)'}}>
      <h2 style={{color: 'var(--text-primary)', marginBottom: '12px'}}>📊 Usage Dashboard</h2>
      <p>Coming soon — Sprint 3</p>
      <p style={{marginTop: '8px', fontSize: '0.85rem'}}>Track requests, tokens, costs, and user activity.</p>
    </div>
  );
}

function PromptLibraryTab() {
  return (
    <div style={{padding: '40px', textAlign: 'center', color: 'var(--text-secondary)'}}>
      <h2 style={{color: 'var(--text-primary)', marginBottom: '12px'}}>📝 Prompt Library</h2>
      <p>Coming soon — Sprint 2</p>
      <p style={{marginTop: '8px', fontSize: '0.85rem'}}>Create and manage reusable prompt templates for test generation.</p>
    </div>
  );
}

/* ─── Tab Map ───────────────────────────────────────────────────── */
const TABS = {
  chat: ChatTab,
  pipeline: TestPipelineTab,
  rag: RagTab,
  dashboard: DashboardTab,
  prompts: PromptLibraryTab,
  config: ConfigTab,
  about: AboutTab,
};

const TAB_TITLES = {
  chat: 'Knowledge Search',
  pipeline: 'Test Pipeline',
  rag: 'RAG Knowledge Base',
  dashboard: 'Usage Dashboard',
  prompts: 'Prompt Library',
  config: 'Configuration',
  about: 'About',
};

/* ─── App Component ─────────────────────────────────────────────── */
function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [model, setModel] = useState('ollama-gemma4');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const ActiveComponent = TABS[activeTab];

  return (
    <ToastProvider>
      <div className="app-layout">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />
        <div
          className="main-wrapper"
          style={{ marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
        >
          <TopBar
            title={TAB_TITLES[activeTab]}
            model={model}
            onModelChange={setModel}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <div className={activeTab === 'chat' || activeTab === 'pipeline' ? '' : 'main-content'}>
            <ActiveComponent model={model} />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

export default App;
