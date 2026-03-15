export function ChartTooltipContent({ active, payload, label, unit = '', color = 'var(--blue-primary)' }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="font-mono rounded-lg p-3 border border-[var(--border-default)]" style={{ background: 'var(--bg-surface)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <div className="text-[11px] text-[var(--text-muted)] mb-1">{label}</div>
            <div className="font-bold text-sm" style={{ color }}>{payload[0].value}{unit}</div>
        </div>
    );
}
