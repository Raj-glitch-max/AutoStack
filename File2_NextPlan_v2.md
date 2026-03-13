# ╔══════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — MASTER BUILD PLAN TO PRODUCTION v2.0             ║
# ║   Based on Actual State: 2026-03-13                             ║
# ║   Infrastructure: Built. AI Logic: Next. Agent: Final.         ║
# ╚══════════════════════════════════════════════════════════════════╝

---

# PREAMBLE — THE HONEST STARTING POINT

Based on the technical report from Antigravity, here is the **real** starting position:

**What is genuinely done and stable:**
- Frontend shell: 95% production quality. React 19, Vite 7, Tailwind 4, full component library, all 7 dashboard tabs, realtime subscriptions, error boundaries, lazy loading, animations, onboarding wizard.
- Backend infrastructure: 16 tables, RLS policies, 9 Edge Functions deployed, Supabase Auth, pgvector extension, pg_cron extension.
- All third-party services connected: PostHog, Sentry, Resend, Upstash Redis.

**What is "deployed but shallow" — the real work ahead:**
- COIE scoring: static rules implemented but reads simulated/hardcoded values, not real cluster metrics
- AIRE pattern matching: keyword-based, pgvector not connected to any embedding model
- DIE engine: the field `pr_url` exists in the database and stays null — no actual PR is ever opened
- Logs tab: live simulation only — zero backend persistence
- Agent binary: does not exist at all
- Token lifecycle: no rotation, no invalidation, no security on the agent connection

**The mission for this document:**
Close every shallow implementation. Build the AI logic to be real. Build the agent. Ship v1.0.

---

# PART 1 — NON-NEGOTIABLE RULES FOR THE ENTIRE PROJECT

These apply to every single line of code, every PR, every migration, every Edge Function.
The AI IDE must follow all of them. No exceptions. No "I'll fix it in the next PR."

---

## RULE GROUP A — WHAT TO NEVER DO (HARD PROHIBITIONS)

**A1 — NEVER use `SUPABASE_SERVICE_ROLE_KEY` in any file under `/src/`.**
It belongs ONLY in Edge Function environment variables. If it ever appears in frontend code, that is a P0 security breach. Stop everything and rotate the key.

**A2 — NEVER write a Supabase query without a `limit()` clause.**
No exceptions. Time-series tables (`cluster_metrics`, `cluster_scores`) will reach millions of rows. An unbounded query at that scale will timeout and potentially exhaust the free tier bandwidth in one request.

**A3 — NEVER call a paid external API (OpenAI, Resend, any LLM) without a Redis cache check first.**
Pattern: hash the input → check Redis → if hit, return cached → if miss, call API, cache result, return. Cache TTL for LLM responses: 24 hours minimum. This is non-negotiable for staying on the free tier.

**A4 — NEVER send an email without checking the daily Resend quota counter in Upstash first.**
The quota counter key is `email:quota:YYYY-MM-DD`. If value >= 90, log to Sentry, do not send, return gracefully. The user's flow must NOT break because an email failed to send.

**A5 — NEVER set a Redis key without an expiry (`ex` parameter).**
Every `redis.set()` must have `{ ex: N }` where N is the TTL in seconds. Persistent Redis keys will fill the 256MB free tier and start costing money.

**A6 — NEVER write a Supabase realtime subscription without a `return () => supabase.removeChannel(channel)` in the useEffect cleanup.**
A missing cleanup means every tab switch creates a new subscription without closing the old one. After 10 tab switches, 10 duplicate subscriptions are running. This degrades performance and burns through the Supabase Realtime free tier.

**A7 — NEVER deploy directly to the `main` branch.**
Every change goes through a feature branch → PR → develop → PR → main. See Part 2 for the full Git strategy.

**A8 — NEVER leave `console.log` in production code.**
Development logs must be wrapped: `if (import.meta.env.DEV) console.log(...)`. Search for bare `console.log` before every merge.

**A9 — NEVER make a database migration that is not idempotent.**
Use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. A migration must be safe to run twice without error.

**A10 — NEVER render a UI component that fetches data without three states: loading, empty, and error.**
Every component that calls a hook must handle: skeleton while loading, EmptyState when data is empty, error message with retry when fetch fails. A white blank space is not acceptable.

**A11 — NEVER add a new npm package without checking three things:**
1. What is its minified bundle size? If it adds >50KB for a rarely-used feature, find a smaller alternative.
2. Is it actively maintained? (last commit within 6 months)
3. Can native browser APIs or existing dependencies already do the job?

**A12 — NEVER skip the verification test at the end of each phase.**
The test is part of the deliverable. "It looks like it works" is not the same as "I ran the test steps and confirmed it works."

---

## RULE GROUP B — WHAT TO ALWAYS DO (MANDATORY PRACTICES)

**B1 — Every Edge Function must have an OPTIONS handler for CORS preflight at the very top.**
Before any logic runs, check `if (req.method === 'OPTIONS') return corsResponse()`. A missing OPTIONS handler causes browser requests to fail with CORS errors while curl tests pass — a very confusing failure mode.

**B2 — Every Edge Function must verify auth before doing any work.**
First thing after OPTIONS check: verify the JWT or agent token. If invalid: return 401 immediately. Log the failed attempt to Sentry. No processing before auth.

**B3 — Every user-visible error message must be human-readable.**
Map Supabase/Postgres error codes to sentences. Log the raw error to Sentry. Show the friendly version to the user. Never show `Error: 42P01` to a user.

**B4 — Every form field must validate on blur (when it loses focus), not just on submit.**
Show inline error text directly below the field that failed. On submit, focus the first invalid field automatically. This is the standard that the current form validation is not meeting.

**B5 — Every async operation must complete its loading state transition regardless of outcome.**
Pattern: `setLoading(true)` → try fetch → `setLoading(false)` in finally block. If loading is set to true but never to false on error, the user sees an infinite spinner.

**B6 — Every feature that is not fully implemented must be visually marked in the UI.**
Use a "Coming soon" badge or a disabled/grayed state. Never show a fully interactive UI that silently does nothing when clicked. The Logs tab "Historical" option and the DIE engine "Connect Repository" flow are current examples of this.

**B7 — The design system is frozen. No new color values, no new font weights, no new spacing units.**
Every color must come from the CSS custom properties defined in `:root`. Every spacing must be a multiple of 4px. If a design decision requires a new token, make that decision explicitly and update the token file — don't add a one-off inline value.

**B8 — All database migrations must be reviewed for index coverage before merging.**
Any new table with columns used in WHERE clauses must have indexes. Any query that touches a table with >10,000 projected rows must be explained with `EXPLAIN ANALYZE` before shipping.

---

# PART 2 — GIT & VERSION CONTROL SYSTEM

This section defines the complete branching, committing, and releasing strategy.
Follow it exactly. Every person on the project follows the same rules.

---

## 2.1 — Branch Architecture

```
main
  PURPOSE: Production. What is currently live on autostack.io.
  RULE: Never commit directly. Only merge via PR from release/* or hotfix/*.
  DEPLOYMENT: Vercel auto-deploys from main to production.
  PROTECTION: Enable branch protection in GitHub: require PR reviews, require status checks.

develop
  PURPOSE: Integration. What will be in the next release.
  RULE: All feature branches merge here first. Never commit directly.
  DEPLOYMENT: Vercel auto-deploys from develop to staging preview URL.
  REQUIREMENT: Must always be in a buildable, runnable state.

feature/[phase]-[description]
  PURPOSE: Individual feature or fix development.
  RULE: Branch off develop. Merge back to develop via PR.
  LIFESPAN: Lives until the feature is merged. Then deleted.
  NAMING: feature/phase3-coie-real-scoring (see naming rules below)

fix/[description]
  PURPOSE: Bug fixes found during development (not in production).
  RULE: Branch off develop. Merge back to develop via PR.
  EXAMPLES: fix/realtime-subscription-cleanup, fix/coie-missing-findings-insert

hotfix/[description]
  PURPOSE: Critical bugs found in production that cannot wait for the next release.
  RULE: Branch off MAIN. Merge into BOTH main AND develop via separate PRs.
  EXAMPLES: hotfix/auth-hook-github-oauth-missing, hotfix/rls-org-isolation-bypass
  NOTE: This is the only time you merge directly from a branch to main.

release/v[X.Y.Z]
  PURPOSE: Stabilization before a production release.
  RULE: Branch off develop when develop is ready to ship.
  ALLOWED CHANGES: Only bug fixes. No new features on a release branch.
  MERGE: Into main (production) AND back into develop (to capture any fixes).
  TAG: After merging to main, tag with `v[X.Y.Z]`.
```

---

## 2.2 — Branch Naming Convention

Format: `[type]/[phase-number]-[kebab-case-description]`

```
FEATURES (during active development phases):
  feature/phase3-coie-real-scoring
  feature/phase3-aire-openai-embeddings
  feature/phase3-notifications-engine
  feature/phase4-github-app-integration
  feature/phase4-die-repo-analyzer
  feature/phase4-coie-fix-pr-generation
  feature/phase5-agent-go-binary
  feature/phase5-helm-chart
  feature/phase6-security-hardening
  feature/phase6-log-persistence

FIXES (bugs found in development):
  fix/auth-hook-github-oauth
  fix/coie-missing-cluster-update
  fix/realtime-channel-leak-usedata
  fix/form-validation-password-regex
  fix/empty-state-projects-tab
  fix/sentry-sample-rate-production
  fix/redis-missing-ttl-keys

HOTFIXES (production emergencies only):
  hotfix/service-role-key-exposed
  hotfix/rls-policy-org-bypass
  hotfix/webhook-hmac-missing

RELEASES:
  release/v0.2.0
  release/v0.3.0
  release/v1.0.0
```

Rules:
- All lowercase. Hyphens only. No underscores. No spaces.
- Phase number in feature branches makes it immediately clear which build phase it belongs to.
- Description must be specific enough that you understand what it is without looking at the code.
- `fix/` is for development bugs. `hotfix/` is for production emergencies only.

---

## 2.3 — Commit Message Convention

Format: `[type]([scope]): [imperative description]`

Types and their meanings:
```
feat     — a new capability added that didn't exist before
fix      — corrects behavior that was broken or wrong
security — patches a security vulnerability
perf     — improves performance without changing behavior
refactor — changes code structure without changing behavior (no new features, no bug fixes)
style    — whitespace, formatting, missing semicolons — no logic changes
test     — adds or fixes tests
chore    — build tools, dependency updates, config changes
docs     — documentation only changes
revert   — reverts a previous commit (include the reverted commit hash in body)
```

Scopes (what part of the system):
```
auth        — authentication, sessions, AuthGuard
coie        — COIE scoring engine
aire        — AIRE incident detection engine
die         — DIE PR generation engine
agent       — agent binary, heartbeat, metrics ingestion
db          — database schema, migrations, RLS policies
realtime    — Supabase realtime subscriptions
hooks       — React data hooks in useData.js
ui          — component library changes
[tab-name]  — overview / projects / pipelines / monitoring / logs / settings / incidents
onboarding  — the 3-step onboarding wizard
email       — Resend templates and sending logic
redis       — Upstash usage and caching
analytics   — PostHog events
sentry      — error tracking setup
build       — vite.config.js, bundling, optimization
```

Good commit messages:
```
feat(coie): implement 4-dimension scoring with real deduction logic
feat(aire): add 10 keyword patterns with confidence scoring
fix(realtime): add missing channel cleanup in useCluster hook
security(webhook): add HMAC signature verification to github-webhook
fix(auth): handle GitHub OAuth event type in auth-hook
perf(db): add composite index on cluster_metrics sampled_at column
fix(coie): wire cluster score UPDATE after each evaluation cycle
feat(notifications): add Resend quota guard before every email send
fix(form): add password strength regex in SignupPage
chore(deps): add canvas-confetti 1.9.2 for onboarding step 3
```

Bad commit messages (never do these):
```
fix stuff
update
WIP
changes
fix bug
minor updates
added features
```

Rules:
- Imperative mood: "add", not "added" or "adding"
- Lowercase entire message
- No period at the end
- Keep the first line under 72 characters
- If more context is needed, add a blank line then a body paragraph
- `BREAKING CHANGE:` in the body if the commit changes any API contract or DB schema in a way that requires updates elsewhere

---

## 2.4 — Pull Request Rules

Every PR must have:

**Title:** Same format as commit message. `feat(coie): implement real metric-based scoring`

**Description template (use this every time):**
```markdown
## What changed
- [bullet point each change]
- [be specific — file names, function names]

## Why
[one paragraph: what problem does this solve? what was broken before?]

## How to test
1. [exact steps to verify this works]
2. [be specific — what URL, what data, what to look for]
3. [include the expected outcome]

## Screenshots
[for any UI change: before and after screenshots side by side]

## Checklist
- [ ] No bare console.log in any file under src/
- [ ] No hardcoded color/spacing values (all use CSS tokens)
- [ ] All realtime subscriptions have cleanup in useEffect return
- [ ] All async functions have try/catch
- [ ] All Supabase queries have limit()
- [ ] All Redis set() calls have { ex: N } expiry
- [ ] Loading state → Skeleton shown
- [ ] Empty state → EmptyState component shown
- [ ] Error state → Error UI with retry shown
- [ ] Ran verification test (described in How to test above)
- [ ] No new Sentry errors introduced (checked Sentry dashboard)
- [ ] Build passes: npm run build completes without errors
```

**PR Size Rule:** Keep PRs under 500 lines of diff. If a feature requires more, split it into sequential PRs where each one is independently mergeable and testable.

**Review Rule:** Every PR must sit for at least 30 minutes before merging, even if you're the only developer. This "cooling period" lets you catch last-minute issues.

---

## 2.5 — Release Tagging

After merging a release branch into main:
```bash
git tag -a v0.2.0 -m "Phase 3 complete: COIE real scoring + AIRE keyword patterns + notifications"
git push origin v0.2.0
```

Version numbering:
```
v0.1.x — Phase 2 complete: Auth + onboarding working end-to-end
v0.2.x — Phase 3 complete: COIE/AIRE real logic + notifications
v0.3.x — Phase 4 complete: DIE engine + GitHub PRs
v0.4.x — Phase 5 complete: Agent binary + real K8s data
v1.0.0 — Phase 6 complete: Hardened, monitored, ready for public beta
x.x.1  — Patch: bug fixes within a phase
x.1.x  — Minor: new features within a phase
```

---

## 2.6 — Mandatory `.gitignore` Entries

These must be in `.gitignore`. If any of these are already committed, that is an emergency.
```
# Secrets (NEVER commit these)
.env
.env.local
.env.production
.env.staging
.env*.local

# Build output
dist/
build/

# Dependencies
node_modules/
.pnp
.pnp.js

# Supabase local state
supabase/.branches/
supabase/.temp/
supabase/functions/.env

# Editor
.idea/
.vscode/settings.json
*.swp
*.swo
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Test coverage
coverage/

# Sentry CLI config (contains auth token)
.sentryclirc
```

---

# PART 3 — IMMEDIATE PRIORITY FIXES (Before Phase 3 Begins)

These are bugs and gaps in the CURRENT build that must be fixed first.
They are not new features. They are broken things that make the existing feature set unreliable.
Branch prefix: `fix/`

---

## FIX 1 — Auth Hook GitHub OAuth Gap

**Branch:** `fix/auth-hook-github-oauth`
**Severity:** CRITICAL — GitHub users have no org created, see zero data

The `auth-hook` function likely only handles the email signup event. GitHub OAuth fires a different auth event. If the hook doesn't handle both:
- GitHub OAuth user signs up
- Hook fires but doesn't recognize the event type
- No organization is created
- No `org_id` is set in user_metadata
- RLS policy: `org_id = auth.jwt() ->> 'org_id'` evaluates to `null = null` which is FALSE in Postgres
- User sees empty dashboard everywhere
- User thinks the app is broken

**What the fix must do:**
Inspect the event payload in `auth-hook`. The structure differs between email and OAuth events. Handle BOTH explicitly. At the end of the function, regardless of how the user signed up, an organization must exist and `user_metadata.org_id` must be populated.

**Verification test:**
1. Create a fresh GitHub account never used with AutoStack
2. Click "Continue with GitHub" on the signup page
3. Complete OAuth flow
4. Check Supabase → Table Editor → organizations → confirm ONE new row exists
5. Check Supabase → Table Editor → org_members → confirm ONE row with `role: owner` for this user
6. Navigate to `/dashboard` → score cards should show (even if 0 values) not blank
7. This test must pass before ANY other work continues

---

## FIX 2 — COIE Missing Database Updates

**Branch:** `fix/coie-database-writes`
**Severity:** HIGH — COIE runs but nothing is persisted, scores never change in UI

Even if `coie-cycle` calculates scores correctly, if it doesn't write to the database, the dashboard always shows stale data. Three writes must happen every COIE cycle:

Write 1: `UPDATE clusters SET health_score=X, score_security=X, score_reliability=X, score_cost=X, score_performance=X, score_updated_at=NOW() WHERE id=cluster_id`

Write 2: `INSERT INTO cluster_scores (cluster_id, health_score, ...) VALUES (...)`
This is the time-series record. Without it, the sparklines on score cards have no data.

Write 3: `INSERT INTO findings (cluster_id, check_name, title, ...) VALUES (...)` for each failed check.
With deduplication: check if `check_name + affected_resource + status='open'` already exists. If yes, UPDATE `last_seen_at` only.

**Verification test:**
1. Open Supabase SQL Editor
2. Manually insert a test cluster row with `agent_status = 'connected'`
3. Trigger `coie-cycle` manually via its API endpoint with this cluster_id
4. Check `clusters` table → health_score column should have changed from 0
5. Check `cluster_scores` table → one new row should exist with a timestamp
6. Check `findings` table → rows should exist corresponding to the checks that failed
7. Open the dashboard → Overview tab → score card should show the new value

---

## FIX 3 — AIRE Seed Data

**Branch:** `fix/aire-incident-patterns-seed`
**Severity:** HIGH — AIRE can never match any pattern without this data

The `incident_patterns` table is empty. AIRE reads this table when diagnosing incidents. With zero rows, every incident diagnosis returns null match and produces generic "Anomaly detected" output. The feature is effectively non-functional.

**What the fix must do:**
Create `supabase/seed.sql` (or `supabase/migrations/002_seed_incident_patterns.sql`).
Insert a row for each of these 10 patterns minimum. Each row needs: `name`, `description`, `matching_criteria` (JSONB), `diagnosis_template`, `remediation_type`.

Patterns to seed:
```
OOM_KILL          — exit code 137, memory exceeded limit
APP_CRASH         — exit code 1, unhandled exception
IMAGE_PULL_FAILURE — ImagePullBackOff, ErrImagePull
LIVENESS_PROBE_FAILURE — liveness probe failed events
CONFIG_MISSING    — env var not found, config missing
NODE_PRESSURE     — pod evicted, MemoryPressure/DiskPressure
ROLLOUT_STUCK     — deadline exceeded, new pods not ready
PVC_BINDING_FAILURE — PVC Pending, no matching StorageClass
RBAC_DENIAL       — 403 forbidden, cannot access resource
STARTUP_DEADLOCK  — readiness failing for 5+ min, pod not crashing
```

For `matching_criteria`, use a JSONB structure like:
```json
{
  "keywords": ["OOMKilled", "exit_code_137"],
  "event_reasons": ["OOMKilling"],
  "confidence_threshold": 0.90
}
```

**Verification test:**
1. After running the seed, check: `SELECT COUNT(*) FROM incident_patterns` → should return 10+
2. Manually insert a test incident row with `trigger_type = 'pod_restart'` and `summary = 'Pod killed: OOMKilled exit code 137'`
3. Trigger `aire-detect` with this incident_id
4. Check the incident row → `matched_pattern` should equal `OOM_KILL`
5. Check → `root_cause` and `immediate_action` should be populated (not null)

---

## FIX 4 — Realtime Subscription Cleanup Audit

**Branch:** `fix/realtime-channel-cleanup`
**Severity:** MEDIUM-HIGH — memory leaks + Supabase free tier degradation

The report mentions "sometimes misses updates if the network connection flickers." This symptom is often caused by duplicate subscriptions when cleanup is missing. Go through `useData.js` and verify every subscription has cleanup.

Also fix: the `eventsPerSecond: 10` throttle in the Supabase client config is good, but verify it is actually set in `src/lib/supabase.js` and not commented out.

Add a global channel counter for debugging:
```
In development mode only, track: how many channels are currently open?
Log this count when a new channel is opened and when one is closed.
This makes subscription leaks immediately visible during development.
```

**Verification test:**
1. Open the dashboard on the Overview tab
2. Open browser DevTools → Network tab → filter by WebSocket
3. Count the active WebSocket connections (should be 1 Supabase realtime connection)
4. Switch between all 7 tabs rapidly
5. The WebSocket count should stay at 1 (same connection, different channels within it)
6. Old channel subscriptions should be visible being unsubscribed in the Network tab

---

## FIX 5 — Form Validation Real Implementation

**Branch:** `fix/form-validation-real-rules`
**Severity:** MEDIUM — security hygiene and user experience

The report says validation is "visual only." The password strength bar shows segments but doesn't actually enforce the rules. The email field doesn't validate format. This must be real validation.

**Login page:**
- Email: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` tested on blur
- Password: non-empty check, minimum 8 characters
- On submit with invalid fields: show inline error, do NOT call Supabase at all

**Signup page:**
- Full name: non-empty, no numbers/special chars, 2-50 chars
- Email: same regex as above
- Organization name: `^[a-zA-Z0-9\s\-_.]{2,60}$`
- Password: enforce ALL FOUR strength rules before allowing submit (not just show the bar)
  - At least 8 characters
  - At least one number
  - At least one uppercase letter
  - At least one special character
- Confirm password: must match exactly, check on every keystroke of the confirm field
- Terms checkbox: must be checked to enable the submit button

**Verification test:**
1. Go to /signup
2. Submit with empty form → all fields should show red inline errors
3. Enter an email without @ → should show "Please enter a valid email address"
4. Type a 7-character password → strength bar should stay at "weak"
5. Type matching passwords then change one → confirm field should immediately show error
6. Fill everything correctly → button should become active and submission should work

---

## FIX 6 — Sentry Configuration Production Safety

**Branch:** `fix/sentry-production-config`
**Severity:** MEDIUM — cost and data quality

Three problems to fix:

Problem 1: `tracesSampleRate` — if set to `1.0` in production, Sentry captures 100% of transactions. With 1,000 daily active users doing 10 navigations each, that's 10,000 performance transactions per day. The free tier is 10,000/month. Fix: `tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0`

Problem 2: The Sentry SDK at 450KB is loading on the landing page where crash reporting matters less. Solution: keep it loading on all pages (removing it would complicate the setup), but ensure it's in its own Vite chunk (`manualChunks: { sentry: ['@sentry/react'] }`). This doesn't reduce the download but prevents it from blocking the critical rendering path.

Problem 3: If `Sentry.setUser()` is not called after login, all errors are anonymous. Add this call in the auth success handler immediately after the Supabase session is confirmed.

---

## FIX 7 — Empty States Completion

**Branch:** `fix/empty-states-all-tabs`
**Severity:** MEDIUM — first-time user experience

Audit every tab. Where `data.length === 0` renders nothing or bare text, replace with the `EmptyState` component. Each empty state must have:
- Appropriate icon from Lucide React
- Title (what is missing)
- Description (why it's empty + what to do about it)
- Action button where applicable (not just text)

Specific requirements per tab:
- Projects: "No projects yet" + "Connect your first repository" button that opens the New Project modal
- Pipelines: "No pipeline runs yet" + explanation that runs appear after the first GitHub push
- Infrastructure: "No resources detected" + "Check that your agent is connected" link
- Incidents: "All clear" + "COIE and AIRE are actively monitoring your cluster"
- Activity feed (Overview sidebar): "No recent activity" + "Deploy something to get started"
- Findings (if displayed): "No findings" + "Your cluster health is 100/100"

---

# PART 4 — PHASE 3: THE AI ENGINES BECOME REAL
## Target: v0.2.0
## Goal: COIE scores real data. AIRE diagnoses with semantic intelligence. Notifications actually send.

---

## PHASE 3A — COIE Real Data Pipeline

**Branch:** `feature/phase3-coie-real-scoring`

### What this phase must do

COIE currently applies static rules to make-believe data. After this phase, it applies static rules to REAL data — metrics actually collected from the cluster by the agent.

The data pipeline is:
```
K8s Cluster → Agent Binary (Phase 5) → agent-metrics Edge Function → cluster_metrics table → COIE reads this table
```

Since the agent doesn't exist yet, COIE must be designed to work with the data shape the agent WILL send, while still functioning in simulation mode for demo purposes.

### The simulation mode (until agent exists)

Add a `SIMULATION_MODE` flag to the COIE Edge Function (read from environment variable, default `true` in dev). In simulation mode, COIE generates realistic fake metric values for its calculations instead of reading the database. In production mode (`SIMULATION_MODE=false`), it reads real data from `cluster_metrics`.

This way, the scoring logic and database writes are the same in both modes. When the agent ships in Phase 5, you flip one env var and COIE immediately starts scoring real data.

### The 4-dimension check implementations

**How to structure each check — the Check Object pattern:**

Every check is a data object, not scattered if/else blocks. Each check must have:
- `id`: machine-readable string, used as `findings.check_name`
- `dimension`: security / reliability / cost / performance
- `severity`: critical / high / medium / low
- `maxDeduction`: maximum points this check can remove from the score
- `title`: one sentence, human-readable, shown in the findings list
- `description`: two sentences explaining why this matters and what the risk is
- `remediation`: exact text telling the user what to change (YAML snippet where possible)
- `evaluate(clusterData)`: function that returns `{ failed: boolean, affectedResources: string[], projectedSaving?: number }`

Structure all checks as an array. The COIE engine iterates the array, calls each `evaluate()`, collects failures, calculates total deduction, writes findings, updates scores.

**Security checks (35% of total score):**

Define these checks:
1. Privileged containers: any container running with `securityContext.privileged: true` → 25 point deduction, critical severity
2. Host network/PID/IPC access: any pod with `hostNetwork`, `hostPID`, or `hostIPC: true` → 20 points deduction each, critical
3. Missing resource limits: deployments without CPU AND memory limits → 10 points per deployment (max 30 points deduction), high severity
4. Image using `:latest` tag: images without a specific version tag → 5 points per image (max 15 points), low severity
5. Missing security context: deployments without `runAsNonRoot: true` and `allowPrivilegeEscalation: false` → 8 points per deployment (max 24 points), medium severity
6. Secrets exposed as env vars: env var names matching `/TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|API/i` → 15 points per secret exposed, high severity

**Reliability checks (30% of total score):**

1. Single replica deployments: `replicas < 2` for any production workload → 15 points, high
2. Missing readiness probe: no `readinessProbe` defined → 12 points per workload (max 24 points), high
3. Missing liveness probe: no `livenessProbe` defined → 10 points per workload (max 20 points), high
4. High pod restart count: any pod with `restartCount > 3` in the last 24 hours → 15 points, high
5. No pod disruption budget: multi-replica deployments without a PDB → 8 points (max 16), medium
6. Recreate rollout strategy: using `RollingUpdate.type: Recreate` → 10 points per deployment, high

**Cost checks (20% of total score):**

1. Over-provisioned CPU: CPU request > 3x average actual usage → 20 points, high. `projectedSaving`: calculate `(overProvisionedCores * $hourlyRatePerCore * 730)` per month
2. Over-provisioned memory: memory request > 2x average actual usage → 15 points, high. Include projected saving.
3. Orphaned load balancers: Service type LoadBalancer with 0 endpoints → 10 points each, medium. These incur cloud charges for nothing.
4. Unused namespaces: namespaces older than 7 days with 0 running pods → 5 points each, low

**Performance checks (15% of total score):**

1. p99 latency trend: p99 latency increased >20% over the last 24h compared to the previous 24h → 15 points, high
2. HTTP error rate: 5xx error rate >1% of total requests → 20 points, critical
3. Node memory pressure: any node with memory usage >85% → 10 points, high
4. CPU throttling: any container with throttled CPU time >20% → 10 points, high

**Score calculation formula:**
```
securityScore = 100 - totalSecurityDeductions (floor at 0)
reliabilityScore = 100 - totalReliabilityDeductions (floor at 0)
costScore = 100 - totalCostDeductions (floor at 0)
performanceScore = 100 - totalPerformanceDeductions (floor at 0)

healthScore = round(
  securityScore * 0.35 +
  reliabilityScore * 0.30 +
  costScore * 0.20 +
  performanceScore * 0.15
)
```

**Important behavior rule:** Deductions are ADDITIVE (stack up) but the score FLOORS at 0. A cluster with 30 critical issues scores 0, not -200.

### What COIE must write to the database after every run:

1. UPDATE `clusters` — update all 5 score columns + `score_updated_at`
2. INSERT `cluster_scores` — one row per run, always, even if scores didn't change
3. For each failed check: INSERT `findings` row (with deduplication check)
4. For any finding that no longer fails (issue resolved): UPDATE `findings.status = 'resolved'`

The last point is important: auto-resolve findings when the underlying issue is fixed. Don't let the findings list accumulate stale "open" items forever.

---

## PHASE 3B — AIRE Keyword Pattern Engine (Phase A)

**Branch:** `feature/phase3-aire-keyword-patterns`

### Important philosophy about AIRE

AIRE is NOT a general-purpose AI. It is a pattern library with an AI interface. The goal is not to reason about arbitrary incidents — it is to match known, common failure patterns reliably and quickly. General reasoning via LLM is added later as a fallback when no pattern matches.

Think of AIRE as having two tiers:
- **Tier 1 (this phase):** Keyword + structural pattern matching. Fast, deterministic, no API calls, no cost. Handles 80% of real-world incidents.
- **Tier 2 (next phase):** OpenAI embedding-based semantic matching. Handles unusual patterns Tier 1 doesn't recognize.

### How the matching engine works

AIRE receives an incident object with:
- `trigger_type`: category of event
- `summary`: 1-2 sentence description of what happened
- `log_excerpts`: array of recent log lines from the affected pod
- `metrics_snapshot`: CPU/memory readings at time of incident
- `timeline`: array of K8s events in order

AIRE iterates over the incident_patterns from the database. For each pattern, it evaluates the `matching_criteria` JSONB field. The criteria contains:
- `keywords`: strings to look for in `log_excerpts` and `summary`
- `exit_codes`: numbers to look for in exit code fields
- `event_reasons`: K8s event reason strings to look for
- `metric_conditions`: conditions on the metrics_snapshot (e.g., `{ memory_pct: { ">": 95 } }`)

A pattern "matches" if:
- At least 1 keyword is found in the log or summary, AND
- If `exit_codes` is defined: at least one matches, AND
- If `event_reasons` is defined: at least one matches

Confidence = (number of criteria met) / (total criteria defined)

Select the pattern with the highest confidence. If highest confidence < 0.65, no match.

### The RCA output format

When AIRE finds a match, it must populate the incident row with:

`matched_pattern`: the pattern's `name` (e.g., "OOM_KILL")
`pattern_confidence`: the confidence score (0.0 to 1.0)
`root_cause`: fill the pattern's `diagnosis_template` with the specific resource details. NOT a generic template — insert the actual resource name, namespace, container name.
`immediate_action`: the pattern's immediate_action field
`permanent_fix`: the pattern's permanent_fix field
`status`: update from `detected` to `diagnosed`
`diagnosed_at`: current timestamp

If NO match:
`matched_pattern`: null
`pattern_confidence`: 0
`root_cause`: "AutoStack detected an anomaly that doesn't match known patterns. Manual investigation required."
`immediate_action`: "Check pod logs and recent K8s events for the affected resource."
`status`: update to `diagnosed` (even for no-match — the diagnosis is "unknown pattern")
`diagnosed_at`: current timestamp

**Rule:** AIRE must always produce output. A perpetually "detected" incident with no diagnosis is worse than an honest "I don't know what happened."

### Trigger mechanism

AIRE is triggered via a Supabase Database Webhook:
- Table: `incidents`
- Event: INSERT
- Fires the `aire-detect` Edge Function with the new incident row data

This means: whenever any component (agent, manual test, future automation) inserts a row into `incidents`, AIRE automatically diagnoses it. There is no manual trigger needed.

### Verification test

1. Insert a test incident row:
```sql
INSERT INTO incidents (cluster_id, trigger_type, summary, log_excerpts)
VALUES (
  '[your-test-cluster-id]',
  'pod_restart',
  'Pod api-gateway-7d9f-xxx was killed',
  '["OOMKilled: container exceeded memory limit 512Mi", "exit code 137"]'
);
```
2. Wait 5 seconds (Edge Function trigger latency)
3. Query: `SELECT matched_pattern, pattern_confidence, root_cause, status FROM incidents WHERE trigger_type = 'pod_restart' ORDER BY detected_at DESC LIMIT 1`
4. Expected: `matched_pattern = 'OOM_KILL'`, `pattern_confidence > 0.85`, `root_cause` contains the resource name, `status = 'diagnosed'`

---

## PHASE 3C — AIRE Semantic Matching (Phase B — OpenAI)

**Branch:** `feature/phase3-aire-semantic-matching`

### Only start this after Phase 3B is fully working

This adds Tier 2 to AIRE: when keyword matching fails (confidence < 0.65), use OpenAI + pgvector to find the most semantically similar known pattern.

### How the semantic search works

1. Condense the incident into a 300-character summary string: `[pod name] in [namespace]: [top 3 log lines]`
2. Call `redis.get('aire:emb:' + hash(summaryString))` — if hit, use cached embedding
3. If miss: call OpenAI `text-embedding-3-small` model (cheapest, still excellent) with the summary
4. Cache the returned embedding: `redis.set('aire:emb:' + hash, JSON.stringify(embedding), { ex: 86400 })`
5. Run pgvector cosine similarity query against `incident_patterns`:
   ```sql
   SELECT name, description, 1 - (embedding <=> '[queryEmbedding]') AS similarity
   FROM incident_patterns
   WHERE embedding IS NOT NULL
   ORDER BY embedding <=> '[queryEmbedding]'
   LIMIT 1
   ```
6. If similarity > 0.80: use this pattern as the match
7. If similarity <= 0.80: proceed with "unknown pattern" RCA

### Populating pattern embeddings

When the `incident_patterns` seed data is inserted (Phase 3A fix), the embeddings column will be null. A one-time script must generate and insert embeddings for all pattern rows:
- Call OpenAI for each pattern's `description + matching_criteria keywords` combined
- UPDATE `incident_patterns SET embedding = '[embedding]' WHERE name = '[pattern_name]'`
- This only needs to run once (and again if patterns are updated)

### Cost control rule

The `text-embedding-3-small` model costs $0.02 per 1 million tokens. One incident summary ≈ 100 tokens. At 1,000 incidents per month: $0.002. This is negligible. But the Redis cache means even this tiny cost is halved by not re-embedding the same incident text twice.

Hard limit: add to OpenAI dashboard → Organization Settings → Usage Limits → Hard Limit: $5/month. This prevents any billing surprises regardless of traffic volume.

---

## PHASE 3D — Notifications Engine Completion

**Branch:** `feature/phase3-notifications`

The report says `send-notification` either doesn't exist as a standalone function or is partially inlined. This phase makes notifications complete and production-grade.

### Notification triggers

After every COIE cycle:
- If any new `critical` severity finding was created: notify immediately
- If the `health_score` changed by more than 10 points in either direction: notify

After every AIRE diagnosis:
- If incident severity is `critical` or `high`: notify immediately
- After any incident is auto-resolved: send resolution notification

After agent heartbeat timeout:
- If `last_seen_at` is more than 5 minutes ago and status was `connected`: notify "Agent disconnected"

### Notification delivery rules

Before sending ANY notification:
1. Check user's `notification_prefs` — is this event type enabled?
2. Check Resend quota: `redis.incr('email:quota:' + todayKey())` — if > 90, skip email (log to Sentry), try Slack instead if configured
3. Check last notification time: don't send the same notification type for the same cluster more than once per 30 minutes. Key: `redis.set('notif:cooldown:[cluster_id]:[event_type]', '1', { ex: 1800 })`

### Email template requirements

All email templates must be:
- HTML with inline CSS only (Gmail strips `<style>` tags)
- AutoStack brand: logo, dark color scheme where email clients support it, white fallback
- Mobile-responsive (single column, minimum 44px tap targets)
- Unsubscribe link in the footer that works WITHOUT login (signed URL token)

Required templates:
1. `incident-detected`: incident type, affected resource, immediate action, link to dashboard incidents tab
2. `score-changed`: from/to scores for each dimension, top new finding, link to overview tab
3. `agent-disconnected`: cluster name, last seen time, reconnect instructions, link to settings
4. `incident-resolved`: resolution time (how long it took), what resolved it, link to overview
5. `weekly-digest`: past 7 days — score trend, finding count by severity, incidents resolved

---

# PART 5 — PHASE 4: DIE ENGINE (DEPLOYMENT INTELLIGENCE)
## Target: v0.3.0
## Goal: Connect a GitHub repo and receive a production-ready PR within 2 minutes

---

## PHASE 4A — GitHub App Creation and Installation Flow

**Branch:** `feature/phase4-github-app`

### GitHub App vs GitHub OAuth App — use GitHub App

The previous setup used a GitHub OAuth App. For DIE (which needs to push code and open PRs), a GitHub App is required because:
- GitHub App can be installed on specific repositories (user controls access per-repo)
- GitHub App has write permissions scoped to only the installed repositories
- GitHub App tokens expire (more secure than OAuth tokens)
- GitHub App can receive webhooks with verified signatures

### App creation configuration

At github.com/settings/apps/new, configure:

**Permissions:**
- Repository contents: Read and Write (to create files via API)
- Pull requests: Read and Write (to open PRs)
- Metadata: Read-only (required)
- Actions: Read-only (to read pipeline status)
- Checks: Read-only (for PR status checks)

**Webhook events to subscribe:**
- `workflow_run` — pipeline status updates
- `push` — code pushed to connected repos
- `pull_request` — for tracking DIE/COIE PRs that get merged

**Webhook URL:** `https://[project].supabase.co/functions/v1/github-webhook`

### The installation flow (what the user experiences)

1. User goes to Settings → Integrations → GitHub → "Connect GitHub App"
2. App redirects to GitHub with the app's install URL: `https://github.com/apps/autostack-io/installations/new`
3. GitHub shows: "Which repositories should AutoStack access?" — user selects repos
4. GitHub redirects to `/settings/integrations/github/callback?installation_id=XXX&state=YYY`
5. Edge Function exchanges installation_id for an installation access token
6. Store in `integrations` table: `{ name: 'github', status: 'connected', config: { installation_id: XXX, account_login: 'username', repos_count: N } }`
7. Show success toast + the GitHub integration card turns green

### Token refresh

GitHub App installation tokens expire after 1 hour. The integration must:
- Before every GitHub API call, check if the token is expired
- If expired or missing, generate a new one: `POST /app/installations/{installation_id}/access_tokens` (authenticated as the GitHub App using the private key + JWT)
- Cache the new token in Redis: `redis.set('github:token:[installation_id]', token, { ex: 3500 })` (5-minute buffer before the 1-hour expiry)

---

## PHASE 4B — Repository Analysis Pipeline (DIE Core)

**Branch:** `feature/phase4-die-analyzer`

### What happens when a user connects a repository

This is the most important user-facing feature of AutoStack. The user adds a repo URL and within 2 minutes gets a pull request with everything they need to deploy on Kubernetes.

### The analysis pipeline — step by step

**Step 1: Fetch repository structure (not clone — use GitHub API)**

Using the GitHub Contents API (authenticated as the App), fetch:
- Top-level file list via `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=false`
- Then fetch content of specific files: `package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `Dockerfile`, `.nvmrc`, `.python-version`, `Procfile`
- Fetch at most 15 files total. Do not fetch source code files — only config/dependency manifests.

**Step 2: Language detection — the decision tree**

Apply these checks in order. FIRST MATCH WINS:

```
Does Dockerfile exist?
  YES → Read EXPOSE line for port. Language = "custom". Continue to resource profile.
  
Does package.json exist?
  YES → fetch and parse it.
    Has "dependencies.next" → Framework: Next.js, Port: 3000
    Has "dependencies.react-scripts" → Framework: React CRA, Type: StaticSite
    Has "dependencies.express" OR "dependencies.fastify" → Framework: Node API, Port: 3000
    Has "dependencies.hono" → Framework: Hono, Port: 8787
    Else → Framework: Node.js generic, Port: 3000

Does requirements.txt exist?
  YES → fetch and parse it.
    Has "django" → Framework: Django, Port: 8000
    Has "flask" → Framework: Flask, Port: 5000
    Has "fastapi" → Framework: FastAPI, Port: 8000
    Has "celery" (and no HTTP framework) → Type: Worker, no port
    Else → Framework: Python generic, Port: 8000

Does go.mod exist?
  YES → Framework: Go, Port: 8080

Does pom.xml OR build.gradle exist?
  YES → Framework: Spring Boot (Java), Port: 8080

Does Gemfile exist?
  YES → Framework: Ruby on Rails, Port: 3000

None matched → Framework: Unknown, Port: 8080 (sensible default)
```

**Step 3: Application type classification**

After language detection, classify the application type:
- `web-service`: has an HTTP port, serves requests (most common)
- `static-site`: React CRA, Vite SPA — output is static files, needs different manifests
- `api-service`: no frontend, purely API
- `worker`: no port, processes jobs (Celery, background queues)
- `cron-job`: runs on a schedule, completes and exits

Type determines which manifests to generate.

**Step 4: Resource profile assignment**

Based on framework, assign:
```
micro    (50m/100m CPU,  64Mi/128Mi memory): static files, lightweight scripts
small    (100m/200m CPU, 128Mi/256Mi memory): Flask, Express lightweight
standard (200m/500m CPU, 256Mi/512Mi memory): Django, FastAPI, Next.js, Node APIs
compute  (500m/1000m CPU, 512Mi/1024Mi memory): Spring Boot, compute-heavy workers
```

**Step 5: Manifest generation**

Generate these files as strings. Variable substitution: replace `[APP_NAME]`, `[PORT]`, `[IMAGE]`, `[REQUESTS_CPU]` etc. with detected values.

For type `web-service` or `api-service`:
- `autostack/Dockerfile`: multi-stage build. Stage 1: build. Stage 2: minimal runtime image (node:alpine, python:slim, distroless/static). Non-root user. HEALTHCHECK instruction.
- `autostack/k8s/deployment.yaml`: 2 replicas, correct resource requests/limits, full securityContext (`runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`), readinessProbe and livenessProbe on the detected port.
- `autostack/k8s/service.yaml`: ClusterIP type (not LoadBalancer — use Ingress instead)
- `autostack/k8s/ingress.yaml`: cert-manager TLS annotation, host to be filled in by user
- `autostack/k8s/hpa.yaml`: scale 2-10 replicas, CPU 70% target, memory 80% target
- `autostack/k8s/networkpolicy.yaml`: deny-all default, allow ingress from ingress controller namespace only
- `autostack/argocd/application.yaml`: points to `autostack/k8s/` directory in the repo

For type `static-site`:
- `autostack/Dockerfile`: build stage runs `npm run build`, serve stage uses `nginx:alpine` serving from `/usr/share/nginx/html`
- Same k8s manifests but resource profile `micro`

For type `worker`:
- Deployment without Service or Ingress
- CronJob manifest instead of HPA

**Step 6: Opening the PR**

Using GitHub API as the App:
1. Get the default branch HEAD SHA: `GET /repos/{owner}/{repo}/git/ref/heads/main`
2. Create new branch: `PUT /repos/{owner}/{repo}/git/refs` → `refs/heads/autostack/initial-setup`
3. For each generated file, create it via: `PUT /repos/{owner}/{repo}/contents/autostack/[filename]` with base64-encoded content
4. Create pull request: `POST /repos/{owner}/{repo}/pulls` with structured body (see below)
5. Add label `autostack-generated` to the PR
6. Update `projects` table: `analysis_status = 'complete'`, `pr_url = [url]`, `pr_number = [number]`, `stack = [detected_stack]`
7. Send notification: "Your manifests are ready — PR opened in [repo]"

**PR body format:**
The PR body must explain every generated file, what NEEDS to be customized by the user (the Ingress hostname, any environment variables), and what is production-ready by default (the security context, probes, HPA). This PR body is the primary user documentation for the generated setup.

### Progress feedback during analysis

Analysis takes 5-30 seconds. The user must see progress. Use Supabase Realtime:
- Update `projects.analysis_status` to stage names as they complete: `fetching` → `analyzing` → `generating` → `opening_pr` → `complete`
- The New Project modal subscribes to realtime updates for this project_id
- Each status change updates a progress indicator in the modal
- When `complete`, the modal shows the PR URL with a "View Pull Request →" button

---

## PHASE 4C — COIE Automated Fix PRs

**Branch:** `feature/phase4-coie-fix-prs`

After COIE identifies findings, it must open PRs with the exact code changes needed to fix them.

### Which findings get auto-PRs

Not every finding gets an automated PR. Only the ones where the fix is deterministic:
- Missing resource limits → add the calculated recommended values to the Deployment manifest
- Missing readiness/liveness probe → add a standard HTTP probe on the detected port
- Image using `:latest` → replace with `:stable` or the most recent semantic version tag
- Missing security context → add the standard security context block
- Single replica → increase to 2 replicas

Findings that do NOT get auto-PRs (too complex or too risky):
- Privileged containers (risk of breaking the application)
- Host network access (may be intentional)
- Secrets in env vars (need human judgment on how to migrate to a Secret)
- Cost optimization (need human review of the recommended values)

### The fix PR generation flow

1. COIE creates the finding
2. COIE checks: is this finding type in the auto-PR list? If yes: call generate-fix-pr function
3. generate-fix-pr reads the finding + the affected resource's current manifest via GitHub API
4. Applies the specific fix to the manifest YAML string
5. Checks: does branch `autostack/fix-[check_name]-[resource_name]` already exist on GitHub? If yes: update the file on that branch. If no: create branch + file.
6. Checks: is there already an open PR for this branch? If yes: update the PR body. If no: open new PR.
7. UPDATE `findings.pr_url` and `findings.pr_number`

### One PR per finding — always

Never batch multiple fixes into one PR. Reasons:
- Easier for the user to understand and review
- If one fix breaks something, the rollback is clean
- COIE findings are independent — they should have independent fix histories

---

# PART 6 — PHASE 5: THE AGENT
## Target: v0.4.0
## Goal: A real Kubernetes cluster sends real data. The demo becomes the product.

This is the hardest phase and the one that makes AutoStack genuinely valuable.

---

## PHASE 5 — Go Agent Binary

**Branch:** `feature/phase5-agent-go-binary`

### Why Go

- Single static binary: `GOOS=linux GOARCH=amd64 go build -o autostack-agent ./cmd/agent`
- Kubernetes client library (`client-go`) is Go-native and excellent
- Low resource usage: the agent itself should use <50MB memory, <10m CPU
- Fast startup: the Helm chart's pod is ready in <3 seconds

### Agent responsibilities (in priority order)

1. **Registration**: On first start, use the agent token from Helm values to register with `connect-cluster` Edge Function. Receive cluster_id. Store cluster_id persistently (in a Kubernetes ConfigMap, not in-memory — survives pod restarts).

2. **Heartbeat**: Every 30 seconds, POST to `agent-heartbeat` Edge Function. Include: cluster_id, agent_version, node count, pod count, current timestamp.

3. **Event streaming**: Use the Kubernetes Watch API to stream events. On any `Warning` event: immediately POST to `agent-metrics` Edge Function with the event details. This is how incidents are detected.

4. **Metrics collection**: Every 60 seconds, query the Kubernetes Metrics Server API for: per-node CPU%, per-node memory%, per-pod CPU%, per-pod memory%, pod restart counts. POST batch to `agent-metrics`.

5. **Workload inventory**: Every 5 minutes, enumerate all Deployments, StatefulSets, DaemonSets across all namespaces. For each: name, namespace, replicas, images, resource requests/limits, probe definitions, security context. POST to `agent-metrics`. This is what COIE uses for its checks.

### What the agent does NOT do

- Does NOT modify any Kubernetes resources directly
- Does NOT pull or run arbitrary code
- Does NOT store data — it forwards everything to the Edge Functions
- Does NOT need write permissions to the cluster (read-only service account)

### Security rules for the agent

- All communication is HTTPS to the Supabase Edge Function URLs
- Agent token is used ONLY for registration. After registration, the cluster_id is the identifier.
- Consider: after registration, the agent should generate a short-lived JWT (signed with a cluster-specific secret stored in a K8s Secret) for subsequent API calls. This prevents token replay attacks.
- If the agent cannot reach the Edge Functions for 10 consecutive heartbeats (5 minutes), it should log a warning and reduce polling frequency to once per 5 minutes to avoid spamming on network issues.

### Helm Chart requirements

The Helm chart must be the only thing a user needs to install. No manual RBAC setup, no manual secret creation. The chart handles everything:

- `templates/namespace.yaml`: Creates `autostack-system` namespace
- `templates/serviceaccount.yaml`: ServiceAccount with no extra permissions
- `templates/clusterrole.yaml`: Exact read-only permissions list (verified minimal — no write permissions)
- `templates/clusterrolebinding.yaml`: Binds the SA to the ClusterRole
- `templates/secret.yaml`: Creates a K8s Secret with the agent token from Helm values
- `templates/deployment.yaml`: The agent deployment with the secret mounted as env var

The Helm chart must be published to GitHub Pages so the `helm repo add` command in the onboarding wizard actually works. Instructions for this are in the Helm documentation for GitHub Pages chart repositories.

---

# PART 7 — PHASE 6: PRODUCTION HARDENING
## Target: v1.0.0
## The technical debt becomes zero

---

## PHASE 6A — Security Hardening

**Branch:** `feature/phase6-security`

Complete the items the report admits are gaps:

**Agent token lifecycle:**
Add a "Regenerate agent token" button in Settings → Infrastructure. When clicked:
- Generate a new token
- UPDATE `clusters.agent_token = new_token, agent_token_used = FALSE`
- Show the user the new Helm upgrade command: `helm upgrade autostack-agent autostack/agent --set agent.token=[new_token]`
- Old token is invalid immediately (the old token column value is gone)

**Rate limiting on all Edge Functions:**
Use Upstash Redis with a sliding window counter. Maximum:
- Auth endpoints (`auth-hook`, any login-adjacent): 10 requests per minute per IP
- Data endpoints (everything else): 100 requests per minute per user_id
- Agent endpoints: 200 requests per minute per cluster_id (agents are chatty)

If rate limit is exceeded: return 429 with `Retry-After` header.

**Input sanitization:**
Every user-provided string stored in the database must be sanitized:
- Cluster names: `^[a-zA-Z0-9\-_]{1,63}$` — reject anything else
- Org names: strip HTML tags, max 100 chars
- Project names: strip HTML tags, max 100 chars
- Repo URLs: must match `^https://(github|gitlab|bitbucket)\.com/[a-zA-Z0-9\-_.]+/[a-zA-Z0-9\-_.]+$`

**Audit log completion:**
Every significant action must insert to `audit_log`. Current gap: most actions don't log.
Required audit events:
- `cluster.created`, `cluster.deleted`
- `project.created`, `project.deleted`
- `finding.suppressed`, `finding.resolved`
- `playbook.enabled`, `playbook.disabled`, `playbook.executed`
- `member.invited`, `member.removed`, `member.role_changed`
- `integration.connected`, `integration.disconnected`
- `agent_token.regenerated`

---

## PHASE 6B — Log Persistence

**Branch:** `feature/phase6-log-persistence`

The Logs tab is currently a simulation. This makes it real.

**Storage architecture:**
Logs are too large for PostgreSQL rows (a busy cluster can generate 1GB+ of logs per day). Use Supabase Storage.

File structure: `{bucket}/logs/{cluster_id}/{YYYY-MM-DD}/{HH}/{deployment_id}-{pod_name}.jsonl`

Each `.jsonl` file is newline-delimited JSON: one log entry per line: `{ "ts": ISO8601, "level": "info|warn|error", "msg": "...", "pod": "...", "container": "...", "namespace": "..." }`

**Ingestion:**
The agent collects log lines from pods using the Kubernetes logs API. The agent batches log lines and sends them every 10 seconds to `agent-metrics` Edge Function. The Edge Function writes the batch to the appropriate Supabase Storage file (append mode via concatenation or separate small files merged daily).

**The Logs tab — now real:**
Replace the simulation with a query to Supabase Storage. Fetch the current hour's log files for the selected cluster. Parse and display. Add filters: namespace, severity level, time range, search string.

**Live streaming:**
For the "Live" mode, use Supabase Realtime's Broadcast channel. The `agent-metrics` function broadcasts new log lines as they arrive. The Logs tab subscribes to this channel. This gives <2 second latency for live logs without polling.

**Retention policy:**
Add to the `cleanup-old-metrics` cron job: delete log files older than 30 days (free tier). In the database, store a `log_retention_days` field on `organizations` — Pro plan gets 90 days.

---

## PHASE 6C — Performance Optimization

**Branch:** `feature/phase6-performance`

**The `ui/index.jsx` problem:**
10,000+ lines in a single file defeats code splitting. Every component in this file loads even when only one is used. Split into individual files:
- `src/components/ui/Button.jsx`
- `src/components/ui/Card.jsx`
- `src/components/ui/Modal.jsx`
- `src/components/ui/Toast.jsx`
- (etc.)
- `src/components/ui/index.js` — re-exports everything for backward compatibility

This is pure refactoring — zero behavioral change. But it unlocks proper code splitting and reduces the critical path bundle size significantly.

**Vite chunking strategy:**
```
vendor: react, react-dom, react-router-dom
charts: recharts, d3
icons: lucide-react
sentry: @sentry/react
supabase: @supabase/supabase-js
[each tab]: their own lazy chunk (already done per the report — verify)
```

**Lazy loading for landing page:**
The landing page should load in <2 seconds on a 4G connection. Currently the landing page probably loads the entire Sentry SDK (450KB). Fix: Sentry should only initialize AFTER the user logs in or navigates to the dashboard. The landing page does not need error tracking to work.

---

# PART 8 — REALISTIC COMPLETION ESTIMATE

Given the actual current state (technical report 2026-03-13):

| Phase | What | Actual Status | Effort |
|-------|------|---------------|--------|
| Immediate fixes | Auth hook OAuth, COIE writes, seed data, form validation, Sentry config | 🔴 Must fix first | 2 days |
| Phase 3A | COIE real check logic + DB writes | 🟡 40% done | 2 days |
| Phase 3B | AIRE keyword patterns | 🟡 30% done | 1.5 days |
| Phase 3C | AIRE OpenAI embeddings | ⬛ 0% done | 1 day |
| Phase 3D | Notifications complete | 🟡 20% done | 1 day |
| Phase 4A | GitHub App installation flow | ⬛ 0% done | 1.5 days |
| Phase 4B | DIE repository analyzer + PR | ⬛ 0% done | 3 days |
| Phase 4C | COIE fix PRs | ⬛ 0% done | 1 day |
| Phase 5 | Go agent binary + Helm chart | ⬛ 0% done | 5 days |
| Phase 6A | Security hardening | ⬛ 0% done | 2 days |
| Phase 6B | Log persistence | ⬛ 0% done | 2 days |
| Phase 6C | Performance: split ui/index.jsx | ⬛ 0% done | 1 day |
| **TOTAL** | | | **~24 days** |

**What you have right now without the agent (Phases 1-4):**
A fully functional demo where a user signs up, onboards, connects GitHub, gets manifests in a PR, sees real AI-scored health metrics, receives incident notifications, and manages their team. That is a legitimate, impressive product you can show to investors and early users.

**What requires the agent (Phase 5):**
Real-time data from an actual Kubernetes cluster. Every metric, score, and incident is based on what's actually happening in their infrastructure — not simulation.

**The order matters:**
Do not skip to Phase 5 (the exciting one). If Phase 3 is skipped, the agent sends real data into a scoring engine that produces meaningless results. The AI logic must be solid before the agent data makes it real.

---

# PART 9 — THE 10 THINGS THAT MUST NEVER HAPPEN AGAIN

1. An Edge Function deployed but not registered as an Auth Hook → user has no org, sees nothing
2. A table seeded with zero rows that the AI engine depends on → pattern matching always fails
3. A function that calculates scores but doesn't write them to the database → UI never updates
4. A Redis `set()` without expiry → persistent keys silently fill the free tier
5. A realtime subscription without cleanup → ghost subscriptions pile up after tab switching
6. A `console.log` with a token or user data in it → security exposure in browser DevTools
7. A UI state that only handles "success" but not "loading" and "error" → blank screens and infinite spinners
8. `SUPABASE_SERVICE_ROLE_KEY` anywhere in the `src/` directory → immediate key rotation required
9. A PR opened to `main` directly for a feature → undiscoverable bugs ship to production
10. An empty `incident_patterns` table shipped to production → entire AIRE feature is theater
