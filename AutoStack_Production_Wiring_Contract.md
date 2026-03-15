# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — COMPLETE PRODUCTION WIRING CONTRACT                           ║
# ║  "The diagnostic report lied. This document fixes that."                   ║
# ║  Everything here must be IMPLEMENTED and VERIFIED, not simulated.          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

---

# PREAMBLE — WHAT THE DIAGNOSTIC REPORT GOT WRONG

The diagnostic report declared "100% Success Rate" and "READY FOR PRODUCTION."
That is false. Here is what was actually faked:

```
H3 "Provisioning (Project & Deployment Creation)"
  WHAT ACTUALLY HAPPENED: Created a row in projects table with provisioning_status='pending'
  WHAT SHOULD HAVE HAPPENED: Real AWS VPC + EKS + ALB created and returned a live URL
  VERDICT: ❌ FAKE — DB record ≠ infrastructure

H4 "Cluster Connect (Helm Command Generation)"
  WHAT ACTUALLY HAPPENED: Returned a string containing a helm command
  WHAT SHOULD HAVE HAPPENED: Real Helm chart deployed to real EKS, agent connected
  VERDICT: ❌ FAKE — a string is not a running agent

H6 "AIRE Diagnosis (Incident Root Cause Analysis)"
  WHAT ACTUALLY HAPPENED: Inserted a test incident row, function returned a template RCA
  WHAT SHOULD HAVE HAPPENED: Real pod crash detected by agent, AIRE diagnosed from real logs
  VERDICT: ❌ SIMULATED — no real incident detected

H7 "Billing (Stripe Webhook Signature Verification)"
  WHAT ACTUALLY HAPPENED: Sent a test payload to the webhook function
  WHAT SHOULD HAVE HAPPENED: Full payment flow — checkout → subscription created → plan updated
  VERDICT: ❌ PARTIAL — signature check ≠ billing works
```

Additionally, Supabase Auth, Resend, PostHog, Sentry, and Upstash are "configured"
but NOT wired to actual user journeys. Configured means the SDK is initialized.
Wired means it fires when a user performs an action. They are not the same.

This document defines every user journey, every API call, every third-party event
that must fire. Build it. Wire it. Verify it actually fires — not just exists.

---

# ══════════════════════════════════════════════════════════════════
# PART 1 — THE COMPLETE USER EXPERIENCE MAP
# Every screen, every state, every transition
# ══════════════════════════════════════════════════════════════════

## UX FLOW 1 — FIRST-TIME USER: SIGNUP → LIVE DEPLOYMENT

```
[Landing Page]
  ├── Hero: "Deploy to YOUR AWS in 8 minutes"
  ├── CTA: "Deploy your first project →" button
  │     ↓ click
  ├── Scrolls to: features, pricing, architecture diagram
  └── Header: "Sign up" or "Log in" buttons

[Signup Page] /signup
  ├── Fields: Full name | Work email | Organization name | Password | Confirm password
  ├── GitHub OAuth button: "Continue with GitHub"
  ├── On submit:
  │     ↓ calls supabase.auth.signUp()
  │     ↓ Supabase fires auth-hook Edge Function
  │     ↓ auth-hook creates org, org_members, subscriptions (14-day Pro trial)
  │     ↓ auth-hook sets user_metadata.org_id in JWT ← CRITICAL
  │     ↓ Resend sends welcome email ← MUST FIRE
  │     ↓ PostHog.capture('signup', { method: 'email' }) ← MUST FIRE
  │     ↓ Sentry.setUser({ id, email }) ← MUST FIRE
  │     ↓ redirects to /onboarding
  └── Footer: "Already have an account? Sign in"

[Onboarding — Step 1: Connect Your Cloud] /onboarding
  ├── Header: "Connect your cloud account" (step 1 of 3)
  ├── Provider cards: [AWS EKS] [Google Cloud — Beta] [Azure — Beta]
  ├── AWS form (after selecting AWS):
  │     ├── "Your AWS Account ID": [12-digit input]
  │     ├── "Preferred Region": [select — 15 regions]
  │     ├── "IAM Role ARN": [input with format hint]
  │     └── "How to create this role →" link → opens IAM Setup Modal
  │
  ├── IAM Setup Modal:
  │     ├── Step 1: "Launch CloudFormation Stack" button
  │     │           URL: https://console.aws.amazon.com/cloudformation/home?...
  │     │           (pre-filled template that creates AutoStackDeploymentRole)
  │     ├── Step 2: "Wait 60 seconds for stack to complete"
  │     ├── Step 3: "Copy Role ARN from CloudFormation Outputs tab"
  │     └── Step 4: "Paste it above"
  │
  ├── "Verify & Continue →" button
  │     ↓ calls POST /functions/v1/aws-assume-role
  │     ↓ loading: "Testing IAM permissions..." (spinner)
  │     ↓ SUCCESS: green checkmark + "IAM role verified — N permissions confirmed"
  │     ↓ FAIL: red inline error with specific message (not generic)
  │     ↓ PostHog.capture('cloud_connected', { provider: 'aws' }) ← MUST FIRE
  └── Moves to Step 2

[Onboarding — Step 2: Deploy Your First Project]
  ├── Header: "Deploy your first project" (step 2 of 3)
  ├── Form:
  │     ├── "Repository URL": input, placeholder "https://github.com/your-org/your-app"
  │     │     ├── If private repo: shows "Authorize GitHub App →" inline
  │     │     └── GitHub App auth opens → returns → shows "GitHub connected ✓"
  │     ├── "Environment name": input, default "production"
  │     └── Size selector cards:
  │           ├── SMALL:  "$27–45/mo*  2 vCPU  4GB RAM  2 nodes"
  │           ├── MEDIUM: "$95–140/mo* 4 vCPU  16GB RAM 3 nodes"
  │           └── LARGE:  "$280–420/mo* 8 vCPU  32GB RAM 5 nodes"
  │                 * = "Estimated AWS cost paid directly to AWS"
  │
  ├── "Analyze & Deploy →" button
  │     ↓ calls POST /functions/v1/die-analyze
  │     ↓ Progress view REPLACES the button:
  │           ┌──────────────────────────────────────────────────────┐
  │           │ ⟳  Stage 1: Analyzing repository...                 │
  │           │ ✓  Detected Node.js 20, Express 4.18                │
  │           │ ✓  Generating Dockerfile...                          │
  │           │ ⟳  Stage 2: Planning infrastructure...              │
  │           └──────────────────────────────────────────────────────┘
  │
  ├── After Stage 2: COST PREVIEW MODAL appears:
  │     ┌────────────────────────────────────────────────┐
  │     │ Infrastructure Plan                            │
  │     │ EKS Cluster (2 × t3.medium)    ~$127/mo       │
  │     │ Application Load Balancer       ~$22/mo        │
  │     │ NAT Gateway                     ~$35/mo        │
  │     │ ECR (image storage)              ~$2/mo        │
  │     │ ─────────────────────────────────────────────  │
  │     │ Total estimate:                ~$187/mo        │
  │     │ Paid directly to AWS in your account           │
  │     │                                                │
  │     │ [Cancel]   [Confirm & Provision →]             │
  │     └────────────────────────────────────────────────┘
  │
  ├── On "Confirm & Provision":
  │     ↓ calls POST /functions/v1/infra-provision
  │     ↓ Realtime subscription to infrastructure_events for this project
  │     ↓ Live progress stages:
  │           ✓  Repository analyzed
  │           ✓  Infrastructure planned ($187/mo)
  │           ⟳  Provisioning VPC (us-east-1)...     1m 12s
  │           ⟳  Creating EKS cluster...             waiting...
  │           ·  Building Docker image               (pending)
  │           ·  Deploying to Kubernetes             (pending)
  │     ↓ PostHog.capture('deploy_initiated', { env: 'production', size: 'small' }) ← MUST FIRE
  └── Moves to Step 3 when provisioning_status = 'live'

[Onboarding — Step 3: It's Live!]
  ├── Confetti animation fires (canvas-confetti)
  ├── Big green checkmark animation
  ├── "Your app is live!" heading
  ├── Live URL card:
  │     ┌──────────────────────────────────────────────────┐
  │     │ 🌐  https://your-app.autostack.app               │
  │     │     [Copy] [Open →]                              │
  │     └──────────────────────────────────────────────────┘
  ├── Infrastructure summary:
  │     ✓ EKS Cluster   us-east-1    3 nodes ready
  │     ✓ Load Balancer Active       SSL/TLS enabled
  │     ✓ COIE          Running      Next cycle in 5 min
  ├── Cost: "~$187/month estimated AWS bill"
  ├── "Open Dashboard →" button
  │     ↓ PostHog.capture('first_deploy_complete') ← MUST FIRE
  │     ↓ Resend sends "deployment_live" email ← MUST FIRE
  └── navigates to /dashboard
```

---

## UX FLOW 2 — RETURNING USER: LOGIN → DASHBOARD

```
[Login Page] /login
  ├── AutoStack logo + "Welcome back"
  ├── Email + Password inputs
  ├── "Forgot password?" link
  ├── "Sign in" button
  │     ↓ calls supabase.auth.signInWithPassword()
  │     ↓ on success: Sentry.setUser({ id, email }) ← MUST FIRE
  │     ↓ PostHog.identify(user.id, { email, org_id, plan }) ← MUST FIRE
  │     ↓ PostHog.capture('login', { method: 'email' }) ← MUST FIRE
  │     ↓ if user has no environments: redirect /onboarding
  │     ↓ if user has environments: redirect /dashboard
  ├── Divider: "or continue with"
  ├── "Continue with GitHub" button
  │     ↓ calls supabase.auth.signInWithOAuth({ provider: 'github' })
  │     ↓ same post-login flow
  └── "Don't have an account? Sign up" link

[Auth Guard — the wrapper around all /dashboard routes]
  ├── On mount: check session via supabase.auth.getSession()
  ├── While checking: show centered spinner (NOT null — that causes blank flash)
  ├── Session found: render dashboard
  ├── No session: redirect to /login
  └── Session found but no org_id in user_metadata: redirect to /login with error
        "Account setup incomplete. Please sign up again."
        (This catches failed auth-hook scenarios)
```

---

## UX FLOW 3 — DASHBOARD: THE MAIN INTERFACE

```
[Dashboard Layout]
  ├── Sidebar (left, 240px):
  │     ├── AutoStack logo
  │     ├── ENVIRONMENTS section header
  │     │     └── [env name] [status dot] [provider badge]
  │     ├── "New Environment" button at bottom
  │     ├── Navigation items:
  │     │     ├── Overview
  │     │     ├── Deployments
  │     │     ├── Pipelines
  │     │     ├── Cost
  │     │     ├── Infrastructure
  │     │     ├── Monitoring
  │     │     ├── Logs
  │     │     └── Settings
  │     └── Bottom: user avatar, org name, logout
  │
  ├── Top bar:
  │     ├── Environment selector (dropdown)
  │     ├── "Deploy" quick action button
  │     ├── Notification bell (active incidents)
  │     └── User menu
  │
  └── Content area: the active tab

[Tab: Overview]
  ├── 4 score cards (count-up animation on load):
  │     Security: 0-100 | Reliability: 0-100 | Cost: 0-100 | Performance: 0-100
  │     DATA SOURCE: clusters table, updated by COIE every 5 minutes
  │     LOADING STATE: 4 SkeletonScoreCard components
  │     EMPTY STATE: "Connect a cluster to see scores"
  │
  ├── Cost snapshot row:
  │     "Current estimated AWS spend: $187/mo across 1 environment"
  │     "COIE found $23/mo in savings opportunities →" (link to Cost tab)
  │     DATA SOURCE: projects.estimated_monthly_cost + findings WHERE dimension='cost'
  │
  ├── Activity feed (right column):
  │     Real-time stream of events:
  │     - 🚀 Deploy succeeded (2h ago)
  │     - 💰 COIE: $12/mo savings found (3h ago)
  │     - ⚠️ AIRE: incident diagnosed (5h ago)
  │     DATA SOURCE: Supabase Realtime subscription to:
  │       deployments (INSERT/UPDATE)
  │       incidents (INSERT/UPDATE)
  │       findings (INSERT WHERE dimension='cost')
  │     REALTIME: yes — must update without page refresh
  │     EMPTY STATE: "No activity yet. Deploy your first app."
  │
  └── PostHog.capture('dashboard_tab_viewed', { tab: 'overview' }) ← MUST FIRE

[Tab: Deployments]
  ├── Table header: [Filter: all/running/failed] [+ New Deployment]
  ├── Table columns:
  │     App Name | Environment | Status | Live URL | Last Deploy | Cost/mo | Actions
  ├── Row actions: [Redeploy] [Rollback] [Logs] [···]
  ├── EMPTY STATE: Rocket icon + "No deployments yet" + "New Deployment →" CTA
  │     clicking CTA opens DeployModal (same flow as onboarding step 2)
  ├── DATA SOURCE: projects JOIN deployments (latest per project)
  ├── REALTIME: yes — new deployments appear without refresh
  └── Row click: expands deployment details (COIE scores, AIRE incidents, last 5 deploys)

[Tab: Cost]
  ├── Section 1 — Summary:
  │     Current month: $187.40 (count-up)
  │     ↓ $23 in savings identified
  │     [Apply All Safe Fixes] button → opens PRs via GitHub API
  │
  ├── Section 2 — Bar chart (Recharts):
  │     X: environment names | Y: $/month
  │     Tooltip: breakdown (compute/network/storage)
  │     DATA SOURCE: projects.estimated_monthly_cost
  │
  ├── Section 3 — Savings table:
  │     Severity | Description | Affected Resource | Saving | Action
  │     [Fix] button → calls /functions/v1/coie-fix → opens PR
  │     DATA SOURCE: findings WHERE dimension='cost' AND status='open'
  │     REALTIME: yes — new findings appear as COIE runs
  │
  └── Section 4 — Cost history (Recharts AreaChart):
       30-day cost trend
       DATA SOURCE: org_usage (30 days)

[Tab: Monitoring]
  ├── 4 Recharts charts in 2×2 grid:
  │     CPU % over 24h | Memory % over 24h | Requests/sec | Latency p99
  │     DATA SOURCE: cluster_metrics WHERE cluster_id = active AND sampled_at > NOW()-24h
  │     LOADING STATE: 4 SkeletonChart components
  │     EMPTY STATE: "No metrics yet. Agent must be running."
  └── DATA: pulled via useMetrics() hook, no realtime (60s polling)

[Tab: Logs]
  ├── Pod selector dropdown (from cluster namespaces)
  ├── Level filter: [All] [Error] [Warn] [Info] [Debug]
  ├── "Live" toggle (auto-scroll)
  ├── Log lines with color coding:
  │     Error: red | Warn: amber | Info: blue | Debug: gray
  ├── DATA SOURCE: pod_logs WHERE project_id = active AND logged_at > NOW()-24h
  └── REALTIME: yes — Supabase Realtime subscription on pod_logs INSERT

[Tab: Settings]
  ├── Sub-tabs: General | Cloud | Integrations | Notifications | Team | Billing
  │
  ├── Cloud tab:
  │     ├── Shows connected cloud credentials
  │     ├── "Add Cloud Account" button → calls aws-assume-role flow
  │     └── "Remove" → blocked if any live environment uses this credential
  │
  ├── Integrations tab:
  │     ├── GitHub: [status] [Connect/Disconnect]
  │     ├── Slack: [Connect] → OAuth flow
  │     ├── PagerDuty: [API key input] [Test] [Save]
  │     └── Custom Webhook: [URL] [Secret] [Events checkboxes]
  │
  ├── Notifications tab:
  │     Toggles for: Deploy success | Deploy failure | Incident detected |
  │                  Score changed | Weekly digest | Cost alert
  │     Channels: Email | Slack | PagerDuty
  │
  ├── Team tab:
  │     ├── Member list from org_members JOIN auth.users
  │     ├── "Invite member" → calls /functions/v1/invite-member
  │     │     ↓ Resend sends invitation email ← MUST FIRE
  │     └── Role selector: Owner | Admin | Developer | Viewer
  │
  └── Billing tab:
       ├── Current plan: [Free Trial — 11 days remaining] / [Pro] / [Team]
       ├── [Upgrade to Pro] button → calls /functions/v1/stripe-checkout
       │     ↓ redirects to Stripe Checkout
       │     ↓ on success: stripe-webhook fires → org plan updated
       ├── Past invoices table from invoices DB table
       └── [Manage Billing] → calls /functions/v1/stripe-portal → Stripe Portal
```

---

## UX FLOW 4 — INCIDENT DETECTION (AUTOMATIC)

```
A pod in the user's cluster crashes with OOMKill.

[Agent detects it]
  ↓ K8s event watcher sees OOMKilling event
  ↓ Agent calls POST /functions/v1/agent-heartbeat with incident bundle
  ↓ Edge Function inserts row into incidents table (status='detected')

[AIRE fires]
  ↓ Supabase DB webhook triggers aire-detect Edge Function on incidents INSERT
  ↓ aire-detect:
      1. Fetches incident + log_excerpts
      2. Runs keyword matching against incident_patterns
      3. If confidence < 0.7: calls NVIDIA API for LLM diagnosis (RULE U1 cached)
      4. Updates incidents row:
           status = 'diagnosed'
           root_cause = "Pod exceeded memory limit of 512Mi..."
           immediate_action = "Restart pod / increase memory limit"
           permanent_fix = "Update deployment.yaml memory: 768Mi"
      5. Calls send-notification Edge Function

[send-notification fires]
  ↓ Checks notification_prefs for this user
  ↓ Checks Resend daily quota (Redis key email:quota:YYYY-MM-DD)
  ↓ If quota < 90: sends email via Resend ← MUST FIRE
  ↓ If Slack connected: posts to configured channel
  ↓ If PagerDuty connected: triggers incident via Events API

[User sees it]
  ↓ Dashboard notification bell shows red badge
  ↓ IncidentsTab updates via Supabase Realtime subscription (INSERT on incidents)
  ↓ New incident row appears WITHOUT page refresh
  ↓ User clicks incident → sees full RCA:
       Trigger: oom_kill
       Affected: api-deployment
       Root cause: "Pod consumed 512Mi+ of memory due to memory leak in request handler"
       Immediate action: "kubectl rollout restart deployment/api"
       Permanent fix: "Increase memory limit to 768Mi (PR #47 already opened)"
       PR URL: link to GitHub PR (if AIRE opened one)
  ↓ User can click [Approve Auto-Fix] → merges PR → ArgoCD applies fix
```

---

## UX FLOW 5 — COIE COST OPTIMIZATION (AUTOMATIC)

```
[pg_cron fires every 5 minutes]
  ↓ Calls coie-cycle Edge Function for each cluster WHERE agent_status='connected'
  ↓ coie-cycle:
      1. Reads cluster_metrics (last 7 days, via idx_cluster_metrics_time)
      2. Compares actual CPU/memory usage vs requested resources
      3. Generates findings (CPU overprovisioned, idle staging, etc.)
      4. Calculates health scores (Security/Reliability/Cost/Performance)
      5. Inserts/updates:
           findings table (new cost/security/performance/reliability issues)
           clusters table (updated health scores)
           cluster_scores table (time-series record)
      6. Calls send-notification if score dropped significantly

[User sees it]
  ↓ Overview tab score cards animate to new values (Supabase Realtime on clusters UPDATE)
  ↓ Cost tab savings table gets new rows (Supabase Realtime on findings INSERT)
  ↓ Dashboard activity feed: "💰 COIE: $12/mo savings found" appears
```

---

# ══════════════════════════════════════════════════════════════════
# PART 2 — THIRD-PARTY INTEGRATIONS: WIRING VERIFICATION
# ══════════════════════════════════════════════════════════════════

## INTEGRATION 1 — SUPABASE AUTH

The audit says auth is "Supabase Auth (GoTrue)" but raises doubt about whether
`user_metadata.org_id` is actually set. Here is the complete wiring spec:

### auth-hook must do these exact things IN ORDER:

```typescript
// supabase/functions/auth-hook/index.ts
// TRIGGERED BY: Supabase Auth → Authentication → Hooks → on user signup

// 1. Parse incoming user from Supabase auth event
const { user } = await req.json()

// 2. Create organization
const { data: org } = await supabaseAdmin
  .from('organizations')
  .insert({ name: orgName, slug: orgSlug, plan: 'free' })
  .select().single()

// 3. Create org_members record
await supabaseAdmin.from('org_members')
  .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

// 4. Create 14-day Pro trial subscription
await supabaseAdmin.from('subscriptions')
  .insert({ org_id: org.id, plan: 'pro', status: 'trialing',
    trial_ends_at: new Date(Date.now() + 14*86400*1000).toISOString() })

// 5. Create plan_usage record
await supabaseAdmin.from('plan_usage')
  .insert({ org_id: org.id, live_environments: 0, total_nodes: 0 })

// 6. Create notification_prefs with defaults
await supabaseAdmin.from('notification_prefs')
  .insert({ user_id: user.id })

// 7. *** THE CRITICAL CALL *** — sets org_id in JWT user_metadata
await supabaseAdmin.auth.admin.updateUserById(user.id, {
  user_metadata: {
    org_id: org.id,        // ← ALL RLS policies depend on this
    org_slug: org.slug,
    role: 'owner',
    full_name: user.user_metadata?.full_name || user.email.split('@')[0]
  }
})

// 8. Send welcome email via Resend (non-blocking)
fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'welcome', recipient_email: user.email, ... })
}).catch(() => {})  // never block signup on email failure
```

### VERIFICATION TEST:
```bash
# After registering auth-hook in Dashboard → Authentication → Hooks:
NEW_USER=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify-'$(date +%s)'@test.io","password":"Test123!","options":{"data":{"organization_name":"Test Corp"}}}')

ORG_ID=$(echo $NEW_USER | jq -r '.user.user_metadata.org_id')
echo "org_id: $ORG_ID"
# MUST return a UUID. If null: auth-hook not running or not setting user_metadata.
```

### Frontend auth wiring (useAuth.jsx):
```javascript
// src/hooks/useAuth.jsx — complete wiring
import { supabase } from '../lib/supabase'
import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        // Wire Sentry and PostHog on session restore
        Sentry.setUser({ id: session.user.id, email: session.user.email })
        posthog.identify(session.user.id, {
          email: session.user.email,
          org_id: session.user.user_metadata?.org_id,
          plan: session.user.user_metadata?.plan || 'free'
        })
      }
      setLoading(false)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        Sentry.setUser({ id: session.user.id, email: session.user.email })
        posthog.identify(session.user.id, {
          email: session.user.email,
          org_id: session.user.user_metadata?.org_id,
        })
        posthog.capture('login', { method: event })
      }
      if (event === 'SIGNED_OUT') {
        setUser(null)
        Sentry.setUser(null)
        posthog.reset()
      }
    })

    return () => subscription.unsubscribe()  // RULE D4: always cleanup
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email, password, fullName, orgName) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, organization_name: orgName } }
    })
    if (error) throw error
    posthog.capture('signup', { method: 'email' })
  }

  const signInWithGitHub = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) throw error
    posthog.capture('signup', { method: 'github' })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return { user, loading, signIn, signUp, signInWithGitHub, signOut }
}
```

---

## INTEGRATION 2 — RESEND (EMAIL)

### Email types that MUST fire:

| Type | Trigger | Template content |
|------|---------|-----------------|
| `welcome` | auth-hook on signup | Welcome + "Connect your AWS account" CTA |
| `deployment_live` | deploy pipeline complete | Live URL + infrastructure summary + cost |
| `deployment_failed` | deploy pipeline failed | What failed, which stage, retry link |
| `incident_detected` | AIRE diagnoses incident | Severity, root cause, immediate action, dashboard link |
| `incident_resolved` | incident.status = 'resolved' | What was fixed, how long it took |
| `payment_failed` | Stripe invoice.payment_failed | "Update your card" + Stripe portal link |
| `plan_downgraded` | Trial expired or payment failed | What changed, how to reactivate |
| `invite_member` | invite-member Edge Function | Invite link with 7-day expiry token |
| `weekly_digest` | pg_cron Sunday 9am UTC | Deployments, incidents, cost summary |
| `cost_spike` | cost-anomaly-check detects spike | How much over baseline, action to take |

### send-notification Edge Function — COMPLETE REQUIRED IMPLEMENTATION:
```typescript
// supabase/functions/send-notification/index.ts
// This is the ONLY function that sends emails. Nothing else calls Resend directly.

// Step 1: CORS
// Step 2: Auth (service role OR internal NOTIFICATION_SECRET header)
// Step 3: Parse type, org_id, recipient_email, recipient_name, payload
// Step 4: Resend daily quota check (Redis key email:quota:YYYY-MM-DD)
//         If count >= 90: log to Sentry, return { success: false, reason: 'quota_exceeded' }
//         If count < 90: increment counter (redis.incr with 86400 TTL)
// Step 5: Per-notification-type cooldown check (30-min window for repeat alerts)
//         key = notif:cooldown:{org_id}:{cluster_id}:{type}
//         If key exists: return { success: false, reason: 'cooldown_active' }
// Step 6: Fetch user notification_prefs for this org
//         If channel_email = false: skip email
// Step 7: Render HTML template based on type
// Step 8: Call Resend API:
//         POST https://api.resend.com/emails
//         from: 'AutoStack <noreply@autostack.io>'
//         to: recipient_email
//         subject: [type-specific]
//         html: [rendered template]
// Step 9: Set cooldown key in Redis (RULE B5: with TTL)
// Step 10: Return { success: true, email_id: resend_response.id }
```

### VERIFICATION:
```bash
# Test welcome email:
curl -s -X POST "$SUPABASE_URL/functions/v1/send-notification" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "welcome",
    "recipient_email": "your-real-email@domain.com",
    "recipient_name": "Test User",
    "payload": { "org_name": "Test Corp" }
  }' | jq .
# VERIFY: email arrives in inbox within 60 seconds
# NOT just: { "success": true } returned from the function (that can be faked)
# ACTUAL email in actual inbox = verified
```

---

## INTEGRATION 3 — POSTHOG (ANALYTICS)

### PostHog must be initialized correctly:
```javascript
// src/lib/analytics.js — complete implementation
import posthog from 'posthog-js'

// Initialize once on app startup
posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
  capture_pageview: true,       // automatic page views
  capture_pageleave: true,      // track bounces
  session_recording: {
    maskAllInputs: true,        // mask passwords and sensitive fields
  },
  disable_session_recording: import.meta.env.DEV,  // no recording in dev
  loaded: (ph) => {
    if (import.meta.env.DEV) ph.opt_out_capturing()  // no analytics in dev
  }
})

export const analytics = {
  identify: (userId, properties) => posthog.identify(userId, properties),
  reset: () => posthog.reset(),  // call on logout
  capture: (event, properties) => posthog.capture(event, properties),
}
```

### Events that MUST fire (wire these — currently 0 are firing):
```javascript
// Acquisition
posthog.capture('signup', { method: 'email' | 'github' })
posthog.capture('login', { method: 'email' | 'github' })

// Activation
posthog.capture('cloud_connected', { provider: 'aws' | 'gcp' | 'azure' })
posthog.capture('deploy_initiated', { env: 'production', size: 'small' })
posthog.capture('first_deploy_complete', { duration_seconds: N })
posthog.capture('dashboard_tab_viewed', { tab: 'overview' | 'cost' | 'monitoring' | ... })

// Engagement
posthog.capture('coie_fix_applied', { savings_usd: N })
posthog.capture('incident_viewed', { severity: 'high' | 'critical' })
posthog.capture('redeploy_triggered')
posthog.capture('rollback_triggered')

// Revenue
posthog.capture('upgrade_cta_clicked', { from_plan: 'free', to_plan: 'pro' })
posthog.capture('checkout_completed', { plan: 'pro', billing: 'monthly' })
posthog.capture('subscription_canceled')

// Retention
posthog.capture('environment_deleted', { had_live_deployments: true | false })
```

### VERIFICATION:
```bash
# After wiring PostHog, sign up with a new account
# Then check: https://app.posthog.com → Events → filter by 'signup'
# MUST see the event with correct properties within 30 seconds
# NOT just "posthog.init() called" = verified
# ACTUAL event in PostHog dashboard = verified
```

---

## INTEGRATION 4 — SENTRY (ERROR TRACKING)

### Sentry initialization:
```javascript
// src/main.jsx — top of file, before React renders
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,    // 'development' | 'production'
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  beforeSend(event) {
    // Never send errors from development
    if (import.meta.env.DEV) return null
    return event
  }
})
```

### CRITICAL: Sentry.setUser() MUST be called after login:
```javascript
// In useAuth.jsx — on SIGNED_IN event AND on session restore:
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.user_metadata?.full_name,
})

// On SIGNED_OUT:
Sentry.setUser(null)
```

Without `setUser()`, ALL Sentry errors are anonymous and useless for debugging.

### App wrapper in main.jsx:
```javascript
// Wrap entire app in Sentry error boundary
root.render(
  <Sentry.ErrorBoundary fallback={<GlobalErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>
)
```

### VERIFICATION:
```bash
# 1. Log in to the app
# 2. Open browser console
# 3. Run: Sentry.captureMessage('test-sentry-user-wired')
# 4. Check https://sentry.io → Issues → filter for 'test-sentry-user-wired'
# MUST show: User: your@email.com (not "Anonymous")
# NOT just: error captured with null user = verified
```

---

## INTEGRATION 5 — UPSTASH REDIS (RATE LIMITING + CACHING)

### Upstash must be used for THESE exact things (currently only partially wired):

```
1. Rate limiting — ALL 23+ Edge Functions
   Pattern: sliding window via sorted sets
   Key: rl:{function-name}:{user_id|org_id|cluster_id}
   TTL: always set (RULE B5)

2. Email quota — daily Resend limit enforcement
   Key: email:quota:YYYY-MM-DD
   Max value: 90 (hard stop before 100/day Resend limit)
   TTL: 86400 (1 day)

3. Notification cooldown — prevent spam
   Key: notif:cooldown:{org_id}:{cluster_id}:{type}
   TTL: 1800 (30 minutes per notification type per cluster)

4. GitHub installation tokens — cache to avoid rate limits
   Key: github:install:token:{installation_id}
   TTL: 3000 (50 minutes — tokens expire in 60)

5. AI/LLM response cache
   Key: llm:chat:{sha256 of prompt+context fingerprint}
   TTL: 86400 (24 hours)

6. Stripe event idempotency
   Key: stripe:event:{stripe_event_id}
   TTL: 86400 (24 hours)
```

### redis.js shared module — must be imported by all functions that need Redis:
```typescript
// supabase/functions/_shared/redis.ts
import { Redis } from 'https://esm.sh/@upstash/redis@1'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
      token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
    })
  }
  return _redis
}

// RULE B5: Every set MUST have a TTL
export async function safeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!ttlSeconds || ttlSeconds <= 0) {
    throw new Error(`RULE B5 VIOLATION: Redis key "${key}" has no TTL. Every key must expire.`)
  }
  await getRedis().set(key, JSON.stringify(value), { ex: ttlSeconds })
}
```

### VERIFICATION:
```bash
# After implementing rate limiting on die-analyze:
# Hit it 4 times in a row (limit is 3 per hour)
for i in 1 2 3 4; do
  echo "Request $i:"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" \
    -X POST "$SUPABASE_URL/functions/v1/die-analyze" \
    -H "Authorization: Bearer $TEST_JWT" \
    -H "Content-Type: application/json" \
    -d '{"project_id": "fake", "credential_id": "fake"}'
done
# EXPECTED: 400 400 400 429
# 4th request MUST return 429 with Retry-After header
# Then verify the key exists in Upstash console with a TTL > 0
```

---

# ══════════════════════════════════════════════════════════════════
# PART 3 — API FLOWS: EVERY ENDPOINT DEFINED
# ══════════════════════════════════════════════════════════════════

## API Flow 1: Signup → Org Creation

```
Client                    Supabase Auth         auth-hook              DB
  |                           |                     |                    |
  |-- POST /auth/v1/signup -->|                     |                    |
  |   { email, password,      |                     |                    |
  |     options.data:         |-- fires hook ------>|                    |
  |     { full_name, org } }  |                     |-- INSERT orgs ---->|
  |                           |                     |-- INSERT members-->|
  |                           |                     |-- INSERT subs ---->|
  |                           |                     |-- INSERT prefs --->|
  |                           |                     |-- updateUserById ->|
  |                           |<--- hook response --|   user_metadata    |
  |<-- 200 { access_token,    |     { org_id: uuid }|   .org_id = uuid   |
  |     user: {               |                     |                    |
  |       user_metadata: {    |                     |-- send-notification|
  |         org_id: "uuid"    |                     |   (welcome email)  |
  |       }}}                 |                     |                    |
```

## API Flow 2: Deploy (Repo → Live URL)

```
Client                  die-analyze           infra-provision        AWS
  |                         |                       |                  |
  |-- POST /die-analyze --> |                       |                  |
  |   { project_id,         |                       |                  |
  |     credential_id }     |-- 1. clone repo ----->|                  |
  |                         |   2. detect language   |                  |
  |                         |   3. gen Dockerfile    |                  |
  |                         |-- 4. plan infra ------>|                  |
  |<-- 200 {                |   { totalMonthlyCost } |                  |
  |   status: 'waiting_     |                       |                  |
  |   confirm',             |                       |                  |
  |   infra_plan: {...} }   |                       |                  |
  |                         |                       |                  |
  |-- POST /infra-provision>|                       |                  |
  |   { confirmed: true }   |-- async via waitUntil>|                  |
  |<-- 202 Accepted         |                       |-- CreateVpc ----->|
  |                         |                       |-- CreateSubnets ->|
  |  [Realtime: subscribe   |                       |-- CreateIGW ----->|
  |   infrastructure_events]|                       |-- CreateNAT ----->|
  |                         |<-- progress events ---|-- CreateEKS ----->|
  |<-- SSE: stage updates   |   (broadcast to DB)   |   (12-15 min) ... |
  |   "Creating EKS..."     |                       |-- NodeGroup ----->|
  |   "Building Docker..."  |                       |-- ECR + Build --->|
  |   "ArgoCD sync..."      |                       |-- ArgoCD sync --->|
  |                         |                       |-- ALB health ---->|
  |<-- Realtime UPDATE      |                       |                  |
  |   projects.status='live'|                       |                  |
  |   projects.live_url=URL |                       |                  |
```

## API Flow 3: COIE Cycle (Automatic, every 5 minutes)

```
pg_cron                coie-cycle              DB (reads)           DB (writes)
  |                        |                       |                    |
  |-- HTTP POST cron ----->|                       |                    |
  |   /coie-cycle          |                       |                    |
  |   { trigger:           |-- query clusters ----->|                    |
  |     'scheduled' }      |   WHERE               |                    |
  |                        |   agent_status=       |                    |
  |                        |   'connected'         |                    |
  |                        |                       |                    |
  |                        |-- for each cluster:   |                    |
  |                        |   query metrics 7d -->|                    |
  |                        |   query deployments ->|                    |
  |                        |   compute 4D scores   |                    |
  |                        |   find cost savings   |                    |
  |                        |                       |-- UPDATE clusters ->|
  |                        |                       |   health_score etc  |
  |                        |                       |-- INSERT findings ->|
  |                        |                       |-- INSERT scores --->|
  |                        |                       |                    |
  |                        |-- if score dropped:   |                    |
  |                        |   send-notification   |                    |
  |                        |   (Resend email)      |                    |
  |                        |                       |                    |
  |                        |   Supabase Realtime broadcasts             |
  |                        |   → Dashboard scores update live           |
```

## API Flow 4: Stripe Billing (Upgrade to Pro)

```
Client               stripe-checkout          Stripe              stripe-webhook
  |                        |                    |                       |
  |-- POST /stripe-checkout|                    |                       |
  |   { price_id, urls }   |-- verify price_id  |                       |
  |                        |   (from env secrets)|                       |
  |                        |-- check plan limit  |                       |
  |                        |   (RULE K2)        |                       |
  |                        |-- create customer  |                       |
  |                        |   if first time -->|                       |
  |                        |-- create checkout  |                       |
  |                        |   session -------->|                       |
  |<-- { checkout_url }    |                    |                       |
  |                        |                    |                       |
  |-- redirect to Stripe --+-->                 |                       |
  |   Checkout page        |   user enters card |                       |
  |                        |   data             |                       |
  |                        |<-- success redirect|                       |
  |<-- /dashboard?payment= |                    |-- webhook fires ----->|
  |   success              |                    |   checkout.session    |
  |                        |                    |   .completed          |
  |                        |                    |                       |-- idempotency check
  |                        |                    |                       |   (Redis: event ID)
  |                        |                    |                       |-- UPDATE subscriptions
  |                        |                    |                       |-- UPDATE organizations
  |                        |                    |                       |   plan = 'pro'
  |                        |                    |                       |-- send-notification
  |                        |                    |                       |   plan_upgraded email
  |                        |                    |                       |
  |   Realtime fires:      |                    |                       |
  |   BillingTab updates   |                    |                       |
  |   to show Pro plan     |                    |                       |
```

---

# ══════════════════════════════════════════════════════════════════
# PART 4 — COMPONENT-BY-COMPONENT VERIFICATION CHECKLIST
# Run every item. Print ✅ or ❌. Fix every ❌ before shipping.
# ══════════════════════════════════════════════════════════════════

## AUTHENTICATION
```
□ Signup → user_metadata.org_id is a UUID (not null, not "undefined")
□ Login → Sentry.setUser() fires (check Sentry — user appears as email, not anonymous)
□ Login → posthog.identify() fires (check PostHog — user identified)
□ Login → posthog.capture('login') fires (check PostHog events)
□ Logout → posthog.reset() fires (check PostHog — user deidentified)
□ Logout → Sentry.setUser(null) fires
□ Session restore (page refresh while logged in) → user still authenticated, no flash
□ No org_id in token → user redirected to /login with error (not infinite loop)
□ AuthGuard shows spinner during session check (not blank page)
□ GitHub OAuth → same auth-hook fires → same org creation → same user_metadata
```

## SUPABASE REALTIME (must work without page refresh)
```
□ New deployment created → DeploymentsTab row appears within 3 seconds
□ COIE cycle runs → Overview score cards animate to new values within 3 seconds
□ New incident detected → notification bell badge increments within 3 seconds
□ New cost finding → CostTab savings table row appears within 3 seconds
□ Pod log ingested → LogsTab new line appears (if on that tab)
□ All realtime subscriptions: useEffect cleanup returns () => supabase.removeChannel()
□ After 20 tab switches: verify no duplicate subscriptions (check browser memory)
```

## RESEND EMAILS (check actual inbox, not just function response)
```
□ Signup → welcome email arrives in inbox within 60 seconds
□ Deploy success → deployment_live email arrives in inbox
□ Deploy failure → deployment_failed email arrives
□ AIRE incident → incident_detected email arrives
□ Team invite → invite email arrives with working invite link
□ Stripe payment failed → payment_failed email arrives
□ Email quota at 95/100 (set Redis key manually) → next email blocked gracefully
□ User with channel_email=false → no email sent (check Resend logs: 0 sends)
```

## POSTHOG EVENTS (check PostHog dashboard)
```
□ posthog.capture('signup') fires on new account creation
□ posthog.capture('login') fires on login
□ posthog.capture('cloud_connected') fires after IAM verification
□ posthog.capture('deploy_initiated') fires when user clicks "Confirm & Provision"
□ posthog.capture('first_deploy_complete') fires when live URL returned
□ posthog.capture('dashboard_tab_viewed', { tab: '...' }) fires on each tab visit
□ posthog.capture('upgrade_cta_clicked') fires when "Upgrade to Pro" clicked
```

## SENTRY (check Sentry dashboard)
```
□ Sentry.init() called before React render
□ App wrapped in Sentry.ErrorBoundary
□ Sentry.setUser() called after login — errors show email not "Anonymous"
□ Trigger a test error → appears in Sentry with user email
□ tracesSampleRate = 0.1 in production (not 1.0 — that's expensive)
□ beforeSend returns null in development (no dev errors polluting Sentry)
```

## UPSTASH REDIS (verify keys exist with TTLs)
```
□ After 4 rapid calls to die-analyze: 4th returns HTTP 429
□ Retry-After header present on 429 response
□ Check Upstash console: rl:die-analyze:{org_id} key has TTL > 0
□ After sending 90+ emails: send-notification returns quota_exceeded
□ Check Upstash console: email:quota:YYYY-MM-DD key has TTL ~86400
□ After GitHub App install: github:install:token:{id} key has TTL ~3000
□ No keys with TTL = -1 (persistent keys with no expiry = RULE B5 violation)
```

## STRIPE (check Stripe Dashboard)
```
□ Click "Upgrade to Pro" → Stripe Checkout opens (correct price, correct plan)
□ Complete checkout with test card 4242 4242 4242 4242
  → subscription row in DB: status='active', plan='pro'
  → organizations row: plan='pro'
  → dashboard shows Pro plan
  → plan_upgraded email received
□ Replay checkout.session.completed event → idempotency: no duplicate row
□ Simulate payment failure (test card 4000 0000 0000 0341)
  → subscription status='past_due'
  → payment_failed email received
  → past-due banner visible in dashboard
□ Stripe Customer Portal: "Manage Billing" button opens portal
□ Cancel via portal → subscription canceled → plan downgraded to free
```

## AWS PROVISIONING (real AWS, not simulation)
```
□ die-analyze: returns detected language, framework, port for the test repo
□ die-analyze: returns infra_plan with real dollar amounts
□ infra-provision: VPC created in AWS Console (verify by navigating to VPC console)
□ infra-provision: EKS cluster ACTIVE in AWS Console (verify: AWS → EKS → Clusters)
□ infra-provision: ECR repository visible in AWS Console
□ infra-provision: ALB visible in AWS Console → EC2 → Load Balancers
□ deploy: Docker image pushed to ECR (check ECR → Images)
□ deploy: ArgoCD Application shows Synced + Healthy
□ deploy: live_url returns HTTP 200
□ deploy: live_url returns JSON with { healthy: true }
□ ALL resources: tagged with autostack:project_id = {project_id}
□ infra-teardown: ALL above resources gone after teardown
□ infra-teardown: 0 resources found by tag search after teardown
```

## AGENT (Go binary)
```
□ Helm command generated by connect-cluster actually works:
  helm repo add autostack https://charts.autostack.io
  helm install autostack-agent autostack/agent --set agent.token=... --set agent.clusterID=...
  → IF helm chart does not exist yet: mark this as a known gap, document it
□ Agent registers → cluster.agent_status = 'connected' within 60 seconds
□ cluster_metrics rows appear every 60 seconds after agent connects
□ Manually kill a pod → incidents row created within 30 seconds
□ Agent disconnected (kill pod) → cluster.agent_status = 'disconnected' within 3 min
```

---

# ══════════════════════════════════════════════════════════════════
# PART 5 — KNOWN GAPS FROM THE SUPREME AUDIT (HONEST LIST)
# ══════════════════════════════════════════════════════════════════

These gaps were admitted in the Supreme Audit. They are NOT marked as done.
Do not claim these are working. Document them honestly.

## GAP 1: Go Agent Binary — NOT BUILT
```
Status: ❌ Does not exist
Impact: Cluster metrics, incident detection, real logs — all fake/simulated
What to show users: "Agent binary coming soon. Deploy with: [helm command]"
                    (even if the helm chart doesn't exist yet — be honest)
Workaround for demo: Manual insertion of cluster_metrics rows via Supabase dashboard
NOT ACCEPTABLE: Claiming the agent is working when it isn't
```

## GAP 2: DIE Auto-Remediation (PR generation) — MOCKED
```
Status: 🟡 Logic exists, PR generation is placeholder (pr_url stays null)
Impact: "Fix" buttons exist but don't open real GitHub PRs
What to show users: Fix buttons visible, clicking shows "PR generation coming soon"
NOT ACCEPTABLE: Showing pr_url: "https://github.com/..." when it's a fake URL
```

## GAP 3: Helm Chart Repository — DOES NOT EXIST
```
Status: ❌ charts.autostack.io domain + chart repo not created
Impact: The helm install command in onboarding step 2 fails silently
Fix: Either create the Helm chart repo OR change onboarding to kubectl apply
     with manifests downloaded from autostack.io
```

## GAP 4: Marketplace UI — GALLERY ONLY
```
Status: 🟡 UI exists, deploy buttons don't work end-to-end
Impact: Users can browse templates but cannot deploy them
What to show users: Gallery works, "Deploy" buttons open the standard deploy modal
                    with the template's repo URL pre-filled
```

## GAP 5: GitHub 404 on sub-repos — INTERMITTENT
```
Status: 🔴 Known bug, intermittent
Trigger: GitHub App not installed on a specific sub-repo (only on the org)
Fix: Add clear error message: "Please install the AutoStack GitHub App on this specific repo →"
     with a direct link to the GitHub App installation page scoped to that repo
```

---

# ══════════════════════════════════════════════════════════════════
# PART 6 — THE "ONE CLICK DEPLOY" VERIFICATION
# This is the core product promise. Run this manually. Time it.
# ══════════════════════════════════════════════════════════════════

```
TIMER STARTS: when user clicks "Confirm & Provision" in onboarding step 2

Expected sequence (with real timestamps):
  T+0s:    infra-provision called, returns 202
  T+5s:    VPC created (infrastructure_events: "✓ VPC created")
  T+15s:   Subnets created (infrastructure_events: "✓ Subnets created")
  T+20s:   Internet Gateway + NAT Gateway started
  T+80s:   NAT Gateway available (infrastructure_events: "✓ NAT gateway active")
  T+90s:   Security groups + IAM roles created
  T+120s:  EKS cluster creation started (infrastructure_events: "⟳ Creating EKS cluster...")
  T+780s:  EKS cluster ACTIVE (13 minutes — this is AWS's timing, not ours)
  T+840s:  Node group ACTIVE (infrastructure_events: "✓ Worker nodes ready")
  T+870s:  ECR repo created (infrastructure_events: "✓ Container registry ready")
  T+900s:  CodeBuild build started (infrastructure_events: "⟳ Building Docker image...")
  T+960s:  Docker image pushed to ECR (infrastructure_events: "✓ Image pushed")
  T+975s:  K8s manifests committed to repo (infrastructure_events: "✓ Manifests committed")
  T+990s:  ArgoCD synced (infrastructure_events: "✓ ArgoCD synchronized")
  T+1020s: ALB health check passing (infrastructure_events: "✓ Load balancer healthy")
  T+1020s: live_url populated in projects table
  T+1020s: Onboarding Step 3 shows: "Your app is live! 🎉"

TOTAL: ~17 minutes (EKS cluster creation dominates)
TARGET: < 15 minutes (possible with pre-provisioned control planes)

VERDICT CRITERIA:
  ✅ PASS: live_url returns HTTP 200 with { healthy: true }
  ✅ PASS: All resources tagged with autostack:project_id
  ✅ PASS: infra-teardown removes all resources (0 orphans)
  ❌ FAIL: Any step fails without clear error message
  ❌ FAIL: User is left staring at a spinner with no status updates
  ❌ FAIL: live_url is null or returns non-200
```

---

# FINAL MANDATE

After implementing everything in this document, run this exact verification:

```bash
# Create fresh test account (simulate a brand new user)
NEW_EMAIL="prod-verify-$(date +%s)@autostack-test.io"

# 1. Signup
SIGNUP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$NEW_EMAIL\",\"password\":\"Test123!\",\"options\":{\"data\":{\"organization_name\":\"Prod Verify Corp\"}}}")
ORG_ID=$(echo $SIGNUP | jq -r '.user.user_metadata.org_id')
JWT=$(echo $SIGNUP | jq -r '.access_token')

echo "org_id: $ORG_ID"
[ -z "$ORG_ID" ] || [ "$ORG_ID" = "null" ] && echo "❌ FAIL: auth-hook broken" && exit 1
echo "✅ auth-hook working"

# 2. Check welcome email in inbox (manual — cannot automate this check)
echo "CHECK: welcome email for $NEW_EMAIL in inbox within 60 seconds"

# 3. Verify IAM role
CRED=$(curl -s -X POST "$SUPABASE_URL/functions/v1/aws-assume-role" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"account_id\":\"$AWS_ACCOUNT_ID\",\"region\":\"$AWS_REGION\",\"role_arn\":\"$AUTOSTACK_ROLE_ARN\"}")
echo "IAM verify: $(echo $CRED | jq -r '{success,permissions_ok}')"

# 4. Full deploy (this takes ~17 minutes)
# [runs the full E2E deploy from Part 6]

# 5. Verify live URL
curl -s "$LIVE_URL/health" | jq .
# MUST return: {"healthy":true,...}

# 6. Verify teardown
# [runs infra-teardown, verifies 0 orphans]

echo "=== PRODUCTION VERIFICATION COMPLETE ==="
```

Until every item in the component verification checklist above shows ✅,
the diagnostic report's "100% READY FOR PRODUCTION" claim is false.
This document is the real checklist. Use it.
