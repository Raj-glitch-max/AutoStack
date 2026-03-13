import { useState } from 'react';
import { Database, Server, GitBranch, GitMerge, FileCode, CheckCircle2, Shield, Cog } from 'lucide-react';

export default function ArchitectureDiagram() {
    const [hoveredNode, setHoveredNode] = useState(null);

    const nodes = [
        { id: 'git', label: 'Git Repo', x: 50, y: 150, color: '#92a4c8', icon: GitBranch, tooltip: 'Source of truth for code and manifests' },
        { id: 'die', label: 'DIE Engine', x: 250, y: 150, color: '#2463eb', icon: Cog, tooltip: 'Dockerfile & Infrastructure Engine (Generates manifests)' },
        { id: 'pr', label: 'Pull Request', x: 450, y: 150, color: '#a78bfa', icon: GitMerge, tooltip: 'Auto-generated PR for infrastructure changes' },
        { id: 'cd', label: 'ArgoCD', x: 650, y: 150, color: '#a78bfa', icon: Server, tooltip: 'GitOps Continuous Delivery' },
        { id: 'k8s', label: 'K8s Cluster', x: 850, y: 150, color: '#4ade80', icon: Database, tooltip: 'Target Kubernetes Environment' },
        { id: 'aire', label: 'AIRE Engine', x: 850, y: 50, color: '#f43f5e', icon: null, tooltip: 'AutoStack Incident Resolution Engine (Auto-heals cluster)' },
        { id: 'coie', label: 'COIE Engine', x: 350, y: 50, color: '#22d3ee', icon: null, tooltip: 'Continuous Optimization & Intelligence Engine (Scores security/cost)' },
    ];

    const edges = [
        { source: 'git', target: 'die', label: 'clone + analyze' },
        { source: 'die', target: 'pr', label: 'opens PR' },
        { source: 'pr', target: 'cd', label: 'webhook' },
        { source: 'cd', target: 'k8s', label: 'GitOps sync' },
        { source: 'k8s', target: 'aire', label: 'metrics stream' },
        { source: 'aire', target: 'coie', label: 'anomaly data' },
        { source: 'coie', target: 'die', label: 'optimization loop' },
    ];

    const getNode = (id) => nodes.find(n => n.id === id);

    return (
        <div className="relative w-full aspect-[21/9] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] overflow-hidden">
            {/* Background Grid */}
            <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(146,164,200,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(146,164,200,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

            <svg className="absolute inset-0 w-full h-full z-10" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* Edges */}
                {edges.map((edge, i) => {
                    const source = getNode(edge.source);
                    const target = getNode(edge.target);
                    if (!source || !target) return null;

                    let pathD = '';
                    if (edge.source === 'coie' && edge.target === 'die') {
                        pathD = `M ${source.x} ${source.y + 30} C ${source.x} ${source.y + 80}, ${target.x} ${target.y - 80}, ${target.x} ${target.y - 30}`;
                    } else if (source.y === target.y) {
                        pathD = `M ${source.x + 60} ${source.y} L ${target.x - 60} ${target.y}`;
                    } else if (source.x === target.x) {
                        pathD = `M ${source.x} ${source.y - 30} L ${target.x} ${target.y + 20}`;
                    } else {
                        pathD = `M ${source.x - 60} ${source.y} C ${source.x - 80} ${source.y}, ${target.x + 60} ${target.y}, ${target.x + 60} ${target.y}`;
                        if (edge.source === 'aire' && edge.target === 'coie') {
                            pathD = `M ${source.x - 60} ${source.y} L ${target.x + 60} ${target.y}`;
                        }
                    }

                    return (
                        <g key={i}>
                            <path d={pathD} fill="none" stroke="rgba(146,164,200,0.2)" strokeWidth="2" />
                            <path
                                d={pathD}
                                fill="none"
                                stroke={source.color}
                                strokeWidth="2"
                                strokeDasharray="4 8"
                                className="animate-dash"
                                style={{ animationDuration: '2s' }}
                            />
                            {/* Edge Label */}
                            {source.y === target.y && (
                                <text x={(source.x + target.x) / 2} y={source.y - 10} textAnchor="middle" className="font-mono text-[10px]" fill="var(--text-muted)">
                                    {edge.label}
                                </text>
                            )}
                            {edge.source === 'aire' && (
                                <text x={(source.x + target.x) / 2} y={source.y - 10} textAnchor="middle" className="font-mono text-[10px]" fill="var(--text-muted)">
                                    {edge.label}
                                </text>
                            )}
                            {edge.source === 'coie' && (
                                <text x={(source.x + target.x) / 2 - 30} y={(source.y + target.y) / 2 + 10} textAnchor="right" className="font-mono text-[10px]" fill="var(--text-muted)">
                                    {edge.label}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Nodes */}
                {nodes.map((node) => {
                    const isHovered = hoveredNode === node.id;
                    const NodeIcon = node.icon;
                    return (
                        <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            className="cursor-pointer transition-transform duration-300"
                            style={{ transform: isHovered ? `translate(${node.x}px, ${node.y - 4}px)` : `translate(${node.x}px, ${node.y}px)` }}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                        >
                            {/* Node Background */}
                            <rect
                                x="-60" y="-30" width="120" height="60" rx="8"
                                fill="var(--bg-card)"
                                stroke={isHovered ? node.color : 'var(--border-default)'}
                                strokeWidth={isHovered ? "2" : "1"}
                                filter={isHovered ? "url(#glow)" : ""}
                                className="transition-all duration-300"
                            />
                            {/* Top Accent */}
                            <rect x="-60" y="-30" width="120" height="4" rx="2" fill={node.color} opacity="0.8" />

                            {/* Icon & Label */}
                            <foreignObject x="-50" y="-15" width="100" height="40">
                                <div className="flex flex-col items-center justify-center w-full h-full text-center">
                                    {NodeIcon && <NodeIcon size={14} style={{ color: node.color, marginBottom: '4px' }} />}
                                    {!NodeIcon && <div className="text-[14px] font-bold" style={{ color: node.color }}>{node.label.split(' ')[0]}</div>}
                                    {NodeIcon && <div className="text-[11px] font-medium text-[var(--text-primary)]">{node.label}</div>}
                                    {!NodeIcon && <div className="text-[10px] font-medium text-[var(--text-primary)]">{node.label.split(' ')[1]}</div>}
                                </div>
                            </foreignObject>

                            {/* Special K8s Inner Nodes */}
                            {node.id === 'k8s' && (
                                <g transform="translate(0, 15)">
                                    <rect x="-40" y="-5" width="24" height="6" rx="2" fill={node.color} opacity="0.3" />
                                    <rect x="-12" y="-5" width="24" height="6" rx="2" fill={node.color} opacity="0.3" />
                                    <rect x="16" y="-5" width="24" height="6" rx="2" fill={node.color} opacity="0.3" />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Tooltip HTML Overlay */}
            {hoveredNode && (
                <div className="absolute z-20 pointer-events-none animate-fadeIn flex justify-center w-full" style={{ bottom: '20px' }}>
                    <div className="bg-[rgba(13,17,23,0.9)] border border-[var(--border-default)] px-4 py-2 rounded-lg text-sm shadow-xl backdrop-blur">
                        <span className="font-bold mr-2" style={{ color: getNode(hoveredNode).color }}>{getNode(hoveredNode).label}:</span>
                        <span className="text-[var(--text-secondary)]">{getNode(hoveredNode).tooltip}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
