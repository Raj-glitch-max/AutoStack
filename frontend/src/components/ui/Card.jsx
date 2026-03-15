export function Card({ children, className = '', hover = true, style = {} }) {
    return (
        <div
            className={`bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl ${hover ? 'transition-all duration-200 hover:border-[var(--text-dim)]' : ''} ${className}`}
            style={style}
        >{children}</div>
    );
}
