import { useState, useEffect } from 'react';
import {
    MessageSquare,
    Wand2,
    FileSearch,
    Settings,
    Info,
    Sun,
    Moon,
    Sparkles
} from 'lucide-react';
import ChatTab from './components/ChatTab';
import GenerateTab from './components/GenerateTab';
import ReviewTab from './components/ReviewTab';
import ConfigTab from './components/ConfigTab';
import AboutTab from './components/AboutTab';

const TABS = [
    { id: 'chat', name: 'AI Chat', icon: MessageSquare },
    { id: 'generate', name: 'Generate Test Script', icon: Wand2 },
    { id: 'review', name: 'Review Test', icon: FileSearch },
    { id: 'config', name: 'Config', icon: Settings },
    { id: 'about', name: 'About', icon: Info },
];

function App() {
    const [activeTab, setActiveTab] = useState('chat');
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('theme');
        return saved || 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };



    return (
        <div className="app-container">
            {/* Sidebar Navigation - Left Side */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">
                            <Sparkles size={22} />
                        </div>
                        <div>
                            <div className="sidebar-logo-text">AI Agent</div>
                            <div className="sidebar-logo-subtitle">Automation Validation Team</div>
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon className="nav-item-icon" size={20} />
                                <span>{tab.name}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <button className="theme-toggle" onClick={toggleTheme}>
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area - All tabs mounted, only active one visible */}
            <main className="main-content">
                <div className="content-wrapper">
                    <div style={{ display: activeTab === 'chat' ? 'block' : 'none', height: '100%' }}>
                        <ChatTab />
                    </div>
                    <div style={{ display: activeTab === 'generate' ? 'block' : 'none', height: '100%' }}>
                        <GenerateTab />
                    </div>
                    <div style={{ display: activeTab === 'review' ? 'block' : 'none', height: '100%' }}>
                        <ReviewTab />
                    </div>
                    <div style={{ display: activeTab === 'config' ? 'block' : 'none', height: '100%' }}>
                        <ConfigTab />
                    </div>
                    <div style={{ display: activeTab === 'about' ? 'block' : 'none', height: '100%' }}>
                        <AboutTab />
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
