import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Layers, Activity, ServerCrash } from 'lucide-react';
import { Card, Button, StatusDot, Tag, ProgressBar, useCountUp, ChartTooltipContent } from '../ui/index';
import { SkeletonScoreCard, SkeletonChart, SkeletonText } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { useClusterScores, useClusterMetrics, useIncidents, useDeployments } from '../../hooks/useData';

/* ─── ScoreCard ─── */
function ScoreCard({ label, score, delta, color, history }) {
    const [isHovered, setIsHovered] = useState(false);
    const animatedScore = useCountUp(score, 1000);
    const isPositive = delta.startsWith('+');

    return (
        <Card className="p-5 flex flex-col relative overflow-hidden"
            style={{ borderColor: isHovered ? color : 'var(--border-default)' }}
            onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold tracking-widest text-[var(--text-muted)] uppercase">{label}</span>
                <Tag small color={isPositive ? 'var(--green)' : delta === '0' ? 'var(--text-muted)' : 'var(--red)'}>{delta}</Tag>
            </div>
            <div className="flex-1 flex items-end justify-between">
                <div className="text-4xl font-black" style={{ color }}>{animatedScore}</div>

                {/* Sparkline on hover */}
                {history && history.length > 0 && (
                    <div className={`transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`} style={{ width: 80, height: 28 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history.map((val, i) => ({ val, i }))}>
                                <Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
            <div className="mt-4">
                <ProgressBar value={score} color={color} />
            </div>
        </Card>
    );
}

export default function OverviewTab({ onNavigate, cluster }) {
    const { data: scores, loading: scoresLoading } = useClusterScores(cluster?.id);
    const { data: metrics, loading: metricsLoading } = useClusterMetrics(cluster?.id);
    const { data: deployments, loading: depsLoading } = useDeployments(cluster?.id);
    const { data: incidents, loading: incLoading } = useIncidents(cluster?.id);

    if (!cluster) {
        return (
            <div className="animate-fadeIn pb-10">
                <Card className="bg-[var(--bg-surface)] mt-6 border-dashed">
                    <EmptyState
                        icon={Layers}
                        title="No Cluster Connected"
                        description="You need to connect an orchestration cluster to start gathering metrics and optimizing workloads."
                        action={{ label: 'Connect Cluster', onClick: () => window.location.href = '/onboarding' }}
                    />
                </Card>
            </div>
        );
    }

    const latestScore = scores?.[0] || {
        health_score: cluster.health_score || 0,
        score_security: cluster.score_security || 0,
        score_reliability: cluster.score_reliability || 0,
        score_cost: cluster.score_cost || 0,
        score_performance: cluster.score_performance || 0,
    };

    const getHistory = (key) => scores?.map(s => s[key]).reverse() || [];

    // Sort combined activity (deployments + incidents)
    const combinedActivity = [
        ...(deployments?.map(d => ({
            type: 'deployment',
            time: new Date(d.started_at),
            msg: `Deployed ${d.projectId ? `project ${d.projectId}` : 'image'} - ${d.commit_sha?.substring(0, 7)}`,
            color: d.status === 'success' ? 'var(--green)' : 'var(--blue-light)',
            isLive: d.status === 'running'
        })) || []),
        ...(incidents?.map(i => ({
            type: 'incident',
            time: new Date(i.detected_at),
            msg: `Incident: [${i.severity.toUpperCase()}] ${i.trigger_type} in ${i.namespace || 'cluster'}`,
            color: i.status === 'resolved' ? 'var(--green)' : i.severity === 'high' ? 'var(--red)' : 'var(--amber)',
            isLive: i.status === 'detected' || i.status === 'diagnosed'
        })) || [])
    ].sort((a, b) => b.time - a.time).slice(0, 10);

    const hasLiveActivity = combinedActivity.some(a => a.isLive);
    const chartData = metrics?.map(m => ({
        time: new Date(m.sampled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        requests: m.requests || 0
    })).reverse() || [];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Cluster Header Card */}
            <div className="rounded-xl p-6 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #0d1937, var(--bg-surface))', border: '1px solid rgba(36,99,235,0.3)' }}>
                <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at top left, rgba(36,99,235,0.1), transparent 50%)' }} />
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <StatusDot color={cluster.health_score > 80 ? 'var(--green)' : 'var(--amber)'} glow />
                            <h2 className="text-xl font-bold">{cluster.name}</h2>
                            <Tag color={cluster.health_score > 80 ? 'var(--green)' : 'var(--amber)'}>{cluster.health_score > 80 ? 'Healthy' : 'Degraded'}</Tag>
                            <Tag color="var(--text-muted)">{cluster.k8s_version || 'v1.28.3'}</Tag>
                        </div>
                        <div className="flex items-center gap-6 text-[11px] text-[var(--text-muted)]">
                            <div className="flex flex-col gap-1"><span className="font-mono text-[13px] text-[var(--text-primary)]">{cluster.node_count || 0}</span> nodes</div>
                            <div className="flex flex-col gap-1"><span className="font-mono text-[13px] text-[var(--text-primary)]">{cluster.pod_count || 0}</span> pods running</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button variant="secondary" onClick={() => onNavigate('monitoring')}>View Metrics</Button>
                        <Button onClick={() => onNavigate('projects')}>New Project</Button>
                    </div>
                </div>
            </div>

            {/* Score Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {scoresLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <SkeletonScoreCard key={i} />)
                ) : (
                    <>
                        <ScoreCard label="Security" score={latestScore.score_security} delta="+2" color="var(--green)" history={getHistory('score_security')} />
                        <ScoreCard label="Reliability" score={latestScore.score_reliability} delta="0" color="var(--blue-primary)" history={getHistory('score_reliability')} />
                        <ScoreCard label="Cost" score={latestScore.score_cost} delta="-1" color="var(--amber)" history={getHistory('score_cost')} />
                        <ScoreCard label="Performance" score={latestScore.score_performance} delta="+3" color="var(--purple)" history={getHistory('score_performance')} />
                    </>
                )}
            </div>

            {/* Grid: Chart + Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Throughput Chart */}
                <Card className="p-6 flex flex-col h-[320px]">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-sm">Request Throughput</h3>
                        <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded p-1">
                            {['1h', '6h', '24h', '7d'].map((r, i) => (
                                <button key={r} className={`text-[10px] font-medium px-2 py-0.5 rounded ${i === 2 ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>{r}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 -ml-4">
                        {metricsLoading ? (
                            <SkeletonChart height="100%" />
                        ) : chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--blue-primary)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="var(--bg-base)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" stroke="var(--border-default)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={30} />
                                    <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                                    <Tooltip content={<ChartTooltipContent unit=" req/s" />} cursor={{ stroke: 'var(--border-default)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                    <Area type="monotone" dataKey="requests" stroke="var(--blue-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorThroughput)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-50">
                                <Activity size={32} className="text-[var(--text-muted)] mb-3" />
                                <span className="text-xs text-[var(--text-muted)]">No throughput data recorded</span>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Activity Feed */}
                <Card className="p-6 h-[320px] flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-sm">Recent Activity</h3>
                        {hasLiveActivity && (
                            <div className="flex items-center gap-1.5"><StatusDot pulse="fast" glow color="var(--green)" /><span className="text-[10px] font-bold text-[var(--green)] uppercase tracking-wider">Live</span></div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                        {depsLoading || incLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex gap-4 mb-4">
                                    <div className="w-2 h-2 rounded-full bg-[var(--bg-card)] mt-1.5" />
                                    <div className="flex-1">
                                        <SkeletonText height={14} className="mb-2 w-3/4" />
                                        <SkeletonText height={10} className="w-1/4" />
                                    </div>
                                </div>
                            ))
                        ) : combinedActivity.length > 0 ? (
                            combinedActivity.map((ev, i) => (
                                <div key={i} className="flex items-start gap-4">
                                    <div className="mt-1.5"><StatusDot color={ev.color} /></div>
                                    <div className="flex-1 border-b border-[var(--border-default)] pb-4 last:border-0 last:pb-0">
                                        <div className="text-[13px] text-[var(--text-primary)] leading-snug">{ev.msg}</div>
                                        <div className="text-[10px] text-[var(--text-muted)] mt-1">
                                            {ev.time.toLocaleDateString()} {ev.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center pt-8 opacity-50">
                                <ServerCrash size={32} className="text-[var(--text-muted)] mb-3" />
                                <span className="text-xs text-[var(--text-muted)]">No recent activity</span>
                            </div>
                        )}
                    </div>
                </Card>

            </div>
        </div>
    );
}
