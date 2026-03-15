import { useState, useEffect } from 'react';

export function ProgressBar({ value, color = 'var(--green)', height = 4, animate = true, className = '' }) {
    const [animatedWidth, setAnimatedWidth] = useState(0);
    useEffect(() => {
        if (animate) {
            const t = setTimeout(() => setAnimatedWidth(value), 100);
            return () => clearTimeout(t);
        }
    }, [value, animate]);

    const width = animate ? animatedWidth : value;
    const barColor = color === 'auto' ? (value > 90 ? 'var(--red)' : value > 70 ? 'var(--amber)' : 'var(--green)') : color;
    return (
        <div className={`w-full rounded-full overflow-hidden ${className}`} style={{ height, background: 'var(--bg-surface)' }}>
            <div className="rounded-full transition-all duration-1000 ease-out" style={{ width: `${width}%`, height: '100%', background: barColor }} />
        </div>
    );
}
