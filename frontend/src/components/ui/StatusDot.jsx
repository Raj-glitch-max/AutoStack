export function StatusDot({ color = 'var(--green)', pulse = false, glow = false, size = 6 }) {
    return (
        <span
            className={`inline-block rounded-full flex-shrink-0 ${pulse ? 'animate-pulse-dot' : ''}`}
            style={{
                width: size, height: size, backgroundColor: color,
                boxShadow: glow ? `0 0 6px ${color}, 0 0 12px ${color}40` : 'none',
                animation: pulse ? `pulse ${pulse === 'fast' ? '1.5s' : '2s'} infinite` : undefined,
            }}
        />
    );
}
