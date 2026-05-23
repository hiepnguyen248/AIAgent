import {
  Zap, Code2, Database, Brain, Cpu, Server, Link
} from 'lucide-react';

const INTEGRATIONS = [
  {
    icon: Cpu,
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.15)',
    title: 'Common Framework',
    description: 'Core test execution utilizing Robot Framework with native extensions for UART, CAN, DLT, and HMI automation.',
  },
  {
    icon: Database,
    color: '#0ea5e9',
    bg: 'rgba(14, 165, 233, 0.15)',
    title: 'CodeBeamer',
    description: 'High-performance ALM integration allowing direct fetching of requirements, test cases, and test specifications.',
  },
  {
    icon: Brain,
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.15)',
    title: 'EXACODE',
    description: 'Enterprise-grade proprietary LGE AI service custom-tailored for code generation, optimization, and code review.',
  },
  {
    icon: Server,
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.15)',
    title: 'Ollama',
    description: 'Local containerized inference enabling high-speed LLM processing completely offline for maximum security.',
  },
  {
    icon: Link,
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.15)',
    title: 'LangChain',
    description: 'Advanced multi-agent developer framework utilizing LangGraph workflows to drive automated reasoning and validation.',
  },
];

export default function AboutTab() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 40 }}>
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <div className="about-hero">
        <h1>⚡ AIGenTS</h1>
        <p>Your premium intelligent companion for automated test generation, review, and knowledge management.</p>
      </div>

      {/* ─── Quick Start ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 32 }}>
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

      {/* ─── Integrations ─────────────────────────────────────── */}
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Code2 size={20} style={{ color: 'var(--primary)' }} /> Core Integrations
      </h2>
      <div className="feature-grid">
        {INTEGRATIONS.map((f, i) => {
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

      {/* ─── Footer ───────────────────────────────────────────── */}
      <div className="about-footer" style={{
        marginTop: 48,
        paddingTop: 24,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        color: 'var(--text-muted)',
        fontSize: '0.85rem'
      }}>
        <span>Author: Automation Validation Team</span>
        <span>© 2026 LG Electronics</span>
      </div>
    </div>
  );
}
