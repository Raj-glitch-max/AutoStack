# ╔══════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — TARGETED DIAGNOSTIC EXAMINATION v2.0              ║
# ║   Based on: Antigravity Technical Report 2026-03-13             ║
# ║   Purpose: Verify exact gaps, test every wiring, find hidden    ║
# ║            breakage before we build Phase 3+                    ║
# ╚══════════════════════════════════════════════════════════════════╝

# CONTEXT FOR THE AI IDE
# =======================
# We already have a detailed technical report. We KNOW the broad strokes.
# What we need now is surgical verification of specific claims and specific gaps.
# Do NOT do a general audit. Answer ONLY the targeted questions below.
# Do NOT write code. Do NOT make changes. READ and REPORT only.
# For every question: answer with the exact file, exact line number, exact code snippet.
# If something cannot be verified from files alone, say what test to run manually.
#
# STATUS BASELINE (what the report claims is already done):
#   ✅ 16 database tables with RLS — migrated
#   ✅ 9 Edge Functions deployed
#   ✅ Auth hook fires on signup
#   ✅ React.lazy + Suspense on all tabs
#   ✅ TabErrorBoundary on every tab
#   ✅ ToastContext wrapping the app
#   ✅ useData.js hooks with realtime
#   ✅ Onboarding 3-step wizard
#   🟡 COIE — static rules, not LLM
#   🟡 AIRE — keyword-based, pgvector not wired to LLM
#   🟡 Form validation — visual only, no real regex
#   🟡 Empty states — component exists, not wired everywhere
#   🔴 DIE engine — PR generation is null, mocked
#   🔴 Agent binary — does not exist
#   🔴 Log persistence — live only, no storage
#   🔴 Agent token rotation — no lifecycle management
#
# Your job: VERIFY each claim and EXPOSE what the report glossed over.

---

# BLOCK 1 — DATABASE VERIFICATION
# The report says: "All 16 tables migrated with RLS, indexes, pgvector"

Q1.1 — Open `supabase/migrations/001_initial_schema.sql` and count every `CREATE TABLE` statement.
List all 16 table names. Are any of the following MISSING from the migration file?
  organizations / org_members / clusters / projects / deployments / pipelines /
  cluster_scores / findings / incidents / playbooks / integrations /
  notification_prefs / audit_log / cluster_metrics / invitations / incident_patterns

Q1.2 — For `cluster_metrics` and `cluster_scores` — do the time-series performance indexes exist?
Find the exact lines: `CREATE INDEX idx_cluster_scores_cluster_time` and
`CREATE INDEX idx_cluster_metrics_time`. Report the exact index definition.
If these indexes are missing, every monitoring chart query will do a full table scan
at 1M+ rows — this is a production blocker.

Q1.3 — The report says `pgvector` is enabled and `incident_patterns` has an embedding column.
Find in the migration: `CREATE EXTENSION IF NOT EXISTS vector` and
the `incident_patterns` table definition showing `embedding vector(1536)`.
Also find: `CREATE INDEX idx_patterns_embedding ON incident_patterns USING ivfflat`.
Report if any of these three lines are MISSING.

Q1.4 — The `auth.org_id()` helper function — find the exact SQL function definition in the migration.
It should look like: `CREATE OR REPLACE FUNCTION auth.org_id() RETURNS UUID`.
If this function does not exist, ALL RLS policies that reference it will silently return 0 rows,
which means users see no data — a critical silent failure.

Q1.5 — Check the RLS policy on the `clusters` table. Find the exact policy text.
The report claims: `org_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid`
Confirm the exact SQL. Note: if `org_id` is not being set in `user_metadata` by the
`auth-hook`, this policy will cause ALL cluster queries to return empty — zero data shown
to users. This is the most critical silent failure in the entire system.

Q1.6 — Is there a migration file for seed data (`002_seed_data.sql` or `supabase/seed.sql`)?
Open it and report:
  - How many `incident_patterns` rows are seeded?
  - If the count is 0 or the file doesn't exist: AIRE CANNOT MATCH ANY PATTERNS.
    The engine will run but always produce null matches. The entire AIRE feature is broken.

Q1.7 — Is `pg_cron` configured? Find in the migration or Supabase config:
  - `SELECT cron.schedule('coie-evaluation', ...)` — does this exist?
  - If missing: COIE only runs when manually triggered. It will NEVER run automatically.
    All score updates in the dashboard are manual-only. Report this clearly.

---

# BLOCK 2 — EDGE FUNCTION DEEP VERIFICATION
# The report says: "9 Edge Functions deployed and active"

Q2.1 — `auth-hook/index.ts`: This is the most critical function.
Open the file and answer:
  a) Does it handle BOTH `email` signup events AND `github` OAuth events?
     GitHub OAuth fires a different event type. If only one is handled, GitHub users
     never get an org created and see empty data forever.
  b) After creating the org, does it call `supabase.auth.admin.updateUserById(user.id, { user_metadata: { org_id: ... } })`?
     If org_id is NOT set in user_metadata, the RLS policy from Q1.5 will block all data.
  c) Is the function registered as an Auth Hook in the Supabase dashboard?
     IMPORTANT: An Edge Function that isn't registered as an Auth Hook never fires.
     Being "deployed" is not the same as being "registered as an auth hook".
     Provide the exact registration steps or confirm it's registered.
  d) What happens if org creation fails? Is there a try/catch? Does it return a non-200 response?
     If it fails silently and returns 200, the user appears logged in but has no org = broken.

Q2.2 — `coie-cycle/index.ts`: The report says "4-dimension scoring with deduction logic".
Open the file and:
  a) List every single check implemented. Exact function or condition names.
  b) Does it INSERT into `cluster_scores` table after every run? Find this line.
  c) Does it INSERT into `findings` table for each failed check? Find this.
  d) Does it UPDATE `clusters.health_score`, `score_security`, `score_reliability`,
     `score_cost`, `score_performance` after calculation? Find these lines.
  e) What data does it READ from? Is it reading from:
     - Real `cluster_metrics` rows in the database? OR
     - Hardcoded/simulated values it makes up internally?
     This is the most important question about COIE. If it's simulated, scores are fake.

Q2.3 — `aire-detect/index.ts`: The report says "keyword-driven pattern matching".
  a) List every keyword/pattern it checks for.
  b) How is it triggered? Via DB webhook? Via explicit API call? Via the agent?
     If it's only triggered by explicit API call, no incidents are ever auto-detected.
  c) When it finds a match, does it UPDATE the `incidents` row with RCA text?
     Find the exact UPDATE statement.
  d) Does it call `send-notification` after diagnosis? Find this call.
  e) What happens when NO pattern matches? Does it write anything to the DB?
     If it writes nothing on no-match, the incident stays with `status='detected'`
     and is never diagnosed. Users see a perpetually "detected" incident with no RCA.

Q2.4 — `github-webhook/index.ts`:
  a) Does it verify the `X-Hub-Signature-256` header? Find the HMAC verification code.
     If missing: SECURITY VULNERABILITY — anyone can POST fake pipeline events.
  b) What event types does it handle? Find the `if (event === 'workflow_run')` style checks.
  c) Does it write to the `pipelines` table? Find the INSERT statement.
  d) What is the webhook URL currently pointing to in the GitHub App settings?
     Is it the real Supabase Edge Function URL or a placeholder?

Q2.5 — `connect-cluster/index.ts`:
  a) What URL does the generated helm command use for the chart repository?
     Report the exact string. The report admits this points to `charts.autostack.io`
     which does not exist. Confirm this is still a placeholder.
  b) Does it validate the user has an org before creating a cluster?
     If a user somehow bypasses onboarding and calls this directly, can they
     create a cluster orphaned from any org?

Q2.6 — CORS Headers — check ALL edge function files:
  For each of the 9 functions, confirm or deny: does it have an OPTIONS preflight handler?
  Format your answer as:
    auth-hook: ✅ has OPTIONS handler / ❌ missing OPTIONS handler
    coie-cycle: ✅ / ❌
    (etc.)
  Missing OPTIONS handlers cause all browser requests to fail with CORS errors.
  This is a common silent killer — the function works in curl but fails in the browser.

Q2.7 — Are there any functions mentioned in the blueprint that are NOT deployed?
  Check for these — report MISSING if not found in the functions directory:
  - `invite-member` ← report says "9 functions" but doesn't list this
  - `send-notification` ← is this a separate function or inlined in aire-detect?
  - `weekly-digest` ← does this exist?
  - `die-analyze` ← does this exist in any form?

---

# BLOCK 3 — FRONTEND WIRING VERIFICATION
# The report says hooks exist and tabs use real data, but "some empty states aren't wired"

Q3.1 — Open `src/hooks/useData.js` (the 180+ line file the report calls "the most important file").
For EACH hook exported from this file:
  a) Name of the hook
  b) Exact Supabase query (table + filters + select)
  c) Does it have `loading` state set correctly? (true before fetch, false after)
  d) Does it have `error` state?
  e) Does it have a realtime subscription?
  f) Does the useEffect cleanup return `() => supabase.removeChannel(channel)`?
  g) Is there a default/fallback value if the query returns empty array?

List any hook that is MISSING cleanup, missing error state, or missing loading state.
These are the hooks most likely to cause the "sometimes misses updates" issue
mentioned in the report.

Q3.2 — Open each tab file and answer: is it using real hook data or hardcoded arrays?
Check for patterns like `const fakeProjects = [...]` or `const data = [{ name: 'Mock...' }]`
vs `const { data: projects } = useProjects(clusterId)`.

Report for each:
  OverviewTab.jsx — hook or fake?
  ProjectsTab.jsx — hook or fake?
  PipelinesTab.jsx — hook or fake?
  InfrastructureTab.jsx — hook or fake?
  MonitoringTab.jsx — hook or fake?
  IncidentsTab.jsx — hook or fake? (NOTE: report mentions this tab — is it the 7th tab?)
  LogsTab.jsx — hook or fake?
  SettingsTab.jsx — hook or fake?

Q3.3 — The report says "some tabs still default to 'No Data' rather than EmptyState component".
Scan every tab file for the pattern: `length === 0` or `!data` checks.
For each one found: is it rendering the `EmptyState` component or just `null` / empty div / text?

Q3.4 — The report calls `src/components/ui/index.jsx` a "10K+ line component library".
This is a red flag. Open it and answer:
  a) What is the EXACT line count?
  b) How many components are exported from this single file?
  c) Is it being imported as a whole `import { Button, Card, Modal } from './ui'`
     or are individual components properly split?
  d) Does React.lazy work correctly when components come from a 10K+ line monolithic file?
     (Answer: it doesn't — lazy() only code-splits at the module boundary, not within a file.
     All 10K lines load eagerly regardless of lazy. Report this as a performance issue.)

Q3.5 — React.lazy + Suspense verification:
  Open `src/App.jsx` or `src/components/Dashboard.jsx`.
  a) Find every `React.lazy(() => import(...))` call. List them.
  b) Is there a `<Suspense fallback={...}>` wrapper around the lazy components?
  c) What does the Suspense fallback render? SkeletonCard? Spinner? Null?
  d) If the fallback is null or a simple spinner: the "tab switch" experience shows
     a blank flash. Confirm or deny this happens.

Q3.6 — AuthGuard implementation:
  Open the AuthGuard component. Answer:
  a) What exactly does it check? `supabase.auth.getSession()` or listening to `onAuthStateChange`?
  b) What does it show during the initial session load? (The race condition window)
     If it shows the login page for 200-500ms before realizing user is logged in,
     that's a visible flash. Confirm or deny.
  c) Does it check for CLUSTERS to decide between /onboarding and /dashboard?
     i.e., does a user with no clusters get redirected to /onboarding?

Q3.7 — The `⌘K` Command Palette:
  a) Does it open on BOTH `Ctrl+K` (Windows/Linux) AND `Cmd+K` (Mac)?
  b) Are the navigation actions inside it wired to React Router navigation
     or do they use `window.location.href =`? The latter causes full page reloads.
  c) Can it be navigated with arrow keys? Does Enter trigger the action?
  d) Does it filter results in real time as you type?

---

# BLOCK 4 — THE THREE KNOWN BROKEN AREAS
# The report is honest about these. Verify the exact extent of each.

Q4.1 — AGENT TOKEN LIFECYCLE
  The report says: "no automated rotation logic — you have to manually delete the cluster row"
  
  a) In `connect-cluster/index.ts`: after the token is used to register, is
     `agent_token_used` set to `TRUE`? Is there ANY code that checks this field?
  b) If I took a valid `agent_token` from the `clusters` table and called
     `agent-heartbeat` with it 1000 times, would it succeed all 1000 times?
     Is there ANY rate limiting or token invalidation?
  c) Is there any "rotate token" functionality in the Settings tab?
     Can a user even see their agent token in the UI, let alone rotate it?

Q4.2 — LOGS TAB — NO PERSISTENCE
  The report says: "only shows Live logs while the tab is open"
  
  a) Open `LogsTab.jsx`. Where do the log lines come from?
     - Random simulation in a useEffect? OR
     - Real data from `agent-metrics` Edge Function writing to a logs table?
  b) Is there actually a `logs` table in the database? Check the migration.
     If not: the "live logs" are 100% fake simulation with no backend at all.
  c) Does `agent-metrics/index.ts` write log lines anywhere?
     Find the section that handles log ingestion vs. just metrics.
  d) If logs are purely simulated: this needs to be explicitly stated in the UI
     as "Sample Data" not presented as real cluster logs.

Q4.3 — EMPTY PROJECTS EXPERIENCE
  The report says: "Projects tab looks lonely if you haven't connected GitHub"
  
  a) What EXACTLY does the Projects tab show when `projects` table is empty for this user?
     Screenshot or describe pixel-for-pixel what renders.
  b) Is the EmptyState component rendered or is it an empty table with column headers?
  c) Does the empty state have a "Connect repository" CTA button?
  d) Does clicking that button open the New Project modal?
  e) In the New Project modal: when a user submits a repo URL, what happens?
     Does it call the DIE engine? Does it call any Edge Function?
     Or does it just add a row to the `projects` table with `analysis_status = 'pending'`
     that never gets processed?

---

# BLOCK 5 — THIRD-PARTY INTEGRATIONS VERIFICATION

Q5.1 — PostHog:
  Open `src/lib/analytics.js`. List:
  a) Is `posthog.init()` called in `main.jsx` before the React render?
  b) Is `posthog.identify()` called after successful login with user.id, email, org data?
  c) List every `posthog.capture()` event currently tracked. If there are fewer than 5
     custom events tracked, the analytics setup is effectively unused.
  d) Is PostHog disabled in development? (`if (import.meta.env.PROD)` guard)

Q5.2 — Sentry:
  a) What is `tracesSampleRate` set to? If it's `1.0`, this is a cost problem.
     Should be `0.1` for production.
  b) Is the app wrapped in `Sentry.ErrorBoundary`? Find this in main.jsx or App.jsx.
  c) Is `sentryVitePlugin` installed in vite.config.js for source map upload?
     Without this, Sentry shows minified stack traces — effectively useless.
  d) Is `Sentry.setUser()` called after login? Without it, all errors are anonymous.

Q5.3 — Resend:
  a) Is the 90-email/day quota guard actually implemented?
     Find the Redis counter check in `send-notification` or `auth-hook`.
     If it's missing: hitting the Resend free tier 100/day limit will cause
     authentication emails (password reset, confirmation) to silently fail.
  b) Is `RESEND_API_KEY` in the Edge Function secrets (Supabase Dashboard)?
     If it's in `.env.local` on the dev machine but NOT in Supabase secrets,
     the auth-hook welcome email has been silently failing in production.

Q5.4 — Upstash Redis:
  a) Open `src/lib/redis.js`. What is it currently used for?
     List every `redis.get()` and `redis.set()` call in the codebase.
  b) Do ALL `redis.set()` calls include `{ ex: N }` expiry? Find any that don't.
  c) Is the `isRateLimited` function the report mentions actually called anywhere?
     Or was it written but never wired to any Edge Function?

---

# BLOCK 6 — BUILD & BUNDLE HEALTH

Q6.1 — The report says bundle sizes are:
  - index-*.js: ~440 KB
  - ui-charts-*.js: ~355 KB  
  - error-tracking-*.js: ~450 KB ← THIS IS TOO LARGE

The Sentry SDK at 450KB is larger than the entire React core + your app logic combined.
This will hurt First Contentful Paint on slow connections.
  a) Is `@sentry/react` imported at the top of `main.jsx` (loaded on every page)?
     Or is it lazy-loaded?
  b) Is the Sentry bundle properly tree-shaken? Check vite.config.js manualChunks.
  c) Is Sentry loaded at all on the landing page, where error tracking is less critical?

Q6.2 — The `ui/index.jsx` at 10K+ lines:
  a) What is it imported in? Is it imported in the main bundle or only in dashboard chunks?
  b) Does the landing page import anything from this file?
     If yes: the entire 10K line component library loads on the landing page,
     killing the marketing page performance.

Q6.3 — Run `npm run build` and paste the complete output including:
  - All chunk names and their sizes
  - Any warnings about chunk sizes > 500KB
  - Build time
  - Any errors

---

# BLOCK 7 — SECURITY SPOT CHECK

Q7.1 — Search the ENTIRE `src/` directory for the string `SERVICE_ROLE`.
Report every file where this appears. If it appears in ANY file under `src/`,
this is a P0 security breach. The service role key must only live in Edge Functions.

Q7.2 — Search all source files for hardcoded strings that look like:
  - `eyJ` (base64-encoded JWT — possible hardcoded token)
  - `re_` (Resend key pattern)
  - `sk-` (OpenAI key pattern)
  - `phc_` (PostHog key pattern)
  - Any string longer than 40 chars that's not in an .env file
  
Q7.3 — Is `.env.local` in `.gitignore`? Open `.gitignore` and confirm.
  Also: has `.env.local` ever been committed? Run in mind:
  `git log --all --full-history -- .env.local`
  If this returns any commits, the keys have been exposed and must ALL be rotated immediately.

Q7.4 — The `github-webhook` function: find the HMAC signature verification.
  If it processes webhook payloads WITHOUT verifying the signature,
  anyone on the internet can send fake pipeline events to your database.

---

# BLOCK 8 — THE FINAL HONEST STATUS MATRIX

After examining everything above, produce this exact matrix:

| System | Claimed Status | Actual Status | Blocker? |
|--------|---------------|---------------|----------|
| Auth (email) | ✅ Working | [verify] | — |
| Auth (GitHub OAuth) | ✅ Working | [verify] | — |
| Auth Hook (org creation) | ✅ Working | [verify] | YES |
| RLS / Org isolation | ✅ Working | [verify] | YES |
| COIE scoring | 🟡 Static rules | [verify extent] | — |
| COIE → findings insert | 🟡 Partial | [verify] | — |
| COIE → cron auto-trigger | ✅ Working | [verify] | — |
| AIRE pattern matching | 🟡 Keyword-only | [verify patterns] | — |
| AIRE → incident update | [unknown] | [verify] | — |
| AIRE → notification call | [unknown] | [verify] | — |
| incident_patterns seed data | [unknown] | [verify] | YES |
| DIE engine (PR generation) | 🔴 Null/mocked | [verify extent] | — |
| Agent binary | 🔴 Missing | Confirmed missing | — |
| Log persistence | 🔴 Missing | [verify if really fake] | — |
| Agent token rotation | 🔴 Missing | Confirmed missing | — |
| Realtime subscriptions | ✅ Working | [verify cleanup] | — |
| Toast system | ✅ Working | [verify wiring] | — |
| Empty states (all tabs) | 🟡 Partial | [list which] | — |
| Form validation | 🟡 Visual only | [verify] | — |
| Sentry (production-safe) | [unknown] | [verify sampleRate] | — |
| Resend quota guard | [unknown] | [verify] | YES |
| Upstash Redis TTL discipline | [unknown] | [verify] | YES |
| CORS on all functions | [unknown] | [verify all 9] | YES |
| GitHub webhook HMAC | [unknown] | [verify] | YES (security) |
| .env.local in .gitignore | [unknown] | [verify] | YES (security) |

---

# DELIVERY FORMAT

Produce your report in this structure:

## SECTION A — CRITICAL BLOCKERS (fix these before anything else)
List every item that, if broken, prevents a real user from signing up and seeing data.
Include: what is broken, which file, which line, what the exact fix is.

## SECTION B — SECURITY VULNERABILITIES (fix these before any public access)
List every security gap found. Severity: P0 (fix now) / P1 (fix this week).

## SECTION C — FUNCTIONAL GAPS (features that are incomplete)
Categorized by engine: COIE / AIRE / DIE / Auth / Frontend

## SECTION D — PERFORMANCE ISSUES (fix before scaling)
Bundle size problems, missing indexes, unbounded queries.

## SECTION E — CONFIRMED WORKING (what we can stop worrying about)
List only what you VERIFIED working, not what the report claimed.

## SECTION F — THE PRIORITY FIX LIST
Numbered list. Exact order to fix things. Dependencies noted.
Each item: what to fix, estimated time, why this order.

---
# REMINDER: DO NOT WRITE CODE. DO NOT MAKE CHANGES.
# READ EVERY FILE. CITE EXACT LINE NUMBERS.
# BE BRUTALLY HONEST. THE REPORT ALREADY WAS — CONTINUE THAT STANDARD.
