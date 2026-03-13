import { RefreshCw, GitCommit, GitBranch } from 'lucide-react';
import { Card, Button, StatusDot } from '../ui/index';
import { SkeletonCard, SkeletonRow, SkeletonText } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { usePipelines } from '../../hooks/useData';

const stageNames = ['Build', 'Test', 'Security', 'QA Deck', 'Production'];

export default function PipelinesTab({ cluster }) {
    const { data: pipelines, loading, refetch } = usePipelines(cluster?.id);

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'success': return 'var(--green)';
            case 'running': return 'var(--blue-light)';
            case 'failed': return 'var(--red)';
            case 'pending': return 'var(--amber)';
            default: return 'var(--text-dim)';
        }
    };

    if (!cluster) {
        return (
            <div className="animate-fadeIn pb-10">
                <Card className="bg-[var(--bg-surface)] mt-6 border-dashed">
                    <EmptyState
                        icon={GitBranch}
                        title="No Cluster Connected"
                        description="Connect a cluster to view CI/CD pipeline deployments."
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
                    <div>
                        <SkeletonText width={120} height={28} className="mb-2" />
                        <SkeletonText width={180} height={14} />
                    </div>
                </div>
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="p-4">
                            <SkeletonRow columns={4} />
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    const runningCount = pipelines?.filter(p => p.status === 'running')?.length || 0;
    const failedCount = pipelines?.filter(p => p.status === 'failed')?.length || 0;

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold">Pipelines</h2>
                    <p className="text-[13px] text-[var(--text-muted)] mt-1">{pipelines?.length || 0} pipelines · {runningCount} running · {failedCount} failed</p>
                </div>
                <Button variant="secondary" icon={RefreshCw} onClick={() => refetch()}>Refresh</Button>
            </div>

            {pipelines?.length === 0 ? (
                <Card className="bg-[var(--bg-surface)] border-dashed">
                    <EmptyState
                        icon={GitBranch}
                        title="No Pipelines Found"
                        description="No CI/CD pipelines have run for the projects in this cluster yet."
                    />
                </Card>
            ) : (
                <div className="space-y-2">
                    {pipelines?.map((pipe, idx) => {
                        const stagesArray = pipe.stages || [0, 0, 0, 0, 0]; // fallback
                        const durationStr = pipe.duration_seconds ? `${Math.floor(pipe.duration_seconds / 60)}m ${pipe.duration_seconds % 60}s` : '--';
                        const timeStr = new Date(pipe.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        return (
                            <Card key={pipe.id || idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group cursor-pointer hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                                {/* Left Info */}
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-4 flex justify-center">
                                        <StatusDot
                                            color={getStatusColor(pipe.status)}
                                            pulse={pipe.status === 'running' ? 'fast' : false}
                                            glow={pipe.status === 'success'}
                                        />
                                    </div>
                                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
                                        <div className="font-semibold text-sm truncate">{pipe.project_id ? `Project ${pipe.project_id.substring(0, 8)}` : 'Unknown'}</div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border uppercase" style={{ color: getStatusColor(pipe.status), borderColor: `${getStatusColor(pipe.status)}40`, background: `${getStatusColor(pipe.status)}15` }}>
                                                {pipe.status || 'unknown'}
                                            </span>
                                        </div>

                                        <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-[var(--text-muted)]">
                                            <span className="flex items-center gap-1"><GitBranch size={12} /> {pipe.trigger_branch || 'main'}</span>
                                            <span className="flex items-center gap-1 text-[var(--blue-light)]"><GitCommit size={12} /> {pipe.commit_sha?.substring(0, 7) || 'HEAD'}</span>
                                        </div>

                                        <div className="text-xs text-[var(--text-muted)] flex items-center gap-4 justify-end md:justify-start">
                                            <span className="w-12 text-right">{durationStr}</span>
                                            <span className="w-20 text-right">{timeStr}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Stages */}
                                <div className="flex items-center gap-1.5 ml-8 md:ml-0 overflow-x-auto pb-1 md:pb-0">
                                    {stagesArray.map((stageState, sIdx) => {
                                        // 0=pending/gray, 1=success/green, 2=running/blue, 3=failed/red
                                        let bg = 'var(--text-dim)';
                                        let classes = 'w-7 h-1.5 rounded-sm relative overflow-hidden transition-all duration-300';

                                        if (stageState === 1) bg = 'var(--green)';
                                        if (stageState === 2) { bg = 'var(--blue-light)'; classes += ' animate-shimmer'; }
                                        if (stageState === 3) { bg = 'var(--red)'; classes += ' animate-pulse-fast shadow-[0_0_8px_rgba(244,63,94,0.5)]'; }
                                        if (stageState === 0) bg = 'var(--bg-card)';

                                        return (
                                            <div key={sIdx} className="relative group/stage">
                                                <div className={classes} style={{ backgroundColor: bg, border: stageState === 0 ? '1px solid var(--border-default)' : 'none' }} />

                                                {/* Stage Tooltip */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded text-[10px] font-mono whitespace-nowrap opacity-0 group-hover/stage:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg capitalize">
                                                    {stageNames[sIdx]}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
