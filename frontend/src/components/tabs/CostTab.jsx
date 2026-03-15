import { useState, useEffect } from 'react';
import { DollarSign, TrendingDown, Zap, ShieldAlert, CheckCircle2, ArrowRight, Info, AlertTriangle, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Card, Button, Tag, StatusDot } from '../ui/index';

const mockDailyCost = [
    { day: 'Mon', cost: 42, potential: 31 },
    { day: 'Tue', cost: 45, potential: 32 },
    { day: 'Wed', cost: 41, potential: 28 },
    { day: 'Thu', cost: 48, potential: 30 },
    { day: 'Fri', cost: 52, potential: 35 },
    { day: 'Sat', cost: 38, potential: 25 },
    { day: 'Sun', cost: 36, potential: 24 },
];

const mockBreakdown = [
    { name: 'Compute', value: 340, color: 'var(--blue-primary)' },
    { name: 'Storage', value: 120, color: 'var(--purple)' },
    { name: 'Networking', value: 85, color: 'var(--cyan)' },
    { name: 'Other', value: 45, color: 'var(--text-dim)' },
];

export default function CostTab({ cluster }) {
    const [optimizing, setOptimizing] = useState(false);
    const [budgets, setBudgets] = useState([]);
    const [anomalies, setAnomalies] = useState([]);
    const [riRecommendations, setRiRecommendations] = useState([]);

    useEffect(() => {
        fetchFinOpsData();
    }, [cluster]);

    const fetchFinOpsData = async () => {
        try {
            // Fetch budgets
            const budgetResp = await fetch('/rest/v1/cost_budgets?status=eq.active', {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
                }
            });
            const budgetData = await budgetResp.json();
            setBudgets(budgetData || []);

            // Fetch anomalies
            const anomalyResp = await fetch('/rest/v1/cost_anomalies?status=eq.open&order=detected_at.desc&limit=5', {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
                }
            });
            const anomalyData = await anomalyResp.json();
            setAnomalies(anomalyData || []);

            // Fetch RI recommendations
            const riResp = await fetch('/rest/v1/ri_recommendations?status=eq.pending&order=annual_savings.desc&limit=5', {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
                }
            });
            const riData = await riResp.json();
            setRiRecommendations(riData || []);
        } catch (err) {
            console.error('Failed to fetch FinOps data:', err);
        } finally {
            // loading removed
        }
    };

    const handleOptimize = () => {
        setOptimizing(true);
        setTimeout(() => setOptimizing(false), 3000);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Budget Overview Section - NEW */}
            {budgets.length > 0 && (
                <Card className="p-6">
                    <h3 className="font-bold text-lg mb-4">Budget Overview</h3>
                    <div className="space-y-4">
                        {budgets.map(budget => {
                            const spendPct = Math.round((budget.current_spend / budget.budget_usd) * 100);
                            const isOverBudget = spendPct >= 100;
                            const isWarning = spendPct >= 80 && spendPct < 100;
                            
                            return (
                                <div key={budget.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">{budget.name}:</span>
                                        <span className="font-mono">
                                            ${budget.current_spend}/${budget.budget_usd}
                                        </span>
                                    </div>
                                    <div className="relative h-2 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                                        <div
                                            className={`absolute left-0 top-0 h-full transition-all ${
                                                isOverBudget ? 'bg-[var(--red)]' :
                                                isWarning ? 'bg-[var(--amber)]' :
                                                'bg-[var(--green)]'
                                            }`}
                                            style={{ width: `${Math.min(spendPct, 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className={`font-medium ${
                                            isOverBudget ? 'text-[var(--red)]' :
                                            isWarning ? 'text-[var(--amber)]' :
                                            'text-[var(--green)]'
                                        }`}>
                                            {spendPct}% {isOverBudget ? 'Over budget' : isWarning ? 'Warning' : 'On track'}
                                        </span>
                                        <Button size="xs" variant="ghost">Edit Budget</Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Anomaly Alerts Section - NEW */}
            {anomalies.length > 0 && (
                <Card className="p-6 border-[var(--amber)]">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={20} className="text-[var(--amber)] flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">Cost Anomaly Detected</h3>
                            {anomalies.map(anomaly => (
                                <div key={anomaly.id} className="mb-3 last:mb-0">
                                    <p className="text-sm text-[var(--text-secondary)] mb-2">
                                        <strong>{anomaly.direction === 'spike' ? '⚠️ Cost spike' : '📉 Cost drop'}</strong> detected in{' '}
                                        <strong>{anomaly.project_name || 'production'}</strong>: ${anomaly.current_amount} vs ${anomaly.expected_amount} expected{' '}
                                        ({anomaly.deviation_pct > 0 ? '+' : ''}{anomaly.deviation_pct}%)
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Detected {new Date(anomaly.detected_at).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                            <div className="flex gap-2 mt-3">
                                <Button size="xs" variant="outline">View Details</Button>
                                <Button size="xs" variant="ghost">Dismiss</Button>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* RI Recommendations Section - NEW */}
            {riRecommendations.length > 0 && (
                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-lg">💡 Reserved Instance Opportunities</h3>
                            <p className="text-xs text-[var(--text-muted)]">
                                Save ${riRecommendations.reduce((sum, r) => sum + r.annual_savings, 0).toFixed(0)}/year
                            </p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[var(--bg-surface)] text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-default)]">
                                    <th className="py-3 px-4">Instance Type</th>
                                    <th className="py-3 px-4">Utilization</th>
                                    <th className="py-3 px-4">Current/mo</th>
                                    <th className="py-3 px-4">RI Cost/mo</th>
                                    <th className="py-3 px-4">Annual Savings</th>
                                    <th className="py-3 px-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {riRecommendations.map(ri => (
                                    <tr key={ri.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                                        <td className="py-3 px-4 font-medium font-mono text-xs">{ri.instance_type}</td>
                                        <td className="py-3 px-4">
                                            <Tag size="xs" color={ri.utilization_pct > 90 ? 'var(--green)' : 'var(--amber)'}>
                                                {ri.utilization_pct}%
                                            </Tag>
                                        </td>
                                        <td className="py-3 px-4 font-mono text-xs">${ri.current_monthly_cost}</td>
                                        <td className="py-3 px-4 font-mono text-xs text-[var(--green)]">${ri.ri_monthly_cost}</td>
                                        <td className="py-3 px-4 font-mono text-xs text-[var(--green)] font-bold">
                                            +${ri.annual_savings}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <Button 
                                                size="xs" 
                                                variant="ghost" 
                                                icon={ArrowRight}
                                                onClick={() => window.open(`https://console.aws.amazon.com/ec2/v2/home?region=${ri.region}#ReservedInstances:`, '_blank')}
                                            >
                                                Purchase
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Header / Summary */}
            <div className="flex flex-col md:flex-row gap-6">
                <Card className="flex-1 p-6 flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--blue-primary)]/10 flex items-center justify-center text-[var(--blue-primary)] flex-shrink-0">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Mtd Spend</div>
                        <div className="text-3xl font-black">$592.40</div>
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--green)]">
                            <TrendingDown size={14} /> <span>12% less than last month</span>
                        </div>
                    </div>
                </Card>

                <Card className="flex-1 p-6 flex items-start gap-4" borderStyle="dashed">
                    <div className="w-12 h-12 rounded-xl bg-[var(--amber)]/10 flex items-center justify-center text-[var(--amber)] flex-shrink-0">
                        <Zap size={24} />
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Potential Savings</div>
                        <div className="text-3xl font-black text-[var(--amber)]">$124.80</div>
                        <div className="mt-2 text-xs text-[var(--text-muted)]">
                            Identified in <strong>{cluster?.name || 'prod-cluster-01'}</strong>
                        </div>
                    </div>
                    <Button size="sm" className="ml-auto" loading={optimizing} onClick={handleOptimize}>Optimize Now</Button>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 p-6 flex flex-col h-[400px]">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="font-bold text-lg">Spending Trends</h3>
                            <p className="text-xs text-[var(--text-muted)]">Daily cloud expenditure vs. optimized potential</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-[var(--text-muted)]">
                                <span className="w-2.5 h-2.5 rounded-full bg-[var(--blue-primary)]"></span> Actual
                            </div>
                            <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-[var(--text-muted)]">
                                <span className="w-2.5 h-2.5 rounded-full bg-[rgba(36,99,235,0.2)]"></span> Optimized
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={mockDailyCost}>
                                <defs>
                                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--blue-primary)" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="var(--blue-primary)" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" opacity={0.5} />
                                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={(v) => `$${v}`} />
                                <Tooltip 
                                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '12px' }}
                                    itemStyle={{ color: 'var(--text-primary)' }}
                                />
                                <Area type="monotone" dataKey="cost" stroke="var(--blue-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorCost)" />
                                <Area type="monotone" dataKey="potential" stroke="rgba(36,99,235,0.2)" strokeDasharray="5 5" fill="transparent" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="p-6 h-[400px] flex flex-col">
                    <h3 className="font-bold text-lg mb-1">Resource Split</h3>
                    <p className="text-xs text-[var(--text-muted)] mb-8">Cost distribution by category</p>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mockBreakdown} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-primary)' }} width={80} />
                                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px' }} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                                    {mockBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-6 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-default)]">
                        <div className="flex items-center gap-2 mb-2">
                            <Info size={14} className="text-[var(--blue-primary)]" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">Insight</span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            NAT Gateway idling detected in <strong>us-east-1</strong>. Switching to VPC Endpoints could save ~$40/mo.
                        </p>
                    </div>
                </Card>
            </div>

            {/* Recommendations Table */}
            <Card className="overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
                    <h3 className="font-bold">Optimization Recommendations</h3>
                    <Tag variant="outline" color="var(--amber)">4 Issues Found</Tag>
                </div>
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[var(--bg-surface)] text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-default)]">
                                <th className="py-3 px-6">Resource</th>
                                <th className="py-3 px-6">Issue</th>
                                <th className="py-3 px-6">Monthly Savings</th>
                                <th className="py-3 px-6 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            <tr className="border-b border-[var(--border-default)] last:border-0 hover:bg-[rgba(255,255,255,0.01)] transition-colors group">
                                <td className="py-4 px-6 font-medium">eks-worker-m5-large</td>
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-2">
                                        <ShieldAlert size={14} className="text-[var(--amber)]" />
                                        <span>Underutilized (Avg 8% CPU)</span>
                                    </div>
                                </td>
                                <td className="py-4 px-6 text-[var(--green)] font-mono">+$67.20</td>
                                <td className="py-4 px-6 text-right">
                                    <Button size="xs" variant="ghost" icon={ArrowRight}>Downsize</Button>
                                </td>
                            </tr>
                            <tr className="border-b border-[var(--border-default)] last:border-0 hover:bg-[rgba(255,255,255,0.01)] transition-colors group">
                                <td className="py-4 px-6 font-medium">production-rds-db</td>
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={14} className="text-[var(--blue-primary)]" />
                                        <span>Reserved Instance Available</span>
                                    </div>
                                </td>
                                <td className="py-4 px-6 text-[var(--green)] font-mono">+$42.00</td>
                                <td className="py-4 px-6 text-right">
                                    <Button size="xs" variant="ghost" icon={ArrowRight}>Convert</Button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
