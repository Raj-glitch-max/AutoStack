import { useState } from 'react';
import { Card, Button, Tag, ToggleSwitch } from '../ui/index';
import { ShieldAlert, Cloud, PlugZap, Bell, Users, Plus, CheckCircle2 } from 'lucide-react';
import { useIntegrations, useSupabaseQuery } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { SkeletonRow } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';

function TriggerRow({ n }) {
  const [on, setOn] = useState(n.default);
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-medium text-sm">{n.label}</div>
        <div className="text-xs text-[var(--text-muted)] mt-1">{n.desc}</div>
      </div>
      <ToggleSwitch checked={on} onChange={setOn} />
    </div>
  );
}

export default function SettingsTab() {
    const [subTab, setSubTab] = useState('Cloud Access');
    const { data: integrations, loading: intsLoading, error: intsError } = useIntegrations();
    const { user } = useAuth();
    const orgId = user?.user_metadata?.org_id;
    const { data: members, loading: membersLoading, error: membersError } = useSupabaseQuery('org_members', {
        filters: orgId ? { org_id: orgId } : {},
        orderBy: 'created_at',
        ascending: true,
        limit: 50,
    });

    const tabs = [
        { id: 'Cloud Access', icon: Cloud },
        { id: 'Integrations', icon: PlugZap },
        { id: 'Security & Auth', icon: ShieldAlert },
        { id: 'Team & Access', icon: Users },
    ];

    return (
        <div className="flex flex-col md:flex-row gap-8 animate-fadeIn h-full pb-10">
            {/* Settings Navigation */}
            <div className="w-full md:w-[220px] flex-shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto pb-4 md:pb-0">
                <div className="px-3 text-[10px] font-semibold tracking-widest text-[var(--text-dim)] mb-2 uppercase hidden md:block">Settings</div>
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setSubTab(t.id)} className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors rounded-lg whitespace-nowrap ${subTab === t.id ? 'bg-[var(--bg-card)] text-[var(--blue-light)] shadow-sm border border-[var(--border-default)]' : 'text-[var(--text-secondary)] border border-transparent hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'}`}>
                        <t.icon size={16} /> <span>{t.id}</span>
                    </button>
                ))}
            </div>

            {/* Settings Content Area */}
            <div className="flex-1 max-w-[720px]">
                {(intsError || membersError) && (
                    <div className="animate-fadeIn pb-10">
                        <Card className="bg-[rgba(244,63,94,0.05)] mt-6 border-dashed" style={{ borderColor: 'rgba(244,63,94,0.3)' }}>
                            <EmptyState
                                icon={ShieldAlert}
                                title="Failed to Load Settings"
                                description="There was a problem fetching your settings data. Please try again."
                                action={{ label: 'Retry', onClick: () => window.location.reload() }}
                            />
                        </Card>
                    </div>
                )}

                {!(intsError || membersError) && subTab === 'Cloud Access' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Cloud Control Plane</h2>
                            <p className="text-sm text-[var(--text-muted)]">Manage the IAM roles and permissions AutoStack uses to provision your cloud.</p>
                        </div>
                        <Card className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[var(--text-primary)] flex items-center justify-center text-[var(--bg-base)]">
                                        <Cloud size={20} fill="currentColor" />
                                    </div>
                                    <div>
                                        <span className="font-bold block">Amazon Web Services</span>
                                        <span className="text-[10px] text-[var(--green)] font-bold uppercase tracking-wider">Verified Account</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <StatusDot color="var(--green)" glow />
                                    <Tag color="var(--green)" variant="secondary">Connected</Tag>
                                </div>
                            </div>
                            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg p-5 space-y-4 mb-6">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-[var(--text-muted)]">AWS Account ID</span>
                                    <span className="font-mono bg-[var(--bg-card)] px-2 py-0.5 rounded border border-[var(--border-default)]">1234-5678-9012</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-[var(--text-muted)]">Default Region</span>
                                    <span className="font-mono bg-[var(--bg-card)] px-2 py-0.5 rounded border border-[var(--border-default)]">us-east-1</span>
                                </div>
                                <div className="flex justify-between items-start text-sm">
                                    <span className="text-[var(--text-muted)]">IAM Role ARN</span>
                                    <div className="text-right">
                                        <span className="font-mono bg-[var(--bg-card)] px-2 py-0.5 rounded border border-[var(--border-default)] block max-w-[300px] truncate text-[11px]">arn:aws:iam::123456789012:role/AutoStackCloudManager</span>
                                        <button className="text-[10px] text-[var(--blue-light)] hover:underline mt-1">Edit Role ARN</button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <Button variant="secondary" size="sm">Audit Permissions</Button>
                                <Button variant="ghost" danger size="sm">Disconnect Provider</Button>
                            </div>
                        </Card>
                        
                        <div className="p-4 rounded-xl bg-[rgba(36,99,235,0.05)] border border-[rgba(36,99,235,0.2)]">
                            <div className="flex items-start gap-3">
                                <ShieldAlert size={18} className="text-[var(--blue-primary)] mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold mb-1">Security Posture</h4>
                                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                        AutoStack is currently using a <strong>Limited Scope</strong> IAM policy. To enable VPC peering or Direct Connect management, upgrade to the "Full Networking" policy in your AWS console.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {!(intsError || membersError) && subTab === 'Integrations' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Integrations</h2>
                            <p className="text-sm text-[var(--text-muted)]">Connect external tools and services to AutoStack.</p>
                        </div>
                        <div className="space-y-3">
                            {intsLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <Card key={i} className="p-4"><SkeletonRow columns={3} /></Card>
                                ))
                            ) : integrations?.length > 0 ? (
                                integrations.map((int, i) => (
                                    <Card key={int.id || i} className="p-5 flex items-center justify-between gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center text-xl">
                                            {int.status === 'connected' ? <CheckCircle2 className="text-[var(--green)]" size={20} /> : <PlugZap className="text-[var(--text-dim)]" size={20} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="font-bold capitalize">{int.provider_type}</h3>
                                                <Tag small color={int.status === 'connected' ? 'var(--green)' : 'var(--text-dim)'}>{int.status || 'available'}</Tag>
                                            </div>
                                            <div className="text-sm text-[var(--text-muted)] mt-1">External provider configuration</div>
                                        </div>
                                        <Button variant={int.status === 'connected' ? 'secondary' : 'primary'}>{int.status === 'connected' ? 'Configure' : 'Connect'}</Button>
                                    </Card>
                                ))
                            ) : (
                                <div className="mt-4">
                                    <EmptyState
                                        icon={PlugZap}
                                        title="No Integrations"
                                        description="Connect external tools like GitHub, Slack, or PagerDuty to streamline your workflow."
                                        action={{ label: 'Explore Integrations', onClick: () => {} }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!(intsError || membersError) && subTab === 'Notifications' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div><h2 className="text-xl font-bold">Alert Rules</h2></div>
                        <Card>
                            <div className="p-5 font-semibold border-b border-[var(--border-default)] flex items-center gap-2"><ShieldAlert size={16} className="text-[var(--blue-light)]" /> Event Triggers</div>
                            <div className="p-5 space-y-6">
                                {[
                                    { id: 1, label: 'Deployment events', desc: 'Success, failure, and rollout status', default: true },
                                    { id: 2, label: 'AIRE incidents', desc: 'Auto-healing triggers and cluster anomalies', default: true },
                                    { id: 3, label: 'Score changes', desc: 'When COIE detects a drop in security or cost score', default: false },
                                    { id: 4, label: 'Weekly digest', desc: 'Platform performance and resource utilization summary', default: true },
                                ].map(n => (
                                    <TriggerRow key={n.id} n={n} />
                                ))}
                            </div>
                            <div className="p-5 border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-4 flex justify-end">
                                <Button>Save Preferences</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {!(intsError || membersError) && subTab === 'Team & Access' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold">Team Members</h2>
                            <Button icon={Plus}>Invite member</Button>
                        </div>
                        <Card className="overflow-hidden">
                            {membersLoading ? (
                                <div className="p-4 space-y-3">
                                    <SkeletonRow /><SkeletonRow /><SkeletonRow />
                                </div>
                            ) : members.length === 0 ? (
                                <EmptyState
                                    icon={Users}
                                    title="No team members yet"
                                    description="Invite team members to collaborate on your infrastructure."
                                    action={{ label: 'Invite member', onClick: () => {} }}
                                />
                            ) : (
                                members.map((m, i) => {
                                    const initials = (m.user_id === user?.id ? (user.user_metadata?.full_name || user.email || '?') : m.user_id)
                                        .substring(0, 2).toUpperCase();
                                    const displayName = m.user_id === user?.id
                                        ? (user.user_metadata?.full_name || user.email)
                                        : `Member ${m.user_id.substring(0, 8)}`;
                                    const displayEmail = m.user_id === user?.id ? user.email : '—';
                                    return (
                                        <div key={m.id || i} className="flex items-center justify-between p-4 border-b border-[var(--border-default)] last:border-0 hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-700 border border-[var(--border-default)] flex items-center justify-center font-bold text-xs">{initials}</div>
                                                <div>
                                                    <div className="font-semibold text-sm">{displayName} <span className="text-[11px] text-[var(--text-muted)] font-normal ml-1">({displayEmail})</span></div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <Tag small color={m.role === 'owner' ? 'var(--blue-light)' : m.role === 'admin' ? 'var(--purple)' : 'var(--text-dim)'}>{m.role}</Tag>
                                                <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] w-8 text-center text-lg">⋯</button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
