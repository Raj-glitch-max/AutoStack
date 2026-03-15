import { SignUp } from '@clerk/react';
import { dark } from '@clerk/themes';
import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SignupPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg-base)' }}>
            {/* Authentication Card */}
            <div className="relative z-10 w-full max-w-[480px] bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl overflow-hidden animate-fadeUp">
                {/* Subtle top light effect */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--blue-primary)] to-transparent opacity-30" />
                
                <div className="p-10">
                    <div className="mb-10 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--blue-primary)] bg-opacity-10 border border-[var(--blue-primary)] border-opacity-20 mb-4">
                            <Layers className="w-6 h-6 text-[var(--blue-primary)]" />
                        </div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Create your account</h1>
                        <p className="text-[13px] text-[var(--text-muted)] mt-2">Start your infrastructure journey with AutoStack</p>
                    </div>

                    <SignUp 
                        signInUrl="/login"
                        routing="path"
                        path="/signup"
                        appearance={{
                            baseTheme: dark,
                            elements: {
                                rootBox: 'w-full',
                                card: 'bg-transparent shadow-none p-0 w-full',
                                header: 'hidden',
                                socialButtonsBlockButton: 'bg-[var(--bg-surface)] border-[var(--border-default)] hover:bg-[var(--bg-base)] text-[var(--text-primary)] transition-all h-11',
                                socialButtonsBlockButtonText: 'font-medium',
                                dividerText: 'text-[var(--text-muted)] text-[11px] uppercase tracking-wider',
                                dividerLine: 'bg-[var(--border-default)]',
                                formFieldLabel: 'text-[var(--text-muted)] text-[12px] font-medium mb-1.5',
                                formFieldInput: 'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)] h-11 focus:border-[var(--blue-primary)] transition-all',
                                formButtonPrimary: 'bg-[var(--blue-primary)] hover:bg-[var(--blue-light)] text-white font-semibold h-11 transition-all shadow-lg shadow-blue-500/10',
                                footer: 'hidden',
                                identityPreviewText: 'text-[var(--text-primary)]',
                                identityPreviewEditButtonIcon: 'text-[var(--blue-primary)]',
                                formResendCodeLink: 'text-[var(--blue-primary)] hover:text-[var(--blue-light)]',
                                otpCodeFieldInput: 'bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--blue-primary)]'
                            },
                            variables: {
                                colorPrimary: '#2463eb',
                                colorBackground: '#111621',
                                colorText: '#f1f5f9',
                                colorTextSecondary: '#92a4c8',
                                colorInputBackground: '#0d1117',
                                colorInputText: '#f1f5f9',
                                borderRadius: '0.75rem',
                            }
                        }}
                    />

                    <div className="mt-10 pt-6 border-t border-[var(--border-default)] text-center">
                        <p className="text-[13px] text-[var(--text-muted)]">
                            Already have an account?{' '}
                            <button 
                                onClick={() => navigate('/login')}
                                className="text-[var(--blue-primary)] hover:text-[var(--blue-light)] font-medium transition-colors"
                            >
                                Sign in
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
