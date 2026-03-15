import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Check, Zap, Eye, RefreshCw, Shield, Cloud, ArrowRight, Github, Twitter, MessageSquare } from 'lucide-react';
import { UserButton } from '@clerk/react';
import { useAuth } from '../hooks/useAuth';
import { Button, Tag, Card, TerminalWindow } from './ui/index';
import { terminalLines } from '../data';
import ArchitectureDiagram from './ArchitectureDiagram';
import { ErrorBoundary } from './ErrorBoundary';

/* ─── Typewriter Terminal ─── */
function TypewriterTerminal() {
    const [lines, setLines] = useState([]);
    const [showCursor] = useState(true);

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
        <TerminalWindow className="group relative">
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03]">
                <div style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)', width: '100%', height: '200%', animation: 'scanline 8s linear infinite' }} />
            </div>
            {lines.map((line, idx) => (
                <div key={idx} className="animate-fadeIn font-mono text-[13px] leading-relaxed" style={{ color: line.color }}>
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
        const dots = Array.from({ length: 40 }, () => ({
            x: Math.random() * 1200, y: Math.random() * 600,
            vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        }));
        const draw = () => {
            if (!canvas) return;
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            ctx.scale(2, 2);
            ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
            dots.forEach(d => {
                d.x += d.vx; d.y += d.vy;
                if (d.x < 0 || d.x > canvas.offsetWidth) d.vx *= -1;
                if (d.y < 0 || d.y > canvas.offsetHeight) d.vy *= -1;
                ctx.beginPath(); ctx.arc(d.x, d.y, 1.2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(36,99,235,0.2)'; ctx.fill();
            });
            dots.forEach((a, i) => {
                dots.slice(i + 1).forEach(b => {
                    const dist = Math.hypot(a.x - b.x, a.y - b.y);
                    if (dist < 150) {
                        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                        ctx.strokeStyle = `rgba(36,99,235,${0.08 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5; ctx.stroke();
                    }
                });
            });
            animFrame = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(animFrame);
    }, []);
    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />;
}

/* ─── Reveal Component ─── */
function Reveal({ children, delay = 0 }) {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setTimeout(() => setIsVisible(true), delay * 1000);
                observer.unobserve(entry.target);
            }
        }, { threshold: 0.1 });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [delay]);
    return <div ref={ref} className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>{children}</div>;
}

/* ─── Feature List ─── */
const features = [
    { icon: Cloud, title: 'BYOC Sovereignty', desc: 'Provision production-grade VPC, EKS, and IAM in your own account. No vendor lock-in, full control.', color: 'var(--blue-primary)' },
    { icon: Zap, title: 'Instant Deployment', desc: 'Auto-detect project stacks from GitHub. We build, scan, and deploy to your cluster in under 60 seconds.', color: 'var(--amber)' },
    { icon: Shield, title: 'Infinite Scalability', desc: 'Elastically scale from 1 node to 1,000. AutoStack optimizes resource quotas and right-sizes your costs.', color: 'var(--green)' },
    { icon: Shield, title: 'Zero-Trust Security', desc: 'Centralized secret management via AWS KMS. OIDC-based GitHub actions integration by default.', color: 'var(--red)' },
    { icon: RefreshCw, title: 'Preview Environments', desc: 'Ephemeral, namespace-isolated clones for every Pull Request. Review changes in a live environment.', color: 'var(--purple)' },
    { icon: Eye, title: 'Autonomous Shield', desc: 'AI-driven MTTR reduction. Self-healing clusters that remediate incidents before you get paged.', color: 'var(--cyan)' },
];

/* ─── LandingPage ─── */
export default function LandingPage() {
    const navigate = useNavigate();
    const { loading, isAuthenticated } = useAuth();
    const [scrolled, setScrolled] = useState(false);
    
    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen text-[var(--text-primary)]" style={{ background: 'var(--bg-base)', fontFamily: 'Inter, sans-serif' }}>
            {/* Nav */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-8 flex items-center justify-between ${scrolled ? 'h-16 bg-[rgba(10,12,18,0.75)] backdrop-blur-xl border-b border-[rgba(255,255,255,0.08)]' : 'h-20 bg-transparent'}`}>
                <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <div className="w-8 h-8 rounded-lg bg-[var(--blue-primary)] flex items-center justify-center shadow-[0_0_20px_rgba(36,99,235,0.4)]">
                        <Layers size={18} className="text-white" />
                    </div>
                    <span className="font-bold text-xl tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>AutoStack</span>
                    <Tag small color="var(--blue-primary)">Production</Tag>
                </div>

                <div className="hidden md:flex items-center gap-10">
                    {['Platform', 'Solutions', 'Pricing', 'Docs'].map(l => (
                        <a key={l} href="#" className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors tracking-wide">{l}</a>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    {!loading && !isAuthenticated && (
                        <>
                            <button className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] px-4" onClick={() => navigate('/login')}>Sign In</button>
                            <Button onClick={() => navigate('/signup')} size="sm" className="shadow-lg">Start Building</Button>
                        </>
                    )}
                    {!loading && isAuthenticated && (
                        <>
                            <Button onClick={() => navigate('/dashboard')} size="sm" className="shadow-lg">Dashboard</Button>
                            <UserButton afterSignOutUrl="/" />
                        </>
                    )}
                </div>
            </nav>

            {/* Hero */}
            <section className="relative pt-48 pb-32 overflow-hidden">
                <HeroCanvas />
                {/* Glow Orbs */}
                <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-[var(--blue-primary)] opacity-[0.08] blur-[120px] rounded-full" />
                <div className="absolute bottom-[-5%] right-[10%] w-[400px] h-[400px] bg-[var(--purple)] opacity-[0.05] blur-[100px] rounded-full" />
                
                <div className="relative z-10 max-w-[1100px] mx-auto px-6 text-center">
                    <Reveal>
                        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full mb-10 bg-[rgba(36,99,235,0.1)] border border-[rgba(36,99,235,0.2)]">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--blue-primary)] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--blue-primary)]"></span>
                            </span>
                            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--blue-primary)]">The Future of DevOps is Autonomous</span>
                        </div>
                    </Reveal>

                    <Reveal delay={0.1}>
                        <h1 className="text-6xl md:text-8xl font-black leading-[0.95] mb-8 tracking-[-0.04em]" style={{ fontFamily: 'Syne, sans-serif' }}>
                            Deploy to <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--blue-primary)] to-[var(--cyan)]">Your Cloud</span><br />
                            without the Noise.
                        </h1>
                    </Reveal>

                    <Reveal delay={0.2}>
                        <p className="text-lg md:text-xl text-[var(--text-muted)] max-w-2xl mx-auto mb-12 leading-relaxed">
                            Bring your own account. We provision production-grade EKS clusters, VPCs, and IAM in 60 seconds. High-stakes Kubernetes operations, handled autonomously.
                        </p>
                    </Reveal>

                    <Reveal delay={0.3}>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-20">
                            <Button size="lg" onClick={() => navigate('/signup')} className="h-14 px-8 text-base shadow-2xl">
                                Launch Cluster <ArrowRight size={18} className="ml-1" />
                            </Button>
                            <Button variant="secondary" size="lg" className="h-14 px-8 text-base bg-[rgba(255,255,255,0.03)] backdrop-blur-md border-[rgba(255,255,255,0.08)]">
                                <Github size={18} className="mr-2" /> View Template
                            </Button>
                        </div>
                    </Reveal>

                    {/* Dashboard Preview */}
                    <Reveal delay={0.4}>
                        <div className="relative max-w-5xl mx-auto group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-[var(--blue-primary)] to-[var(--cyan)] rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                            <div className="relative bg-[#0d1117] rounded-xl border border-[rgba(255,255,255,0.1)] overflow-hidden shadow-2xl">
                                <TypewriterTerminal />
                            </div>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-32 px-6 border-y border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.01)]">
                <div className="max-w-[1100px] mx-auto">
                    <div className="mb-20">
                        <Tag color="var(--blue-primary)" className="mb-4">Capabilities</Tag>
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>Built for Critical Workloads.</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((f, i) => (
                            <Reveal key={f.title} delay={i * 0.1}>
                                <Card className="p-8 h-full bg-transparent border-[rgba(255,255,255,0.05)] hover:border-[rgba(36,99,235,0.3)] group transition-all duration-500">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] group-hover:bg-[var(--blue-primary)] group-hover:translate-y-[-4px] transition-all duration-300">
                                        <f.icon size={22} className="text-[var(--text-muted)] group-hover:text-white" strokeWidth={1.5} />
                                    </div>
                                    <h3 className="text-xl font-bold mb-3 group-hover:text-[var(--blue-primary)] transition-colors">{f.title}</h3>
                                    <p className="text-[15px] text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
                                </Card>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* Unified Ops Section */}
            <section className="py-40 px-6">
                <div className="max-w-[1100px] mx-auto flex flex-col lg:flex-row items-center gap-20">
                    <div className="flex-1">
                        <Tag color="var(--amber)" className="mb-4">Observability</Tag>
                        <h2 className="text-4xl md:text-5xl font-black mb-8 leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>Autonomous Guardian<br />for your Runtime.</h2>
                        <ul className="space-y-6">
                            {[
                                'Real-time cluster telemetry & log streaming.',
                                'Autonomous incident remediation (AIRE).',
                                'Cost-optimization with right-sizing analysis.',
                                'Security drift detection & automated patching.'
                            ].map((item, idx) => (
                                <li key={idx} className="flex gap-4 items-start text-lg text-[var(--text-muted)] group">
                                    <div className="w-6 h-6 rounded-full bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[var(--green)] transition-all">
                                        <Check size={14} className="text-[var(--green)] group-hover:text-white" />
                                    </div>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex-1 w-full">
                        <Card className="p-4 bg-[rgba(13,17,23,0.6)] backdrop-blur-md border-[rgba(255,255,255,0.08)] shadow-3xl">
                            <ArchitectureDiagram />
                        </Card>
                    </div>
                </div>
            </section>

            {/* CTA Final */}
            <section className="py-40 px-6">
                <div className="max-w-[900px] mx-auto">
                    <div className="relative rounded-[2rem] overflow-hidden p-16 text-center border border-[rgba(36,99,235,0.3)]">
                        {/* Background mesh */}
                        <div className="absolute inset-0 bg-[#0d152a] z-0" />
                        <div className="absolute inset-0 opacity-[0.4] z-1" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(36,99,235,0.2), transparent)' }} />
                        
                        <div className="relative z-10">
                            <h2 className="text-4xl md:text-5xl font-black mb-8" style={{ fontFamily: 'Syne, sans-serif' }}>Scale your product,<br />not your headcount.</h2>
                            <p className="text-lg text-[var(--text-muted)] mb-12 max-w-lg mx-auto">
                                Join hundreds of companies deploying mission-critical infrastructure autonomously.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Button size="lg" onClick={() => navigate('/signup')} className="shadow-2xl h-14 px-10">Get Started for Free</Button>
                                <Button variant="secondary" size="lg" className="h-14 px-10">Schedule Demo</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="pt-20 pb-10 px-8 border-t border-[rgba(255,255,255,0.05)]">
                <div className="max-w-[1100px] mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-20">
                        <div className="col-span-2 md:col-span-1">
                            <div className="flex items-center gap-2 mb-6">
                                <Layers size={20} className="text-[var(--blue-primary)]" />
                                <span className="font-bold text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>AutoStack</span>
                            </div>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                                The autonomous cloud platform for modern software teams.
                            </p>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] mb-6">Product</h4>
                            <ul className="space-y-4 text-sm text-[var(--text-muted)]">
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">Features</a></li>
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">Pricing</a></li>
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">Security</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] mb-6">Resources</h4>
                            <ul className="space-y-4 text-sm text-[var(--text-muted)]">
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">Documentation</a></li>
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">API Reference</a></li>
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">Changelog</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] mb-6">Company</h4>
                            <ul className="space-y-4 text-sm text-[var(--text-muted)]">
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">About</a></li>
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">Join Us</a></li>
                                <li><a href="#" className="hover:text-[var(--text-primary)] transition-colors">Twitter</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-10 border-t border-[rgba(255,255,255,0.05)]">
                        <span className="text-xs text-[var(--text-dim)]">© 2024 AutoStack Inc. Developed by <span className="text-[var(--text-muted)]">Antigravity AI</span>.</span>
                        <div className="flex items-center gap-6">
                            <a href="#" className="text-[var(--text-dim)] hover:text-[var(--text-primary)]"><Github size={16} /></a>
                            <a href="#" className="text-[var(--text-dim)] hover:text-[var(--text-primary)]"><Twitter size={16} /></a>
                            <a href="#" className="text-[var(--text-dim)] hover:text-[var(--text-primary)]"><MessageSquare size={16} /></a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
