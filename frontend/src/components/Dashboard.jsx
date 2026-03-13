import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderGit2, GitBranch, Server, Activity, FileText, Settings, Search, Bell, ChevronDown, LogOut } from 'lucide-react';

// Lazy load tab components
const OverviewTab = lazy(() => import('./tabs/OverviewTab'));
const ProjectsTab = lazy(() => import('./tabs/ProjectsTab'));
const PipelinesTab = lazy(() => import('./tabs/PipelinesTab'));
const InfrastructureTab = lazy(() => import('./tabs/InfrastructureTab'));
const MonitoringTab = lazy(() => import('./tabs/MonitoringTab'));
const LogsTab = lazy(() => import('./tabs/LogsTab'));
const SettingsTab = lazy(() => import('./tabs/SettingsTab'));

import { StatusDot } from './ui/index';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { useClusters } from '../hooks/useData';
import { SkeletonText } from './ui/Skeleton';
import TabErrorBoundary from './TabErrorBoundary';

/* ─── Command Palette (⌘K) ─── */
function DashboardCommandPalette({ isOpen, onClose, navItems, setActiveTab }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex justify-center pt-[15vh]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[560px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] animate-fadeUp overflow-hidden flex flex-col" style={{ maxHeight: '60vh' }}>
                <div className="flex items-center px-4 py-3 border-b border-[var(--border-default)]">
                    <Search size={18} className="text-[var(--text-muted)] mr-3" />
                    <input type="text" placeholder="Search anything... (Navigate, Actions)" className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-dim)]" autoFocus />
                    <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)] px-2 py-1 rounded border border-[var(--border-default)]">ESC</span>
                </div>
                <div className="p-2 overflow-y-auto">
                    <div className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Navigate</div>
                    {navItems.map(item => (
                        <button key={item.id} onClick={() => { setActiveTab(item.id); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-card)] rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-left transition-colors">
                            <item.icon size={16} /> <span>{item.label}</span>
                        </button>
                    ))}
                    <div className="px-3 py-2 mt-2 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Actions</div>
                    <button className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--bg-card)] rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-left">
                        <span className="flex items-center gap-3"><FolderGit2 size={16} /> New Project</span>
                        <span className="text-xs bg-[var(--bg-card)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">⌘N</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { tab } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const activeTab = tab || 'overview';
    const setActiveTab = (t) => navigate(`/dashboard/${t}`);
    const [cmdOpen, setCmdOpen] = useState(false);

    const { user, signOut } = useAuth();
    const { data: clusters, loading: clustersLoading } = useClusters();
    const [activeClusterId, setActiveClusterId] = useState(null);

    // Auto-select first cluster if none selected
    useEffect(() => {
        if (!activeClusterId && clusters?.length > 0) {
            setActiveClusterId(clusters[0].id);
        }
    }, [clusters, activeClusterId]);

    const activeCluster = clusters?.find(c => c.id === activeClusterId);

    const handleLogout = async () => {
        await signOut();
        toast.info('Signed out');
        navigate('/');
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true); }
            if (e.key === 'Escape') setCmdOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const navItems = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'projects', label: 'Projects', icon: FolderGit2 },
        { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
        { id: 'infrastructure', label: 'Infrastructure', icon: Server },
        { id: 'monitoring', label: 'Monitoring', icon: Activity },
        { id: 'logs', label: 'Logs', icon: FileText },
    ];

    const currentTabName = [...navItems, { id: 'settings', label: 'Settings' }].find(t => t.id === activeTab)?.label;

    return (
        <div className="min-h-screen flex bg-[var(--bg-base)] content-grid text-[var(--text-primary)]">
            <DashboardCommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} navItems={navItems} setActiveTab={setActiveTab} />

            {/* Sidebar - 220px Fixed */}
            <aside className="fixed inset-y-0 left-0 w-[220px] bg-[var(--bg-surface)] border-r border-[var(--border-default)] flex flex-col z-30">

                {/* Org Switcher */}
                <div className="p-4">
                    <div className="bg-[var(--bg-card)] rounded-lg p-3 flex items-center gap-2 cursor-pointer border border-transparent hover:border-[var(--border-default)] transition-colors">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-[#1e3a5f] to-[var(--blue-primary)] flex-shrink-0" onClick={() => navigate('/')} title="Back to Landing Page" />
                        <div className="flex-1 flex items-center justify-between overflow-hidden">
                            <span className="text-sm font-medium truncate">Acme Corp</span>
                            <ChevronDown size={14} className="text-[var(--text-muted)]" />
                        </div>
                    </div>

                    {/* Cluster Badge */}
                    <div className="bg-[var(--bg-base)] border border-[var(--border-default)] rounded-lg p-3 mt-3">
                        {clustersLoading ? (
                            <div className="space-y-2">
                                <SkeletonText className="w-24 h-4" />
                                <SkeletonText className="w-32 h-3" />
                            </div>
                        ) : activeCluster ? (
                            <>
                                <div className="flex items-center gap-2 mb-1 cursor-pointer hover:opacity-80 transition-opacity">
                                    <StatusDot color={activeCluster.health_score > 80 ? 'var(--green)' : 'var(--amber)'} glow pulse={activeCluster.health_score > 80} />
                                    <span className="font-mono text-[11px] truncate" title={activeCluster.name}>{activeCluster.name}</span>
                                    <ChevronDown size={14} className="text-[var(--text-muted)] ml-auto" />
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-[var(--text-muted)]">{activeCluster.provider} · {activeCluster.node_count} nodes</span>
                                    <span className="font-mono text-[var(--green)]">{activeCluster.health_score}</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-[11px] text-[var(--text-muted)] text-center">No clusters found</div>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-2">
                    <div className="px-4 text-[10px] font-semibold tracking-widest text-[var(--text-dim)] mb-2 uppercase">Platform</div>
                    <nav className="space-y-0.5">
                        {navItems.map(item => {
                            const active = activeTab === item.id;
                            return (
                                <button key={item.id} onClick={() => setActiveTab(item.id)}
                                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors border-l-2 ${active
                                        ? 'bg-[rgba(36,99,235,0.1)] text-[var(--blue-primary)] border-[var(--blue-primary)]'
                                        : 'text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
                                        }`}>
                                    <item.icon size={16} strokeWidth={active ? 2 : 1.5} />
                                    <span>{item.label}</span>
                                </button>
                            )
                        })}
                    </nav>

                    <div className="my-4 mx-4 h-px bg-[var(--border-default)]" />

                    <button onClick={() => setActiveTab('settings')}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors border-l-2 ${activeTab === 'settings'
                            ? 'bg-[rgba(36,99,235,0.1)] text-[var(--blue-primary)] border-[var(--blue-primary)]'
                            : 'text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
                            }`}>
                        <Settings size={16} strokeWidth={activeTab === 'settings' ? 2 : 1.5} />
                        <span>Settings</span>
                    </button>
                </div>

                {/* User Row */}
                <div className="p-4 border-t border-[var(--border-default)]">
                    <div className="flex items-center gap-3 cursor-pointer group">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--purple)] to-[var(--blue-primary)] flex-shrink-0 border border-[var(--border-default)]" />
                        <div className="flex flex-col flex-1 overflow-hidden">
                            <span className="text-xs font-medium group-hover:text-[var(--blue-primary)] transition-colors truncate">
                                {user?.user_metadata?.full_name || 'User'}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)] truncate">{user?.email}</span>
                        </div>
                        <button onClick={handleLogout} title="Sign out"
                            className="text-[var(--text-dim)] hover:text-[var(--red)] transition-colors cursor-pointer"
                            style={{ background: 'none', border: 'none' }}>
                            <LogOut size={14} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 ml-[220px] flex flex-col min-h-screen">
                {/* Top Bar - 52px Sticky */}
                <header className="h-[52px] sticky top-0 z-20 bg-[var(--bg-surface)]/90 backdrop-blur border-b border-[var(--border-default)] px-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="font-semibold text-[15px]">{currentTabName}</h1>
                        <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline-block">Cluster health and activity</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div
                            className="hidden sm:flex items-center bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--text-dim)] rounded-md px-3 py-1.5 cursor-pointer transition-colors"
                            onClick={() => setCmdOpen(true)}
                        >
                            <Search size={14} className="text-[var(--text-muted)] mr-2" />
                            <span className="text-xs text-[var(--text-dim)] mr-8">Search...</span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-base)] px-1 rounded border border-[var(--border-default)]">⌘K</span>
                        </div>
                        <button className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                            <Bell size={18} />
                            <span className="absolute top-0 right-0 w-2 h-2 bg-[var(--red)] rounded-full border border-[var(--bg-surface)] transform translate-x-0.5 -translate-y-0.5" />
                        </button>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--purple)] to-[var(--blue-primary)] border border-[var(--border-default)] cursor-pointer" />
                    </div>
                </header>

                {/* Dynamic Tab Content */}
                <div className="p-6 max-w-[1200px] w-full mx-auto pb-20 animate-fadeIn">
                    <TabErrorBoundary onRetry={() => window.location.reload()}>
                        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-8 bg-[var(--bg-card)] rounded w-1/4"></div><div className="h-64 bg-[var(--bg-card)] rounded"></div></div>}>
                            {activeTab === 'overview' && <OverviewTab onNavigate={setActiveTab} cluster={activeCluster} />}
                            {activeTab === 'projects' && <ProjectsTab cluster={activeCluster} />}
                            {activeTab === 'pipelines' && <PipelinesTab cluster={activeCluster} />}
                            {activeTab === 'infrastructure' && <InfrastructureTab cluster={activeCluster} />}
                            {activeTab === 'monitoring' && <MonitoringTab cluster={activeCluster} />}
                            {activeTab === 'logs' && <LogsTab cluster={activeCluster} />}
                            {activeTab === 'settings' && <SettingsTab cluster={activeCluster} />}
                        </Suspense>
                    </TabErrorBoundary>
                </div>
            </main>
        </div>
    );
}
