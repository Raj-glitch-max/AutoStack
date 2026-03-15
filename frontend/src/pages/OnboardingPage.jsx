import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Rocket, Check, ChevronRight, Loader2, HardDrive, Shield, Globe, ExternalLink, Copy, Terminal } from 'lucide-react';
import { TerminalWindow, useCountUp } from '../components/ui/index';
import { StatusDot } from '../components/ui/index';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';

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
    const [provider, setProvider] = useState('aws');
    const [accountId, setAccountId] = useState('');
    const [region, setRegion] = useState('us-east-1');
    const [roleArn, setRoleArn] = useState('');

    const isAWS = provider === 'aws';
    const canProceed = accountId.length === 12 && roleArn.startsWith('arn:aws:iam');

    return (
        <div className="animate-fadeUp">
            <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, var(--blue-primary), var(--purple))' }}>
                    <Cloud size={28} style={{ color: 'white' }} />
                </div>
            </div>
            <h1 className="text-center text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                Connect your cloud
            </h1>
            <p className="text-center text-sm mb-8 max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
                AutoStack provisions production-grade infrastructure in your own cloud account. You own everything.
            </p>

            <div className="w-full max-w-[540px] mx-auto rounded-xl p-8"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                
                <div className="flex gap-4 mb-6">
                    {['aws', 'gcp', 'azure'].map(p => (
                        <button key={p} onClick={() => setProvider(p)}
                            className={`flex-1 p-3 rounded-xl border text-center transition-all ${provider === p ? 'border-blue-500 bg-blue-500/10' : 'border-[#334366] bg-[#0d1117] hover:border-gray-500'} cursor-pointer`}>
                            <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: provider === p ? 'var(--blue-primary)' : 'var(--text-muted)' }}>{p}</div>
                            {p !== 'aws' && <div className="text-[10px] text-amber-500 font-medium">BETA</div>}
                        </button>
                    ))}
                </div>

                {isAWS ? (
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>AWS Account ID</label>
                            <input value={accountId} onChange={e => setAccountId(e.target.value.replace(/\D/g, '').slice(0, 12))} 
                                placeholder="123456789012"
                                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Preferred Region</label>
                            <select value={region} onChange={e => setRegion(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer appearance-none"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }}>
                                <option value="us-east-1">US East (N. Virginia)</option>
                                <option value="us-west-2">US West (Oregon)</option>
                                <option value="eu-west-1">EU West (Ireland)</option>
                                <option value="ap-south-1">Asia Pacific (Mumbai)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>IAM Role ARN</label>
                            <input value={roleArn} onChange={e => setRoleArn(e.target.value)} 
                                placeholder="arn:aws:iam::123456789012:role/AutoStackRole"
                                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }} />
                            <div className="mt-2 flex items-center gap-2">
                                <a href="#" className="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
                                    <Shield size={10} /> Create role in 2 minutes
                                </a>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="py-12 text-center text-sm text-gray-500">
                        {provider.toUpperCase()} integration is coming soon.
                    </div>
                )}

                <button onClick={() => canProceed && !loading && onNext({ provider, accountId, region, roleArn })} 
                    disabled={!canProceed || loading}
                    className="w-full h-[46px] rounded-lg font-bold text-sm text-white cursor-pointer flex items-center justify-center gap-2 mt-8 transition-all"
                    style={{ background: (canProceed && !loading) ? 'var(--blue-primary)' : 'var(--border-default)', border: 'none', boxShadow: canProceed ? '0 4px 12px rgba(37,99,235,0.3)' : 'none' }}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Verify & Continue'}
                    {!loading && <ChevronRight size={18} />}
                </button>
            </div>
        </div>
    );
}

function Step2({ onNext, loading }) {
    const [repoUrl, setRepoUrl] = useState('');
    const [size, setSize] = useState('small');
    const [deploying, setDeploying] = useState(false);
    const [progress, setProgress] = useState([]);
    
    // Deployment lifecycle simulation or real hook integration could go here
    const canDeploy = repoUrl.includes('github.com/');

    const handleDeploy = async () => {
        setDeploying(true);
        setProgress([
            { id: 1, label: 'Analyzing repository...', status: 'running' },
            { id: 2, label: 'Planning infrastructure...', status: 'pending' },
            { id: 3, label: 'Provisioning VPC & EKS...', status: 'pending' },
            { id: 4, label: 'Building Docker image...', status: 'pending' }
        ]);

        // Trigger real DIE analyze
        await onNext({ repoUrl, size, setProgress });
    };

    if (deploying) {
        return (
            <div className="animate-fadeUp max-w-lg mx-auto">
                <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--text-primary)' }}>Deploying your project...</h1>
                <div className="space-y-4 mb-8">
                    {progress.map((step) => (
                        <div key={step.id} className="flex items-center gap-3 p-4 rounded-xl border" 
                             style={{ background: 'var(--bg-card)', borderColor: step.status === 'running' ? 'var(--blue-primary)' : 'var(--border-default)' }}>
                            {step.status === 'done' ? <Check size={18} className="text-green-500" /> : 
                             step.status === 'running' ? <Loader2 size={18} className="animate-spin text-blue-500" /> : 
                             <div className="w-[18px] h-[18px] rounded-full border border-gray-600" />}
                            <span className="text-sm font-medium" style={{ color: step.status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{step.label}</span>
                            {step.status === 'running' && <span className="text-[10px] ml-auto text-blue-400 font-mono">1m 12s</span>}
                        </div>
                    ))}
                </div>
                <TerminalWindow title="AutoStack Provisioning">
                    <pre className="text-[10px] font-mono leading-relaxed" style={{ color: 'var(--term-text)' }}>
                        [2026-03-13 14:02:11] STAGE 1: Repository analysis started...<br/>
                        [2026-03-13 14:02:14] DETECTED: Node.js 20 + Express<br/>
                        [2026-03-13 14:02:16] STAGE 2: Planning infrastructure for {size} profile...<br/>
                        [2026-03-13 14:02:18] VPC created: vpc-0a2b3c4d5e (us-east-1)<br/>
                        [2026-03-13 14:02:20] Provisioning EKS Cluster (Control Plane)...
                    </pre>
                </TerminalWindow>
            </div>
        );
    }

    return (
        <div className="animate-fadeUp">
            <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}>
                    <Rocket size={28} style={{ color: 'white' }} />
                </div>
            </div>
            <h1 className="text-center text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                Deploy your first project
            </h1>
            <p className="text-center text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Paste your GitHub URL to begin the 8-minute deployment</p>

            <div className="w-full max-w-[580px] mx-auto rounded-xl p-8"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                
                <div className="mb-6">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Repository URL</label>
                    <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} 
                        placeholder="https://github.com/org/repo"
                        className="w-full px-4 py-3 rounded-lg text-sm font-mono"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }} />
                </div>

                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Infrastructure Size</label>
                <div className="flex gap-4 mb-8">
                    {[
                        { id: 'small', label: 'Small', desc: '~$187/mo', nodes: '2 vCPU' },
                        { id: 'medium', label: '~$345/mo', nodes: '4 vCPU' },
                    ].map(s => (
                        <button key={s.id} onClick={() => setSize(s.id)}
                            className={`flex-1 p-4 rounded-xl border text-left transition-all ${size === s.id ? 'border-blue-500 bg-blue-500/10' : 'border-[#334366] bg-[#0d1117] hover:border-gray-500'} cursor-pointer`}>
                            <div className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{s.label}</div>
                            <div className="text-xs text-blue-400 font-bold mb-2">{s.desc}</div>
                            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.nodes} · 2 AZs</div>
                        </button>
                    ))}
                </div>

                <button onClick={handleDeploy} disabled={!canDeploy || loading}
                    className="w-full h-[50px] rounded-lg font-bold text-sm text-white cursor-pointer flex items-center justify-center gap-2 transition-all"
                    style={{ background: canDeploy ? 'var(--blue-primary)' : 'var(--border-default)', border: 'none' }}>
                    Analyze & Deploy →
                </button>
            </div>
        </div>
    );
}

function Step3({ deployment }) {
    const navigate = useNavigate();
    const score = useCountUp(98, 1500);

    useEffect(() => {
        confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
    }, []);

    return (
        <div className="animate-fadeUp text-center">
            <h1 className="text-4xl font-extrabold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>It's Live! 🚀</h1>
            <p className="text-base mb-10" style={{ color: 'var(--text-muted)' }}>Your production infrastructure is ready on AWS.</p>

            <div className="max-w-md mx-auto rounded-2xl p-6 mb-8 text-left"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                <div className="flex items-center gap-2 mb-6">
                    <Globe size={18} className="text-blue-500" />
                    <span className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>{deployment?.live_url || 'https://api-service.autostack.app'}</span>
                    <a href={deployment?.live_url} target="_blank" className="ml-auto p-1.5 hover:bg-white/10 rounded">
                        <ExternalLink size={14} className="text-gray-400" />
                    </a>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs">
                        <Check size={14} className="text-green-500" />
                        <span style={{ color: 'var(--text-muted)' }}>EKS Cluster:</span>
                        <span className="font-bold ml-auto" style={{ color: 'var(--text-primary)' }}>Healthy (3 nodes)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <Check size={14} className="text-green-500" />
                        <span style={{ color: 'var(--text-muted)' }}>Load Balancer:</span>
                        <span className="font-bold ml-auto" style={{ color: 'var(--text-primary)' }}>Active</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <Check size={14} className="text-green-500" />
                        <span style={{ color: 'var(--text-muted)' }}>AIRE Engine:</span>
                        <span className="font-bold ml-auto" style={{ color: 'var(--text-primary)' }}>Monitoring Active</span>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Infrastructure Score</span>
                        <span className="text-2xl font-bold font-mono" style={{ color: 'var(--green)' }}>{score}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-gray-800">
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${score}%`, transition: 'width 2s' }} />
                    </div>
                </div>
            </div>

            <button onClick={() => navigate('/dashboard')}
                className="h-[54px] px-12 rounded-xl font-bold text-base text-white cursor-pointer transition-all hover:scale-105 active:scale-95"
                style={{ background: 'var(--blue-primary)', border: 'none', boxShadow: '0 8px 30px rgba(37,99,235,0.4)' }}>
                Open Dashboard
            </button>
            <p className="mt-6 text-[11px] max-w-xs mx-auto" style={{ color: 'var(--text-dim)' }}>
                AutoStack will begin cost analysis (COIE) in 5 minutes. You can manage your AWS resources at any time.
            </p>
        </div>
    );
}

export default function OnboardingPage() {
    const [step, setStep] = useState(1);
    const [credentials, setCredentials] = useState(null);
    const [deployment, setDeployment] = useState(null);
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    const handleStep1Next = async (c) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('aws-assume-role', {
                body: c
            });
            if (error || !data.success) throw new Error(error?.message || 'Verification failed');
            
            setCredentials({ ...c, id: data.credential_id });
            setStep(2);
        } catch (err) {
            toast.error(err.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const handleDeploy = async ({ repoUrl, size, setProgress }) => {
        setLoading(true);
        try {
            // 1. Create Project
            const { data: project, error: projErr } = await supabase.from('projects').insert({
                name: repoUrl.split('/').pop(),
                repo_url: repoUrl,
                cloud_credential_id: credentials.id,
                environment: 'production',
                status: 'creating'
            }).select().single();

            if (projErr) throw projErr;

            // 2. Invoke DIE Analyze
            const { data, error } = await supabase.functions.invoke('die-analyze', {
                body: { project_id: project.id, size }
            });

            if (error || !data.success) throw new Error(error?.message || 'Analysis failed');

            // 3. Poll for Deployment Status
            const pollDeployment = async () => {
                const { data: depls } = await supabase.from('deployments')
                    .select('*')
                    .eq('project_id', project.id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (depls && depls[0]) {
                    const d = depls[0];
                    if (d.stage === 'live') {
                        setDeployment(d);
                        setStep(3);
                        return;
                    }
                    if (d.stage === 'failed') throw new Error('Deployment failed');
                    
                    // Update progress UI based on stage
                    const stageMap = { 'analyzing': 1, 'planning': 2, 'provisioning': 3, 'building': 4, 'deploying': 4 };
                    const currentStageIdx = stageMap[d.stage] || 0;
                    
                    setProgress(prev => prev.map((s, idx) => ({
                        ...s,
                        status: idx < currentStageIdx - 1 ? 'done' : idx === currentStageIdx - 1 ? 'running' : 'pending'
                    })));
                }
                setTimeout(pollDeployment, 3000);
            };

            pollDeployment();

        } catch (err) {
            toast.error(err.message || 'Deployment failed');
            setStep(2); // Go back to repo input
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg-base)' }}>
            <div className="w-full max-w-[680px]">
                <StepIndicator current={step} />
                {step === 1 && <Step1 onNext={handleStep1Next} loading={loading} />}
                {step === 2 && <Step2 credentials={credentials} onNext={handleDeploy} loading={loading} />}
                {step === 3 && <Step3 deployment={deployment} />}
            </div>
        </div>
    );
}
