import { Server } from 'lucide-react';
import { Card, Tag, ProgressBar } from '../ui/index';
import EmptyState from '../ui/EmptyState';

// Since we don't have node-level metrics in the DB yet, we simulate them based on the cluster size
const generateNodes = (count, provider) => {
    return Array.from({ length: Math.max(1, count) }).map((_, i) => ({
        name: `${provider || 'aws'}-worker-${i + 1}`,
        type: provider === 'aws' ? 'm5.xlarge' : 'Standard_D4s_v3',
        detail: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        status: i === 0 ? 'Warning' : 'Healthy',
        cpu: Math.floor(Math.random() * 40) + 20,
        memory: i === 0 ? 88 : Math.floor(Math.random() * 40) + 40,
        warning: i === 0 ? 'High memory pressure detected' : null
    }));
};

export default function InfrastructureTab({ cluster }) {
    if (!cluster) {
        return (
            <div className="animate-fadeIn pb-10">
                <Card className="bg-[var(--bg-surface)] mt-6 border-dashed">
                    <EmptyState
                        icon={Server}
                        title="No Cluster Connected"
                        description="Connect a cluster to view infrastructure nodes and resource usage."
                        action={{ label: 'Connect Cluster', onClick: () => window.location.href = '/onboarding' }}
                    />
                </Card>
            </div>
        );
    }

    const resources = [
        ...generateNodes(cluster.node_count || 3, cluster.provider),
        {
            name: `${cluster.provider || 'aws'}-rds-master`,
            type: 'db.r6g.xlarge',
            detail: 'Multi-AZ',
            status: 'Healthy',
            cpu: 32,
            memory: 64,
        },
        {
            name: `${cluster.provider || 'aws'}-elasticache`,
            type: 'cache.r6g.large',
            detail: 'Redis 7.0',
            status: 'Healthy',
            cpu: 18,
            memory: 45,
        }
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">Infrastructure</h2>
                <Tag small color="var(--text-muted)">{cluster.region || 'us-east-1'}</Tag>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {resources.map((res, i) => (
                    <Card key={i} className="p-5 flex flex-col justify-between h-40 group hover:-translate-y-0.5 transition-transform" style={{ animationDelay: `${i * 0.05}s` }}>
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-base mb-1 group-hover:text-[var(--blue-light)] transition-colors">{res.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                    <span>{res.type}</span>
                                    <span>·</span>
                                    <span className="font-mono">{res.detail}</span>
                                </div>
                            </div>
                            <Tag color={res.status === 'Healthy' ? 'var(--green)' : 'var(--amber)'}>{res.status}</Tag>
                        </div>

                        {res.cpu !== null ? (
                            <div className="space-y-3 mt-auto">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] w-12 uppercase tracking-wider">CPU</span>
                                    <ProgressBar value={res.cpu} color="auto" className="flex-1" />
                                    <span className="text-xs font-mono w-8 text-right">{res.cpu}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] w-12 uppercase tracking-wider">Mem</span>
                                    <ProgressBar value={res.memory} color="auto" className="flex-1" />
                                    <span className="text-xs font-mono w-8 text-right">{res.memory}%</span>
                                </div>
                            </div>
                        ) : res.warning ? (
                            <div className="mt-auto p-2.5 rounded-md bg-[var(--red)]/10 border border-[var(--red)]/20 text-[var(--red)] text-xs font-medium flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                {res.warning}
                            </div>
                        ) : (
                            <div className="mt-auto text-xs text-[var(--text-muted)] italic">
                                Metrics managed by {cluster.provider?.toUpperCase() || 'Cloud Provider'}
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}
