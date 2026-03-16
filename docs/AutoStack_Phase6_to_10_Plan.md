# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — POST-POC PRODUCTION COMPLETION PLAN                         ║
# ║  Phases 6 → 10: From Working Demo to Shippable Product                   ║
# ║  Prerequisite: Phases 1–5 complete. E2E POC passing.                     ║
# ║  For: Antigravity AI IDE                                                  ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

---

# PRE-READ: WHERE YOU ARE NOW

After Phase 1–5:
✅ A GitHub URL deploys to a real AWS EKS cluster in ~12 minutes
✅ COIE runs and finds cost savings
✅ AIRE detects and diagnoses incidents
✅ Dashboard shows live URL, cost, infra resources
✅ Auth, RLS, and all 9 Edge Functions have CORS handlers

What you do NOT yet have:
❌ GitHub App (private repos don't work, no automatic redeploy on push)
❌ Go Agent (metrics are simulated, not from real cluster telemetry)
❌ infra-teardown (can't delete environments cleanly)
❌ Multi-environment (no staging/preview branch deploys)
❌ Custom domains + SSL
❌ Billing / plan enforcement
❌ Production security hardening
❌ Performance optimization (bundle size, DB indexes)
❌ Launch readiness (error handling, rate limits, abuse prevention)

This document closes all of that.

---

# ══════════════════════════════════════════════════════
# SECTION 0 — ADDENDUM RULES
# These extend the rules from the previous plan document.
# All previous rules still apply. Read them before starting.
# ══════════════════════════════════════════════════════

## NEW RULE G — GITHUB APP STANDARDS

### G1 — GitHub App JWT Is Short-Lived (10 min max)
GitHub App authentication uses a signed JWT with `exp = now + 600 seconds`.
Never cache this JWT for longer than 9 minutes (leave 60s margin).
```typescript
function generateGitHubAppJWT(): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = { iat: now - 60, exp: now + 540, iss: GITHUB_APP_ID }
  return jwt.sign(payload, GITHUB_PRIVATE_KEY, { algorithm: 'RS256' })
}
// Cache key: 'github:app:jwt' with ex: 480 (8 min TTL) — RULE B5 applies
```

### G2 — Installation Tokens Are Per-Repository
Never use the same installation token for different orgs.
Always look up the installation ID from the `integrations` table for the requesting org.
Installation tokens expire after 1 hour — always refresh before use, don't assume cached.

### G3 — Webhook Secret Is Per-Installation, Not Global
Each GitHub App installation has its own webhook secret.
Store it in Supabase Vault (not in the `integrations` table directly).
Rotate it if the user reports unexpected behavior.

---

## NEW RULE H — GO AGENT STANDARDS

### H1 — Agent Never Makes Outbound DB Calls
The Go agent does NOT talk to Supabase directly.
It talks ONLY to AutoStack's Edge Functions via HTTPS.
The agent never has a Supabase connection string or key.

### H2 — Agent Token Is One-Time Registration, Then JWT
The agent uses the `agent_token` from Helm values ONCE to register.
After registration, it receives a short-lived JWT (24h TTL).
All subsequent calls use this JWT. Token rotation is automatic.

### H3 — Agent Metrics Are Batched, Not Per-Event
The agent collects metrics every 15 seconds locally.
It sends a batch to `agent-metrics` every 60 seconds.
Never send individual metric readings per-event — this burns through rate limits.

### H4 — Agent Handles Disconnection Gracefully
If the agent cannot reach AutoStack's API:
- Buffer up to 10 minutes of metrics locally (in memory, not disk)
- Retry with exponential backoff: 5s, 10s, 30s, 60s, 120s
- After 10 minutes of failed connection: log warning, continue buffering
- Never crash the agent process due to API unavailability

---

## NEW RULE I — MULTI-ENVIRONMENT STANDARDS

### I1 — Production Environments Are Protected
Production environments require explicit confirmation for:
- Manifest changes (cannot be auto-applied, must be reviewed in ArgoCD)
- Infrastructure changes (must show cost diff and get user approval)
- Deletion (requires typing environment name to confirm)

Staging and development environments can auto-apply changes.

### I2 — Preview Environments Are Ephemeral
Preview environments (for pull requests) must self-destruct:
- Auto-created on PR open
- Auto-destroyed on PR close or merge
- Maximum lifetime: 72 hours (then auto-destroyed even if PR is open)
- Never provision a full EKS cluster for preview — use existing staging cluster with namespace isolation

### I3 — Environment Variables Are Encrypted at Rest
Environment variables containing secrets (detected by key name patterns:
`_KEY`, `_SECRET`, `_PASSWORD`, `_TOKEN`, `_CREDENTIAL`, `DATABASE_URL`)
are encrypted before storage using Supabase Vault.
Never store them in plaintext in the `projects` table or any JSONB column.

---

## NEW RULE J — BILLING & PLAN ENFORCEMENT

### J1 — Plan Limits Are Enforced at the Edge Function Layer
Never enforce plan limits only in the frontend.
Every Edge Function that creates a billable resource must check the org's plan
before proceeding.
```typescript
async function checkPlanLimit(supabase: any, org_id: string, resource: string): Promise<void> {
  const { data: org } = await supabase.from('organizations').select('plan').eq('id', org_id).single()
  const { data: usage } = await supabase.from('projects')
    .select('count').eq('org_id', org_id).eq('provisioning_status', 'live').single()

  const limits = PLAN_LIMITS[org.plan as keyof typeof PLAN_LIMITS]
  if (resource === 'environment' && usage.count >= limits.max_environments) {
    throw new PlanLimitError(`Free plan: max ${limits.max_environments} environment. Upgrade to Pro for unlimited.`)
  }
}

const PLAN_LIMITS = {
  free:       { max_environments: 1,  max_nodes: 3,  features: ['coie_read', 'aire_detect'] },
  pro:        { max_environments: 10, max_nodes: 50, features: ['coie_fix', 'aire_remediate', 'custom_domain'] },
  team:       { max_environments: 50, max_nodes: 200,features: ['everything', 'compliance_export', 'slack_alerts'] },
  enterprise: { max_environments: -1, max_nodes: -1, features: ['everything', 'on_premise', 'sla'] },
}
```

### J2 — Free Tier Cannot Be Abused For Infinite Deployments
Free tier limit: 1 live environment, 2 CPU cores, 4GB RAM cluster max.
Enforce at `die-analyze` Stage 3 trigger (before infra provisioning).
If the org has 1 live environment on free tier and tries to create another: block.

---

# ══════════════════════════════════════════════════════
# PHASE 6 — GITHUB APP INTEGRATION
# Branch: `feature/phase6-github-app`
# Goal: Private repos work. Auto-redeploy on push works.
#       PR preview environments work.
# ══════════════════════════════════════════════════════

---

## TASK 6.1 — GitHub App Creation & OAuth Install Flow

### What to build
A GitHub App that users install on their GitHub org or repo.
This gives AutoStack permission to:
- Read private repos (clone for analysis and build)
- Create branches and open PRs (COIE fix PRs, AIRE remediation PRs)
- Receive webhooks for push events and PR events
- Write commit statuses (show deployment status on commits)

### GitHub App manifest (create this app in GitHub)
```json
{
  "name": "AutoStack",
  "description": "Deploy your app to your cloud in 8 minutes",
  "url": "https://autostack.io",
  "hook_attributes": {
    "url": "https://[project].supabase.co/functions/v1/github-webhook",
    "active": true
  },
  "redirect_url": "https://autostack.io/auth/github/callback",
  "callback_urls": ["https://autostack.io/auth/github/callback"],
  "request_oauth_on_install": true,
  "setup_on_update": false,
  "public": true,
  "default_permissions": {
    "contents": "write",
    "pull_requests": "write",
    "statuses": "write",
    "metadata": "read",
    "deployments": "write"
  },
  "default_events": [
    "push",
    "pull_request",
    "workflow_run",
    "deployment",
    "deployment_status"
  ]
}
```

### Edge Function: `github-app-install/index.ts`

```typescript
// Handles the GitHub App OAuth callback after installation
// URL: GET /functions/v1/github-app-install?code=[code]&installation_id=[id]&state=[state]
// 
// FLOW:
// 1. Verify state param (CSRF protection — state = base64(org_id + timestamp), stored in Redis)
// 2. Exchange code for user access token (GitHub OAuth)
// 3. Store installation_id in integrations table (not the token — use App JWT instead)
// 4. Redirect to /dashboard?github_connected=true
//
// SECURITY: CSRF state validation
async function validateCSRFState(redis: Redis, state: string, org_id: string): Promise<boolean> {
  const stored = await redis.get(`github:oauth:state:${org_id}`)
  if (!stored) return false
  await redis.del(`github:oauth:state:${org_id}`)  // one-time use
  return stored === state
}

// GitHub App JWT generation (RULE G1)
function generateAppJWT(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iat: now - 60, exp: now + 540, iss: appId },
    privateKey,
    { algorithm: 'RS256' }
  )
}

// Get installation access token (cached in Redis per installation, RULE G2)
async function getInstallationToken(redis: Redis, installation_id: string): Promise<string> {
  const cacheKey = `github:installation:token:${installation_id}`
  const cached = await redis.get(cacheKey)
  if (cached) return cached

  const appJWT = generateAppJWT(/* ... */)
  const response = await fetch(
    `https://api.github.com/app/installations/${installation_id}/access_tokens`,
    { method: 'POST', headers: { Authorization: `Bearer ${appJWT}` } }
  )
  const { token, expires_at } = await response.json()

  // Cache for 50 minutes (tokens last 1 hour, leave 10 min buffer) — RULE B5
  await redis.set(cacheKey, token, { ex: 3000 })
  return token
}
```

### Edge Function: `github-webhook/index.ts` — Full Rewrite

```typescript
// Events to handle:
// 1. push → main/master → trigger redeploy for matching project
// 2. push → feature/* → create/update preview environment
// 3. pull_request → opened/synchronize → create preview if not exists
// 4. pull_request → closed → destroy preview environment
// 5. workflow_run → completed → update pipelines table

// EVENT: push to main branch — trigger redeploy
if (event === 'push' && isMainBranch(payload)) {
  // Find project matching this repo + branch
  const project = await findProjectByRepo(supabase, payload.repository.clone_url, payload.ref)
  if (project && project.provisioning_status === 'live') {
    // Trigger redeploy (Stage 4 only — infra already exists)
    await supabase.functions.invoke('deploy-redeploy', {
      body: { project_id: project.id, commit_sha: payload.after, commit_message: payload.head_commit.message }
    })
    // Insert deployment record
    await supabase.from('deployments').insert({
      project_id: project.id,
      cluster_id: project.cluster_id,
      commit_sha: payload.after,
      commit_msg: payload.head_commit.message,
      branch: payload.ref.replace('refs/heads/', ''),
      status: 'running',
      triggered_by: 'github_push'
    })
  }
}

// EVENT: pull_request opened → create preview
if (event === 'pull_request' && ['opened', 'synchronize'].includes(payload.action)) {
  const previewName = `pr-${payload.number}`
  const existingPreview = await findPreviewProject(supabase, payload.repository.clone_url, previewName)

  if (!existingPreview) {
    // Create preview environment (reuses existing staging cluster, just a new namespace)
    await createPreviewEnvironment(supabase, {
      repo_url: payload.repository.clone_url,
      branch: payload.pull_request.head.ref,
      pr_number: payload.number,
      pr_title: payload.pull_request.title,
      environment: previewName
    })
  } else {
    // Update existing preview with new commit
    await triggerPreviewRedeploy(supabase, existingPreview.id, payload.pull_request.head.sha)
  }
}

// EVENT: pull_request closed → destroy preview
if (event === 'pull_request' && payload.action === 'closed') {
  const preview = await findPreviewProject(supabase, payload.repository.clone_url, `pr-${payload.number}`)
  if (preview) {
    await supabase.functions.invoke('infra-teardown', { body: { project_id: preview.id } })
  }
}
```

### VERIFY Task 6.1
```
□ GitHub App created with correct permissions in GitHub Developer settings
□ GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET in Supabase secrets
□ Install flow: navigate to GitHub App install URL → GitHub redirects back → 
    integration saved with installation_id
□ integrations table shows: name='github', status='connected', installation_id in config
□ Push to main on connected repo → new deployment row created within 30 seconds
□ PR opened → preview environment created (namespace only, no new EKS cluster)
□ PR closed → preview environment deleted (namespace removed from cluster)
□ Webhook HMAC verified on all events — reject invalid signatures with 401
□ Redis: installation token cached with TTL (confirm with redis.ttl())
□ State parameter validated on OAuth callback — replay attack rejected
```

---

## TASK 6.2 — `deploy-redeploy` Edge Function (Auto-Redeploy on Push)

### File
`supabase/functions/deploy-redeploy/index.ts`

### Difference from full deploy
Redeploy reuses existing infrastructure. It only runs Stage 4 (build + deploy).
Time: ~3 minutes (no VPC/EKS provisioning).

```typescript
// INPUT: { project_id, commit_sha, commit_message }
// 
// FLOW:
// 1. Get project + cloud_credential
// 2. Assume AWS role
// 3. Start CodeBuild job with new commit_sha as image tag
// 4. Poll CodeBuild until SUCCEEDED or FAILED
// 5. On SUCCEEDED:
//    a. Update deployment.yaml in user's repo with new image tag
//    b. ArgoCD auto-syncs (it watches the repo)
//    c. Poll ArgoCD sync status: wait for Synced + Healthy
//    d. Update deployments table: status='success', completed_at=now
// 6. On FAILED:
//    a. Update deployments table: status='failed'
//    b. Call send-notification: deployment_failed
//    c. Do NOT auto-rollback (user must choose)
// 7. On SUCCEEDED after 3+ consecutive failures:
//    a. Send "your app is healthy again" notification

// ROLLBACK TRIGGER: Separate endpoint POST /functions/v1/deploy-rollback
// INPUT: { deployment_id }  ← the deployment_id to roll back TO
// FLOW:
//    1. Get deployment.previous_image_sha
//    2. Update deployment.yaml with previous image SHA
//    3. Commit to repo
//    4. ArgoCD syncs
//    5. Insert new deployment row with triggered_by='rollback'
```

### VERIFY Task 6.2
```
□ Push to connected repo → deploy-redeploy triggered by github-webhook
□ New deployments row: status='running' → 'success' within 3 minutes
□ live_url unchanged after successful redeploy (same ALB, same domain)
□ DeploymentsTab shows: new deployment at top, previous deployment with timestamp
□ Failed build → deployments row: status='failed', notification email received
□ Rollback endpoint: rolls back to previous image SHA, new deployment row with triggered_by='rollback'
□ Previous image SHA populated correctly in deployments.previous_image_sha
```

---

## TASK 6.3 — Preview Environments (Namespace-Isolated)

### Architecture
Preview environments do NOT get their own EKS cluster (too expensive).
They run as isolated Kubernetes namespaces on the staging cluster.
Each PR gets: `namespace: pr-[number]`, its own Ingress rule, its own ALB path.

```sql
-- Add preview-specific columns to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pr_number        INTEGER,
  ADD COLUMN IF NOT EXISTS pr_branch        TEXT,
  ADD COLUMN IF NOT EXISTS pr_title         TEXT,
  ADD COLUMN IF NOT EXISTS preview_url      TEXT,
  ADD COLUMN IF NOT EXISTS auto_destroy_at  TIMESTAMPTZ;
  -- Set to NOW() + 72 hours for preview environments
  -- pg_cron job checks this and destroys expired previews

-- pg_cron: destroy expired previews every hour
SELECT cron.schedule(
  'destroy-expired-previews',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://[project].supabase.co/functions/v1/infra-teardown',
    headers := '{"Authorization": "Bearer [service_role_key]", "Content-Type": "application/json"}',
    body := json_build_object('project_id', id)::text
  ) FROM projects
  WHERE auto_destroy_at < NOW()
    AND provisioning_status != 'deleted';
  $$
);
```

### VERIFY Task 6.3
```
□ PR opened → preview namespace created on staging cluster within 5 minutes
□ Preview URL format: https://pr-[number].[project]-staging.autostack.app
□ Preview URL accessible and shows the PR's branch code
□ PR closed → namespace deleted within 2 minutes
□ PR without connected staging cluster → clear error "Connect a staging environment first"
□ Preview auto-destroys after 72 hours (test with auto_destroy_at = NOW() + 5min)
□ Deployment status posted to GitHub commit (green checkmark or red X)
```

---

# ══════════════════════════════════════════════════════
# PHASE 7 — GO AGENT: REAL CLUSTER TELEMETRY
# Branch: `feature/phase7-go-agent`
# Goal: Real CPU/memory/pod metrics. Real log streaming.
#       Incidents detected from real cluster events, not manual DB inserts.
# ══════════════════════════════════════════════════════

---

## TASK 7.1 — Go Agent Binary: Core Structure

### Repository
Create `github.com/[your-org]/autostack-agent` — separate Go repository

### Directory structure
```
autostack-agent/
├── cmd/
│   └── agent/
│       └── main.go           ← Entry point
├── internal/
│   ├── client/
│   │   └── api.go            ← HTTP client for AutoStack Edge Functions
│   ├── collector/
│   │   ├── metrics.go        ← CPU/memory collection via metrics-server
│   │   ├── events.go         ← K8s event watcher (pod crashes, OOM, etc.)
│   │   ├── logs.go           ← Log streaming from crashed pods
│   │   └── nodes.go          ← Node health collection
│   ├── reporter/
│   │   ├── heartbeat.go      ← 30-second heartbeat sender
│   │   ├── metrics.go        ← 60-second metrics batch sender
│   │   └── incidents.go      ← Incident bundle sender on anomaly detection
│   └── config/
│       └── config.go         ← Config from env vars (injected by Helm)
├── helm/
│   └── autostack-agent/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── deployment.yaml
│           ├── serviceaccount.yaml
│           ├── clusterrole.yaml
│           └── clusterrolebinding.yaml
├── Dockerfile
├── go.mod
└── go.sum
```

### RULE H3 in practice — metrics collection loop
```go
// internal/collector/metrics.go

type MetricsBatch struct {
    ClusterID  string        `json:"cluster_id"`
    SampledAt  time.Time     `json:"sampled_at"`
    NodeCount  int           `json:"node_count"`
    PodCount   int           `json:"pod_count"`
    Pods       []PodMetric   `json:"pods"`
    Nodes      []NodeMetric  `json:"nodes"`
    ClusterCPUPercent    float64 `json:"cluster_cpu_pct"`
    ClusterMemoryPercent float64 `json:"cluster_memory_pct"`
}

type PodMetric struct {
    Name         string  `json:"name"`
    Namespace    string  `json:"namespace"`
    CPUMillicores int64  `json:"cpu_millicores"`
    MemoryBytes  int64   `json:"memory_bytes"`
    RestartCount int32   `json:"restart_count"`
    Phase        string  `json:"phase"`
}

// Collect loop: runs every 15s, sends batch every 60s
func (c *MetricsCollector) Start(ctx context.Context) {
    ticker := time.NewTicker(15 * time.Second)
    batchTicker := time.NewTicker(60 * time.Second)
    var buffer []MetricsSample

    for {
        select {
        case <-ticker.C:
            sample, err := c.collectOnce()
            if err != nil {
                log.Printf("metrics collection error: %v", err)
                continue
            }
            buffer = append(buffer, sample)

        case <-batchTicker.C:
            if len(buffer) == 0 {
                continue
            }
            batch := aggregateBatch(buffer)
            buffer = nil  // clear buffer regardless of send success

            // RULE H4: retry with backoff, don't block collection
            go c.reporter.SendMetricsBatch(ctx, batch)

        case <-ctx.Done():
            return
        }
    }
}
```

### K8s event watcher — incident detection
```go
// internal/collector/events.go
// Watches the K8s event stream for anomalies that trigger AIRE

type IncidentTrigger struct {
    ClusterID       string            `json:"cluster_id"`
    TriggerType     string            `json:"trigger_type"`
    AffectedResource string           `json:"affected_resource"`
    Namespace       string            `json:"namespace"`
    Severity        string            `json:"severity"`
    LogExcerpts     []string          `json:"log_excerpts"`
    MetricsSnapshot map[string]interface{} `json:"metrics_snapshot"`
    DetectedAt      time.Time         `json:"detected_at"`
}

// Events that trigger AIRE:
var INCIDENT_TRIGGERS = map[string]struct {
    Reason   string
    Type     string
    Severity string
}{
    "OOMKilling":          {Reason: "OOMKilling",          Type: "oom_kill",              Severity: "high"},
    "BackOff":             {Reason: "BackOff",             Type: "crash_loop_back_off",   Severity: "high"},
    "Failed":              {Reason: "Failed",              Type: "pod_failed",            Severity: "medium"},
    "Unhealthy":           {Reason: "Unhealthy",           Type: "health_check_failing",  Severity: "medium"},
    "FailedMount":         {Reason: "FailedMount",         Type: "volume_mount_failure",  Severity: "high"},
    "ImagePullBackOff":    {Reason: "ImagePullBackOff",    Type: "image_pull_failure",    Severity: "high"},
    "ErrImagePull":        {Reason: "ErrImagePull",        Type: "image_pull_failure",    Severity: "high"},
    "NodeNotReady":        {Reason: "NodeNotReady",        Type: "node_not_ready",        Severity: "critical"},
    "Evicted":             {Reason: "Evicted",             Type: "pod_evicted",           Severity: "medium"},
}

func (w *EventWatcher) Watch(ctx context.Context) {
    informer := cache.NewListWatchFromClient(
        w.clientset.CoreV1().RESTClient(),
        "events",
        corev1.NamespaceAll,
        fields.Everything(),
    )

    _, controller := cache.NewInformer(informer, &corev1.Event{}, 0,
        cache.ResourceEventHandlerFuncs{
            AddFunc: func(obj interface{}) {
                event := obj.(*corev1.Event)
                trigger, ok := INCIDENT_TRIGGERS[event.Reason]
                if !ok {
                    return
                }

                // Collect pod logs for the affected pod (last 50 lines)
                logs := w.collectPodLogs(ctx, event.InvolvedObject.Name, event.InvolvedObject.Namespace)

                incident := IncidentTrigger{
                    ClusterID:        w.clusterID,
                    TriggerType:      trigger.Type,
                    AffectedResource: event.InvolvedObject.Name,
                    Namespace:        event.InvolvedObject.Namespace,
                    Severity:         trigger.Severity,
                    LogExcerpts:      logs,
                    DetectedAt:       time.Now(),
                }

                // RULE H3: don't send per-event — buffer and deduplicate
                w.incidentBuffer.Add(incident)
            },
        },
    )
    controller.Run(ctx.Done())
}

// Deduplication: same pod + same reason within 5 minutes = same incident
type IncidentBuffer struct {
    mu      sync.Mutex
    recent  map[string]time.Time  // key: pod+reason → last sent
    pending []IncidentTrigger
}
```

### Helm chart values.yaml
```yaml
# helm/autostack-agent/values.yaml
# User overrides controlPlane.url and agent.token on install

controlPlane:
  url: "https://[project].supabase.co/functions/v1"
  # Note: each Edge Function is a separate URL
  # agentHeartbeatPath: /agent-heartbeat
  # agentMetricsPath: /agent-metrics
  # agentIncidentPath: /aire-detect

agent:
  token: ""  # Required — provided on helm install
  clusterID: ""  # Set by connect-cluster function, included in Helm command

image:
  repository: ghcr.io/[your-org]/autostack-agent
  tag: latest
  pullPolicy: IfNotPresent

# Minimal RBAC — read-only except for events
rbac:
  create: true
  rules:
    - apiGroups: [""]
      resources: ["nodes", "pods", "events", "namespaces", "services"]
      verbs: ["get", "list", "watch"]
    - apiGroups: ["apps"]
      resources: ["deployments", "replicasets", "daemonsets", "statefulsets"]
      verbs: ["get", "list", "watch"]
    - apiGroups: ["metrics.k8s.io"]
      resources: ["nodes", "pods"]
      verbs: ["get", "list"]

resources:
  requests:
    cpu: "50m"     # Agent is lightweight
    memory: "64Mi"
  limits:
    cpu: "200m"
    memory: "256Mi"

# Agent runs on every cluster but is not a DaemonSet (1 replica is enough)
replicaCount: 1
```

### VERIFY Task 7.1
```
□ Go binary compiles: go build ./cmd/agent/
□ Docker image builds: docker build -t autostack-agent .
□ Helm chart lints: helm lint helm/autostack-agent/
□ Deploy to sandbox cluster: helm install autostack-agent helm/autostack-agent/ \
    --set agent.token=[token] --set agent.clusterID=[id]
□ agent-heartbeat Edge Function receives heartbeat within 60 seconds
□ cluster.agent_status changes to 'connected'
□ cluster_metrics rows populated with real CPU/memory data
□ Manually kill a pod with OOMKill → incident row created in incidents table
□ Logs from crashed pod appear in incident.log_excerpts
□ Agent disconnected (kill pod) → cluster.agent_status → 'disconnected' within 3 minutes
□ Agent reconnects → cluster.agent_status → 'connected'
□ RULE H4: mock API unavailability → agent doesn't crash, buffers metrics, resumes
```

---

## TASK 7.2 — Real Log Streaming to LogsTab

### Architecture
Instead of fake simulation in LogsTab, stream real pod logs via the agent.

```
Flow:
  1. User selects a project in LogsTab
  2. Frontend opens Supabase Realtime channel for this project's logs
  3. Agent receives log streaming command via agent-heartbeat response
  4. Agent streams logs from selected pod to agent-metrics Edge Function
  5. Edge Function inserts log lines into cluster_metrics (or a new logs table)
  6. Realtime broadcasts to frontend

For Phase 7, use a simpler approach:
  - Add a `logs` table to the database
  - Agent sends last 100 log lines per pod per 60-second batch
  - Frontend queries latest 200 lines, real-time subscription adds new lines
```

```sql
-- Migration: add logs table
CREATE TABLE IF NOT EXISTS pod_logs (
  id          BIGSERIAL    PRIMARY KEY,
  project_id  UUID         REFERENCES projects(id) ON DELETE CASCADE,
  cluster_id  UUID         REFERENCES clusters(id) ON DELETE CASCADE,
  pod_name    TEXT         NOT NULL,
  namespace   TEXT         NOT NULL,
  log_line    TEXT         NOT NULL,
  log_level   TEXT,           -- 'error' | 'warn' | 'info' | 'debug' (detected from line content)
  logged_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Retention: keep only 24 hours of logs (free tier storage constraint)
CREATE INDEX IF NOT EXISTS idx_pod_logs_project_time ON pod_logs(project_id, logged_at DESC);
ALTER TABLE pod_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pod_logs_org" ON pod_logs
  FOR SELECT USING (
    cluster_id IN (SELECT id FROM clusters WHERE org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid)
  );

-- pg_cron: delete logs older than 24 hours (free tier storage discipline)
SELECT cron.schedule(
  'cleanup-pod-logs',
  '0 * * * *',
  $$ DELETE FROM pod_logs WHERE logged_at < NOW() - INTERVAL '24 hours'; $$
);
```

### VERIFY Task 7.2
```
□ Agent sends log batches → pod_logs rows created in DB
□ LogsTab: remove all data.js fake imports
□ LogsTab renders real log lines from pod_logs via useEffect + Realtime
□ LogsTab shows correct pod name and namespace selector
□ Log level color-coding: error (red), warn (amber), info (blue), debug (gray)
□ "Live" toggle subscribes to Realtime for new log lines
□ "Historical" button fetches last 200 lines from DB
□ Empty state shown when no logs exist for selected project
□ Storage check: after 25 hours, old logs are cleaned up by pg_cron
```

---

# ══════════════════════════════════════════════════════
# PHASE 8 — PRODUCTION SECURITY HARDENING
# Branch: `feature/phase8-security-hardening`
# Goal: AutoStack can be used by enterprise customers.
#       All P0 security gaps closed. Penetration-test ready.
# ══════════════════════════════════════════════════════

---

## TASK 8.1 — Environment Variable Encryption at Rest

### File
`supabase/functions/secret-vault/index.ts` — wrapper for Supabase Vault

```typescript
// Supabase Vault encrypts secrets using AES-256-GCM with a vault key
// that never leaves Supabase infrastructure.
// 
// Usage: instead of storing env vars in projects.infra_plan JSONB,
// store secret env vars in Vault and reference them by vault_id.

// Store a secret
async function storeSecret(supabase: any, org_id: string, name: string, value: string): Promise<string> {
  const { data } = await supabase.rpc('vault.create_secret', {
    secret: value,
    name: `${org_id}:${name}`,
    description: `Env var for org ${org_id}`
  })
  return data  // returns the vault secret ID
}

// Retrieve a secret
async function getSecret(supabase: any, vault_id: string): Promise<string> {
  const { data } = await supabase.rpc('vault.decrypted_secret', { secret_id: vault_id })
  return data.decrypted_secret
}

// In the projects table, env vars are stored as:
// [
//   { key: 'DATABASE_URL', vault_id: 'uuid-of-vault-secret', is_secret: true },
//   { key: 'NODE_ENV',     value: 'production',              is_secret: false }
// ]
// Only non-secret vars are stored in plaintext.
// Secret vars (detected by key name pattern or user-marked) go to Vault.
```

### Secret detection patterns (for auto-classification)
```typescript
const SECRET_KEY_PATTERNS = [
  /_KEY$/i, /_SECRET$/i, /_PASSWORD$/i, /_TOKEN$/i, /_CREDENTIAL$/i,
  /^DATABASE_URL$/i, /^REDIS_URL$/i, /^MONGODB_URI$/i,
  /^AWS_ACCESS_KEY/i, /^AWS_SECRET/i,
  /_PRIVATE_KEY$/i, /^PRIVATE_KEY$/i,
  /^JWT_SECRET$/i, /^SESSION_SECRET$/i,
  /^STRIPE_/i, /^SENDGRID_/i, /^TWILIO_/i
]

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some(pattern => pattern.test(key))
}
```

### VERIFY Task 8.1
```
□ DATABASE_URL env var → stored in Vault (vault_id in projects table, not plaintext)
□ NODE_ENV=production → stored as plaintext (not secret)
□ Retrieve secret → decrypted correctly and injected into K8s secret manifest
□ K8s Secret created in cluster with env var values (not ConfigMap — Secrets for sensitive data)
□ Deployment references Secret via envFrom not env.value
□ Direct DB query: SELECT * FROM projects WHERE id = [id] → no DATABASE_URL value visible
```

---

## TASK 8.2 — Rate Limiting on All Edge Functions

### File
`supabase/functions/_shared/rate-limiter.ts` (shared utility)

```typescript
// Rate limiting using Upstash Redis sliding window
// RULE B5: all Redis keys have TTL

import { Redis } from 'https://esm.sh/@upstash/redis'

type RateLimitConfig = {
  window_seconds: number
  max_requests: number
  identifier: string  // e.g., 'ip' | 'user_id' | 'org_id'
}

// Rate limits per endpoint
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'aws-assume-role':    { window_seconds: 60,   max_requests: 5,    identifier: 'user_id' },
  'die-analyze':        { window_seconds: 3600, max_requests: 3,    identifier: 'org_id' },
  'infra-provision':    { window_seconds: 3600, max_requests: 3,    identifier: 'org_id' },
  'send-notification':  { window_seconds: 3600, max_requests: 50,   identifier: 'org_id' },
  'github-webhook':     { window_seconds: 60,   max_requests: 100,  identifier: 'ip' },
  'agent-metrics':      { window_seconds: 60,   max_requests: 120,  identifier: 'cluster_id' },
  'agent-heartbeat':    { window_seconds: 60,   max_requests: 10,   identifier: 'cluster_id' },
}

export async function checkRateLimit(
  redis: Redis,
  endpoint: string,
  id: string
): Promise<{ allowed: boolean; remaining: number; reset_at: number }> {
  const config = RATE_LIMITS[endpoint]
  if (!config) return { allowed: true, remaining: 999, reset_at: 0 }

  const key = `ratelimit:${endpoint}:${id}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - config.window_seconds

  // Sliding window: count requests in the last window_seconds
  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, windowStart)       // remove old entries
  pipe.zadd(key, { score: now, member: `${now}-${Math.random()}` })
  pipe.zcard(key)
  pipe.expire(key, config.window_seconds + 1)      // RULE B5: TTL always set

  const results = await pipe.exec()
  const count = results[2] as number

  return {
    allowed: count <= config.max_requests,
    remaining: Math.max(0, config.max_requests - count),
    reset_at: now + config.window_seconds
  }
}

// Usage in every Edge Function after auth check:
// const { allowed, remaining } = await checkRateLimit(redis, 'die-analyze', org_id)
// if (!allowed) {
//   return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
//     status: 429,
//     headers: { ...CORS_HEADERS, 'Retry-After': String(config.window_seconds) }
//   })
// }
```

### VERIFY Task 8.2
```
□ Hit aws-assume-role 6 times in 60 seconds → 6th request returns 429
□ Response headers include: Retry-After, X-RateLimit-Remaining
□ Rate limit keys in Redis have TTL: redis.ttl('ratelimit:aws-assume-role:[user_id]') > 0
□ Different users have independent limits (RULE J2)
□ github-webhook rate limit: 100/min per IP — send 101 requests → 101st returns 429
```

---

## TASK 8.3 — Input Validation on All Edge Functions

### Shared validation utility
```typescript
// supabase/functions/_shared/validator.ts

export class ValidationError extends Error {
  fields: Record<string, string>
  constructor(fields: Record<string, string>) {
    super('Validation failed')
    this.fields = fields
  }
}

type Schema = Record<string, {
  type: 'string' | 'uuid' | 'url' | 'email' | 'number' | 'boolean'
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  enum?: string[]
}>

export function validate(data: Record<string, unknown>, schema: Schema): void {
  const errors: Record<string, string> = {}

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field]

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors[field] = `${field} is required`
      continue
    }
    if (value === undefined || value === null) continue  // optional, not present, skip

    if (rules.type === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) {
      errors[field] = `${field} must be a valid UUID`
    }
    if (rules.type === 'url') {
      try { new URL(String(value)) } catch { errors[field] = `${field} must be a valid URL` }
    }
    if (rules.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      errors[field] = `${field} must be a valid email address`
    }
    if (rules.maxLength && String(value).length > rules.maxLength) {
      errors[field] = `${field} must be at most ${rules.maxLength} characters`
    }
    if (rules.pattern && !rules.pattern.test(String(value))) {
      errors[field] = `${field} format is invalid`
    }
    if (rules.enum && !rules.enum.includes(String(value))) {
      errors[field] = `${field} must be one of: ${rules.enum.join(', ')}`
    }
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors)
}

// Usage:
// validate(body, {
//   project_id:     { type: 'uuid',   required: true },
//   repo_url:       { type: 'url',    required: true, maxLength: 500 },
//   environment:    { type: 'string', required: true, enum: ['production', 'staging', 'development'] },
//   size:           { type: 'string', required: true, enum: ['small', 'medium', 'large'] },
// })
```

### VERIFY Task 8.3
```
□ POST die-analyze with invalid UUID for project_id → 400 with field-level error
□ POST die-analyze with non-URL repo_url → 400 "repo_url must be a valid URL"
□ POST die-analyze with invalid size → 400 "size must be one of: small, medium, large"
□ All Edge Functions return structured { error, fields } on validation failure
□ Validation errors never expose internal server details (no stack traces to users)
```

---

## TASK 8.4 — Audit Log: Complete Coverage

### All actions that must be logged to `audit_log`
```typescript
// supabase/functions/_shared/audit.ts

type AuditAction =
  // Auth
  | 'user.signup' | 'user.login' | 'user.logout'
  // Cloud
  | 'cloud_credential.created' | 'cloud_credential.verified' | 'cloud_credential.deleted'
  // Deployments
  | 'deployment.started' | 'deployment.succeeded' | 'deployment.failed'
  | 'deployment.rolled_back' | 'environment.deleted'
  // GitHub
  | 'github.app_installed' | 'github.app_uninstalled'
  | 'github.pr_opened' | 'github.preview_created' | 'github.preview_destroyed'
  // COIE/AIRE
  | 'finding.opened' | 'finding.suppressed' | 'finding.resolved'
  | 'incident.detected' | 'incident.diagnosed' | 'incident.resolved'
  | 'playbook.executed' | 'pr.opened'
  // Team
  | 'member.invited' | 'member.joined' | 'member.removed' | 'member.role_changed'
  // Billing
  | 'plan.upgraded' | 'plan.downgraded'

export async function audit(
  supabase: any,
  org_id: string,
  actor_id: string,
  actor_name: string,
  action: AuditAction,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  // Fire-and-forget — don't let audit failure block the main operation
  supabase.from('audit_log').insert({
    org_id, actor_id, actor_name,
    actor_type: actor_id.startsWith('system:') ? 'system' : 'user',
    action,
    metadata
  }).then(() => {}).catch((err: Error) => {
    console.error('Audit log write failed:', err.message)
    // Non-blocking — main flow continues even if audit write fails
  })
}
```

### VERIFY Task 8.4
```
□ Sign up → audit_log row: action='user.signup'
□ Verify IAM role → audit_log row: action='cloud_credential.verified'
□ Deploy → audit_log rows: 'deployment.started' then 'deployment.succeeded'
□ Delete environment → audit_log row: 'environment.deleted' with project_id in metadata
□ Invite team member → audit_log row: 'member.invited' with invitee email in metadata
□ audit_log rows have correct org_id (RLS works — other orgs cannot see them)
□ audit_log is INSERT-only (no UPDATE or DELETE policies — immutable)
```

---

# ══════════════════════════════════════════════════════
# PHASE 9 — PERFORMANCE & PRODUCTION READINESS
# Branch: `feature/phase9-performance`
# Goal: First load < 3s. Dashboard interactions < 100ms.
#       Zero unnecessary API calls. Zero memory leaks.
# ══════════════════════════════════════════════════════

---

## TASK 9.1 — Split `ui/index.jsx` Into Individual Files

### Current problem
`ui/index.jsx` is 10,000+ lines exported from a single file.
`React.lazy()` code-splits at the module boundary — not inside a file.
All 10K lines load on the first tab regardless of lazy loading.

### Target structure
```
src/components/ui/
├── index.js              ← re-exports only (no component code)
├── Button.jsx
├── Card.jsx
├── Modal.jsx
├── Input.jsx
├── Select.jsx
├── Badge.jsx
├── Tag.jsx
├── ProgressBar.jsx
├── Skeleton.jsx          ← new
├── EmptyState.jsx        ← new
├── Toggle.jsx
├── Tooltip.jsx
├── Dropdown.jsx
├── Toast.jsx
├── CommandPalette.jsx
├── Sidebar.jsx
└── TopBar.jsx

src/components/ui/index.js:  ← thin re-export barrel
export { default as Button }      from './Button'
export { default as Card }        from './Card'
// ... etc
```

### Migration strategy (do NOT do a big bang rewrite)
1. Create new individual files copying components one by one
2. Update `index.js` to re-export from individual files
3. Do NOT change any import statements in tabs/pages
4. Once all components are in individual files, delete the original monolith
5. Run build — confirm bundle sizes improve

### VERIFY Task 9.1
```
□ npm run build — no errors
□ All components still work (visual regression: load each dashboard tab)
□ Bundle size comparison:
    Before: index-*.js ~440KB
    After: index-*.js < 100KB (component code is now in tab chunks)
□ Chrome DevTools: Landing page does NOT load dashboard UI components
□ First Contentful Paint < 2s on 3G simulated network (Chrome DevTools)
```

---

## TASK 9.2 — Lazy-Load Sentry on Dashboard Only (Not Landing Page)

```javascript
// src/lib/errorTracker.js — lazy initialization

let _sentry = null

async function getSentry() {
  if (_sentry) return _sentry
  // Only load Sentry when actually needed (first error or dashboard load)
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // RULE D5: don't send errors from dev
    beforeSend(event) {
      if (import.meta.env.DEV) return null
      return event
    }
  })
  _sentry = Sentry
  return Sentry
}

// src/components/Dashboard.jsx — init Sentry when dashboard loads
useEffect(() => {
  getSentry().then(Sentry => {
    Sentry.setUser({ id: user.id, email: user.email })
  })
}, [user.id])
```

### VERIFY Task 9.2
```
□ Chrome DevTools Network: landing page does NOT load error-tracking-*.js chunk
□ Navigate to /dashboard → error-tracking-*.js loads
□ Trigger a JS error in dashboard → Sentry receives it with user context
□ error-tracking-*.js chunk not in initial bundle (confirm with build output)
```

---

## TASK 9.3 — Database Query Performance Audit

### Required indexes (add to migration `003_performance_indexes.sql`)
```sql
-- All queries used by dashboard tabs — add missing indexes

-- CRITICAL: Time-series queries (MonitoringTab, CostTab history)
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_time
  ON cluster_metrics(cluster_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_scores_time
  ON cluster_scores(cluster_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pod_logs_project_time
  ON pod_logs(project_id, logged_at DESC);

-- CRITICAL: Dashboard tab queries (all filtered by cluster or project)
CREATE INDEX IF NOT EXISTS idx_findings_cluster_status
  ON findings(cluster_id, status, dimension);
CREATE INDEX IF NOT EXISTS idx_incidents_cluster_status
  ON incidents(cluster_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_project_time
  ON deployments(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipelines_cluster_time
  ON pipelines(cluster_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_infra_events_project_time
  ON infrastructure_events(project_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_time
  ON audit_log(org_id, created_at DESC);

-- For RLS policy performance (org_id lookup)
CREATE INDEX IF NOT EXISTS idx_clusters_org
  ON clusters(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_cluster
  ON projects(cluster_id);
CREATE INDEX IF NOT EXISTS idx_projects_org
  ON projects(org_id);
```

### VERIFY Task 9.3
```
□ EXPLAIN ANALYZE for top 5 queries used by the dashboard — all use index scans
□ No sequential scans on tables with > 1000 rows
□ cluster_metrics query with cluster_id + time range: index scan confirmed
□ findings query with cluster_id + status: index scan confirmed
□ Run: SELECT * FROM pg_stat_user_tables WHERE n_live_tup > 1000 AND seq_scan > 0
    → goal: zero tables with both conditions
```

---

## TASK 9.4 — Frontend Performance: React Query / TanStack

### Problem
Current custom hooks use plain `useEffect` + `useState`.
This means no caching, no deduplication of identical requests, no background refetching.
A user switching tabs makes the same DB call on every tab switch.

### Solution: Wrap hooks with TanStack Query

```javascript
// Install: npm install @tanstack/react-query

// src/main.jsx — add QueryClient
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,       // Data fresh for 30 seconds — no refetch on tab switch
      cacheTime: 5 * 60 * 1000,   // Keep in cache 5 minutes after unmount
      retry: 2,                   // Retry failed requests twice
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
  },
})

// Wrap app: <QueryClientProvider client={queryClient}><App /></QueryClientProvider>

// src/hooks/useDeployments.js — migrate to TanStack Query
import { useQuery, useQueryClient } from '@tanstack/react-query'

export function useDeployments(clusterId) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['deployments', clusterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, deployments(id, status, live_url, commit_sha, started_at ORDER BY started_at DESC LIMIT 1)')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data || []
    },
    enabled: !!clusterId,
  })

  // Still use Realtime for live updates — but now it invalidates the cache
  useEffect(() => {
    if (!clusterId) return
    const channel = supabase.channel(`deployments:${clusterId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'projects',
        filter: `cluster_id=eq.${clusterId}`
      }, () => {
        // Invalidate cache → TanStack Query refetches automatically
        queryClient.invalidateQueries({ queryKey: ['deployments', clusterId] })
      })
      .subscribe()

    return () => supabase.removeChannel(channel)  // RULE D4
  }, [clusterId, queryClient])

  return {
    deployments: query.data || [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
```

### VERIFY Task 9.4
```
□ Switch between dashboard tabs rapidly — no duplicate Supabase requests
    (Chrome DevTools Network: second tab switch = no new DB calls, uses cache)
□ Background refetch: data updates without user action every 30 seconds
□ Error retry: mock a failed request → retries 2 times before showing error
□ Stale-while-revalidate: old data shown while new data loads (no loading skeleton on cache hit)
```

---

# ══════════════════════════════════════════════════════
# PHASE 10 — LAUNCH READINESS
# Branch: `feature/phase10-launch-readiness`
# Goal: AutoStack is ready to show to users and handle
#       the first 100 sign-ups without breaking.
# ══════════════════════════════════════════════════════

---

## TASK 10.1 — Custom Domain + SSL Support

### User flow
1. User clicks "Add custom domain" in DeploymentTab / Settings
2. User enters: `api.mycompany.com`
3. AutoStack shows DNS instructions:
   - CNAME: `api.mycompany.com → [alb_dns_name]`
4. User adds CNAME in their DNS provider
5. AutoStack polls DNS resolution every 30 seconds
6. When DNS resolves: request ACM certificate for `api.mycompany.com`
7. Wait for ACM validation (email or DNS validation)
8. Add HTTPS listener to ALB with the new certificate
9. Update ingress with new host
10. Show green "SSL Active" status

```typescript
// supabase/functions/add-custom-domain/index.ts

// After DNS validates:
async function provisionSSL(acmClient: ACMClient, domain: string): Promise<string> {
  // Request certificate
  const { CertificateArn } = await acmClient.send(new RequestCertificateCommand({
    DomainName: domain,
    ValidationMethod: 'DNS',  // DNS validation (user adds TXT record)
    Tags: [{ Key: 'autostack:managed', Value: 'true' }]  // RULE A4
  }))

  // Get validation DNS record
  const cert = await pollUntilReady(
    () => acmClient.send(new DescribeCertificateCommand({ CertificateArn })),
    (r) => r.Certificate?.DomainValidationOptions?.[0]?.ResourceRecord != null,
    5000, 60000
  )

  const dnsRecord = cert.Certificate!.DomainValidationOptions![0].ResourceRecord!
  return dnsRecord.Value  // User adds this CNAME to validate ownership
}
```

### VERIFY Task 10.1
```
□ Add custom domain → DNS instructions shown with correct CNAME values
□ ACM certificate requested → DNS validation record provided
□ After user adds DNS validation CNAME → certificate issued (test with sandbox domain)
□ HTTPS listener added to ALB → custom domain serves traffic over SSL
□ Original autostack.app subdomain still works after custom domain added
□ Teardown: delete environment → ACM certificate deleted, no orphaned resources
```

---

## TASK 10.2 — Plan Enforcement & Billing Foundation

### What to build now (Stripe comes later — this is the enforcement layer)

```sql
-- Plan limits tracked in real-time
CREATE TABLE IF NOT EXISTS plan_usage (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID    UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  live_environments   INTEGER DEFAULT 0,
  total_nodes         INTEGER DEFAULT 0,
  last_updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: update plan_usage when projects change status
CREATE OR REPLACE FUNCTION update_plan_usage() RETURNS TRIGGER AS $$
BEGIN
  UPDATE plan_usage SET
    live_environments = (
      SELECT COUNT(*) FROM projects WHERE org_id = NEW.org_id AND provisioning_status = 'live'
    ),
    last_updated_at = NOW()
  WHERE org_id = NEW.org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_usage_update
  AFTER INSERT OR UPDATE OF provisioning_status ON projects
  FOR EACH ROW EXECUTE FUNCTION update_plan_usage();
```

### Plan enforcement at deploy time (RULE J1 in practice)
```typescript
// In die-analyze, before Stage 3 trigger:
async function enforcePlanLimits(supabase: any, org_id: string): Promise<void> {
  const { data: org } = await supabase
    .from('organizations').select('plan').eq('id', org_id).single()
  const { data: usage } = await supabase
    .from('plan_usage').select('*').eq('org_id', org_id).single()

  const limits = PLAN_LIMITS[org.plan as keyof typeof PLAN_LIMITS]

  if (limits.max_environments !== -1 && usage.live_environments >= limits.max_environments) {
    throw Object.assign(new Error(
      `${capitalize(org.plan)} plan allows ${limits.max_environments} live environment${limits.max_environments === 1 ? '' : 's'}. ` +
      `You have ${usage.live_environments}. Upgrade to Pro for unlimited deployments.`
    ), { code: 'PLAN_LIMIT_EXCEEDED', upgrade_url: 'https://autostack.io/pricing' })
  }
}
```

### VERIFY Task 10.2
```
□ Free org: deploy first environment → succeeds
□ Free org: attempt second environment → blocked with upgrade message
□ plan_usage.live_environments increments correctly when deployment goes live
□ plan_usage.live_environments decrements when environment is deleted
□ Upgrade org.plan to 'pro' → second deployment succeeds
```

---

## TASK 10.3 — Error Handling: Make Every Failure Recoverable

### The most common unrecoverable states and their fixes

**State 1: "provisioning" forever (EKS creation timed out)**
```typescript
// supabase/functions/infra-provision/index.ts — add timeout recovery
// If EKS cluster creation exceeds 25 minutes: mark as failed with actionable message

// Also: add a "Retry Provisioning" button to the frontend
// When retrying: check rollback_data → skip resources that already exist (RULE B3 idempotency)
```

**State 2: "deploying" forever (ArgoCD sync never completed)**
```typescript
// Add ArgoCD sync timeout: 10 minutes max
// On timeout: check ArgoCD Application status for error details
// Surface specific K8s events: ImagePullBackOff, OOMKilled, etc.
// Show user the exact error from K8s events (not "deployment failed")
```

**State 3: "building" forever (CodeBuild stuck)**
```typescript
// Add CodeBuild build timeout: check build status every 30 seconds
// If build_id exists but status is IN_PROGRESS for > 15 minutes: stop build
// Retry: start a new build
// Show CodeBuild logs in dashboard (stream via the infrastructure_events table)
```

### Retry mechanism in frontend
```jsx
// DeployProgress.jsx — add retry button for failed states
{status === 'failed' && (
  <div className="flex gap-3 mt-4">
    <Button
      variant="primary"
      onClick={() => retryDeploy(projectId, failedStage)}
      loading={retrying}
    >
      Retry from {failedStage}
    </Button>
    <Button
      variant="secondary"
      onClick={() => setShowDeleteConfirm(true)}
    >
      Cancel & Clean Up
    </Button>
  </div>
)}
// "Cancel & Clean Up" triggers infra-teardown to remove partial resources
```

### VERIFY Task 10.3
```
□ Kill EKS creation mid-way → project status = 'failed', rollback_data populated
□ "Retry" button → provisioning resumes from where it failed (VPC already exists, reused)
□ "Cancel & Clean Up" → infra-teardown removes all tagged resources
□ After teardown: AWS console shows 0 resources with project's tag
□ CodeBuild failure → user sees the actual build error, not "Deployment failed"
□ ArgoCD sync failure → user sees the K8s event (e.g., "ImagePullBackOff")
```

---

## TASK 10.4 — Final Launch Checklist

### Infrastructure
```
□ Supabase project on Pro plan (not free — free has limited connections and no daily backups)
□ Point-in-time recovery enabled on Supabase database
□ pg_cron enabled and all scheduled jobs running:
    SELECT * FROM cron.job; → shows coie-evaluation, cleanup-old-metrics, 
                               destroy-expired-previews, cleanup-pod-logs
□ Supabase Auth: confirm auth-hook registered as Auth Hook (Dashboard → Auth → Hooks)
□ All Edge Functions deployed with latest code: supabase functions list
□ All environment variables set in Supabase secrets (not in code):
    SUPABASE_SERVICE_ROLE_KEY ✓
    RESEND_API_KEY ✓
    UPSTASH_REDIS_REST_URL ✓
    UPSTASH_REDIS_REST_TOKEN ✓
    GITHUB_APP_ID ✓
    GITHUB_APP_PRIVATE_KEY ✓
    GITHUB_WEBHOOK_SECRET ✓
    NOTIFICATION_SECRET ✓
□ Vercel: custom domain configured, HTTPS enforced, environment variables set
```

### Security
```
□ grep -r "SERVICE_ROLE" frontend/src/ → zero results
□ grep -r "AKIA" . --include="*.ts" --include="*.js" → zero results (no hardcoded AWS keys)
□ .env.local in .gitignore → confirmed
□ git log --all --full-history -- .env.local → no commits found
□ GitHub App: webhook secret rotated from development value
□ All RLS policies tested: user from org A cannot read org B's data
□ Rate limits active on all Edge Functions
□ Input validation on all Edge Functions
```

### Performance
```
□ Lighthouse score on landing page: Performance > 90
□ First Contentful Paint < 2.5s (3G network, Chrome DevTools)
□ Total blocking time < 200ms
□ Dashboard: tab switch < 100ms (data from TanStack cache, no DB call)
□ No sequential scans on tables with > 1000 rows
□ Sentry: no P0 errors in last 24 hours
```

### Functional
```
□ Happy path: signup → IAM verify → deploy Node.js app → live URL in < 12 min
□ Auto-redeploy: push to GitHub → new deployment within 3 minutes
□ Rollback: click Rollback → previous version live within 3 minutes
□ COIE: cost findings appear within 5 minutes of first deployment
□ AIRE: crash a pod → incident detected within 60 seconds
□ Delete environment: all AWS resources cleaned up (zero orphans)
□ Email notifications: deployment_live, deployment_failed, incident_detected received
□ Team invite: invite by email → user joins org → sees same environments
□ Plan enforcement: free user cannot create second environment
□ Audit log: all key actions recorded
```

### Monitoring
```
□ PostHog: signup funnel visible (signup → IAM verify → first deployment → live)
□ Sentry: error rate < 0.1% over last 1000 requests
□ Upstash: daily Redis usage < 8000 commands (leave buffer before 10K free tier limit)
□ Resend: email quota usage visible, quota guard working (tested at 95/100)
□ Supabase: DB size < 400MB (leave 100MB buffer on free tier)
```

---

## TASK 10.5 — Demo Repository & Demo Mode

### Create a polished demo repo
```
github.com/[your-org]/autostack-demo-api
  A Node.js Express API that:
  - Has a /health endpoint returning { healthy: true, version: process.env.npm_package_version }
  - Has a / endpoint returning a simple JSON response
  - Has a /metrics endpoint returning fake metrics (for COIE to score)
  - Is intentionally missing some resource limits in a v1 tag (so COIE finds issues)
  - Has a v2 tag that fixes the issues (to demo COIE fix PRs)
```

### Demo mode for college project / investor presentations
```javascript
// src/lib/demo.js
// When VITE_DEMO_MODE=true, the app uses pre-seeded data
// and skips real AWS provisioning (uses a pre-created environment)

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

// In OnboardingPage.jsx, when DEMO_MODE:
// Step 1: pre-fill with demo AWS account ID + role ARN
//         IAM verification skipped (returns success immediately)
// Step 2: pre-fill with github.com/[your-org]/autostack-demo-api
//         Deploy flow uses a pre-existing EKS environment
//         Progress simulation shows all 5 stages complete in 30 seconds
// Step 3: Shows live URL of the real demo environment (always running)

// In Dashboard, DEMO_MODE shows the pre-seeded data:
// - 3 deployments (1 live, 1 failed, 1 rolled back)
// - COIE findings with real dollar amounts
// - AIRE incidents with RCA populated
// - Real-looking metrics from demo cluster
```

### VERIFY Task 10.5
```
□ DEMO_MODE=true: entire onboarding completes in 30 seconds
□ DEMO_MODE=true: dashboard shows all tabs populated with relevant data
□ DEMO_MODE=false: real IAM verification runs
□ Demo repo has intentional COIE issues that appear in CostTab
□ Demo repo /health endpoint returns 200 (ALB health check passes)
```

---

# ══════════════════════════════════════════════════════
# APPENDIX — COMPLETE PROGRESS TRACKER (PHASES 6–10)
# Add to PROGRESS.md
# ══════════════════════════════════════════════════════

```markdown
## Phase 6: GitHub App Integration
- [ ] Task 6.1 — GitHub App creation, OAuth install flow, CSRF protection
- [ ] Task 6.2 — deploy-redeploy Edge Function (auto-redeploy on push)
- [ ] Task 6.3 — Preview environments (namespace-isolated, auto-destroy on PR close)

## Phase 7: Go Agent
- [ ] Task 7.1 — Go agent binary: core structure, metrics collection, event watcher
- [ ] Task 7.2 — Real log streaming to LogsTab (pod_logs table + Realtime)

## Phase 8: Security Hardening
- [ ] Task 8.1 — Environment variable encryption at rest (Supabase Vault)
- [ ] Task 8.2 — Rate limiting on all Edge Functions (sliding window, Upstash)
- [ ] Task 8.3 — Input validation on all Edge Functions (shared validator)
- [ ] Task 8.4 — Audit log: complete coverage of all key actions

## Phase 9: Performance
- [ ] Task 9.1 — Split ui/index.jsx into individual component files
- [ ] Task 9.2 — Lazy-load Sentry (dashboard only, not landing page)
- [ ] Task 9.3 — Database index audit (003_performance_indexes.sql)
- [ ] Task 9.4 — TanStack Query: caching + deduplication for all hooks

## Phase 10: Launch Readiness
- [ ] Task 10.1 — Custom domain + SSL support (ACM + ALB HTTPS listener)
- [ ] Task 10.2 — Plan enforcement (free tier limits at Edge Function layer)
- [ ] Task 10.3 — Error recovery (retry buttons, partial teardown)
- [ ] Task 10.4 — Final launch checklist (ALL items green)
- [ ] Task 10.5 — Demo repository + demo mode for presentations
```

---

# APPENDIX — WHAT COMES AFTER PHASE 10

These are Phase 11+ items — NOT in scope for initial launch.
Park them. Do not let them distract from shipping.

```
FUTURE PHASES:
  Phase 11 — Stripe billing integration (plan upgrades, usage-based add-ons)
  Phase 12 — GCP (GKE) and Azure (AKS) support
  Phase 13 — Multi-region deployments (deploy same app to 2+ AWS regions)
  Phase 14 — Database provisioning (RDS Postgres, ElastiCache Redis) from within AutoStack
  Phase 15 — On-premise Control Plane (enterprise feature)
  Phase 16 — AutoStack CLI (npm install -g autostack → autostack deploy)
  Phase 17 — Terraform export ("Export this environment as Terraform code")

DO NOT START THESE until Phase 10 checklist is 100% green.
```

---

*AutoStack Phase 6–10 Production Completion Plan*
*Ship Phase 10. Then think about Phase 11.*
*Every task has a VERIFY block. A task without a passing VERIFY is not done.*
