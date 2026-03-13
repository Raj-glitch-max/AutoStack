import { createContext, useContext, useState, useCallback, useRef } from 'react';
import Toast from '../components/ui/Toast';

const ToastContext = createContext(null);

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef(new Map());

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        const timer = timersRef.current.get(id);
        if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
    }, []);

    const addToast = useCallback((variant, message) => {
        const id = crypto.randomUUID();
        setToasts(prev => {
            const next = [...prev, { id, variant, message }];
            return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
        });
        const timer = setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
        timersRef.current.set(id, timer);
        return id;
    }, [removeToast]);

    const pauseTimer = useCallback((id) => {
        const timer = timersRef.current.get(id);
        if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
    }, []);

    const resumeTimer = useCallback((id) => {
        const timer = setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
        timersRef.current.set(id, timer);
    }, [removeToast]);

    const toast = {
        success: (msg) => addToast('success', msg),
        error: (msg) => addToast('error', msg),
        info: (msg) => addToast('info', msg),
        warning: (msg) => addToast('warning', msg),
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[360px] pointer-events-none">
                {toasts.map(t => (
                    <Toast
                        key={t.id}
                        variant={t.variant}
                        message={t.message}
                        onClose={() => removeToast(t.id)}
                        onMouseEnter={() => pauseTimer(t.id)}
                        onMouseLeave={() => resumeTimer(t.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
