/* Chart data: 24 hourly data points */
export const metricsData = Array.from({ length: 24 }, (_, i) => ({
    time: `${String(i).padStart(2, '0')}:00`,
    cpu: Math.round(45 + Math.sin(i / 3) * 20 + Math.random() * 10),
    memory: Math.round(60 + Math.cos(i / 4) * 15 + Math.random() * 8),
    requests: Math.round(800 + Math.sin(i / 2) * 400 + Math.random() * 100),
    latency: Math.round(120 + Math.sin(i / 3.5) * 40 + Math.random() * 20),
}));

export const scoreHistory = {
    security: [82, 85, 83, 87, 84, 88, 87],
    reliability: [90, 91, 93, 92, 94, 93, 94],
    cost: [68, 70, 72, 71, 73, 74, 73],
    performance: [88, 89, 90, 91, 90, 92, 91],
};

export const projectsData = [
    { name: 'api-gateway', stack: 'Node.js', stackColor: '#4ade80', env: 'PROD', health: 94, deploys: 142, status: 'Healthy' },
    { name: 'user-service', stack: 'Python', stackColor: '#60a5fa', env: 'PROD', health: 88, deploys: 87, status: 'Healthy' },
    { name: 'worker-queue', stack: 'Go', stackColor: '#22d3ee', env: 'PROD', health: 71, deploys: 34, status: 'Degraded' },
    { name: 'frontend-app', stack: 'React', stackColor: '#a78bfa', env: 'PROD', health: 96, deploys: 203, status: 'Healthy' },
    { name: 'ml-inference', stack: 'Python', stackColor: '#60a5fa', env: 'STAGING', health: 62, deploys: 12, status: 'Warning' },
    { name: 'billing-svc', stack: 'Node.js', stackColor: '#4ade80', env: 'PROD', health: 91, deploys: 76, status: 'Healthy' },
    { name: 'analytics-svc', stack: 'Go', stackColor: '#22d3ee', env: 'STAGING', health: 85, deploys: 29, status: 'Healthy' },
];

export const pipelinesData = [
    { service: 'api-gateway', status: 'SUCCESS', run: '#142', branch: 'main', sha: 'a3f7b2c', duration: '2m 14s', time: '3h ago', stages: [1, 1, 1, 1, 1, 1, 1, 1] },
    { service: 'user-service', status: 'RUNNING', run: '#88', branch: 'main', sha: '9d4e1a8', duration: '1m 47s', time: 'just now', stages: [1, 1, 1, 1, 1, 2, 0, 0] },
    { service: 'worker-queue', status: 'FAILED', run: '#35', branch: 'fix/mem', sha: 'c8b9d3f', duration: '0m 52s', time: '5m ago', stages: [1, 1, 1, 3, 0, 0, 0, 0] },
    { service: 'frontend-app', status: 'SUCCESS', run: '#204', branch: 'main', sha: '7e2a4f1', duration: '4m 02s', time: '12m ago', stages: [1, 1, 1, 1, 1, 1, 1, 1] },
    { service: 'ml-inference', status: 'QUEUED', run: '#13', branch: 'feat/v2', sha: 'd5c7b6e', duration: '—', time: '1h ago', stages: [0, 0, 0, 0, 0, 0, 0, 0] },
];

export const stageNames = ['checkout', 'install', 'lint', 'test', 'build', 'push', 'deploy', 'verify'];

export const infraResources = [
    { name: 'prod-eks-us-east-1', type: 'Amazon EKS', region: 'us-east-1', status: 'Healthy', detail: '6 nodes · v1.28.3', cpu: 64, memory: 58 },
    { name: 'autostack-primary-db', type: 'Amazon RDS', region: 'us-east-1a', status: 'Healthy', detail: 'db.t3.medium', cpu: 38, memory: 91 },
    { name: 'autostack-cache', type: 'ElastiCache', region: 'us-east-1', status: 'Healthy', detail: 'cache.t3.micro · 2 nodes', cpu: 27, memory: 43 },
    { name: 'alb-prod-us-east-1', type: 'Application LB', region: 'us-east-1', status: 'Healthy', detail: '847 req/s · 23ms p99', cpu: null, memory: null },
    { name: 'autostack-artifacts', type: 'Amazon S3', region: 'us-east-1', status: 'Healthy', detail: '4 buckets · 2.3 TB', cpu: null, memory: null },
    { name: 'autostack-ecr', type: 'ECR Registry', region: 'us-east-1', status: 'Warning', detail: '8 repos · 47 images', cpu: null, memory: null, warning: '3 images with critical CVEs' },
];

export const initialLogLines = [
    { time: '10:24:01', level: 'INFO', service: 'argocd', msg: 'Sync triggered for api-gateway' },
    { time: '10:24:02', level: 'INFO', service: 'argocd', msg: 'Cloning repository main branch' },
    { time: '10:24:04', level: 'INFO', service: 'kubelet', msg: 'Pulling image registry.autostack.io/api:v2.1.4' },
    { time: '10:24:08', level: 'INFO', service: 'kubelet', msg: 'Image pull complete (1.2GB)' },
    { time: '10:24:09', level: 'INFO', service: 'k8s-api', msg: 'Creating pod api-gateway-7d9f4b6c-xk8pl' },
    { time: '10:24:10', level: 'INFO', service: 'k8s-api', msg: 'Pod scheduled on node ip-10-0-1-23' },
    { time: '10:24:11', level: 'INFO', service: 'kubelet', msg: 'Container starting...' },
    { time: '10:24:13', level: 'SUCCESS', service: 'kubelet', msg: 'Readiness probe passed' },
    { time: '10:24:13', level: 'SUCCESS', service: 'argocd', msg: 'Rollout complete — 3/3 replicas ready' },
    { time: '10:24:14', level: 'INFO', service: 'coie', msg: 'COIE cycle starting for prod-eks-us-east-1' },
    { time: '10:24:18', level: 'INFO', service: 'coie', msg: 'Evaluated 42 workloads in 4.2s' },
    { time: '10:24:18', level: 'WARN', service: 'coie', msg: 'ECR: 3 images have critical CVEs (worker-queue, ml-inference)' },
    { time: '10:24:18', level: 'SUCCESS', service: 'coie', msg: 'Score report: Security 87 (+2) Reliability 94 Cost 73 Perf 91' },
    { time: '10:24:19', level: 'INFO', service: 'aire', msg: 'Monitoring event stream...' },
];

export const liveLogPool = [
    { level: 'INFO', service: 'argocd', msg: 'Health check passed for user-service' },
    { level: 'INFO', service: 'kubelet', msg: 'Container memory usage: 247MB / 512MB' },
    { level: 'WARN', service: 'coie', msg: 'worker-queue CPU request 500m exceeds p95 usage 280m' },
    { level: 'SUCCESS', service: 'argocd', msg: 'Sync complete for frontend-app v2.1.0' },
    { level: 'INFO', service: 'aire', msg: 'No anomalies detected in last 5m window' },
    { level: 'INFO', service: 'k8s-api', msg: 'HPA scaled api-gateway: 3 → 5 replicas' },
    { level: 'WARN', service: 'kubelet', msg: 'Node ip-10-0-1-47 disk pressure threshold reached' },
    { level: 'SUCCESS', service: 'coie', msg: 'PR #49 opened: optimize worker-queue resource limits' },
    { level: 'INFO', service: 'argocd', msg: 'Application billing-svc sync in progress' },
    { level: 'INFO', service: 'kubelet', msg: 'Pulling image registry.autostack.io/billing:v1.8.2' },
    { level: 'SUCCESS', service: 'k8s-api', msg: 'Pod billing-svc-5a8c3d1-m7kp2 ready' },
    { level: 'INFO', service: 'aire', msg: 'OOMKill risk assessment: worker-queue 12% probability' },
    { level: 'WARN', service: 'coie', msg: 'Image autostack/ml-inference:latest is 1.4GB — multi-stage recommended' },
    { level: 'INFO', service: 'argocd', msg: 'GitOps diff detected for analytics-svc' },
    { level: 'SUCCESS', service: 'coie', msg: 'Security score improved: 87 → 89' },
];

export const terminalLines = [
    { text: '$ autostack init my-cluster', color: 'var(--term-prompt)', speed: 'cmd' },
    { text: 'Initializing AutoStack environment... Done.', color: 'var(--text-muted)', speed: 'fast' },
    { text: '$ autostack deploy .', color: 'var(--term-prompt)', speed: 'cmd' },
    { text: 'Analyzing repository...', color: 'var(--term-info)', speed: 'fast' },
    { text: 'Detected Node.js application (Express)', color: 'var(--term-text)', speed: 'fast' },
    { text: 'Generating Dockerfile...', color: 'var(--term-text)', speed: 'fast' },
    { text: 'Building image registry.autostack.io/app:v1.0.4...', color: 'var(--term-text)', speed: 'fast', highlight: 'registry.autostack.io/app:v1.0.4' },
    { text: 'Pushing image...', color: 'var(--term-text)', speed: 'fast' },
    { text: 'Applying Kubernetes manifests...', color: 'var(--term-info)', speed: 'fast' },
    { text: '✓ deployment.apps/api-server created', color: 'var(--term-text)', speed: 'fast' },
    { text: '✓ service/api-service created', color: 'var(--term-text)', speed: 'fast' },
    { text: '✓ ingress.networking.k8s.io/api-ingress configured', color: 'var(--term-text)', speed: 'fast' },
    { text: 'Deploy successful! 🚀', color: 'var(--term-prompt)', speed: 'fast', bold: true },
    { text: 'Live URL: https://api.myapp.com', color: 'var(--text-muted)', speed: 'fast' },
];

export const activityEvents = [
    { color: 'var(--green)', msg: 'api-gateway deployed v2.1.4', time: '2m ago' },
    { color: 'var(--blue-light)', msg: 'COIE opened PR #47 — resource limits', time: '8m ago' },
    { color: 'var(--red)', msg: 'AIRE resolved OOMKilled — worker-queue', time: '15m ago' },
    { color: 'var(--green)', msg: 'PR #45 merged — security context', time: '1h ago' },
    { color: 'var(--amber)', msg: 'Security score improved +3 → 87', time: '2h ago' },
];

export const integrations = [
    { name: 'GitHub', status: 'Connected', desc: 'Repository integration for PR generation', icon: '🐙' },
    { name: 'Jenkins', status: 'Disconnected', desc: 'CI/CD pipeline integration', icon: '🔧' },
    { name: 'AWS', status: 'Connected', desc: 'Infrastructure provisioning', icon: '☁️' },
    { name: 'Slack', status: 'Connected', desc: 'Incident alerts to #devops-alerts', icon: '💬' },
    { name: 'PagerDuty', status: 'Disconnected', desc: 'Incident escalation', icon: '🔔' },
    { name: 'Datadog', status: 'Disconnected', desc: 'Metrics forwarding', icon: '📊' },
];

export const teamMembers = [
    { name: 'Alex Chen', email: 'alex@acme.com', role: 'Owner', gradient: 'from-blue-500 to-blue-700', initials: 'AC' },
    { name: 'Sarah Kim', email: 'sarah@acme.com', role: 'Admin', gradient: 'from-green-500 to-green-700', initials: 'SK' },
    { name: 'Marcus Lee', email: 'marcus@acme.com', role: 'Developer', gradient: 'from-purple-500 to-purple-700', initials: 'ML' },
];
