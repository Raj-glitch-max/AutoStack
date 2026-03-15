export function Input({ placeholder, value, onChange, className = '', icon: Icon }) {
    return (
        <div className={`relative ${className}`}>
            {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />}
            <input type="text" placeholder={placeholder} value={value} onChange={onChange}
                className={`w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-md text-sm text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--blue-primary)] focus:ring-1 focus:ring-[var(--blue-primary)] transition-all ${Icon ? 'pl-9 pr-3' : 'px-3'} py-2`} />
        </div>
    );
}
