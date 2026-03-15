import { useEffect } from 'react';
import { X } from 'lucide-react';

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
