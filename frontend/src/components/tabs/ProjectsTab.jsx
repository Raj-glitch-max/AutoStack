import { useState } from 'react';
import { ExternalLink, Plus, FolderGit2 } from 'lucide-react';
import { Card, Button, StatusDot, Tag, ProgressBar, Modal, Input, Select } from '../ui/index';
import { SkeletonCard, SkeletonRow, SkeletonText } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { useProjects, useSupabaseInsert } from '../../hooks/useData';
import { useToast } from '../../context/ToastContext';

/* ─── New Project Modal ─── */
function NewProjectModal({ onClose, clusterId, onSuccess }) {
    const toast = useToast();
    const { mutate: insertProject } = useSupabaseInsert('projects');
    const [step, setStep] = useState(0); // 0: form, 1: analyzing, 2: success
    const [form, setForm] = useState({
        repoUrl: '',
        branch: 'main',
        environment: 'production'
    });

    const handleSubmit = async () => {
        const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/;
        if (!form.repoUrl) {
            toast.error('Repository URL is required');
            return;
        }
        if (!githubRegex.test(form.repoUrl)) {
            toast.error('Please enter a valid GitHub repository URL');
            return;
        }

        setStep(1);

        // Simulate analysis delay
        await new Promise(r => setTimeout(r, 2000));

        try {
            // Extract a reasonable name from the github URL
            const urlParts = form.repoUrl.replace('https://github.com/', '').split('/');
            const projectName = urlParts[urlParts.length - 1]?.replace('.git', '') || 'new-service';

            await insertProject({
                cluster_id: clusterId,
                name: projectName,
                repo_url: form.repoUrl,
                branch: form.branch,
                environment: form.environment,
                stack: 'Node.js', // Simulated
                status: 'pending',
                health_score: 100
            });

            setStep(2);
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);
        } catch (err) {
            toast.error(err.message || 'Failed to connect repository');
            setStep(0);
        }
    };

    return (
        <Modal title="Connect repository" onClose={onClose}>
            {step === 0 && (
                <div className="space-y-5">
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
                            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">Environment</label>
                            <Select options={[{ value: 'production', label: 'Production' }, { value: 'staging', label: 'Staging' }]} value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase">AWS Region</label>
                        <Select options={[{ value: 'us-east-1', label: 'US East (N. Virginia)' }, { value: 'eu-central-1', label: 'EU (Frankfurt)' }]} value="us-east-1" onChange={() => { }} />
                    </div>

                    <div className="p-4 rounded-lg mt-2" style={{ background: 'rgba(36,99,235,0.05)', border: '1px solid rgba(36,99,235,0.2)' }}>
                        <div className="text-xs font-semibold mb-3">AutoStack will generate:</div>
                        <div className="flex flex-wrap gap-2">
                            {['Dockerfile', 'K8s Manifests', 'HPA', 'NetworkPolicy', 'ArgoCD App', 'Security Context'].map(t => (
                                <Tag key={t} small>{t}</Tag>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSubmit}>Connect repository →</Button>
                    </div>
                </div>
            )}
            {step === 1 && (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 border-2 border-[var(--blue-primary)] border-t-transparent rounded-full animate-spin mb-4" />
                    <h3 className="font-bold text-lg mb-1">Analyzing Repository...</h3>
                    <p className="text-[var(--text-muted)] text-sm">Detecting stack, dependencies, and generating manifests.</p>
                </div>
            )}
            {step === 2 && (
                <div className="py-12 flex flex-col items-center justify-center text-center animate-fadeUp">
                    <div className="w-12 h-12 bg-[var(--green)]/20 text-[var(--green)] rounded-full flex items-center justify-center mb-4">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--green)' }}>Repository Connected!</h3>
                    <p className="text-[var(--text-muted)] text-sm">✓ PR opened with infrastructure configuration.</p>
                </div>
            )}
        </Modal>
    );
}

export default function ProjectsTab({ cluster }) {
    const [modalOpen, setModalOpen] = useState(false);

    // We only fetch projects if a cluster ID is available
    const { data: projects, loading, refetch } = useProjects(cluster?.id);

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
            {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} clusterId={cluster.id} onSuccess={() => refetch()} />}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-3">Projects <span className="text-[14px] font-normal text-[var(--text-muted)]">{projects?.length || 0} repositories connected</span></h2>
                </div>
                <Button icon={Plus} onClick={() => setModalOpen(true)}>New Project</Button>
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
                                    {['Project', 'Stack', 'Environment', 'Health Score', 'Deployments', 'Status', ''].map(h => (
                                        <th key={h} className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider py-3 px-5 whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {projects?.map((p) => (
                                    <tr key={p.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors group cursor-pointer">
                                        <td className="py-3.5 px-5 font-semibold text-[14px]">{p.name}</td>
                                        <td className="py-3.5 px-5"><span className="font-mono text-xs text-[var(--text-secondary)]">{p.stack || 'Unknown'}</span></td>
                                        <td className="py-3.5 px-5"><Tag small color={p.environment === 'production' ? 'var(--amber)' : 'var(--blue-light)'}>{p.environment}</Tag></td>
                                        <td className="py-3.5 px-5">
                                            <div className="flex items-center gap-3 w-32">
                                                <span className="font-mono text-[13px]">{p.health_score}</span>
                                                <ProgressBar value={p.health_score} color={p.health_score > 80 ? 'var(--green)' : 'var(--amber)'} className="flex-1" />
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-5 font-mono text-[13px]">{p.deploy_count || 0}</td>
                                        <td className="py-3.5 px-5">
                                            <div className="flex items-center gap-2">
                                                <StatusDot color={p.status === 'healthy' ? 'var(--green)' : p.status === 'pending' ? 'var(--blue-light)' : 'var(--red)'} />
                                                <span className="text-xs capitalize">{p.status}</span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-5 text-right w-12">
                                            <a href={p.repo_url} target="_blank" rel="noreferrer" className="inline-flex opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--blue-primary)]">
                                                <ExternalLink size={16} />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
