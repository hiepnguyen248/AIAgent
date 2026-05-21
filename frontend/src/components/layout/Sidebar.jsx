import {
  Search,
  FlaskConical,
  BookOpen,
  Settings,
  Info,
  ChevronLeft,
  ChevronRight,
  Zap,
  BarChart3,
  FileEdit,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'chat', label: 'Knowledge', icon: Search },
  { id: 'pipeline', label: 'Test Pipeline', icon: FlaskConical },
  { id: 'rag', label: 'RAG Knowledge', icon: BookOpen },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'prompts', label: 'Prompt Library', icon: FileEdit },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'about', label: 'About', icon: Info },
];

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Zap size={18} />
        </div>
        <span className="sidebar-title">AI Agent Hub</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} />
              <span className="sidebar-item-label">{item.label}</span>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-toggle">
        <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
}
