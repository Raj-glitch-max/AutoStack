import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import { Card, Tag, ChartTooltipContent } from '../ui/index';
import { SkeletonChart, SkeletonScoreCard } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { useClusterMetrics } from '../../hooks/useData';

export default function MonitoringTab({ cluster }) {
    const { data: metrics, loading } = useClusterMetrics(cluster?.id);

    if (!cluster) {
        return (
            <div className="animate-fadeIn pb-10">
                <Card className="bg-[var(--bg-surface)] mt-6 border-dashed">
                    <EmptyState
                        icon={Activity}
                        title="No Cluster Connected"
                        description="Connect a cluster to view detailed performance metrics."
                        action={{ label: 'Connect Cluster', onClick: () => window.location.href = '/onboarding' }}
                    />
                </Card>
            </div>
        );
    }

    // Format metrics for charts
    const chartData = [...(metrics || [])].reverse().map(m => ({
        time: new Date(m.sampled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cpu: m.cpu_usage || 0,
        memory: m.memory_usage || 0,
        requests: m.requests || 0,
        errors: m.errors || 0
    }));

    const current = chartData[chartData.length - 1] || { cpu: 0, memory: 0, requests: 0, errors: 0 };
    const previous = chartData[chartData.length - 2] || current;

    const calcDelta = (curr, prev) => {
        const diff = curr - prev;
        if (diff === 0) return '0';
        return diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    };

    const statCards = [
        { label: 'Avg CPU', value: `${current.cpu.toFixed(1)}%`, delta: `${calcDelta(current.cpu, previous.cpu)}%`, color: 'var(--blue-primary)', good: current.cpu <= previous.cpu },
        { label: 'Avg Memory', value: `${current.memory.toFixed(1)}%`, delta: `${calcDelta(current.memory, previous.memory)}%`, color: 'var(--purple)', good: current.memory <= previous.memory },
        { label: 'Req/min', value: current.requests.toString(), delta: calcDelta(current.requests, previous.requests), color: 'var(--green)', good: current.requests >= previous.requests },
        { label: 'Errors/min', value: current.errors.toString(), delta: calcDelta(current.errors, previous.errors), color: 'var(--red)', good: current.errors <= previous.errors },
    ];

    const charts = [
        { title: 'CPU Utilization %', dataKey: 'cpu', color: 'var(--blue-primary)', unit: '%' },
        { title: 'Memory Utilization %', dataKey: 'memory', color: 'var(--purple)', unit: '%' },
        { title: 'Requests/min', dataKey: 'requests', color: 'var(--green)', unit: ' req' },
        { title: 'Errors/min', dataKey: 'errors', color: 'var(--red)', unit: ' err' },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">Monitoring</h2>
                    <Tag small color="var(--text-muted)">Live Data</Tag>
                </div>
            </div>

            {/* 4 Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => <SkeletonScoreCard key={i} />)
                ) : chartData.length === 0 ? (
                    <div className="col-span-full">
                        <Card className="bg-[var(--bg-surface)] border-dashed p-10">
                            <EmptyState
                                icon={Activity}
                                title="No metrics yet"
                                description="We are waiting for the AutoStack agent to send the first batch of telemetry."
                            />
                        </Card>
                    </div>
                ) : (
                    statCards.map((stat, i) => (
                        <Card key={i} className="p-5 flex flex-col justify-between" style={{ animationDelay: `${i * 0.1}s` }}>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[11px] font-semibold tracking-widest text-[var(--text-muted)] uppercase">{stat.label}</span>
                                <Tag small color={stat.good ? 'var(--green)' : stat.delta === '0' ? 'var(--text-muted)' : 'var(--red)'}>{stat.delta}</Tag>
                            </div>
                            <div className="text-3xl font-black" style={{ color: stat.color }}>{stat.value}</div>
                        </Card>
                    ))
                )}
            </div>

            {/* 2x2 Chart Grid */}
            {chartData.length > 0 && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {charts.map((chart, i) => (
                        <Card key={i} className="p-6 h-[260px] flex flex-col">
                            <h3 className="font-semibold text-sm mb-6">{chart.title}</h3>
                            <div className="flex-1 -ml-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id={`color-${chart.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={chart.color} stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="var(--bg-base)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="time" stroke="var(--border-default)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={30} />
                                        <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <Tooltip content={<ChartTooltipContent unit={chart.unit} color={chart.color} />} cursor={{ stroke: 'var(--border-default)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                        <Area type="monotone" dataKey={chart.dataKey} stroke={chart.color} strokeWidth={2} fillOpacity={1} fill={`url(#color-${chart.dataKey})`} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
