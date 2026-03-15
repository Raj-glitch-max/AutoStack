import { useState, useEffect, useRef } from 'react';
import { TerminalWindow, StatusDot, Button } from '../ui/index';
import { supabase } from '../../lib/supabase';
import { Terminal } from 'lucide-react';
import EmptyState from '../ui/EmptyState';

export default function LogsTab({ cluster }) {
    const [logs, setLogs] = useState([]);
    const [filter, setFilter] = useState('ALL');
    const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef(null);

    // Real-Time Log Subscription
    useEffect(() => {
        if (!cluster?.id) return;

        // 1. Fetch initial batch
        const fetchInitialLogs = async () => {
            const { data, error } = await supabase
                .from('pod_logs')
                .select('*')
                .eq('project_id', cluster.id)
                .order('logged_at', { ascending: true })
                .limit(100);
            
            if (!error && data) {
                setLogs(data.map(l => ({
                    id: l.id,
                    time: new Date(l.logged_at).toLocaleTimeString([], { hour12: false }),
                    level: (l.log_level || 'INFO').toUpperCase(),
                    service: l.namespace || 'system',
                    msg: l.log_line
                })));
            }
        };

        fetchInitialLogs();

        // 2. Subscribe to new logs
        const channel = supabase
            .channel(`logs-${cluster.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pod_logs',
                filter: `project_id=eq.${cluster.id}`
            }, (payload) => {
                const l = payload.new;
                const newLine = {
                    id: l.id,
                    time: new Date(l.logged_at).toLocaleTimeString([], { hour12: false }),
                    level: (l.log_level || 'INFO').toUpperCase(),
                    service: l.namespace || 'system',
                    msg: l.log_line
                };
                setLogs(prev => [...prev.slice(-100), newLine]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [cluster?.id]);

    // Auto-scroll
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setAutoScroll(isAtBottom);
    };

    const getLevelColor = (level) => {
        if (level === 'INFO') return 'var(--blue-light)';
        if (level === 'WARN') return 'var(--amber)';
        if (level === 'SUCCESS') return 'var(--green)';
        if (level === 'ERROR') return 'var(--red)';
        return 'var(--text-primary)';
    };

    const getServiceColor = (srv) => {
        if (srv === 'argocd') return 'var(--purple)';
        if (srv === 'kubelet') return 'var(--text-muted)';
        if (srv === 'k8s-api') return 'var(--cyan)';
        if (srv === 'coie') return 'var(--green)';
        if (srv === 'aire') return 'var(--amber)';
        return 'var(--blue-light)';
    };

    const filteredLogs = logs.filter(l => filter === 'ALL' || l.level === filter);

    if (!cluster) {
        return (
            <div className="animate-fadeIn p-10 h-full flex items-center justify-center">
                <EmptyState
                    icon={Terminal}
                    title="No Cluster Selected"
                    description="Connect or select a cluster to view live deployment and agent logs."
                    action={{ label: 'Go to Onboarding', onClick: () => window.location.href = '/onboarding' }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn h-full flex flex-col">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        Deployment Logs
                        <StatusDot status="active" />
                    </h2>
                    <p className="text-[13px] text-[var(--text-muted)] mt-1 flex items-center gap-2">
                        Real-time cluster telemetry <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                        {autoScroll ? 'auto-scroll enabled' : 'auto-scroll paused'}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between">
                <div className="flex items-center bg-[var(--bg-surface)] border border-[var(--border-default)] p-1 rounded-lg">
                    {['ALL', 'INFO', 'WARN', 'SUCCESS', 'ERROR'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-all ${filter === f ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setLogs([])}>Clear terminal</Button>
            </div>

            {/* Terminal */}
            <TerminalWindow live title={`autostack logs --follow --cluster ${cluster?.name || 'cluster'}`} className="flex-1 shadow-2xl h-[calc(100vh-280px)] min-h-[500px] flex flex-col">
                <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-[10px] md:px-0 scroll-smooth">
                    <div className="space-y-1 pb-8">
                        {filteredLogs.map((log, i) => (
                            <div key={log.id || i} className="flex gap-4 hover:bg-[rgba(255,255,255,0.02)] px-2 py-0.5 rounded transition-colors group animate-fadeIn font-mono text-[13px]" style={{ animationDuration: '0.3s' }}>
                                <span className="w-20 flex-shrink-0 text-[var(--text-dim)]">{log.time}</span>
                                <span className="w-16 flex-shrink-0 font-bold" style={{ color: getLevelColor(log.level) }}>{log.level}</span>
                                <span className="w-24 flex-shrink-0 opacity-70" style={{ color: getServiceColor(log.service) }}>[{log.service}]</span>
                                <span className="flex-1 text-[var(--text-primary)] relative break-all">
                                    {log.msg}
                                </span>
                            </div>
                        ))}
                    </div>

                    {!filteredLogs.length && (
                        <div className="text-[var(--text-dim)] italic mt-4 text-center">Waiting for incoming logs...</div>
                    )}

                    {/* Blinking trailing cursor */}
                    {autoScroll && filter === 'ALL' && (
                        <div className="mt-2 flex">
                            <span className="w-20 flex-shrink-0" /><span className="w-16 flex-shrink-0" /><span className="w-24 flex-shrink-0" />
                            <span className="inline-block w-2.5 h-4 bg-[var(--term-prompt)] animate-blink" />
                        </div>
                    )}
                </div>
            </TerminalWindow>
        </div>
    );
}
