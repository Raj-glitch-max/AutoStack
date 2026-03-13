import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Layers, Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';

export default function ForgotPasswordPage() {
    const { resetPassword } = useAuth();
    const toast = useToast();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email) return;
        setLoading(true);
        try {
            await resetPassword(email);
            setSent(true);
        } catch (err) {
            toast.error(err.message || 'Failed to send reset email');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
            <div className="w-full max-w-[420px] rounded-xl p-10"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>

                <div className="flex items-center justify-center gap-2 mb-8">
                    <Layers size={20} style={{ color: 'var(--blue-primary)' }} />
                    <span className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>AutoStack</span>
                </div>

                {sent ? (
                    <div className="text-center animate-fadeUp">
                        <MailCheck size={48} className="mx-auto mb-4" style={{ color: 'var(--green)' }} />
                        <h1 className="font-bold text-xl mb-2" style={{ color: 'var(--text-primary)' }}>Check your email</h1>
                        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                            We've sent a password reset link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
                        </p>
                        <Link to="/login" className="text-sm font-medium" style={{ color: 'var(--blue-primary)', textDecoration: 'none' }}>
                            ← Back to sign in
                        </Link>
                    </div>
                ) : (
                    <>
                        <h1 className="text-center font-bold text-2xl mb-1" style={{ color: 'var(--text-primary)' }}>Reset your password</h1>
                        <p className="text-center text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                            Enter your email and we'll send you a reset link
                        </p>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email address</label>
                                <div className="relative">
                                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                                        className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm"
                                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }} />
                                </div>
                            </div>

                            <button type="submit" disabled={loading}
                                className="w-full h-[44px] rounded-lg font-medium text-sm text-white cursor-pointer flex items-center justify-center gap-2"
                                style={{ background: loading ? 'var(--border-default)' : 'var(--blue-primary)', border: 'none' }}>
                                {loading ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Send reset link'}
                            </button>
                        </form>

                        <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                            <Link to="/login" style={{ color: 'var(--blue-primary)', textDecoration: 'none' }}>← Back to sign in</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
