import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Layers, Github, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const { signIn, signInWithGithub } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email || !password) { setError('Please fill in all fields.'); return; }
        setLoading(true);
        try {
            await signIn(email, password);
            toast.success('Signed in successfully');
            navigate('/dashboard');
        } catch (err) {
            setError(err.message || 'Invalid email or password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGithub = async () => {
        try {
            await signInWithGithub();
        } catch (err) {
            toast.error(err.message || 'GitHub sign in failed');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
            <div
                className="w-full max-w-[420px] rounded-xl p-10"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}
            >
                <div className="flex items-center justify-center gap-2 mb-8">
                    <Layers size={20} style={{ color: 'var(--blue-primary)' }} />
                    <span className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>AutoStack</span>
                </div>

                <h1 className="text-center font-bold text-2xl mb-1" style={{ color: 'var(--text-primary)' }}>Welcome back</h1>
                <p className="text-center text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Sign in to your account</p>

                {error && (
                    <div className="mb-4 p-3 rounded-lg text-[13px]" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--red)' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email address</label>
                        <div className="relative">
                            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
                            <input
                                type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                        <div className="relative">
                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
                            <input
                                type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                                className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }}
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                        <div className="text-right mt-1">
                            <Link to="/forgot-password" className="text-xs" style={{ color: 'var(--blue-primary)', textDecoration: 'none' }}>Forgot password?</Link>
                        </div>
                    </div>

                    <button type="submit" disabled={loading}
                        className="w-full h-[44px] rounded-lg font-medium text-sm text-white cursor-pointer flex items-center justify-center gap-2 mt-1"
                        style={{ background: loading ? 'var(--border-default)' : 'var(--blue-primary)', border: 'none', transition: 'all 0.15s' }}>
                        {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : 'Sign in'}
                    </button>
                </form>

                <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>or continue with</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} />
                </div>

                <button onClick={handleGithub}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', transition: 'all 0.15s' }}>
                    <Github size={16} /> Continue with GitHub
                </button>

                <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Don't have an account?{' '}
                    <Link to="/signup" style={{ color: 'var(--blue-primary)', textDecoration: 'none' }}>Sign up</Link>
                </p>
            </div>
        </div>
    );
}
