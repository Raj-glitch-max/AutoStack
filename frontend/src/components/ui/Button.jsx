import { useRef } from 'react';

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
