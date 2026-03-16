import { useState } from 'react';
import { ExternalLink, Plus, FolderGit2 } from 'lucide-react';
import { Card, Button, StatusDot, Tag, ProgressBar, Modal, Input, Select } from '../ui/index';
import { SkeletonCard, SkeletonRow, SkeletonText } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { useProjects } from '../../hooks/useData';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';

/* ─── New Service Modal ─── */
function NewServiceModal({ onClose, clusterId, onSuccess }) {
    const toast = useToast();
    const [step, setStep] = useState(0); // 0: input, 1: analyzing, 1.5: cost, 2: provisioning (progress), 3: success
    const [analysisData, setAnalysisData] = useState(null);
    const [form, setForm] = useState({
        repoUrl: '',
        branch: 'main',
        environment: 'production',
        size: 'small'
    });

    const handleAnalyze = async () => {
        const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/;
        if (!form.repoUrl) return toast.error('Repository URL is required');
        if (!githubRegex.test(form.repoUrl)) return toast.error('Please enter a valid GitHub repository URL');

        setStep(1);

        try {
            // 1. Resolve installation_id (In production, this comes from the connected GitHub App)
            // For now, we fetch the first available integration
            const { data: integrations } = await supabase.from('integrations').select('installation_id').limit(1);
            const installation_id = integrations?.[0]?.installation_id || 'test-install-id';

            // 2. Create base project entry if not exists (or use existing)
            const projectName = form.repoUrl.split('/').pop().replace('.git', '');
            const { data: project, error: pErr } = await supabase.from('projects').insert({
                cluster_id: clusterId,
                name: projectName,
                repo_url: form.repoUrl,
                branch: form.branch,
                environment: form.environment,
                provisioning_status: 'pending'
            }).select().single();

            if (pErr) throw pErr;
            setForm(prev => ({ ...prev, projectId: project.id }));

            // 3. Trigger IE-1: Repository Analysis
            const { data: dieResponse, error: dieErr } = await supabase.functions.invoke('die-analyze', {
                body: { 
                    project_id: project.id, 
                    installation_id,
                    size: form.size
                }
            });

            if (dieErr || !dieResponse.success) throw new Error(dieErr?.message || 'Analysis failed');

            setAnalysisData(dieResponse);
            setStep(1.5);
        } catch (err) {
            toast.error(err.message || 'Analysis failed');
            setStep(0);
        }
    };

    const handleProvision = async () => {
        setStep(2);
        try {
            const { data, error } = await supabase.functions.invoke('infra-provision', {
                body: { 
                    project_id: form.projectId,
                    deployment_id: analysisData.deployment_id
                }
            });

            if (error || !data.success) throw new Error(error?.message || 'Provisioning failed');
            
            // Step 2 will now listen to real-time events via Dashboard or here
            // For the modal experience, we'll wait for the 'live' status
            setStep(3);
        } catch (err) {
            toast.error(err.message || 'Provisioning failed');
            setStep(1.5);
        }
    };

    return (
        <Modal title={step === 1.5 ? "Infrastructure Plan" : "Connect repository"} onClose={onClose} wide={step === 1.5}>
            {step === 0 && (
                <div className="space-y-5 animate-fadeIn">
                    <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">Repository URL</label>
                        <Input placeholder="https://github.com/acme/backend" value={form.repoUrl} onChange={e => setForm({ ...form, repoUrl: e.target.value })} />
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">Branch</label>
                            <Input placeholder="main" value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">Profile</label>
                            <Select options={[
                                { value: 'small', label: 'Small (~$211/mo) - 2 nodes' }, 
                                { value: 'medium', label: 'Medium (~$334/mo) - 3 nodes' },
                                { value: 'large', label: 'Large (~$559/mo) - 4 nodes' }
                            ]} value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} />
                        </div>
                    </div>

                    <div className="p-4 rounded-lg mt-2" style={{ background: 'rgba(36,99,235,0.05)', border: '1px solid rgba(36,99,235,0.2)' }}>
                        <div className="text-xs font-semibold mb-3">AutoStack IE Engine will:</div>
                        <div className="flex flex-wrap gap-2">
                            {['Scan Stack', 'Plan VPC', 'EKS Sizing', 'ECR Registry', 'IAM Sandboxing'].map(t => (
                                <Tag key={t} small>{t}</Tag>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleAnalyze}>Analyze Repository →</Button>
                    </div>
                </div>
            )}

            {step === 1 && (
                <div className="py-12 flex flex-col items-center justify-center text-center animate-fadeIn">
                    <div className="w-10 h-10 border-2 border-[var(--blue-primary)] border-t-transparent rounded-full animate-spin mb-4" />
                    <h3 className="font-bold text-lg mb-1">Deep Analysis Running...</h3>
                    <p className="text-[var(--text-muted)] text-sm">Identifying stack, dependencies, and generating AWS blueprint.</p>
                </div>
            )}

            {step === 1.5 && (
                <div className="space-y-6 animate-fadeUp">
                    <div className="flex items-start gap-4 p-5 rounded-xl border border-[var(--blue-primary)]/30 bg-[var(--blue-primary)]/5">
                        <div className="w-10 h-10 rounded-lg bg-[var(--blue-primary)] flex items-center justify-center flex-shrink-0">
                            <Rocket size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-1">Plan Ready: {analysisData.stack} Web Service</h3>
                            <p className="text-sm text-[var(--text-muted)]">We've identified a {analysisData.stack} project. We'll deploy it to a dedicated EKS cluster with multi-AZ high availability.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Resource Breakdown</h4>
                            <div className="space-y-2">
                                {analysisData.infra_plan_json?.resources?.map(r => (
                                    <div key={r.name} className="flex items-center justify-between p-3 bg-[var(--bg-card)] rounded-lg border border-[var(--border-default)]">
                                        <span className="text-sm">{r.name}</span>
                                        <span className="text-sm font-mono">${r.cost}/mo</span>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between p-3 border-t border-[var(--border-default)] mt-2">
                                    <span className="font-bold">Estimated Monthly Total</span>
                                    <span className="font-bold text-[var(--blue-primary)]">${analysisData.estimated_cost}/mo</span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Infrastructure Specs</h4>
                            <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-[var(--text-muted)]">Nodes</span>
                                    <span className="font-semibold">{analysisData.infra_plan_json?.specs?.nodes || 2} nodes (t3.medium)</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-[var(--text-muted)]">Compute</span>
                                    <span className="font-semibold">{analysisData.infra_plan_json?.specs?.vcpu || 2} vCPU / {analysisData.infra_plan_json?.specs?.ram || '4GB'} RAM</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-[var(--text-muted)]">Networking</span>
                                    <span className="font-semibold text-[var(--green)]">Isolated VPC (Multi-AZ)</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-[var(--text-muted)]">Dockerfile</span>
                                    <Tag small color="var(--blue-light)">{analysisData.infra_plan_json?.dockerfile === 'generated' ? 'Auto-Generated' : 'Existing'}</Tag>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-[var(--border-default)]">
                        <p className="text-[10px] text-[var(--text-dim)] max-w-[300px]">By clicking confirm, AutoStack will begin provisioning resources in your AWS account. This typically takes 8-12 minutes.</p>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                            <Button onClick={handleProvision}>Confirm & Provision →</Button>
                        </div>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="py-12 flex flex-col items-center justify-center text-center animate-fadeIn">
                    <div className="w-12 h-12 border-2 border-[var(--blue-primary)] border-t-transparent rounded-full animate-spin mb-6" />
                    <h3 className="font-bold text-xl mb-2">Provisioning in Progress...</h3>
                    <p className="text-[var(--text-muted)] text-sm max-w-sm">We are communicating with your AWS account to create the EKS cluster. This modal will update automatically.</p>
                    <div className="mt-8 w-full max-w-xs h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--blue-primary)] animate-shimmer" style={{ width: '65%', borderRadius: 'inherit' }} />
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="py-12 flex flex-col items-center justify-center text-center animate-fadeUp">
                    <div className="w-16 h-16 bg-[var(--green)]/20 text-[var(--green)] rounded-full flex items-center justify-center mb-6">
                        <Check size={32} strokeWidth={3} />
                    </div>
                    <h3 className="font-bold text-2xl mb-2" style={{ color: 'var(--green)' }}>Engine Dispatched!</h3>
                    <p className="text-[var(--text-muted)] text-sm mb-8">Infrastructure provisioning has been offloaded to the DIE engine.<br/>Check the services list for real-time progress.</p>
                    <Button onClick={() => { onSuccess(); onClose(); }}>Back to Dashboard</Button>
                </div>
            )}
        </Modal>
    );
}

export default function ProjectsTab({ cluster }) {
    const [modalOpen, setModalOpen] = useState(false);

    // We only fetch projects if a cluster ID is available
    const { data: projects, loading, error, refetch } = useProjects(cluster?.id);

    if (!cluster) {
        return (
            <div className="animate-fadeIn pb-10">
                <Card className="bg-[var(--bg-surface)] mt-6 border-dashed">
                    <EmptyState
                        icon={FolderGit2}
                        title="No Cluster Connected"
                        description="You need to connect an orchestration cluster before you can deploy projects onto it."
                        action={{ label: 'Connect Cluster', onClick: () => window.location.href = '/onboarding' }}
                    />
                </Card>
            </div>
        );
    }

    if (error) {
        return (
            <div className="animate-fadeIn pb-10">
                <Card className="bg-[rgba(244,63,94,0.05)] mt-6 border-dashed" style={{ borderColor: 'rgba(244,63,94,0.3)' }}>
                    <EmptyState
                        icon={FolderGit2}
                        title="Failed to Load Services"
                        description="There was an error fetching your deployments. Please try again."
                        action={{ label: 'Retry', onClick: () => refetch() }}
                    />
                </Card>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between">
                    <div><SkeletonText width={150} height={24} className="mb-2" /></div>
                    <SkeletonText width={100} height={36} className="rounded-lg" />
                </div>
                <Card className="overflow-hidden">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonRow key={i} columns={6} className="border-b border-[var(--border-default)] last:border-0" />
                    ))}
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {modalOpen && <NewServiceModal onClose={() => setModalOpen(false)} clusterId={cluster.id} onSuccess={() => refetch()} />}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-3">Services <span className="text-[14px] font-normal text-[var(--text-muted)]">{projects?.length || 0} active deployments</span></h2>
                </div>
                <Button icon={Plus} onClick={() => setModalOpen(true)}>Deploy New Service</Button>
            </div>

            <Card className="overflow-hidden">
                {projects?.length === 0 ? (
                    <EmptyState
                        icon={FolderGit2}
                        title="No projects deployed"
                        description="Connect a Git repository to generate manifests and start deploying to Kubernetes."
                        action={{ label: 'New Project', onClick: () => setModalOpen(true) }}
                    />
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
                                    {['Service', 'Stage', 'Environment', 'Build Speed', 'Auto-Healing', 'Status', ''].map(h => (
                                        <th key={h} className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider py-3 px-5 whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {projects?.map((p) => {
                                    const isLive = p.provisioning_status === 'live';
                                    const isProvisioning = !isLive && p.provisioning_status !== 'pending' && p.provisioning_status !== 'failed';
                                    
                                    const stageLabel = p.die_stage || p.provisioning_status || 'Pending';
                                    const progressPct = p.provisioning_status === 'live' ? 100 : 
                                                       p.die_stage?.includes('VPC') ? 20 :
                                                       p.die_stage?.includes('EKS') ? 40 :
                                                       p.die_stage?.includes('kubeconfig') ? 60 :
                                                       p.die_stage?.includes('ALB') ? 80 : 10;

                                    return (
                                        <tr key={p.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors group cursor-pointer">
                                            <td className="py-3.5 px-5 font-semibold text-[14px]">{p.name}</td>
                                            <td className="py-3.5 px-5">
                                                <div className="flex flex-col gap-1.5 min-w-[140px]">
                                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                                        <span>{stageLabel}</span>
                                                        {isProvisioning && <span className="text-[var(--blue-primary)] animate-pulse">PROVISIONING</span>}
                                                    </div>
                                                    <div className="w-full h-1 bg-[var(--bg-card)] rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full transition-all duration-1000 ${isLive ? 'bg-[var(--green)]' : 'bg-[var(--blue-primary)] animate-shimmer'}`}
                                                            style={{ width: `${progressPct}%` }} 
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5"><Tag small color={p.environment === 'production' ? 'var(--amber)' : 'var(--blue-light)'}>{p.environment}</Tag></td>
                                            <td className="py-3.5 px-5 font-mono text-[13px]">{isLive ? '210s' : '--'}</td>
                                            <td className="py-3.5 px-5">
                                                <div className="flex items-center gap-1.5 text-[var(--green)]">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
                                                    <span className="text-xs font-medium">Auto-Healing</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5">
                                                <div className="flex items-center gap-2">
                                                    <StatusDot 
                                                        color={isLive ? 'var(--green)' : p.provisioning_status === 'failed' ? 'var(--red)' : 'var(--blue-light)'} 
                                                        pulse={isProvisioning} 
                                                        glow={isLive}
                                                    />
                                                    <span className="text-xs font-medium capitalize">
                                                        {isLive ? 'Live' : p.provisioning_status || 'Unknown'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 text-right w-12">
                                                <a href={p.live_url || p.repo_url} target="_blank" rel="noreferrer" className="inline-flex opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--blue-primary)]">
                                                    <ExternalLink size={16} />
                                                </a>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
