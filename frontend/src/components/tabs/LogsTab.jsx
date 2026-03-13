import { useState, useEffect, useRef } from 'react';
import { TerminalWindow, StatusDot, Button } from '../ui/index';
import { initialLogLines, liveLogPool } from '../../data';

export default function LogsTab({ cluster }) {
    const [logs, setLogs] = useState(initialLogLines);
    const [filter, setFilter] = useState('ALL');
    const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef(null);

    // Simulated Live Data Stream
    useEffect(() => {
        let t;
        const appendLog = () => {
            const newLine = liveLogPool[Math.floor(Math.random() * liveLogPool.length)];
            const d = new Date();
            newLine.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            setLogs(prev => [...prev.slice(-100), { ...newLine, id: Date.now() }]);
            t = setTimeout(appendLog, 800 + Math.random() * 1200);
        };
        t = setTimeout(appendLog, 1500);
        return () => clearTimeout(t);
    }, []);

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

    return (
        <div className="space-y-6 animate-fadeIn h-full flex flex-col">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold">Deployment Logs</h2>
                    <p className="text-[13px] text-[var(--text-muted)] mt-1 flex items-center gap-2">
                        Real-time <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                        {autoScroll ? 'auto-scroll enabled' : 'auto-scroll paused'}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between">
                <div className="flex items-center bg-[var(--bg-surface)] border border-[var(--border-default)] p-1 rounded-lg">
                    {['ALL', 'INFO', 'WARN', 'SUCCESS'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-all ${filter === f ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                            {f}
                        </button>
                    ))}
                </div>
                <Button variant="ghost" size="sm">Copy all</Button>
            </div>

            {/* Terminal */}
            <TerminalWindow live title={`autostack logs --follow --cluster ${cluster?.name || 'cluster'}`} className="flex-1 shadow-2xl h-[calc(100vh-280px)] min-h-[500px] flex flex-col">
                <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-[10px] md:px-0 scroll-smooth">
                    <div className="space-y-1 pb-8">
                        {filteredLogs.map((log, i) => (
                            <div key={log.id || i} className="flex gap-4 hover:bg-[rgba(255,255,255,0.02)] px-2 py-0.5 rounded transition-colors group animate-fadeIn" style={{ animationDuration: '0.3s' }}>
                                <span className="w-16 flex-shrink-0 text-[var(--text-dim)]">{log.time}</span>
                                <span className="w-16 flex-shrink-0 font-bold" style={{ color: getLevelColor(log.level) }}>{log.level}</span>
                                <span className="w-24 flex-shrink-0" style={{ color: getServiceColor(log.service) }}>[{log.service}]</span>
                                <span className="flex-1 text-[var(--text-primary)] relative">
                                    {log.msg}
                                </span>
                            </div>
                        ))}
                    </div>

                    {!filteredLogs.length && (
                        <div className="text-[var(--text-dim)] italic mt-4 text-center">No logs match the current filter.</div>
                    )}

                    {/* Blinking trailing cursor */}
                    {autoScroll && filter === 'ALL' && (
                        <div className="mt-2 flex">
                            <span className="w-16 flex-shrink-0" /><span className="w-16 flex-shrink-0" /><span className="w-24 flex-shrink-0" />
                            <span className="inline-block w-2.5 h-4 bg-[var(--term-prompt)] animate-blink" />
                        </div>
                    )}
                </div>
            </TerminalWindow>
        </div>
    );
}
