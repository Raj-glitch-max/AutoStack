import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, Layers, Github, Building, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../hooks/useAuth';

function PasswordStrength({ password }) {
    const getStrength = (p) => {
        let s = 0;
        if (p.length >= 8) s++;
        if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
        if (/\d/.test(p)) s++;
        if (/[^A-Za-z0-9]/.test(p)) s++;
        return s;
    };
    const strength = getStrength(password);
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['', 'var(--red)', 'var(--amber)', 'var(--blue-primary)', 'var(--green)'];
    if (!password) return null;
    return (
        <div className="mt-2">
            <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex-1 h-1 rounded-full" style={{ background: i <= strength ? colors[strength] : 'var(--bg-card)', transition: 'background 0.2s' }} />
                ))}
            </div>
            <span className="text-[11px] mt-1 block" style={{ color: colors[strength] }}>{labels[strength]}</span>
        </div>
    );
}

export default function SignupPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const { signUp, signInWithGithub } = useAuth();
    const [form, setForm] = useState({ name: '', email: '', org: '', password: '', confirm: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    const validate = () => {
        const e = {};
        if (!form.name.trim()) e.name = 'Full name is required';
        if (!form.email.trim()) e.email = 'Email is required';
        if (!form.org.trim()) e.org = 'Organization name is required';
        if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
        if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            await signUp(form.email, form.password, {
                full_name: form.name,
                organization_name: form.org,
            });
            toast.success('Account created — check your email to confirm');
            navigate('/onboarding');
        } catch (err) {
            toast.error(err.message || 'Signup failed');
        } finally {
            setLoading(false);
        }
    };

    const handleGithub = async () => {
        try {
            await signInWithGithub();
        } catch (err) {
            toast.error(err.message || 'GitHub sign up failed');
        }
    };

    const inputStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' };

    const renderField = (label, field, icon, type = 'text', placeholder = '') => {
        const Icon = icon;
        const isPassword = field === 'password' || field === 'confirm';
        return (
            <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
                <div className="relative">
                    <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
                    <input
                        type={isPassword && !showPassword ? 'password' : 'text'}
                        value={form[field]} onChange={update(field)} placeholder={placeholder}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={inputStyle}
                    />
                    {field === 'password' && (
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    )}
                </div>
                {errors[field] && <span className="text-[12px] mt-1 block" style={{ color: 'var(--red)' }}>{errors[field]}</span>}
                {field === 'password' && <PasswordStrength password={form.password} />}
            </div>
        );
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg-base)' }}>
            <div className="w-full max-w-[420px] rounded-xl p-10"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>

                <div className="flex items-center justify-center gap-2 mb-8">
                    <Layers size={20} style={{ color: 'var(--blue-primary)' }} />
                    <span className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>AutoStack</span>
                </div>

                <h1 className="text-center font-bold text-2xl mb-1" style={{ color: 'var(--text-primary)' }}>Create your account</h1>
                <p className="text-center text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Start deploying in minutes</p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {renderField('Full name', 'name', User, 'text', 'Alex Chen')}
                    {renderField('Work email', 'email', Mail, 'email', 'alex@company.com')}
                    {renderField('Organization name', 'org', Building, 'text', 'Acme Corp')}
                    {renderField('Password', 'password', Lock, 'password', '••••••••')}
                    {renderField('Confirm password', 'confirm', Lock, 'password', '••••••••')}

                    <button type="submit" disabled={loading}
                        className="w-full h-[44px] rounded-lg font-medium text-sm text-white cursor-pointer flex items-center justify-center gap-2 mt-1"
                        style={{ background: loading ? 'var(--border-default)' : 'var(--blue-primary)', border: 'none' }}>
                        {loading ? <><Loader2 size={16} className="animate-spin" /> Creating account...</> : 'Create account'}
                    </button>
                </form>

                <p className="text-center text-[11px] mt-3" style={{ color: 'var(--text-dim)' }}>
                    By creating an account, you agree to our Terms of Service and Privacy Policy
                </p>

                <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>or continue with</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} />
                </div>

                <button onClick={handleGithub}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                    <Github size={16} /> Continue with GitHub
                </button>

                <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Already have an account?{' '}
                    <Link to="/login" style={{ color: 'var(--blue-primary)', textDecoration: 'none' }}>Sign in</Link>
                </p>
            </div>
        </div>
    );
}
