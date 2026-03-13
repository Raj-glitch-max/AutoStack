import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── StatusDot ─── */
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

/* ─── Tag ─── */
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

/* ─── Button ─── */
export function Button({ children, variant = 'primary', onClick, className = '', icon: Icon, size = 'md', danger = false }) {
    const ref = useRef(null);
    const handleClick = (e) => {
        const btn = ref.current;
        const rect = btn.getBoundingClientRect();
        const circle = document.createElement('span');
        const diameter = Math.max(rect.width, rect.height);
        circle.style.cssText = `width:${diameter}px;height:${diameter}px;left:${e.clientX - rect.left - diameter / 2}px;top:${e.clientY - rect.top - diameter / 2}px;position:absolute;border-radius:50%;background:rgba(255,255,255,0.2);transform:scale(0);animation:ripple 0.5s linear;pointer-events:none;`;
        btn.appendChild(circle);
        setTimeout(() => circle.remove(), 500);
        onClick?.(e);
    };
    const base = 'relative overflow-hidden font-medium transition-all duration-150 cursor-pointer inline-flex items-center justify-center gap-2';
    const sizes = { sm: 'text-xs px-3 py-1.5 rounded', md: 'text-sm px-4 py-2 rounded-lg', lg: 'text-sm px-6 py-2.5 rounded-lg' };
    const variants = {
        primary: `bg-[var(--blue-primary)] text-white hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(36,99,235,0.4)] active:translate-y-0 ${danger ? 'bg-[var(--red)] hover:shadow-[0_4px_16px_rgba(244,63,94,0.4)]' : ''}`,
        secondary: 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:border-[var(--text-dim)] hover:text-[var(--text-primary)]',
        ghost: `text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] ${danger ? 'text-[var(--red)] hover:text-[var(--red)]' : ''}`,
    };
    return (
        <button ref={ref} onClick={handleClick} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
            {Icon && <Icon size={14} strokeWidth={1.5} />}{children}
        </button>
    );
}

/* ─── Card ─── */
export function Card({ children, className = '', hover = true, style = {} }) {
    return (
        <div
            className={`bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl ${hover ? 'transition-all duration-200 hover:border-[var(--text-dim)]' : ''} ${className}`}
            style={style}
        >{children}</div>
    );
}

/* ─── ProgressBar ─── */
export function ProgressBar({ value, color = 'var(--green)', height = 4, animate = true, className = '' }) {
    const [width, setWidth] = useState(0);
    useEffect(() => { if (animate) { const t = setTimeout(() => setWidth(value), 100); return () => clearTimeout(t); } else { setWidth(value); } }, [value, animate]);
    const barColor = color === 'auto' ? (value > 90 ? 'var(--red)' : value > 70 ? 'var(--amber)' : 'var(--green)') : color;
    return (
        <div className={`w-full rounded-full overflow-hidden ${className}`} style={{ height, background: 'var(--bg-surface)' }}>
            <div className="rounded-full transition-all duration-1000 ease-out" style={{ width: `${width}%`, height: '100%', background: barColor }} />
        </div>
    );
}

/* ─── ToggleSwitch ─── */
export function ToggleSwitch({ checked, onChange }) {
    return (
        <button onClick={() => onChange?.(!checked)} className="relative inline-flex cursor-pointer flex-shrink-0 rounded-full transition-colors duration-200"
            style={{ width: 36, height: 20, background: checked ? 'var(--blue-primary)' : 'var(--bg-card)', border: `1px solid ${checked ? 'var(--blue-primary)' : 'var(--border-default)'}` }}>
            <span className="rounded-full bg-white shadow transition-all duration-200 absolute top-0.5"
                style={{ width: 14, height: 14, left: checked ? 18 : 3 }} />
        </button>
    );
}

/* ─── Modal ─── */
export function Modal({ children, onClose, title }) {
    useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px) saturate(180%)' }} />
            <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[520px] rounded-xl overflow-hidden"
                style={{ background: 'rgba(13,17,23,0.92)', border: '1px solid var(--border-default)', borderTop: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)', animation: 'fadeUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
                <div className="flex items-center justify-between p-5 border-b border-[var(--border-default)]">
                    <h3 className="font-bold text-lg">{title}</h3>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"><X size={18} /></button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

/* ─── TerminalWindow ─── */
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

/* ─── useCountUp ─── */
export function useCountUp(target, duration = 800, start = true) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        if (!start) return;
        let startTime;
        const ease = t => 1 - Math.pow(1 - t, 3);
        const animate = (ts) => {
            if (!startTime) startTime = ts;
            const progress = Math.min((ts - startTime) / duration, 1);
            setValue(Math.round(ease(progress) * target));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [target, duration, start]);
    return value;
}

/* ─── ChartTooltip ─── */
export function ChartTooltipContent({ active, payload, label, unit = '', color = 'var(--blue-primary)' }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="font-mono rounded-lg p-3 border border-[var(--border-default)]" style={{ background: 'var(--bg-surface)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <div className="text-[11px] text-[var(--text-muted)] mb-1">{label}</div>
            <div className="font-bold text-sm" style={{ color }}>{payload[0].value}{unit}</div>
        </div>
    );
}

/* ─── Input ─── */
export function Input({ placeholder, value, onChange, className = '', icon: Icon }) {
    return (
        <div className={`relative ${className}`}>
            {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />}
            <input type="text" placeholder={placeholder} value={value} onChange={onChange}
                className={`w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-md text-sm text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--blue-primary)] focus:ring-1 focus:ring-[var(--blue-primary)] transition-all ${Icon ? 'pl-9 pr-3' : 'px-3'} py-2`} />
        </div>
    );
}

/* ─── Select ─── */
export function Select({ options, value, onChange, className = '' }) {
    return (
        <select value={value} onChange={e => onChange?.(e.target.value)}
            className={`w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-md text-sm text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-[var(--blue-primary)] focus:ring-1 focus:ring-[var(--blue-primary)] cursor-pointer appearance-none ${className}`}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}
