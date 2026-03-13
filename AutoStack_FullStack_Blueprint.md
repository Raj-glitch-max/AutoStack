# ╔══════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — FULL-STACK BLUEPRINT v1.0                         ║
# ║   Frontend Gap Analysis + Backend Architecture + All Prompts    ║
# ╚══════════════════════════════════════════════════════════════════╝

---

# PART A — FRONTEND GAP ANALYSIS
## What's Done vs. What's Missing Before Backend Can Connect

---

## ✅ CONFIRMED COMPLETE (from status report)

- Landing page (hero, terminal, features, architecture, pricing, footer)
- Dashboard shell (sidebar, topbar, tab routing)
- All 7 tabs with fake/static data
- Component library (Button, Card, Modal, ToggleSwitch, etc.)
- Animations (fadeUp, pulse, count-up, typewriter, shimmer)
- ⌘K Command Palette
- New Project modal workflow
- Settings multi-pane

---

## 🔴 CRITICAL FRONTEND GAPS (must build BEFORE backend integration)

These are missing pages/flows that are required for a real app. Without these, you cannot log in, onboard, or handle real errors.

---

### GAP 1 — Authentication Pages (CRITICAL)

The current app only has Landing → Dashboard with no real auth gate. Need:

#### 1A. Login Page (`/login`)
```
Full page, centered card, bg same dark theme
Card: bg #0d1117 border #334366 rounded-xl p-40 w-420px shadow heavy

Header:
  AutoStack layers icon + wordmark
  "Welcome back" Inter Bold 24px #f1f5f9
  "Sign in to your account" Inter Regular 14px #92a4c8

Form:
  Email input (full width, with Mail icon inside)
  Password input (full width, with Lock icon + show/hide eye toggle)
  "Forgot password?" link right-aligned, #2463eb, 12px

Primary button: "Sign in" full width blue, height 44px
Divider: "or continue with"
GitHub OAuth button: GitHub icon + "Continue with GitHub" bordered full width

Footer: "Don't have an account? Sign up" link

Error state: red inline message below each invalid field
Loading state: spinner inside button, button disabled
```

#### 1B. Sign Up Page (`/signup`)
```
Same card layout as login
Fields: Full name / Work email / Password / Confirm password
Plan selector: Free / Pro (toggle with pricing) — defaults to Free
"Organization name" input (this becomes the org in Supabase)

Terms checkbox: "I agree to Terms of Service and Privacy Policy"
Primary CTA: "Create account"
GitHub OAuth option

After signup → redirect to /onboarding (see Gap 2)
```

#### 1C. Forgot Password Page (`/forgot-password`)
```
Email input + "Send reset link" button
Success state: "Check your email" with envelope icon
Uses Resend to send the email (Supabase triggers this)
```

#### 1D. Auth Guard / Protected Route Wrapper
```javascript
// Component that wraps all dashboard routes
// If not authenticated → redirect to /login
// If authenticated but no cluster → redirect to /onboarding
// If authenticated + has cluster → render dashboard
```

---

### GAP 2 — Onboarding Flow (CRITICAL)

First-time users after signup see this BEFORE the dashboard. Currently missing entirely.

```
/onboarding — 3-step wizard

Step 1: "Connect your first cluster"
  Big centered card
  Icon: Kubernetes logo / layers
  Title: "Let's connect your cluster" Inter Bold 28px
  Subtitle: "This takes about 2 minutes" muted

  Form:
    Cluster name input: "prod-eks-us-east-1"
    Cloud provider select: AWS EKS / Google GKE / Azure AKS / Other
    Region select (dynamic based on provider)

  CTA: "Generate install command →"

Step 2: "Install the Agent"
  Terminal card showing the EXACT helm install command:
  ┌─────────────────────────────────────────────────────┐
  │  $ helm repo add autostack https://charts.autostack.io
  │  $ helm install autostack-agent autostack/agent \
  │      --namespace autostack-system \
  │      --create-namespace \
  │      --set controlPlane.url=wss://api.autostack.io \
  │      --set agent.token=<YOUR_TOKEN_HERE>
  └─────────────────────────────────────────────────────┘

  Copy button (copies full command)
  "Waiting for agent connection..." pulsing status
  Live polling: check every 3s if agent has connected
  When connected → green checkmark + animate to Step 3

Step 3: "You're all set!"
  Confetti animation (canvas-confetti library, ~3KB)
  Cluster health score appears for first time with count-up animation
  "Open Dashboard →" primary button
```

---

### GAP 3 — Empty States (IMPORTANT)

Every tab needs an empty state for when the user has no data. Currently renders broken/empty tables.

```
Projects tab empty state:
  Centered in table area
  FolderGit2 icon 48px #334366
  "No projects connected" Inter Medium 16px #f1f5f9
  "Connect your first Git repository to start deploying" muted 14px
  "Connect repository" blue button

Pipelines empty state:
  GitBranch icon + "No pipeline runs yet" + description

Infrastructure empty state:
  Server icon + "No resources detected" + "Agent must be connected"

Logs empty state:
  FileText icon + "No logs yet" + "Deploy something to see logs here"

Incidents/Activity empty state:
  Activity icon + "All clear — no recent activity"
```

---

### GAP 4 — Toast Notification System (IMPORTANT)

Currently no user feedback on actions. Need a global toast system.

```
Position: top-right, stacked, max 3 visible
Animation: slideIn from right (0.3s), auto-dismiss after 4s, hover pauses dismiss

Variants:
  success: green left border + CheckCircle icon
  error:   red left border + XCircle icon
  info:    blue left border + Info icon
  warning: amber left border + AlertTriangle icon

Each toast: bg #1a2233 border #334366 rounded-lg shadow p-16 pr-32
Close button: X icon top-right

Usage (global context/hook):
  toast.success("PR #48 opened successfully")
  toast.error("Failed to connect repository: invalid URL")
  toast.info("COIE cycle completed — 3 new findings")
```

---

### GAP 5 — Skeleton Loading States (IMPORTANT)

When real API data is loading, show skeletons not empty divs.

```
Skeleton component: bg #1a2233 rounded, shimmer animation
  shimmer: background linear-gradient(90deg, #1a2233 25%, #242a3d 50%, #1a2233 75%)
  background-size: 200% 100%
  animation: shimmer 1.5s infinite

Skeleton variants:
  SkeletonText: w-full h-12 rounded (for text lines)
  SkeletonCard: full card sized skeleton
  SkeletonTableRow: row-shaped skeleton with columns
  SkeletonChart: rectangle skeleton for chart area

Apply to:
  Score cards (while loading cluster data)
  Projects table rows (while loading projects)
  Activity feed (while loading events)
  All 4 monitoring charts
```

---

### GAP 6 — Error Boundary + Error States (IMPORTANT)

```
Global ErrorBoundary component wrapping the whole app
Tab-level error states for when API calls fail:

Error state template:
  AlertTriangle icon 40px #f43f5e
  "Something went wrong" Inter Medium 16px
  Error message muted 13px (from error.message)
  "Try again" secondary button (retry the failed request)
  "Report issue" ghost button (triggers Sentry feedback)
```

---

### GAP 7 — Real-time Data Hooks (BACKEND INTEGRATION PREP)

Replace all fake data with a hook pattern ready for Supabase:

```javascript
// Pattern for every data-fetching component:
const { data, loading, error, refetch } = useClusterData(clusterId)

// Each hook should handle:
// 1. Loading state → show skeleton
// 2. Error state → show error state with retry
// 3. Empty state → show empty state
// 4. Success state → render data
// 5. Real-time subscription → update on Supabase realtime events

// Hooks to create:
useAuth()           // current user + org
useClusters()       // list of clusters
useCluster(id)      // single cluster detail
useProjects(clusterId)
useProject(id)
usePipelines(clusterId)
useFindings(clusterId)
useIncidents()
useMetrics(clusterId, range)
useScoreHistory(clusterId)
useNotificationPrefs()
useTeamMembers()
useIntegrations()
```

---

### GAP 8 — Missing Landing Page Sections (MINOR)

From the original spec, the Figma only had partial sections. Still missing:

```
1. Stats row in hero:
   "500+ Clusters" / "2.1M+ Deployments" / "89% MTTR reduction"
   Syne 700 24px numbers with count-up, 12px muted labels below

2. CTA Banner (between pricing and footer):
   Full-width dark gradient card
   "Ready to stop managing YAML?" Syne 800 40px
   "Open Dashboard" + "Read the docs" buttons

3. Responsive nav (hamburger menu at <768px)

4. Actual section scroll anchors (Features / Architecture / Pricing links in navbar work)
```

---

### GAP 9 — Performance & Production Readiness (BEFORE LAUNCH)

```
1. React.lazy() + Suspense for dashboard tabs (code splitting)
   - Each tab loads only when visited
   - Reduces initial bundle size significantly

2. Vite build optimization in vite.config.js:
   rollupOptions: {
     output: {
       manualChunks: {
         vendor: ['react', 'react-dom'],
         charts: ['recharts'],
         icons: ['lucide-react'],
       }
     }
   }

3. Image optimization: all SVG assets inlined, no external image deps

4. Meta tags for SEO (landing page):
   title, description, og:image, twitter:card
```

---

## FRONTEND GAP PRIORITY ORDER

| Priority | Gap | Effort | Block backend? |
|----------|-----|--------|----------------|
| 🔴 P0 | Auth pages (Login/Signup) | 4h | YES |
| 🔴 P0 | Onboarding flow | 3h | YES |
| 🟡 P1 | Toast system | 1h | YES (user feedback) |
| 🟡 P1 | Skeleton loading states | 2h | YES (UX) |
| 🟡 P1 | Empty states | 2h | YES (UX) |
| 🟡 P1 | Data hooks pattern | 3h | YES (wiring) |
| 🟢 P2 | Error boundaries | 1h | No |
| 🟢 P2 | Missing landing sections | 1h | No |
| 🟢 P3 | Performance/code splitting | 2h | No |

**Total frontend remaining: ~19 hours of focused work before backend wiring**

---
---

# PART B — TECHNOLOGY DECISIONS

---

## 1. AUTH: Supabase Auth ✅ (NOT Clerk)

**Decision: Supabase Auth**

Reasoning:
- **Free forever** — no MAU limits that matter at your stage
- **Native RLS integration** — Row Level Security policies in Supabase automatically scope all DB queries to the authenticated user's org. This is CRITICAL for AutoStack's multi-tenant model. With Clerk you'd need a separate sync layer.
- **Built-in GitHub OAuth** — one config, done
- **Magic link / OTP** — works out of the box
- **Organizations via Supabase** — use `user_metadata` + a `organizations` table with RLS. Same result as Clerk's org feature, zero extra cost.
- **Email confirmations** via Resend — Supabase supports custom SMTP, plug in Resend directly

The ONLY reason to choose Clerk is its pre-built React UI components (they're beautiful). But for AutoStack you already have a custom design system — you don't want Clerk's UI anyway.

---

## 2. VECTOR DB: pgvector (in Supabase) NOT Pinecone

**Decision: pgvector extension in Supabase (NO Pinecone)**

For AutoStack's AIRE pattern matching:
- Supabase has `pgvector` built-in — enable with one SQL command
- Store incident pattern embeddings directly in PostgreSQL
- Semantic search with `<->` cosine distance operator
- Free, zero extra service, co-located with your data

Pinecone free tier = 100K vectors, 1 index. Fine for v1 but adds complexity. pgvector gives you the same capability inside Supabase for free.

---

## 3. COMPLETE FREE-TIER STACK DECISION

| Service | Purpose | Free Tier | Paid Risk |
|---------|---------|-----------|-----------|
| **Supabase** | DB + Auth + Realtime + Storage + Edge Functions | 500MB DB, 50K MAU, 2GB bandwidth | $25/mo (Pro) if exceeded |
| **Upstash Redis** | Rate limiting, caching, session store, job queue | 10K commands/day, 256MB | $0.2/100K commands |
| **Resend** | Transactional emails | 3,000 emails/mo, 100/day | $20/mo (Pro) |
| **PostHog** | Product analytics | 1M events/mo | $0 until 1M/mo |
| **Sentry** | Error tracking | 5K errors/mo, 10K perf | $26/mo (Team) |
| **Vercel** | Frontend hosting | Unlimited for hobby | $20/mo (Pro) |
| **Supabase pgvector** | Vector search (AIRE patterns) | Included in Supabase | Same as Supabase |

**Total monthly cost: $0** until you hit scale thresholds.

---

## 4. COST GUARDRAIL RULES (apply these ALWAYS)

Add this comment block at the top of EVERY file that touches a paid service:

```javascript
// ⚠️ COST GUARDRAIL — READ BEFORE MODIFYING
// Service: [Supabase / Upstash / Resend / etc.]
// Free tier limit: [exact limit]
// Current usage pattern: [what this code does]
// RULE: If this function could be called > [N] times/day, add rate limiting.
// RULE: Never add new Supabase Edge Functions without checking invocation count.
// RULE: Never send emails without checking Resend daily quota (100/day).
// RULE: Never store >500MB in Supabase without archiving old data first.
// RULE: All Upstash Redis keys must have TTL set (no persistent keys without expiry).
```

**Specific guardrails to implement in code:**

```javascript
// 1. Supabase — add to ALL realtime subscriptions:
const MAX_REALTIME_CHANNELS = 10  // Supabase free = 200 concurrent, stay safe
// Unsubscribe when component unmounts — ALWAYS

// 2. Resend — wrap every email send:
async function sendEmail(to, subject, html) {
  const today = await redis.incr(`email:quota:${todayKey()}`)
  if (today > 90) {  // 90, not 100 — 10 buffer
    console.error('EMAIL QUOTA NEARLY EXHAUSTED — not sending:', subject)
    // notify admin via Sentry instead
    Sentry.captureMessage(`Email quota at ${today}/100`, 'warning')
    return { error: 'quota_exceeded' }
  }
  return resend.emails.send({ to, subject, html })
}

// 3. Upstash Redis — all keys must have expiry:
await redis.set('key', value, { ex: 3600 })  // ALWAYS set ex (seconds)
// Never: await redis.set('key', value)  ← this persists forever, costs money

// 4. Supabase DB — add indexes before any query with WHERE clause:
// Run EXPLAIN ANALYZE on any query touching >1000 rows

// 5. Supabase Storage — compress images before upload, max 5MB per file
```

**Environment variable to block accidental billing:**
```bash
# .env
VITE_COST_ALERT_WEBHOOK=https://hooks.slack.com/... # or your preferred alert
# Add to every service initialization to log usage
```

---
---

# PART C — BACKEND ARCHITECTURE

---

## Overview

AutoStack backend runs on **Supabase** (database, auth, realtime, edge functions) with **Upstash Redis** for queuing and caching. The three engines (DIE, COIE, AIRE) run as **Supabase Edge Functions** (Deno/TypeScript) triggered by database webhooks and scheduled cron jobs.

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                     │
│                   React 19 + Vite 7 + Tailwind 4            │
└─────────────┬───────────────────────────┬───────────────────┘
              │ Supabase JS Client         │ Direct REST/WS
              ▼                           ▼
┌─────────────────────────┐   ┌──────────────────────────────┐
│   SUPABASE PLATFORM      │   │      UPSTASH REDIS           │
│                          │   │  • Rate limiting             │
│  ┌─────────────────────┐ │   │  • Session cache             │
│  │   PostgreSQL 15      │ │   │  • Job queue (COIE/AIRE)    │
│  │   + pgvector         │ │   │  • Email quota counters     │
│  │   + TimescaleDB?     │ │   │  • WebSocket token store    │
│  └─────────────────────┘ │   └──────────────────────────────┘
│                          │
│  ┌─────────────────────┐ │   ┌──────────────────────────────┐
│  │   Auth (GoTrue)      │ │   │      RESEND                  │
│  │   • Email/password   │ │   │  • Invite emails             │
│  │   • GitHub OAuth     │ │   │  • Incident alerts           │
│  │   • Magic link       │ │   │  • Weekly digest             │
│  └─────────────────────┘ │   │  • Score change alerts       │
│                          │   └──────────────────────────────┘
│  ┌─────────────────────┐ │
│  │   Realtime           │ │   ┌──────────────────────────────┐
│  │   • Score updates    │ │   │      POSTHOG                 │
│  │   • Incident alerts  │ │   │  • Page views / feature use  │
│  │   • Log streaming    │ │   │  • Funnel: signup → paid     │
│  │   • Pipeline updates │ │   │  • Session recordings        │
│  └─────────────────────┘ │   └──────────────────────────────┘
│                          │
│  ┌─────────────────────┐ │   ┌──────────────────────────────┐
│  │   Edge Functions     │ │   │      SENTRY                  │
│  │   • /api/deploy      │ │   │  • JS error tracking         │
│  │   • /api/coie        │ │   │  • Edge function errors      │
│  │   • /api/aire        │ │   │  • Performance monitoring    │
│  │   • /api/webhooks    │ │   │  • User feedback widget      │
│  └─────────────────────┘ │   └──────────────────────────────┘
│                          │
│  ┌─────────────────────┐ │
│  │   Storage            │ │
│  │   • Incident bundles │ │
│  │   • Log archives     │ │
│  │   • Generated files  │ │
│  └─────────────────────┘ │
└─────────────────────────┘
```

---

## DATABASE SCHEMA (PostgreSQL via Supabase)

### Core Tables

```sql
-- ============================================================
-- ORGANIZATIONS (top-level tenant)
-- ============================================================
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,  -- used in URLs
  plan        TEXT NOT NULL DEFAULT 'free',  -- free | pro | team | enterprise
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORGANIZATION MEMBERS (users belong to orgs with roles)
-- ============================================================
CREATE TABLE org_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'developer',  -- owner|admin|developer|viewer
  invited_by      UUID REFERENCES auth.users(id),
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- ============================================================
-- CLUSTERS
-- ============================================================
CREATE TABLE clusters (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  provider           TEXT NOT NULL,  -- eks|gke|aks|k3s|other
  region             TEXT NOT NULL,
  k8s_version        TEXT,
  node_count         INT DEFAULT 0,
  pod_count          INT DEFAULT 0,
  agent_status       TEXT DEFAULT 'disconnected',  -- connected|disconnected|degraded
  agent_version      TEXT,
  agent_token        TEXT UNIQUE,  -- one-time registration token
  agent_token_used   BOOLEAN DEFAULT FALSE,
  health_score       INT DEFAULT 0,
  score_security     INT DEFAULT 0,
  score_reliability  INT DEFAULT 0,
  score_cost         INT DEFAULT 0,
  score_performance  INT DEFAULT 0,
  score_updated_at   TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROJECTS (Git repositories connected to clusters)
-- ============================================================
CREATE TABLE projects (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID REFERENCES organizations(id) ON DELETE CASCADE,
  cluster_id         UUID REFERENCES clusters(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  repo_url           TEXT NOT NULL,
  branch             TEXT NOT NULL DEFAULT 'main',
  environment        TEXT NOT NULL DEFAULT 'production',  -- production|staging|development
  stack              TEXT,  -- detected: Node.js|Python|Go|etc
  health_score       INT DEFAULT 100,
  status             TEXT DEFAULT 'inactive',  -- healthy|degraded|failing|inactive
  deploy_count       INT DEFAULT 0,
  last_deploy_at     TIMESTAMPTZ,
  argocd_app_name    TEXT,
  argocd_sync_status TEXT DEFAULT 'Unknown',
  analysis_status    TEXT DEFAULT 'pending',  -- pending|analyzing|complete|failed
  pr_url             TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEPLOYMENTS (immutable deploy event records)
-- ============================================================
CREATE TABLE deployments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  cluster_id    UUID REFERENCES clusters(id) ON DELETE CASCADE,
  commit_sha    TEXT NOT NULL,
  commit_msg    TEXT,
  branch        TEXT,
  image_tag     TEXT,
  status        TEXT DEFAULT 'running',  -- success|failed|running|rolled_back
  argocd_sync   TEXT DEFAULT 'Unknown',
  duration_ms   INT,
  triggered_by  TEXT DEFAULT 'github_push',  -- github_push|manual|rollback
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- ============================================================
-- PIPELINES (GitHub Actions runs, ingested via webhook)
-- ============================================================
CREATE TABLE pipelines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id      UUID REFERENCES clusters(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  github_run_id   TEXT UNIQUE,
  branch          TEXT,
  commit_sha      TEXT,
  status          TEXT DEFAULT 'queued',  -- success|running|failed|queued|cancelled
  duration_ms     INT,
  stages          JSONB DEFAULT '[]',  -- [{name, status, duration_ms, started_at}]
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ============================================================
-- CLUSTER SCORES (time-series, 1 row per COIE cycle)
-- ============================================================
CREATE TABLE cluster_scores (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id         UUID REFERENCES clusters(id) ON DELETE CASCADE,
  health_score       INT NOT NULL,
  score_security     INT NOT NULL,
  score_reliability  INT NOT NULL,
  score_cost         INT NOT NULL,
  score_performance  INT NOT NULL,
  evaluated_at       TIMESTAMPTZ DEFAULT NOW()
);
-- Index for time-series queries:
CREATE INDEX idx_cluster_scores_cluster_time ON cluster_scores(cluster_id, evaluated_at DESC);

-- ============================================================
-- FINDINGS (COIE-detected issues)
-- ============================================================
CREATE TABLE findings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id          UUID REFERENCES clusters(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES projects(id),
  dimension           TEXT NOT NULL,  -- security|reliability|cost|performance
  severity            TEXT NOT NULL,  -- critical|high|medium|low
  check_name          TEXT NOT NULL,  -- MISSING_RESOURCE_LIMITS etc.
  title               TEXT NOT NULL,
  description         TEXT,
  affected_resource   TEXT,
  namespace           TEXT,
  remediation         TEXT,
  pr_url              TEXT,
  pr_number           INT,
  status              TEXT DEFAULT 'open',  -- open|suppressed|resolved
  suppressed_reason   TEXT,
  projected_saving    DECIMAL(10,2),  -- monthly USD savings for cost findings
  first_seen_at       TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INCIDENTS (AIRE-created)
-- ============================================================
CREATE TABLE incidents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id           UUID REFERENCES clusters(id) ON DELETE CASCADE,
  project_id           UUID REFERENCES projects(id),
  trigger_type         TEXT NOT NULL,
  affected_resource    TEXT,
  namespace            TEXT,
  status               TEXT DEFAULT 'detected',  -- detected|investigating|diagnosed|resolved
  severity             TEXT DEFAULT 'medium',
  matched_pattern      TEXT,
  pattern_confidence   DECIMAL(3,2),
  summary              TEXT,
  root_cause           TEXT,
  immediate_action     TEXT,
  permanent_fix        TEXT,
  remediation_applied  TEXT,
  pr_url               TEXT,
  timeline             JSONB DEFAULT '[]',
  log_excerpts         JSONB DEFAULT '[]',
  metrics_snapshot     JSONB DEFAULT '{}',
  detected_at          TIMESTAMPTZ DEFAULT NOW(),
  diagnosed_at         TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ
);

-- ============================================================
-- PLAYBOOKS (user-defined self-healing rules)
-- ============================================================
CREATE TABLE playbooks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id       UUID REFERENCES clusters(id) ON DELETE CASCADE,
  org_id           UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  source           TEXT DEFAULT 'user',  -- system|user
  trigger_config   JSONB NOT NULL,
  action_config    JSONB NOT NULL,
  enabled          BOOLEAN DEFAULT FALSE,
  execution_count  INT DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INTEGRATIONS (per-org)
-- ============================================================
CREATE TABLE integrations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,  -- github|slack|pagerduty|datadog|jenkins
  status         TEXT DEFAULT 'disconnected',
  config         JSONB DEFAULT '{}',  -- encrypted sensitive fields stored in Supabase vault
  connected_at   TIMESTAMPTZ,
  error_message  TEXT,
  UNIQUE(org_id, name)
);

-- ============================================================
-- NOTIFICATION PREFERENCES (per-user)
-- ============================================================
CREATE TABLE notification_prefs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  event_deploy          BOOLEAN DEFAULT TRUE,
  event_incident        BOOLEAN DEFAULT TRUE,
  event_score_change    BOOLEAN DEFAULT FALSE,
  event_weekly_digest   BOOLEAN DEFAULT TRUE,
  channel_slack         BOOLEAN DEFAULT FALSE,
  channel_email         BOOLEAN DEFAULT TRUE,
  channel_pagerduty     BOOLEAN DEFAULT FALSE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG (append-only, immutable)
-- ============================================================
CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES organizations(id),
  actor_type   TEXT NOT NULL,  -- user|system
  actor_id     TEXT NOT NULL,
  actor_name   TEXT,
  action       TEXT NOT NULL,  -- finding.suppressed|playbook.executed|member.invited
  target_type  TEXT,
  target_id    TEXT,
  description  TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- Partition by month for efficiency:
-- (add partitioning if >100K rows/month)

-- ============================================================
-- CLUSTER METRICS (time-series, sampled from agent)
-- ============================================================
CREATE TABLE cluster_metrics (
  id          BIGSERIAL PRIMARY KEY,
  cluster_id  UUID REFERENCES clusters(id) ON DELETE CASCADE,
  sampled_at  TIMESTAMPTZ DEFAULT NOW(),
  cpu_pct     DECIMAL(5,2),
  memory_pct  DECIMAL(5,2),
  requests    INT,
  latency_p99 DECIMAL(8,2)
);
CREATE INDEX idx_cluster_metrics_time ON cluster_metrics(cluster_id, sampled_at DESC);

-- ============================================================
-- INVITATIONS (pending team invites)
-- ============================================================
CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'developer',
  token       TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  invited_by  UUID REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INCIDENT PATTERNS (AIRE pattern library with pgvector)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE incident_patterns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT UNIQUE NOT NULL,  -- OOM_KILL, APP_CRASH, etc.
  description       TEXT,
  matching_criteria JSONB NOT NULL,
  diagnosis_template TEXT,
  remediation_type  TEXT,  -- restart|scale|patch_manifest|open_pr
  embedding         vector(1536),  -- OpenAI ada-002 embeddings for semantic match
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_patterns_embedding ON incident_patterns USING ivfflat (embedding vector_cosine_ops);
```

---

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on ALL tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
-- (all tables)

-- Helper function: get current user's org_id
CREATE OR REPLACE FUNCTION auth.org_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'org_id')::UUID;
$$ LANGUAGE SQL STABLE;

-- Clusters: only members of the org can see their clusters
CREATE POLICY "cluster_org_isolation" ON clusters
  USING (org_id = auth.org_id());

-- Projects: same pattern
CREATE POLICY "project_org_isolation" ON projects
  USING (org_id = auth.org_id());

-- Audit log: org-scoped read, system/edge function write only
CREATE POLICY "audit_read" ON audit_log
  FOR SELECT USING (org_id = auth.org_id());
CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT WITH CHECK (TRUE);  -- only edge functions insert

-- Findings: readable by org members, writable only by service role
CREATE POLICY "findings_read" ON findings
  FOR SELECT USING (
    cluster_id IN (SELECT id FROM clusters WHERE org_id = auth.org_id())
  );
```

---

## SUPABASE EDGE FUNCTIONS

### Function List

```
supabase/functions/
├── auth-hook/           → runs after signup to create org + member records
├── invite-member/       → sends invite email via Resend
├── connect-cluster/     → generates agent token, returns helm command
├── agent-register/      → validates agent token, marks cluster connected
├── agent-heartbeat/     → updates cluster last_seen_at, pod/node counts
├── agent-metrics/       → ingests metrics batch from agent
├── die-analyze/         → DIE pipeline: clone repo → analyze → gen manifests → open PR
├── coie-cycle/          → COIE evaluation: score all dimensions → open fix PRs
├── aire-detect/         → AIRE: receives incident bundle → run diagnosis → gen RCA
├── github-webhook/      → ingests GitHub workflow_run events → update pipelines
├── send-notification/   → sends email/Slack notifications via Resend/webhook
├── weekly-digest/       → scheduled Sunday digest email via cron
└── stripe-webhook/      → (future) handle subscription upgrades
```

### Key Edge Function: `auth-hook`

```typescript
// supabase/functions/auth-hook/index.ts
// Triggered: after every new user signup via Supabase Auth Hook
// Purpose: create organization + assign user as owner

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { user } = await req.json()
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // service role bypasses RLS
  )
  
  // 1. Create organization from user's company name (or email domain)
  const orgName = user.user_metadata?.organization_name 
    || user.email.split('@')[1].split('.')[0]  // fallback: email domain
  
  const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-')
  
  const { data: org } = await supabase
    .from('organizations')
    .insert({ name: orgName, slug: `${orgSlug}-${Date.now()}` })
    .select()
    .single()
  
  // 2. Create org_member record (owner role)
  await supabase.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner'
  })
  
  // 3. Create default notification prefs
  await supabase.from('notification_prefs').insert({
    user_id: user.id
  })
  
  // 4. Update user metadata with org_id (used by RLS)
  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { org_id: org.id, role: 'owner' }
  })
  
  // 5. Send welcome email via Resend
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'AutoStack <hello@autostack.io>',
      to: user.email,
      subject: 'Welcome to AutoStack — connect your first cluster',
      html: welcomeEmailTemplate(user.user_metadata?.full_name || 'there')
    })
  })
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### Key Edge Function: `connect-cluster`

```typescript
// supabase/functions/connect-cluster/index.ts
// Called by: POST /functions/v1/connect-cluster
// Auth: Bearer JWT required

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std/crypto/mod.ts'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')!
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  
  const { name, provider, region } = await req.json()
  
  // Get current user's org_id from JWT
  const { data: { user } } = await supabase.auth.getUser()
  const orgId = user?.user_metadata?.org_id
  
  // Generate secure one-time agent token
  const agentToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  
  // Create cluster record
  const { data: cluster } = await supabase
    .from('clusters')
    .insert({ org_id: orgId, name, provider, region, agent_token: agentToken })
    .select()
    .single()
  
  // Return the Helm install command
  const controlPlaneUrl = Deno.env.get('CONTROL_PLANE_URL')
  const helmCommand = `helm repo add autostack https://charts.autostack.io && \\
helm install autostack-agent autostack/agent \\
  --namespace autostack-system \\
  --create-namespace \\
  --set controlPlane.url=${controlPlaneUrl} \\
  --set agent.token=${agentToken} \\
  --set cluster.id=${cluster.id}`
  
  return new Response(JSON.stringify({
    cluster_id: cluster.id,
    agent_token: agentToken,
    helm_command: helmCommand
  }), { headers: { 'Content-Type': 'application/json' } })
})
```

### Key Edge Function: `coie-cycle`

```typescript
// supabase/functions/coie-cycle/index.ts
// Triggered: Supabase cron job every 5 minutes per cluster
// OR: called directly after agent-metrics ingestion

Deno.serve(async (req) => {
  const { cluster_id } = await req.json()
  const supabase = createClient(/* service role */)
  
  // 1. Fetch current cluster state (via agent's last-reported data)
  const { data: cluster } = await supabase
    .from('clusters').select('*').eq('id', cluster_id).single()
  
  // 2. Fetch all projects and their last metrics
  const { data: projects } = await supabase
    .from('projects').select('*').eq('cluster_id', cluster_id)
  
  // 3. Run all 4 scoring dimensions
  const securityScore = await runSecurityChecks(supabase, cluster_id, projects)
  const reliabilityScore = await runReliabilityChecks(supabase, cluster_id, projects)
  const costScore = await runCostChecks(supabase, cluster_id, projects)
  const perfScore = await runPerformanceChecks(supabase, cluster_id, projects)
  
  // 4. Compute weighted aggregate
  const healthScore = Math.round(
    securityScore * 0.35 +
    reliabilityScore * 0.30 +
    costScore * 0.20 +
    perfScore * 0.15
  )
  
  // 5. Update cluster scores
  await supabase.from('clusters').update({
    health_score: healthScore,
    score_security: securityScore,
    score_reliability: reliabilityScore,
    score_cost: costScore,
    score_performance: perfScore,
    score_updated_at: new Date().toISOString()
  }).eq('id', cluster_id)
  
  // 6. Insert time-series record
  await supabase.from('cluster_scores').insert({
    cluster_id,
    health_score: healthScore,
    score_security: securityScore,
    score_reliability: reliabilityScore,
    score_cost: costScore,
    score_performance: perfScore
  })
  
  // 7. Supabase Realtime broadcasts the update to subscribed frontend clients
  // (happens automatically because we updated the clusters table)
  
  return new Response(JSON.stringify({ success: true, health_score: healthScore }))
})
```

---

## SUPABASE REALTIME SUBSCRIPTIONS (Frontend)

Replace all fake data polling with these Supabase realtime channels:

```javascript
// hooks/useClusterRealtime.js
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

export function useCluster(clusterId) {
  const [cluster, setCluster] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // Initial fetch
    supabase
      .from('clusters')
      .select('*')
      .eq('id', clusterId)
      .single()
      .then(({ data }) => { setCluster(data); setLoading(false) })
    
    // Real-time subscription: updates whenever COIE cycle runs
    const channel = supabase
      .channel(`cluster:${clusterId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'clusters',
        filter: `id=eq.${clusterId}`
      }, (payload) => {
        setCluster(payload.new)
        // Trigger score card count-up animation
        toast.info(`Scores updated: ${payload.new.health_score}/100`)
      })
      .subscribe()
    
    return () => supabase.removeChannel(channel)  // ← ALWAYS cleanup
  }, [clusterId])
  
  return { cluster, loading }
}

// Similar hooks for:
// useFindings(clusterId) — broadcasts on new COIE findings
// useIncidents(clusterId) — broadcasts on new AIRE detections
// usePipelines(clusterId) — broadcasts on GitHub webhook updates
// useActivityFeed(clusterId) — composite of all event types
```

---

## CRON JOBS (Supabase pg_cron)

```sql
-- Enable pg_cron extension in Supabase Dashboard → Extensions

-- COIE: run every 5 minutes for all connected clusters
SELECT cron.schedule(
  'coie-evaluation',
  '*/5 * * * *',  -- every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://[project].supabase.co/functions/v1/coie-cycle',
    headers := '{"Authorization": "Bearer [service_role_key]"}',
    body := json_build_object('trigger', 'scheduled')
  ) FROM clusters WHERE agent_status = 'connected';
  $$
);

-- Weekly digest: every Sunday at 9am UTC
SELECT cron.schedule(
  'weekly-digest',
  '0 9 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://[project].supabase.co/functions/v1/weekly-digest',
    headers := '{"Authorization": "Bearer [service_role_key]"}'
  );
  $$
);

-- Clean up old metrics (keep 90 days): daily at 2am
SELECT cron.schedule(
  'cleanup-old-metrics',
  '0 2 * * *',
  $$
  DELETE FROM cluster_metrics WHERE sampled_at < NOW() - INTERVAL '90 days';
  DELETE FROM cluster_scores WHERE evaluated_at < NOW() - INTERVAL '90 days';
  $$
);
```

---

## ENVIRONMENT VARIABLES

```bash
# .env.local (frontend)
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon_key]
VITE_POSTHOG_KEY=phc_[key]
VITE_POSTHOG_HOST=https://app.posthog.com
VITE_SENTRY_DSN=https://[key]@[org].ingest.sentry.io/[project]
VITE_APP_URL=https://autostack.io

# supabase/functions/.env (edge functions)
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[service_role_key]
SUPABASE_ANON_KEY=[anon_key]
RESEND_API_KEY=re_[key]
UPSTASH_REDIS_REST_URL=https://[id].upstash.io
UPSTASH_REDIS_REST_TOKEN=[token]
GITHUB_APP_ID=[id]
GITHUB_APP_PRIVATE_KEY=[pem]
GITHUB_WEBHOOK_SECRET=[secret]
OPENAI_API_KEY=[key]  # for AIRE pattern embeddings (pgvector)
CONTROL_PLANE_URL=wss://[project].supabase.co
SENTRY_DSN=[dsn]
```

---

## POSTHOG INTEGRATION

```javascript
// src/lib/analytics.js
import posthog from 'posthog-js'

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  capture_pageview: true,
  capture_pageleave: true,
  session_recording: { maskAllInputs: true },  // mask passwords
  // Cost guardrail: disable session recording in development
  disable_session_recording: import.meta.env.DEV,
})

// Identify user after login:
export function identifyUser(user, org) {
  posthog.identify(user.id, {
    email: user.email,
    name: user.user_metadata?.full_name,
    org_id: org.id,
    org_name: org.name,
    plan: org.plan,
  })
  posthog.group('organization', org.id, { name: org.name, plan: org.plan })
}

// Track key events:
export const track = {
  signup: (method) => posthog.capture('signup', { method }),
  clusterConnected: () => posthog.capture('cluster_connected'),
  projectCreated: () => posthog.capture('project_created'),
  dashboardTabViewed: (tab) => posthog.capture('dashboard_tab_viewed', { tab }),
  prMerged: (type) => posthog.capture('pr_merged', { type }),  // coie|die|aire
  incidentResolved: (pattern) => posthog.capture('incident_resolved', { pattern }),
  upgradeClicked: (plan) => posthog.capture('upgrade_cta_clicked', { plan }),
}
```

---

## SENTRY INTEGRATION

```javascript
// src/main.jsx (add at top, before React render)
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,  // development|production
  // Cost guardrail: only capture 10% of transactions in prod (performance monitoring)
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  // Capture 100% of errors regardless
  beforeSend(event) {
    // Don't send errors from dev
    if (import.meta.env.DEV) return null
    return event
  }
})

// Wrap app in Sentry error boundary:
// <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
//   <App />
// </Sentry.ErrorBoundary>

// Add user context after login:
export function setSentryUser(user) {
  Sentry.setUser({ id: user.id, email: user.email })
}
```

---

# PART D — FRONTEND ADDITION PROMPT

## The Missing Frontend Pieces (Auth + Onboarding + UX)

Paste this prompt into your AI IDE to build what's missing:

---

```
Add the following missing pieces to the existing AutoStack React 19 + Vite 7 + Tailwind 4 application.
The existing app has: Landing page, Dashboard with 7 tabs, component library.
Now add:

=== 1. AUTH PAGES ===

Create src/pages/LoginPage.jsx:
Full-page centered layout. Same dark theme (#111621 bg).
Card: bg #0d1117 border #334366 1px solid rounded-xl w-[420px] mx-auto mt-[15vh] p-[40px]
Shadow: 0 32px 80px rgba(0,0,0,0.5)

Content:
  Logo: Layers icon 20px #2463eb + "AutoStack" Inter Bold 20px — centered
  "Welcome back" Inter Bold 24px #f1f5f9 mt-8 text-center
  "Sign in to your account" Inter Regular 14px #92a4c8 text-center mt-2

Form (mt-8 flex flex-col gap-4):
  Email input: label "Email address" 12px muted above, input with Mail icon left inside
  Password input: label "Password", Lock icon left, Eye toggle right (toggles type)
  "Forgot password?" — #2463eb text-right text-12px mt-1

"Sign in" primary button full-width h-[44px] mt-2
  Loading state: spinner + "Signing in..." text, button disabled

Divider: border line + "or continue with" muted text centered

GitHub button: full width bordered bg #1a2233, GitHub SVG icon left + "Continue with GitHub"

Footer: "Don't have an account?" muted + "Sign up" #2463eb link — centered mt-6

Error display: red inline message "#f43f5e text-13px" below field on validation fail
General error: red card above form "Invalid email or password. Please try again."

Create src/pages/SignupPage.jsx:
Same card layout.
Fields in order:
  Full name (User icon)
  Work email (Mail icon)
  Organization name (Building icon) — tooltip "This will be your team's workspace name"
  Password (Lock icon) — show strength indicator bar below:
    4 segments: weak(1 red) / fair(2 amber) / good(3 blue) / strong(4 green)
  Confirm password

"Create account" blue full-width button
GitHub OAuth option
"Already have an account? Sign in" footer link

Terms: "By creating an account, you agree to our Terms of Service and Privacy Policy" muted 11px below button

=== 2. ONBOARDING WIZARD ===

Create src/pages/OnboardingPage.jsx:
Full page centered, 3-step wizard. Progress: "Step X of 3" + 3 dots indicator at top.

STEP 1 — "Connect your cluster"
  Icon: Server icon 48px in blue gradient circle
  Title: "Let's connect your cluster" Inter Bold 28px
  Subtitle: "This takes about 2 minutes"
  
  Form card: bg #0d1117 border #334366 rounded-xl p-32 w-[520px] mx-auto mt-8
    Cluster name: text input, placeholder "prod-eks-us-east-1"
    Cloud provider: select with options: AWS EKS / Google GKE / Azure AKS / Other
    Region: select (changes based on provider):
      AWS: us-east-1 / us-west-2 / eu-west-1 / ap-southeast-1
      GCP: us-central1 / europe-west1 / asia-east1
      Azure: eastus / westeurope / eastasia
  
  "Generate install command →" blue button full width

STEP 2 — "Install the Agent"
  Title: "Run this command in your cluster"
  Subtitle: "Requires kubectl access and Helm 3+"
  
  Terminal card: macOS header + command body
  Full helm command (pre-formatted, copy button top-right corner of card)
  
  Status section below terminal (mt-24):
    Pulsing amber dot + "Waiting for agent connection..."
    Animated: dots appear one by one (…)
    Poll every 3 seconds (fake polling with setTimeout for now)
    After 5 seconds in demo: switches to:
    Green checkmark + "Agent connected!" fadeIn animation
    "Continue →" blue button appears
  
  "Having trouble?" ghost button → opens help modal with troubleshooting steps

STEP 3 — "You're all set!"
  Canvas confetti animation (use canvas-confetti: import confetti from 'canvas-confetti')
  Cluster card showing:
    Green dot + cluster name
    Health score animating 0 → 94 (count-up)
    "EKS · 6 nodes" label
  
  "Go to Dashboard →" large primary button
  Runs confetti on mount: confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })

=== 3. GLOBAL TOAST SYSTEM ===

Create src/components/ui/Toast.jsx + src/context/ToastContext.jsx:

Toast container: fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[360px]

Individual toast: bg #1a2233 border-l-4 rounded-lg p-4 shadow-xl
  flex items-start gap-3, relative
Variants:
  success: border-l-color #4ade80, CheckCircle icon #4ade80
  error:   border-l-color #f43f5e, XCircle icon #f43f5e
  info:    border-l-color #2463eb, Info icon #2463eb
  warning: border-l-color #f59e0b, AlertTriangle icon #f59e0b

Content: title Inter Medium 13px #f1f5f9 + message Inter Regular 12px #92a4c8
Close X button: absolute top-2 right-2, #4a5568 hover #92a4c8

Animations:
  Enter: translateX(100%) → translateX(0) + opacity 0→1, duration 0.3s
  Exit:  translateX(0) → translateX(100%) + opacity 1→0, duration 0.25s
  Progress bar at bottom: shrinks from full width to 0 in 4s (auto-dismiss timer)
  Hover on toast: pauses progress bar

ToastContext provides: toast.success(msg) / toast.error(msg) / toast.info(msg) / toast.warning(msg)
Each call generates unique id, adds to array, auto-removes after 4s.

=== 4. SKELETON COMPONENTS ===

Create src/components/ui/Skeleton.jsx:
Base: bg #1a2233 rounded, shimmer animation:
  background: linear-gradient(90deg, #1a2233 25%, #242a3d 50%, #1a2233 75%)
  background-size: 200% 100%
  animation: shimmer 1.5s infinite

Exports:
  SkeletonText — props: width (default "100%"), height (default "12px"), className
  SkeletonCard — props: height (default "120px"), className
  SkeletonRow — mimics a table row with 5 columns of varying widths
  SkeletonChart — rectangle with aspect ratio for chart area
  SkeletonScoreCard — matches the exact dimensions of a score card

Apply skeletons to all dashboard tabs:
  Overview: show 4 SkeletonScoreCards while cluster data loads (loading=true for 1.5s demo)
  Projects: show 5 SkeletonRows while projects load
  Monitoring: show 4 SkeletonChart while metrics load

=== 5. EMPTY STATES ===

Create src/components/ui/EmptyState.jsx:
Props: icon (Lucide component), title, description, action (optional {label, onClick})

Style: centered in parent container, py-16
  icon: 48px #334366 (muted, not bright)
  title: Inter Medium 16px #7a8099
  description: Inter Regular 13px #4a5168 mt-1 max-w-[280px] text-center
  action button: secondary variant, mt-4

Empty states to add to each tab:
  Projects: <EmptyState icon={FolderGit2} title="No projects yet" description="Connect a Git repository to start deploying" action={{label:"Connect repository", onClick: openModal}} />
  Pipelines: <EmptyState icon={GitBranch} title="No pipeline runs" description="Runs will appear here when you push to a connected repository" />
  Infrastructure: <EmptyState icon={Server} title="No resources detected" description="Connect and configure your cluster agent to see infrastructure" />
  Logs: <EmptyState icon={FileText} title="No logs yet" description="Deploy something to start seeing live logs here" />
  Activity feed: <EmptyState icon={Activity} title="All quiet" description="No activity in the last 24 hours" />

=== 6. ROUTING + AUTH GUARD ===

Add React Router DOM to the project:
  npm install react-router-dom

Create src/router.jsx with these routes:
  / → LandingPage (public)
  /login → LoginPage (public, redirect to /dashboard if already authed)
  /signup → SignupPage (public)
  /onboarding → OnboardingPage (protected, only if no cluster exists)
  /dashboard → DashboardApp (protected, redirect to /login if not authed)
  /dashboard/:tab → DashboardApp with activeTab from URL param

AuthGuard component:
  Checks: isAuthenticated (from Supabase session, fake it with localStorage for now)
  If not authed → redirect to /login
  If authed, no clusters → redirect to /onboarding
  If authed, has clusters → render children

Fake auth for demo (will be replaced by Supabase):
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('autostack_demo_auth') === 'true'
  )
  Login button sets this to true
  Logout in sidebar clears it

=== TECHNICAL REQUIREMENTS ===
- React 19 + Vite 7 + Tailwind CSS 4
- Install: canvas-confetti, react-router-dom
- All new components go in src/components/ui/ or src/pages/
- Use existing design tokens (same CSS variables)
- All animations match existing system (fadeUp, fadeIn, pulse)
- No breaking changes to existing Dashboard tabs
- Toast context wraps entire app in main.jsx
```

---

# PART E — BACKEND SETUP PROMPT

## Supabase + All Services Initial Setup

```
Set up the complete AutoStack backend using:
- Supabase (database + auth + edge functions + realtime)
- Upstash Redis (caching + rate limiting)
- Resend (transactional email)
- PostHog (analytics)
- Sentry (error tracking)

=== STEP 1: Supabase Client Setup ===

Create src/lib/supabase.js:
  import { createClient } from '@supabase/supabase-js'
  export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true  // for OAuth redirects
      },
      realtime: {
        params: { eventsPerSecond: 10 }  // cost guardrail: limit realtime events
      }
    }
  )

=== STEP 2: Auth Implementation ===

Create src/hooks/useAuth.js:
  - supabase.auth.signInWithPassword({ email, password })
  - supabase.auth.signInWithOAuth({ provider: 'github' })
  - supabase.auth.signUp({ email, password, options: { data: { full_name, organization_name } } })
  - supabase.auth.signOut()
  - supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })
  - supabase.auth.onAuthStateChange(callback) — subscribe in useEffect, cleanup on unmount
  
  Returns: { user, session, loading, signIn, signUp, signOut, signInWithGithub }

Wire auth to:
  LoginPage — calls signIn, redirects to /dashboard on success
  SignupPage — calls signUp, redirects to /onboarding on success
  Sidebar logout button — calls signOut, redirects to /
  GitHub button — calls signInWithGithub

=== STEP 3: Data Hooks ===

Create these hooks, all following the same pattern:
Pattern: initial fetch + realtime subscription + loading/error states

src/hooks/useClusters.js
  - fetchs: supabase.from('clusters').select('*').order('created_at', { ascending: false })
  - realtime: subscribe to clusters table for the current org
  - returns: { clusters, loading, error, refetch }

src/hooks/useCluster.js(id)
  - fetches single cluster + score history (last 24h from cluster_scores)
  - realtime: subscribe to UPDATE on clusters WHERE id=eq.{id}
  - on update: animates score card numbers (dispatch custom event for count-up)

src/hooks/useProjects.js(clusterId)
  - fetches projects for cluster
  - realtime: INSERT + UPDATE on projects

src/hooks/usePipelines.js(clusterId)
  - fetches pipelines sorted by started_at DESC, limit 20
  - realtime: INSERT + UPDATE on pipelines

src/hooks/useFindings.js(clusterId)
  - fetches open findings grouped by severity
  - realtime: INSERT on findings

src/hooks/useIncidents.js(clusterId)
  - fetches incidents sorted by detected_at DESC
  - realtime: INSERT + UPDATE on incidents

src/hooks/useMetrics.js(clusterId, { from, to, granularity })
  - fetches cluster_metrics time series
  - no realtime (polling every 60s instead)

src/hooks/useActivityFeed.js(clusterId)
  - combines realtime events from incidents, findings, pipelines, deployments
  - returns unified event stream for sidebar activity feed

=== STEP 4: Replace All Fake Data ===

Replace every hardcoded data array in the dashboard tabs with the corresponding hook:

OverviewTab:
  const { cluster, loading } = useCluster(activeClusters[0]?.id)
  const { data: metrics } = useMetrics(cluster?.id, { from: '24h' })
  const { events } = useActivityFeed(cluster?.id)
  Show SkeletonScoreCard while loading
  Show real cluster data when loaded

ProjectsTab:
  const { projects, loading } = useProjects(clusterId)
  Show SkeletonRow × 5 while loading
  Show EmptyState when projects.length === 0

(Same pattern for all 7 tabs)

=== STEP 5: PostHog Setup ===

src/lib/analytics.js (as specified in blueprint)
Add to main.jsx: posthog.init(...)
Track in AuthContext: identify user on login
Track in router: page views automatically
Add track.clusterConnected() to onboarding step 2 completion
Add track.projectCreated() to new project modal success

=== STEP 6: Sentry Setup ===

Install: @sentry/react @sentry/vite-plugin
Add to vite.config.js:
  import { sentryVitePlugin } from '@sentry/vite-plugin'
  plugins: [..., sentryVitePlugin({ org: 'your-org', project: 'autostack' })]
  sourcemap: true

Add to main.jsx: Sentry.init(...)
Wrap App in Sentry.ErrorBoundary
Add setSentryUser() call after successful login

=== COST GUARDRAIL RULES TO ADD ===

1. All realtime subscriptions must unsubscribe on unmount
2. No infinite polling — use realtime OR polling with minimum 30s interval  
3. Metrics queries: always include time range (no unbounded queries)
4. Add to each hook: const MAX_ITEMS = 100; .limit(MAX_ITEMS)
5. Supabase storage uploads: check file size < 5MB before uploading
```

---

# PART F — DATABASE MIGRATION PROMPT

```
Create the complete Supabase database migration for AutoStack.
File: supabase/migrations/001_initial_schema.sql

Include ALL tables from the blueprint:
  organizations, org_members, clusters, projects, deployments,
  pipelines, cluster_scores, findings, incidents, playbooks,
  integrations, notification_prefs, audit_log, cluster_metrics,
  invitations, incident_patterns

Include:
  - All column definitions with correct types
  - All foreign keys with ON DELETE CASCADE
  - All indexes for common query patterns
  - Row Level Security enabled on all tables
  - RLS policies for org isolation
  - auth.org_id() helper function
  - pgvector extension for incident_patterns
  - pg_cron schedules

Also create:
  supabase/migrations/002_seed_data.sql — seed with:
  - 10 incident patterns (OOM_KILL, APP_CRASH, IMAGE_PULL_FAILURE, etc.)
  - System playbooks (restart_on_oomkill, scale_on_hpa_max, etc.)

Also create:
  supabase/seed.sql — for local development:
  - 1 demo organization
  - 1 demo cluster (connected, healthy)
  - 5 demo projects
  - 10 demo findings (mix of severities)
  - 3 demo incidents (1 resolved, 1 diagnosed, 1 investigating)
  - 30 days of fake cluster_scores
  - 24h of fake cluster_metrics
```

---

# SUMMARY TABLE

| Phase | What | When |
|-------|------|------|
| **Frontend Phase 2** | Auth pages, Onboarding, Toast, Skeletons, Empty states, Routing | NOW |
| **DB Setup** | Supabase migration, RLS, seed data | After frontend P2 |
| **Auth wiring** | Connect login/signup to Supabase Auth | After DB |
| **Data hooks** | All useX() hooks with realtime | After auth |
| **Edge Functions** | auth-hook, connect-cluster, coie-cycle, aire-detect | After hooks |
| **Email** | Resend templates + sending logic | After edge functions |
| **Analytics** | PostHog + Sentry wiring | Can be parallel |
| **DIE Engine** | GitHub integration + manifest generation | Phase 3 |
| **Agent Protocol** | WebSocket agent connection | Phase 4 |
```
