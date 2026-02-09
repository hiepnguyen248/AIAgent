import { Bot, TestTube, FileCode, Brain, Boxes, Link2 } from 'lucide-react';

function AboutTab() {
    const frameworks = [
        {
            name: 'Common Framework',
            url: 'https://robotframework.org/',
            description: 'Robot Framework',
            icon: TestTube,
            color: '#00b894'
        },
        {
            name: 'CodeBeamer',
            url: 'https://codebeamer.com/',
            description: 'ALM & Test Management',
            icon: FileCode,
            color: '#3498db'
        },
        {
            name: 'EXACODE',
            url: 'https://exacode.lge.com/',
            description: 'LGE AI Assistant',
            icon: Brain,
            color: '#9b59b6'
        },
        {
            name: 'Ollama',
            url: 'https://ollama.ai/',
            description: 'Local LLM Runner',
            icon: Boxes,
            color: '#e67e22'
        },
        {
            name: 'LangChain',
            url: 'https://langchain.com/',
            description: 'LLM Framework',
            icon: Link2,
            color: '#1abc9c'
        },
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 'calc(100vh - 100px)',
            justifyContent: 'space-between'
        }}>
            {/* Main Content */}
            <div>
                {/* Hero Section */}
                <div className="page-header" style={{ textAlign: 'center', paddingBottom: '32px' }}>
                    <div className="flex justify-center" style={{ marginBottom: '16px' }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: 'var(--radius-xl)',
                            background: 'linear-gradient(135deg, var(--primary-500), var(--accent-500))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Bot size={40} color="white" />
                        </div>
                    </div>
                    <h1 className="page-title" style={{ fontSize: '2rem' }}>AI Agent</h1>
                    <p className="page-subtitle" style={{ maxWidth: '600px', margin: '0 auto' }}>
                        AI-powered test automation platform for automotive embedded systems.
                        Generate, review, and improve Robot Framework tests with intelligent assistance.
                    </p>
                </div>

                {/* Framework Cards */}
                <div className="flex gap-4" style={{ flexWrap: 'wrap', marginBottom: '32px' }}>
                    {frameworks.map((fw, index) => {
                        const Icon = fw.icon;
                        return (
                            <a
                                key={index}
                                href={fw.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="card"
                                style={{
                                    flex: '1 1 180px',
                                    minWidth: '160px',
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <div className="card-body" style={{ textAlign: 'center', padding: '24px 16px' }}>
                                    <div style={{
                                        width: '56px',
                                        height: '56px',
                                        margin: '0 auto 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '12px',
                                        background: `${fw.color}20`
                                    }}>
                                        <Icon size={28} style={{ color: fw.color }} />
                                    </div>
                                    <h4 className="font-medium" style={{ marginBottom: '4px', color: 'var(--text-primary)' }}>
                                        {fw.name}
                                    </h4>
                                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                                        {fw.description}
                                    </p>
                                </div>
                            </a>
                        );
                    })}
                </div>
            </div>

            {/* Footer - Always at bottom */}
            <div style={{
                paddingTop: '24px',
                paddingBottom: '16px',
                borderTop: '1px solid var(--border-light)',
                textAlign: 'center',
                marginTop: 'auto'
            }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                    <strong>Author:</strong> Automation Validation Team
                </p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                    © 2026 LG Electronics. All rights reserved. | Powered by AI Technology for Enhanced Automation Productivity and Quality
                </p>
            </div>
        </div>
    );
}

export default AboutTab;
