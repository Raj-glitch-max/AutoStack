import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Copy, Check, ChevronRight, HelpCircle, Loader2 } from 'lucide-react';
import { TerminalWindow, useCountUp } from '../components/ui/index';
import { StatusDot } from '../components/ui/index';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';

const PROVIDERS = {
    'AWS EKS': ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
    'Google GKE': ['us-central1', 'europe-west1', 'asia-east1'],
    'Azure AKS': ['eastus', 'westeurope', 'eastasia'],
    'Other': ['default'],
};

function StepIndicator({ current }) {
    return (
        <div className="flex items-center justify-center gap-2 mb-8">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Step {current} of 3</span>
            <div className="flex gap-1.5 ml-2">
                {[1, 2, 3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{
                        background: i <= current ? 'var(--blue-primary)' : 'var(--border-default)',
                        transition: 'background 0.3s',
                    }} />
                ))}
            </div>
        </div>
    );
}

function Step1({ onNext, loading }) {
    const [name, setName] = useState('');
    const [provider, setProvider] = useState('AWS EKS');
    const [region, setRegion] = useState('us-east-1');

    const [error, setError] = useState('');

    useEffect(() => {
        setRegion(PROVIDERS[provider][0]);
    }, [provider]);

    const validateName = (val) => {
        const regex = /^[a-z0-9-]+$/;
        if (!val) return '';
        if (!regex.test(val)) return 'Only lowercase letters, numbers, and dashes allowed';
        if (val.length > 32) return 'Maximum 32 characters';
        return '';
    };

    const handleNameChange = (e) => {
        const val = e.target.value.toLowerCase();
        setName(val);
        setError(validateName(val));
    };

    const canProceed = name.trim().length > 0 && !error;

    return (
        <div className="animate-fadeUp">
            <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, var(--blue-primary), var(--purple))' }}>
                    <Server size={28} style={{ color: 'white' }} />
                </div>
            </div>
            <h1 className="text-center text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                Let's connect your cluster
            </h1>
            <p className="text-center text-sm mb-8" style={{ color: 'var(--text-muted)' }}>This takes about 2 minutes</p>

            <div className="w-full max-w-[520px] mx-auto rounded-xl p-8"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>

                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Cluster name</label>
                        <input value={name} onChange={handleNameChange} placeholder="prod-eks-us-east-1"
                            className="w-full px-3 py-2.5 rounded-lg text-sm"
                            style={{ background: 'var(--bg-card)', border: error ? '1px solid var(--red)' : '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }} />
                        {error && <span className="text-[11px] text-[var(--red)] mt-1 block">{error}</span>}
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Cloud provider</label>
                        <select value={provider} onChange={e => setProvider(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer appearance-none"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }}>
                            {Object.keys(PROVIDERS).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Region</label>
                        <select value={region} onChange={e => setRegion(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer appearance-none"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }}>
                            {PROVIDERS[provider].map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>

                <button onClick={() => canProceed && !loading && onNext({ name, provider, region })} disabled={!canProceed || loading}
                    className="w-full h-[44px] rounded-lg font-medium text-sm text-white cursor-pointer flex items-center justify-center gap-2 mt-6"
                    style={{ background: (canProceed && !loading) ? 'var(--blue-primary)' : 'var(--border-default)', border: 'none', opacity: loading ? 0.7 : 1 }}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : 'Generate install command'}
                    {!loading && <ChevronRight size={16} />}
                </button>
            </div>
        </div>
    );
}

function Step2({ cluster, result, onNext }) {
    const [copied, setCopied] = useState(false);
    const [status, setStatus] = useState('waiting');
    const toast = useToast();

    const helmCmd = result?.command || '';

    const handleCopy = () => {
        if (!helmCmd) return;
        navigator.clipboard.writeText(helmCmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Real polling for agent connection
    useEffect(() => {
        let isSubscribed = true;
        const poll = async () => {
            if (!cluster || !result?.cluster_id) return;
            const { data, error } = await supabase
                .from('clusters')
                .select('agent_status')
                .eq('id', result.cluster_id)
                .single();
            
            if (data?.agent_status === 'healthy') {
                if (isSubscribed) setStatus('connected');
                return;
            }
            if (isSubscribed) setTimeout(poll, 3000);
        };
        poll();
        return () => { isSubscribed = false; };
    }, [cluster, result]);

    return (
        <div className="animate-fadeUp">
            <h1 className="text-center text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                Run this command in your cluster
            </h1>
            <p className="text-center text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Requires kubectl access and Helm 3+</p>

            <div className="w-full max-w-[600px] mx-auto relative">
                <TerminalWindow title={`bash — ${cluster.name}`}>
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--term-text)' }}>{helmCmd}</pre>
                </TerminalWindow>
                <button onClick={handleCopy}
                    className="absolute top-12 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: copied ? 'var(--green)' : 'var(--text-muted)' }}>
                    {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
            </div>

            <div className="flex items-center justify-center gap-2 mt-6">
                {status === 'waiting' ? (
                    <>
                        <StatusDot color="var(--amber)" pulse="fast" glow />
                        <span className="text-sm" style={{ color: 'var(--amber)' }}>Waiting for agent connection<span className="animate-pulse-fast">...</span></span>
                    </>
                ) : (
                    <>
                        <StatusDot color="var(--green)" glow />
                        <span className="text-sm font-medium animate-fadeUp" style={{ color: 'var(--green)' }}>Agent connected!</span>
                    </>
                )}
            </div>

            {status === 'connected' && (
                <div className="flex justify-center mt-4 animate-fadeUp">
                    <button onClick={onNext}
                        className="h-[44px] px-8 rounded-lg font-medium text-sm text-white cursor-pointer flex items-center gap-2"
                        style={{ background: 'var(--blue-primary)', border: 'none' }}>
                        Continue <ChevronRight size={16} />
                    </button>
                </div>
            )}

            <div className="flex justify-center mt-6">
                <button className="text-xs flex items-center gap-1.5 cursor-pointer"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
                    <HelpCircle size={12} /> Having trouble?
                </button>
            </div>
        </div>
    );
}

function Step3({ cluster }) {
    const navigate = useNavigate();
    const toast = useToast();
    const score = useCountUp(94, 1200);

    useEffect(() => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        localStorage.setItem('autostack_has_cluster', 'true');
    }, []);

    return (
        <div className="animate-fadeUp text-center">
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>You're all set! 🎉</h1>
            <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Your cluster is connected and being analyzed</p>

            <div className="inline-block rounded-xl p-6 text-left"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', minWidth: 300 }}>
                <div className="flex items-center gap-2 mb-3">
                    <StatusDot color="var(--green)" glow pulse />
                    <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cluster.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                    <span style={{ color: 'var(--text-muted)' }}>Health Score</span>
                    <span className="font-mono font-bold text-lg" style={{ color: 'var(--green)' }}>{score}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{cluster.provider} · {cluster.region}</div>
            </div>

            <div className="mt-8">
                <button onClick={() => { toast.success('Welcome to AutoStack!'); navigate('/dashboard'); }}
                    className="h-[48px] px-10 rounded-lg font-semibold text-sm text-white cursor-pointer"
                    style={{ background: 'var(--blue-primary)', border: 'none', boxShadow: '0 4px 16px rgba(36,99,235,0.4)' }}>
                    Go to Dashboard →
                </button>
            </div>
        </div>
    );
}

export default function OnboardingPage() {
    const [step, setStep] = useState(1);
    const [cluster, setCluster] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    const handleStep1Next = async (c) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('connect-cluster', {
                body: { name: c.name, provider: c.provider, region: c.region }
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            setCluster(c);
            setResult(data);
            setStep(2);
        } catch (err) {
            toast.error(err.message || 'Failed to connect cluster');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg-base)' }}>
            <div className="w-full max-w-[640px]">
                <StepIndicator current={step} />
                {step === 1 && <Step1 onNext={handleStep1Next} loading={loading} />}
                {step === 2 && <Step2 cluster={cluster} result={result} onNext={() => setStep(3)} />}
                {step === 3 && <Step3 cluster={{ ...cluster, ...result }} />}
            </div>
        </div>
    );
}
