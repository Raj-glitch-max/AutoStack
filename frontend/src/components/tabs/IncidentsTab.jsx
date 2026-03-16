import { useState } from 'react';
import { Card, Button, StatusDot, Tag } from '../ui/index';
import { ShieldCheck, ShieldAlert, AlertTriangle, AlertCircle, Clock, CheckCircle2, RefreshCw, ExternalLink, Info } from 'lucide-react';
import { useIncidents } from '../../hooks/useData';
import EmptyState from '../ui/EmptyState';
import { SkeletonCard } from '../ui/Skeleton';
import { formatDistanceToNow } from 'date-fns';

export default function IncidentsTab({ cluster }) {
    const { data: incidents, loading, error, refetch } = useIncidents(cluster?.id);
    const [selectedIncident, setSelectedIncident] = useState(null);

    if (loading) return (
        <div className="space-y-4">
            <SkeletonCard height="120px" />
            <SkeletonCard height="120px" />
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center py-16 gap-4">
            <AlertTriangle className="w-10 h-10 text-[var(--red)]" />
            <p className="text-sm text-[var(--text-muted)]">Failed to load: {error.message || 'Network error'}</p>
            <Button variant="secondary" onClick={refetch}>Try again</Button>
        </div>
    );

    const activeIncidents = incidents.filter(i => ['detected', 'investigating', 'diagnosed'].includes(i.status));
    const resolvedIncidents = incidents.filter(i => i.status === 'resolved');

    if (!incidents || incidents.length === 0) return (
        <EmptyState
            icon={ShieldCheck}
            title="All clear"
            description="AIRE is monitoring your environment and hasn't detected any incidents."
            action={null}
        />
    );

    const getSeverityDetails = (severity) => {
        switch (severity) {
            case 'critical': return { color: 'var(--red)', icon: AlertCircle };
            case 'high': return { color: 'var(--orange)', icon: AlertTriangle };
            case 'medium': return { color: 'var(--amber)', icon: Info };
            case 'low': return { color: 'var(--blue-primary)', icon: Info };
            default: return { color: 'var(--text-muted)', icon: Info };
        }
    };

    return (
        <div className="space-y-8 animate-fadeIn flex">
            {/* Left side: List */}
            <div className={`flex-1 transition-all ${selectedIncident ? 'pr-6 border-r border-[var(--border-default)]' : ''}`}>
                <div className="mb-6">
                    <h2 className="text-xl font-bold mb-1">Active Incidents</h2>
                    <p className="text-sm text-[var(--text-muted)]">AI-detected issues requiring your attention.</p>
                </div>

                <div className="space-y-4">
                    {activeIncidents.length === 0 ? (
                        <Card className="p-6 text-center border-dashed bg-transparent">
                            <ShieldCheck className="mx-auto h-8 w-8 text-[var(--green)] mb-3" />
                            <h3 className="text-sm font-medium">No active incidents</h3>
                            <p className="text-xs text-[var(--text-muted)] mt-1">Systems are functioning normally.</p>
                        </Card>
                    ) : (
                        activeIncidents.map(incident => {
                            const { color, icon: Icon } = getSeverityDetails(incident.severity);
                            return (
                                <Card 
                                    key={incident.id} 
                                    className={`p-4 cursor-pointer hover:border-[var(--border-hover)] transition-colors ${selectedIncident?.id === incident.id ? 'border-[var(--blue-primary)] ring-1 ring-[var(--blue-primary)]' : ''}`}
                                    onClick={() => setSelectedIncident(incident)}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 rounded bg-black/5" style={{ color }}>
                                            <Icon size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-semibold">{incident.summary}</h3>
                                                <div className="flex items-center gap-2">
                                                    <StatusDot color={incident.status === 'diagnosed' ? 'var(--blue-primary)' : 'var(--amber)'} pulse />
                                                    <span className="text-xs uppercase font-medium">{incident.status}</span>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex items-center gap-4 text-xs text-[var(--text-muted)]">
                                                <span className="font-mono bg-[var(--bg-base)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
                                                    {incident.affected_resource || 'unknown'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} />
                                                    {incident.detected_at ? formatDistanceToNow(new Date(incident.detected_at), { addSuffix: true }) : 'Unknown'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </div>

                {resolvedIncidents.length > 0 && (
                    <div className="mt-10">
                        <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4">Resolved Recently</h3>
                        <div className="space-y-3">
                            {resolvedIncidents.slice(0, 5).map(incident => (
                                <Card key={incident.id} className="p-4 opacity-70 hover:opacity-100 transition-opacity flex items-center justify-between cursor-pointer" onClick={() => setSelectedIncident(incident)}>
                                    <div>
                                        <div className="font-medium text-sm line-through decoration-[var(--text-dim)]">{incident.summary}</div>
                                        <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2">
                                            <CheckCircle2 size={12} className="text-[var(--green)]" />
                                            Resolved {incident.diagnosed_at ? formatDistanceToNow(new Date(incident.diagnosed_at), { addSuffix: true }) : 'Unknown'}
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Right side: Detail Panel */}
            {selectedIncident && (
                <div className="w-[450px] pl-6 animate-slideInRight">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-lg">Incident Detail</h3>
                        <button onClick={() => setSelectedIncident(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
                    </div>

                    <div className="space-y-6">
                        {/* Status timeline */}
                        <div className="bg-[var(--bg-card)] rounded-lg p-4 border border-[var(--border-default)]">
                            <div className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wide font-semibold">AIRE Diagnosis</div>
                            {selectedIncident.pattern_confidence ? (
                                <div className="text-sm flex items-start gap-2">
                                    <ShieldCheck className="text-[var(--blue-primary)] shrink-0 mt-0.5" size={16} />
                                    <span>
                                        Matched pattern <span className="font-mono text-xs">{selectedIncident.matched_pattern || 'UNKNOWN'}</span> with 
                                        {' '}<span className="font-bold">{(selectedIncident.pattern_confidence * 100).toFixed(0)}% confidence</span>.
                                    </span>
                                </div>
                            ) : (
                                <div className="text-sm flex items-start gap-2 text-[var(--amber)]">
                                    <RefreshCw className="shrink-0 mt-0.5 animate-spin" size={16} />
                                    <span>AIRE is currently analyzing this incident...</span>
                                </div>
                            )}
                        </div>

                        {selectedIncident.root_cause && (
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Root Cause</h4>
                                <p className="text-sm bg-[var(--bg-base)] p-3 rounded border border-[var(--border-default)]">
                                    {selectedIncident.root_cause}
                                </p>
                            </div>
                        )}

                        {selectedIncident.immediate_action && (
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Immediate Action</h4>
                                <p className="text-sm bg-[var(--bg-base)] p-3 rounded border border-[var(--border-default)]">
                                    {selectedIncident.immediate_action}
                                </p>
                            </div>
                        )}

                        {selectedIncident.permanent_fix && (
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Permanent Fix</h4>
                                <p className="text-sm bg-[var(--bg-base)] p-3 rounded border border-[var(--border-default)]">
                                    {selectedIncident.permanent_fix}
                                </p>
                            </div>
                        )}

                        {selectedIncident.log_excerpts && selectedIncident.log_excerpts.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Relevant Logs</h4>
                                <div className="bg-[#1e1e1e] rounded p-3 overflow-x-auto border border-[#333]">
                                    {selectedIncident.log_excerpts.map((log, i) => (
                                        <div key={i} className="font-mono text-xs text-[#d4d4d4] whitespace-pre">{log}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-[var(--border-default)] flex gap-3">
                            {selectedIncident.remediation_type === 'restart' && (
                                <Button className="flex-1">
                                    <RefreshCw size={14} className="mr-2" /> Restart Resource
                                </Button>
                            )}
                            {selectedIncident.remediation_type === 'patch_manifest' && (
                                <Button className="flex-1" variant="secondary">
                                    <ExternalLink size={14} className="mr-2" /> View PR
                                </Button>
                            )}
                            {selectedIncident.status !== 'resolved' && (
                                <Button variant={selectedIncident.remediation_type ? "secondary" : "primary"} className="flex-1">Mark Resolved</Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
