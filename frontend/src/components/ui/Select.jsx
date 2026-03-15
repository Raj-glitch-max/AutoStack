export function Select({ options, value, onChange, className = '' }) {
    return (
        <select value={value} onChange={e => onChange?.(e.target.value)}
            className={`w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-md text-sm text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-[var(--blue-primary)] focus:ring-1 focus:ring-[var(--blue-primary)] cursor-pointer appearance-none ${className}`}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}
