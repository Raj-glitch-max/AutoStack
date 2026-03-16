# ARCHITECTURE.md — AutoStack System Design

**Generated: 2026-03-16**
**Status: Current**

---

## System Overview

Two-component architecture: Control Plane (SaaS on Supabase) + Cluster Agent (Go binary in user's cluster).

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                         │
│              React 19 + Vite 7 + Tailwind 4                  │
│         Routes: / | /login | /signup | /onboarding           │
│                  /dashboard/[tab]                             │
└──────────────────┬──────────────────────────────────────────┘
                   │ supabase-js client
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                  SUPABASE PLATFORM                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  PostgreSQL  │  │   Auth       │  │  Realtime CDC     │ │
│  │  15+pgvector │  │  (GoTrue)    │  │  postgres_changes │ │
│  │  16 tables   │  │  email+OAuth │  │  useData.js hooks │ │
│  │  RLS on all  │  │  auth-hook   │  │  <15 channels     │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Edge Funcs   │  │  Storage     │  │  pg_cron          │ │
│  │ 23+ Deno fns │  │  cluster-logs│  │  coie every 5min  │ │
│  │ all CORS+auth│  │  .jsonl files│  │  cleanup daily    │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         │ Upstash Redis                      │ Resend SMTP
         │ rate limits, quotas,               │ all auth emails
         │ embedding cache, cooldowns         │ notifications
         ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  USER'S AWS ACCOUNT                          │
│  AutoStack assumes their IAM role via STS + ExternalId       │
│  ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────────┐ │
│  │   VPC   │ │ EKS  │ │ ALB  │ │ ECR  │ │  CodeBuild    │ │
│  │subnets  │ │cluster│ │HTTPS │ │images│ │ Docker builds │ │
│  │NAT,IGW  │ │nodes │ │TLS   │ │      │ │               │ │
│  └─────────┘ └──────┘ └──────┘ └──────┘ └───────────────┘ │
│                                                             │
│  All resources tagged: autostack:deployment = [deploy_id]  │
└─────────────────────────────────────────────────────────────┘
         │ (inside cluster)
         ▼
┌─────────────────────────────────────────────────────────────┐
│                  GO AGENT (in K8s cluster)                   │
│  Deployed via Helm. Read-only K8s permissions.               │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────────────┐ │
│  │ Heartbeat  │ │ Event Watch │ │  Metrics + Inventory   │ │
│  │ every 30s  │ │ K8s Warning │ │  every 60s + 5min      │ │
│  │ node/pod   │ │ events      │ │  to Redis inventory    │ │
│  │ counts     │ │ → incidents │ │  key for COIE          │ │
│  └────────────┘ └─────────────┘ └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema (16 Core Tables)

```sql
organizations          -- top-level tenant (1 per signup)
org_members            -- user ↔ org with role (owner/admin/developer/viewer)
environments           -- provisioned AWS environment (was: clusters)
deployments            -- each deploy attempt, has pr_url + live_url
pipelines              -- GitHub Actions runs from webhook
cluster_scores         -- time-series: one row per COIE cycle
findings               -- COIE-discovered issues, open/resolved
incidents              -- AIRE-detected failures with RCA
incident_patterns      -- 10 seed patterns with pgvector embeddings
cluster_metrics        -- time-series: CPU/memory/latency per environment
cloud_credentials      -- Vault-backed AWS role ARN per org
integrations           -- GitHub/Slack/PagerDuty per org
notification_prefs     -- per-user email/Slack toggles
invitations            -- pending team invites (7-day expiry)
audit_log              -- immutable append-only action log
api_keys               -- hashed API keys for programmatic access
```

**RLS rule on all tables:** `org_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid`
This is enforced at the Postgres kernel. Frontend cannot bypass it.

---

## Edge Functions (23 Active)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `auth-hook` | Auth event (MUST be registered) | Create org + set user_metadata.org_id |
| `aws-assume-role` | POST /JWT | STS AssumeRole, store in Vault |
| `infra-provision` | POST /JWT | Create VPC+EKS+ALB in user's AWS |
| `infra-teardown` | POST /JWT | Delete all tagged AWS resources |
| `die-analyze` | POST /JWT | Repo analysis + manifest gen + PR |
| `build-and-deploy` | POST /JWT | CodeBuild + ECR push + K8s apply |
| `coie-cycle` | pg_cron 5min | Score environment, write findings |
| `aire-detect` | DB Webhook INSERT incidents | Pattern match + OpenAI fallback |
| `send-notification` | Internal POST | Route email/Slack with quota guard |
| `github-app-callback` | OAuth callback | Exchange installation_id for token |
| `github-webhook` | GitHub POST | Sync pipeline runs |
| `agent-register` | POST /token | Validate one-time token, activate |
| `agent-heartbeat` | POST /cluster-id | Update last_seen_at + counts |
| `agent-metrics` | POST /cluster-id | Ingest metrics + events + inventory |
| `agent-logs` | POST /cluster-id | Store log batches to Storage |
| `invite-member` | POST /JWT | Send invite email, insert invitation |
| `unsubscribe` | GET /token | Unsubscribe from notifications |
| `stripe-webhook` | Stripe POST | Handle subscription lifecycle |
| `deploy-redeploy` | POST /JWT | Trigger redeploy from latest image |
| `deploy-rollback` | POST /JWT | kubectl rollout undo |
| `deploy-preview` | POST /JWT | Namespace-isolated PR preview env |
| `weekly-digest` | pg_cron Sunday 9am | Send weekly summary email |
| `cleanup-old-data` | pg_cron daily 2am | Delete metrics/logs older than 90d |

---

## Critical Dependency: auth-hook + JWT org_id

```
User signs up
    ↓
auth-hook fires (MUST be registered in Supabase Dashboard → Auth → Hooks)
    ↓
Creates organizations row
Creates org_members row (role: owner)
Calls supabase.auth.admin.updateUserById(user.id, {
  user_metadata: { org_id: [uuid], role: 'owner' }
})
    ↓
All subsequent RLS policies read: auth.jwt() -> 'user_metadata' ->> 'org_id'
    ↓
If org_id is NOT in user_metadata: ALL queries return 0 rows
```

**This is the #1 failure mode. Always verify after any auth changes.**

---

## Frontend Route Map

```
/                    → LandingPage (public)
/login               → LoginPage (public)
/signup              → SignupPage (public)
/forgot-password     → ForgotPasswordPage (public)
/reset-password      → ResetPasswordPage (public)
/onboarding          → OnboardingPage (protected, new users only)
/accept-invite       → AcceptInvitePage (semi-public, token-gated)
/dashboard           → DashboardApp (protected)
/dashboard/overview  → OverviewTab
/dashboard/deployments → DeploymentsTab
/dashboard/pipelines → PipelinesTab
/dashboard/infrastructure → InfrastructureTab
/dashboard/monitoring → MonitoringTab
/dashboard/logs      → LogsTab
/dashboard/cost      → CostTab
/dashboard/incidents → IncidentsTab
/dashboard/settings  → SettingsTab
/auth/callback       → OAuth callback handler
```

---

## Data Flow: One-Click Deploy

```
User clicks "Deploy"
    ↓
Frontend creates deployments row {status: 'queued'}
    ↓
Calls die-analyze Edge Function
    ↓
die-analyze:
  1. GitHub App JWT → fetch repo file tree
  2. detectStack() → language/framework/port
  3. generateManifests() → 7 files as strings
  4. openManifestPR() → REAL GitHub PR (pr_url CANNOT be null)
  5. Assumes user's IAM role via STS
  6. Creates VPC → subnets → IGW → NAT → SGs → EKS → nodegroup → ECR
  7. Triggers CodeBuild → Docker build → ECR push
  8. kubectl apply manifests → ArgoCD sync
  9. ALB becomes active → live_url returned
    ↓
deployments.live_url = "https://app-xyz.autostack.app"
deployments.status = "healthy"
    ↓
Frontend Realtime subscription updates UI
    ↓
User sees live URL
```

---

## Agent → AIRE Incident Flow

```
K8s pod fails (OOM, crash, etc.)
    ↓
Go agent K8s Watch API detects Warning event
    ↓
agent-metrics called with event payload
    ↓
Edge Function: maps event to trigger_type
  (OOMKilled → 'oom_kill', ImagePullBackOff → 'image_pull_failure', etc.)
    ↓
INSERT into incidents table {status: 'detected'}
    ↓
Supabase Database Webhook fires → aire-detect called
    ↓
Tier 1: Pattern matching against incident_patterns table
  → confidence score calculated
Tier 2 (if confidence < 0.65): OpenAI embedding → pgvector similarity
    ↓
UPDATE incidents {
  matched_pattern, pattern_confidence,
  root_cause, immediate_action, permanent_fix,
  status: 'diagnosed', diagnosed_at
}
    ↓
send-notification called → email within 60 seconds
    ↓
Frontend Realtime subscription shows incident in IncidentsTab
```

---

## Shared Utilities (`_shared/`)

```
_shared/cors.ts        — CORS headers + OPTIONS handler (every function uses this)
_shared/auth.ts        — JWT verification + user extraction
_shared/rate-limit.ts  — Upstash sliding window rate limiter
_shared/sanitize.ts    — Input validation + sanitization
_shared/audit.ts       — Writes to audit_log table
_shared/github.ts      — GitHub App JWT + installation token refresh
_shared/vault.ts       — Supabase Vault read/write for secrets
```

---

## Go Agent Structure

```
agent/
├── cmd/agent/main.go
├── internal/
│   ├── collector/events.go      — K8s Watch API for Warning events
│   ├── collector/metrics.go     — Metrics Server queries (CPU/memory)
│   ├── collector/inventory.go   — Workload inventory → Redis
│   ├── client/supabase.go       — HTTP client for Edge Functions
│   ├── client/retry.go          — Exponential backoff (5s/30s/2min)
│   ├── config/config.go         — Env vars from K8s Secret
│   └── registration/register.go — One-time token exchange
├── helm/autostack-agent/        — Helm chart
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── namespace.yaml       — autostack-system
│       ├── serviceaccount.yaml
│       ├── clusterrole.yaml     — READ-ONLY permissions (no write)
│       ├── clusterrolebinding.yaml
│       ├── secret.yaml          — agent token from Helm values
│       └── deployment.yaml
├── Dockerfile                   — FROM scratch (smallest possible)
└── go.mod
```
