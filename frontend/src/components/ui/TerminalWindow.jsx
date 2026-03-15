import { StatusDot } from './StatusDot';

export function TerminalWindow({ children, title = 'bash — autostack deploy', live = false, className = '' }) {
    return (
        <div className={`rounded-xl overflow-hidden border border-[var(--border-default)] ${className}`} style={{ background: 'var(--bg-surface)', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            <div className="flex items-center px-4 py-3 border-b border-[var(--border-default)]" style={{ background: '#161b22' }}>
                <div className="flex gap-2 mr-4">
                    <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(239,68,68,0.8)' }} />
                    <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(234,179,8,0.8)' }} />
                    <span className="w-3 h-3 rounded-full" style={{ background: 'rgba(34,197,94,0.8)' }} />
                </div>
                <span className="font-mono text-xs text-[var(--text-muted)] flex-1 text-center">{title}</span>
                {live && (
                    <div className="flex items-center gap-1.5">
                        <StatusDot color="var(--green)" glow pulse />
                        <span className="text-[10px] font-medium text-[var(--green)] uppercase tracking-wider">Live</span>
                    </div>
                )}
            </div>
            <div className="p-6 font-mono text-sm leading-relaxed" style={{ minHeight: 200 }}>{children}</div>
        </div>
    );
}
