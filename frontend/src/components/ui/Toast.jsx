import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const VARIANTS = {
    success: { color: 'var(--green)', Icon: CheckCircle },
    error: { color: 'var(--red)', Icon: XCircle },
    info: { color: 'var(--blue-primary)', Icon: Info },
    warning: { color: 'var(--amber)', Icon: AlertTriangle },
};

export default function Toast({ variant = 'info', message, onClose, onMouseEnter, onMouseLeave }) {
    const [visible, setVisible] = useState(false);
    const { color, Icon } = VARIANTS[variant] || VARIANTS.info;

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 250);
    };

    return (
        <div
            className="pointer-events-auto"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderLeft: `4px solid ${color}`,
                borderRadius: 8,
                padding: '12px 36px 12px 12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                transform: visible ? 'translateX(0)' : 'translateX(110%)',
                opacity: visible ? 1 : 0,
                transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
                position: 'relative',
            }}
        >
            <Icon size={18} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{message}</span>
            <button
                onClick={handleClose}
                style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-dim)',
                }}
            >
                <X size={14} />
            </button>
        </div>
    );
}
