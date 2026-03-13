import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Play, Check, Zap, Eye, RefreshCw, Shield, Lock, Cloud } from 'lucide-react';
import { Button, StatusDot, Tag, Card, TerminalWindow, useCountUp } from './ui/index';
import { terminalLines } from '../data';
import ArchitectureDiagram from './ArchitectureDiagram';
import { ErrorBoundary } from './ErrorBoundary';

/* ─── Typewriter Terminal ─── */
function TypewriterTerminal() {
    const [lines, setLines] = useState([]);
    const [showCursor, setShowCursor] = useState(true);

    useEffect(() => {
        let i = 0;
        const addLine = () => {
            if (i >= terminalLines.length) return;
            const currentLine = terminalLines[i];
            setLines(prev => [...prev, currentLine]);
            i++;
            setTimeout(addLine, terminalLines[i - 1]?.speed === 'cmd' ? 600 : 250);
        };
        const t = setTimeout(addLine, 800);
        return () => clearTimeout(t);
    }, []);

    return (
        <TerminalWindow>
            {/* Scanline overlay */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.03 }}>
                <div style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)', width: '100%', height: '200%', animation: 'scanline 8s linear infinite' }} />
            </div>
            {lines.map((line, idx) => (
                <div key={idx} className="animate-fadeIn" style={{ color: line.color }}>
                    {line.highlight ? (
                        <>{line.text.split(line.highlight)[0]}<span style={{ color: 'var(--term-yellow)' }}>{line.highlight}</span>{line.text.split(line.highlight)[1]}</>
                    ) : (
                        <span className={line.bold ? 'font-bold' : ''}>{line.text}</span>
                    )}
                </div>
            ))}
            {showCursor && <span className="inline-block w-2 h-4 mt-1 animate-blink" style={{ background: 'var(--term-prompt)' }} />}
        </TerminalWindow>
    );
}

/* ─── Animated Hero Canvas ─── */
function HeroCanvas() {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animFrame;
        const dots = Array.from({ length: 60 }, () => ({
            x: Math.random() * 1200, y: Math.random() * 600,
            vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        }));
        const draw = () => {
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            ctx.scale(2, 2);
            ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
            dots.forEach(d => {
                d.x += d.vx; d.y += d.vy;
                if (d.x < 0 || d.x > canvas.offsetWidth) d.vx *= -1;
                if (d.y < 0 || d.y > canvas.offsetHeight) d.vy *= -1;
                ctx.beginPath(); ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(36,99,235,0.35)'; ctx.fill();
            });
            dots.forEach((a, i) => {
                dots.slice(i + 1).forEach(b => {
                    const dist = Math.hypot(a.x - b.x, a.y - b.y);
                    if (dist < 120) {
                        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                        ctx.strokeStyle = `rgba(36,99,235,${0.12 * (1 - dist / 120)})`;
                        ctx.lineWidth = 0.5; ctx.stroke();
                    }
                });
            });
            animFrame = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(animFrame);
    }, []);
    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />;
}

/* ─── Hero Stat Counter ─── */
function HeroStat({ value, label, suffix = '' }) {
    const count = useCountUp(parseInt(value.replace(/[^0-9]/g, '')), 1200);
    const prefix = value.match(/^[^0-9]*/)?.[0] || '';
    const postfix = value.match(/[^0-9]*$/)?.[0] || '';
    return (
        <div className="text-center">
            <div className="text-2xl font-black text-[var(--text-primary)]" style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-1px' }}>{prefix}{count.toLocaleString()}{postfix}{suffix}</div>
            <div className="text-xs text-[var(--text-muted)] mt-1 font-medium uppercase tracking-wider">{label}</div>
        </div>
    );
}

/* ─── Feature Cards ─── */
const features = [
    { icon: Zap, title: 'Automated Scaling', desc: 'Scale deployments up or down based on real-time traffic and resource utilization metrics.', color: 'var(--amber)' },
    { icon: Eye, title: 'Deep Observability', desc: 'Instant access to real-time metrics, distributed tracing, and aggregated logs out of the box.', color: 'var(--blue-light)' },
    { icon: RefreshCw, title: 'Zero Downtime', desc: 'Automated rolling updates and canary deployments ensure your services never go offline.', color: 'var(--green)' },
    { icon: Shield, title: 'RBAC Enforcement', desc: 'Granular access control policies managed through an intuitive UI rather than complex YAML.', color: 'var(--purple)' },
    { icon: Lock, title: 'Secret Management', desc: 'Securely store, rotate, and inject secrets directly into your pods with native KMS integration.', color: 'var(--cyan)' },
    { icon: Cloud, title: 'Multi-Cloud Ready', desc: 'Deploy consistently across AWS EKS, GCP GKE, Azure AKS, or on-premise clusters.', color: 'var(--red)' },
];

/* ─── Pricing ─── */
const tiers = [
    { name: 'Hobby', price: '$0', period: '/mo', desc: 'Perfect for side projects and learning.', features: ['1 Cluster', '5 Deployments', 'Community Support'], cta: 'Start Free', variant: 'secondary' },
    { name: 'Pro', price: '$49', period: '/mo', desc: 'For professional developers and small teams.', features: ['5 Clusters', 'Unlimited Deployments', 'Advanced Observability', 'Email Support'], cta: 'Get Pro', variant: 'primary', highlight: true },
    { name: 'Team', price: '$199', period: '/mo', desc: 'For scaling organizations needing control.', features: ['Unlimited Clusters', 'Unlimited Deployments', 'SSO & Advanced RBAC', '24/7 Priority Support'], cta: 'Contact Sales', variant: 'secondary' },
];

/* ─── LandingPage ─── */
export default function LandingPage() {
    const navigate = useNavigate();
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-8" style={{ height: 73, background: 'rgba(17,22,33,0.8)', backdropFilter: 'blur(6px)', borderBottom: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <Layers size={20} style={{ color: 'var(--blue-primary)' }} />
                    <span className="font-bold text-xl">AutoStack</span>
                </div>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    {['Features', 'How it Works', 'Pricing'].map(l => (
                        <a key={l} href={`#${l.toLowerCase().replace(/\s/g, '-')}`} className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">{l}</a>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <Button onClick={() => navigate('/signup')} className="hidden sm:flex">Get Started</Button>
                    <button className="md:hidden text-[var(--text-primary)]" onClick={() => setShowMobileMenu(!showMobileMenu)}>
                        {showMobileMenu ? <Shield size={24} /> : <Layers size={24} />}
                    </button>
                </div>

                {/* Mobile Menu Overlay */}
                {showMobileMenu && (
                    <div className="absolute top-[73px] left-0 right-0 bg-[var(--bg-surface)] border-b border-[var(--border-default)] p-4 flex flex-col gap-4 md:hidden animate-fadeDown">
                        {['Features', 'How it Works', 'Pricing'].map(l => (
                            <a key={l} href={`#${l.toLowerCase().replace(/\s/g, '-')}`} onClick={() => setShowMobileMenu(false)} className="text-lg font-medium text-[var(--text-secondary)] py-2 border-b border-[var(--border-default)]/50">{l}</a>
                        ))}
                        <Button onClick={() => navigate('/signup')} className="w-full py-4 h-auto">Get Started</Button>
                    </div>
                )}
            </nav>

            {/* Hero */}
            <section className="relative pt-32 pb-20 overflow-hidden">
                <HeroCanvas />
                <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top center, rgba(36,99,235,0.15) 0%, transparent 60%)' }} />
                <div className="relative z-10 max-w-[960px] mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 animate-fadeUp" style={{ background: 'rgba(36,99,235,0.1)', border: '1px solid rgba(36,99,235,0.3)' }}>
                        <StatusDot color="var(--blue-primary)" pulse="fast" />
                        <span className="text-sm font-medium" style={{ color: 'var(--blue-primary)' }}>AutoStack Beta is live</span>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6 animate-fadeUp delay-1" style={{ letterSpacing: -3, opacity: 0 }}>
                        Deploy to Kubernetes.<br />In 60 seconds.
                    </h1>
                    <p className="text-lg text-[var(--text-muted)] max-w-lg mx-auto mb-10 animate-fadeUp delay-2" style={{ opacity: 0, lineHeight: 1.7 }}>
                        Intelligent Kubernetes Operations Platform. Skip the YAML, focus on your code. We handle the rest.
                    </p>
                    <div className="flex items-center justify-center gap-4 mb-12 animate-fadeUp delay-3" style={{ opacity: 0 }}>
                        <Button onClick={() => navigate('/signup')} size="lg">Join Beta</Button>
                        <Button variant="secondary" size="lg" icon={Play}>View Documentation</Button>
                    </div>
                    <div className="flex items-center justify-center gap-12 mb-16 animate-fadeUp delay-4" style={{ opacity: 0 }}>
                        <HeroStat value="500+" label="Clusters" />
                        <HeroStat value="2100000" label="Deployments" suffix="+" />
                        <HeroStat value="89" label="MTTR reduction" suffix="%" />
                    </div>
                    <div className="max-w-2xl mx-auto animate-fadeUp delay-5" style={{ opacity: 0 }}>
                        <ErrorBoundary>
                            <TypewriterTerminal />
                        </ErrorBoundary>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="py-24 px-6">
                <div className="max-w-[960px] mx-auto text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Powerful Kubernetes Operations</h2>
                    <p className="text-[var(--text-muted)]">Everything you need to deploy and manage workloads effortlessly.</p>
                </div>
                <div className="max-w-[960px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((f, i) => (
                        <Card key={f.title} className="p-6 hover:-translate-y-1 hover:shadow-lg animate-fadeUp" style={{ opacity: 0, animationDelay: `${i * 0.08}s` }}>
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: `${f.color}15`, border: `1px solid ${f.color}30` }}>
                                <f.icon size={22} style={{ color: f.color }} strokeWidth={1.5} />
                            </div>
                            <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
                        </Card>
                    ))}
                </div>
            </section>

            {/* Architecture */}
            <section id="how-it-works" className="py-24 px-6">
                <div className="max-w-[960px] mx-auto text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">How it works</h2>
                    <p className="text-[var(--text-muted)]">A streamlined architecture designed for developer velocity.</p>
                </div>
                <div className="max-w-[960px] mx-auto">
                    <Card className="p-8 md:p-10" hover={false}>
                        <ArchitectureDiagram />
                    </Card>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-24 px-6">
                <div className="max-w-[960px] mx-auto text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3">Simple, transparent pricing</h2>
                    <p className="text-[var(--text-muted)]">Start for free, upgrade when you need more power.</p>
                </div>
                <div className="max-w-[960px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                    {tiers.map(t => (
                        <div key={t.name} className="relative rounded-xl p-6 border" style={{
                            background: 'var(--bg-card)',
                            borderColor: t.highlight ? 'var(--blue-primary)' : 'var(--border-default)',
                            borderWidth: t.highlight ? 2 : 1,
                            boxShadow: t.highlight ? '0 0 30px rgba(36,99,235,0.15)' : 'none',
                        }}>
                            {t.highlight && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: 'var(--blue-primary)' }}>Most Popular</div>
                            )}
                            <h3 className="font-bold text-xl mb-1">{t.name}</h3>
                            <p className="text-xs text-[var(--text-muted)] mb-4">{t.desc}</p>
                            <div className="mb-6"><span className="text-4xl font-black">{t.price}</span><span className="text-sm text-[var(--text-muted)]">{t.period}</span></div>
                            <ul className="space-y-3 mb-6">
                                {t.features.map(f => (
                                    <li key={f} className="flex items-center gap-2 text-sm">
                                        <Check size={14} style={{ color: 'var(--green)' }} />{f}
                                    </li>
                                ))}
                            </ul>
                            <Button variant={t.variant} className="w-full" onClick={t.highlight ? () => navigate('/signup') : undefined}>{t.cta}</Button>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA Banner */}
            <section className="py-20 px-6">
                <div className="max-w-[960px] mx-auto">
                    <Card className="p-12 text-center relative overflow-hidden" hover={false} style={{ background: 'linear-gradient(135deg, #0d1937, var(--bg-base))', border: '1px solid rgba(36,99,235,0.2)' }}>
                        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at top center, rgba(36,99,235,0.12), transparent 70%)' }} />
                        <div className="relative z-10">
                            <h2 className="text-3xl md:text-4xl font-black mb-4">Ready to deploy?</h2>
                            <p className="text-[var(--text-muted)] mb-8 max-w-md mx-auto">Stop managing YAML files. Let AutoStack handle your Kubernetes operations.</p>
                            <div className="flex items-center justify-center gap-4">
                                <Button onClick={() => navigate('/signup')} size="lg">Open Dashboard</Button>
                                <Button variant="secondary" size="lg">Read the Docs</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-[var(--border-default)] py-10 px-6">
                <div className="max-w-[960px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Layers size={16} style={{ color: 'var(--blue-primary)' }} />
                        <span className="font-bold text-sm">AutoStack</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
                        <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Twitter</a>
                        <a href="#" className="hover:text-[var(--text-primary)] transition-colors">GitHub</a>
                        <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Discord</a>
                    </div>
                    <span className="text-sm text-[var(--text-muted)]">© 2024 AutoStack Inc. All rights reserved.</span>
                </div>
            </footer>
        </div>
    );
}
