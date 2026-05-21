import {
  MessageSquare, FlaskConical, SearchCode, BookOpen,
  Settings, Zap, Code2, Database, Brain,
} from 'lucide-react';

const FEATURES = [
  {
    icon: MessageSquare,
    color: 'var(--primary)',
    bg: 'var(--primary-muted)',
    title: 'AI Chat',
    description: 'Interactive chat with your AI assistant. Ask questions, get help with test cases, and explore Robot Framework concepts.',
  },
  {
    icon: FlaskConical,
    color: 'var(--accent)',
    bg: 'var(--accent-muted)',
    title: 'Test Generator',
    description: 'Generate Robot Framework test cases from descriptions or CodeBeamer test cases. Supports CAN, UART, DLT, HMI, and more.',
  },
  {
    icon: SearchCode,
    color: 'var(--success)',
    bg: 'var(--success-muted)',
    title: 'Code Review',
    description: 'Get AI-powered review of your Robot Framework test code with actionable improvement suggestions.',
  },
  {
    icon: BookOpen,
    color: 'var(--warning)',
    bg: 'var(--warning-muted)',
    title: 'RAG Knowledge Base',
    description: 'Upload and index your documentation, test files, and code. The AI uses this knowledge to generate better test cases.',
  },
  {
    icon: Database,
    color: '#e879f9',
    bg: 'rgba(232, 121, 249, 0.15)',
    title: 'CodeBeamer Integration',
    description: 'Connect to CodeBeamer to fetch test cases and generate Robot Framework tests directly from existing requirements.',
  },
  {
    icon: Brain,
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.15)',
    title: 'Multi-Model Support',
    description: 'Choose between EXACODE, Ollama (Gemma4, Llama3, Qwen3), and more. Switch models on the fly.',
  },
];

const TECH_STACK = [
  'React', 'Vite', 'FastAPI', 'Python', 'Robot Framework',
  'Monaco Editor', 'SSE Streaming', 'RAG / Embeddings', 'Ollama', 'LangChain',
];

export default function AboutTab() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <div className="about-hero">
        <h1>⚡ AI Agent Hub</h1>
        <p>Your intelligent companion for automated test generation, review, and knowledge management.</p>
      </div>

      {/* ─── Quick Start ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>
          <Zap size={18} /> Quick Start
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
          <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: 'var(--primary-gradient)', color: 'white', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700 }}>1</span>
              Configure LLM
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Go to Config and set up your LLM provider (EXACODE or Ollama).</p>
          </div>
          <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: 'var(--primary-gradient)', color: 'white', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700 }}>2</span>
              Upload Knowledge
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Index your Robot Framework files and documentation in the RAG tab.</p>
          </div>
          <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: 'var(--primary-gradient)', color: 'white', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700 }}>3</span>
              Start Generating
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Use Chat or Generate to create high-quality Robot Framework test cases.</p>
          </div>
        </div>
      </div>

      {/* ─── Features ─────────────────────────────────────────── */}
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 16 }}>Features</h2>
      <div className="feature-grid">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={i} className="feature-card">
              <div className="feature-card-icon" style={{ background: f.bg, color: f.color }}>
                <Icon size={20} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          );
        })}
      </div>

      {/* ─── Tech Stack ───────────────────────────────────────── */}
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="card-title" style={{ justifyContent: 'center', marginBottom: 16 }}>
          <Code2 size={18} /> Tech Stack
        </div>
        <div className="tech-badges">
          {TECH_STACK.map((t) => (
            <span key={t} className="tech-badge">{t}</span>
          ))}
        </div>
        <div style={{ marginTop: 20, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          AI Agent Hub v1.0.0 — Built with ❤️ for automotive test automation
        </div>
      </div>
    </div>
  );
}
