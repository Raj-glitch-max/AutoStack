export function Tag({ children, color = 'var(--green)', small = false }) {
    return (
        <span
            className="font-medium uppercase tracking-wider inline-flex items-center gap-1"
            style={{
                fontSize: small ? 10 : 11, padding: small ? '1px 6px' : '2px 8px',
                borderRadius: 4, border: `1px solid ${color}40`,
                background: `${color}15`, color: color,
            }}
        >{children}</span>
    );
}
