# ╔══════════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — PRODUCTION COMPLETION MASTER PROMPT                   ║
# ║   For: Antigravity AI IDE                                           ║
# ║   Status Baseline: Immediate Fixes Done. Phases 3→5 Remaining.     ║
# ║   Goal: Enterprise-Grade Production. Zero Shortcuts.                ║
# ╚══════════════════════════════════════════════════════════════════════╝

---

# HOW TO READ AND USE THIS DOCUMENT

This is a single sequential instruction set. Work through it exactly in the order written.
Do not skip ahead. Do not combine tasks from different phases.
Every task ends with a VERIFICATION block — run it before marking the task complete.
Mark each task ✅ DONE in a running `PROGRESS.md` file you maintain as you go.

The quality bar is enterprise-grade:
- Every feature handles all three states: loading, error, empty
- Every async call has error handling
- Every user action gives feedback within 100ms
- Every secret stays out of the frontend
- Every DB query has a LIMIT
- Every Redis set has an expiry
- Every Supabase realtime subscription has cleanup

---

# CONFIRMED COMPLETE (DO NOT REDO)

The following have been verified and are done. Skip them entirely.

✅ incident_patterns table — 10 rows seeded
✅ Realtime subscription cleanup — verified in all hooks
✅ Sentry tracesSampleRate — already 0.1 in production
✅ FIX 3/4/6 from File2 — confirmed done

---

# PHASE 3 — AI INTELLIGENCE TIER 2 + NOTIFICATIONS
## Branch: `feature/phase3-ai-and-notifications`
## Milestone: v0.2.0
## Prerequisites: All immediate fixes confirmed done

---

## TASK 3.1 — SEND-NOTIFICATION EDGE FUNCTION

### What it is
A standalone Supabase Edge Function (`supabase/functions/send-notification/index.ts`) that
is the single gateway for ALL notifications leaving the system. Nothing in the codebase
calls Resend directly except this function. COIE, AIRE, and the agent heartbeat system
all call this function. It handles delivery channel routing, quota enforcement, and cooldowns.

### Architecture rules
- NEVER call Resend from any other function — only through send-notification
- NEVER send a notification without checking the user's `notification_prefs` first
- NEVER send the same notification twice in 30 minutes (Redis cooldown key)
- NEVER crash the calling function when email fails — notifications are non-blocking

### Input payload schema
The function accepts a POST with JSON body:
```
{
  "type": string,         // incident_detected | score_changed | agent_disconnected |
                          // incident_resolved | finding_critical | weekly_digest |
                          // invite_member | welcome | password_reset
  "org_id": string,       // UUID — used to look up notification prefs
  "cluster_id": string,   // UUID — optional, for cooldown keying
  "recipient_email": string,
  "recipient_name": string,
  "payload": object       // type-specific data (see each template below)
}
```

### Implementation — step by step

**Step 1: CORS + Auth check**
OPTIONS preflight returns 200 with CORS headers immediately.
All POST requests must have Authorization header with service role token OR an
internal shared secret (`NOTIFICATION_SECRET` env var). Functions calling this
internally use the shared secret. Never expose this to the frontend.

**Step 2: Quota check**
```
key = "email:quota:" + todayKey()   // todayKey() = YYYY-MM-DD in UTC
count = await redis.incr(key)
if count === 1: await redis.expire(key, 86400)   // first write of the day — set 24h TTL
if count > 90:
  log to Sentry: "Email quota at {count}/100 — suppressing: {type}"
  // Try Slack if available (see Step 3b below)
  return { success: false, reason: "quota_exceeded", quota: count }
```

**Step 3a: Cooldown check (for repeating event types)**
For these types only: `incident_detected`, `score_changed`, `agent_disconnected`, `finding_critical`
```
cooldownKey = "notif:cooldown:" + org_id + ":" + (cluster_id || '') + ":" + type
exists = await redis.get(cooldownKey)
if exists: return { success: false, reason: "cooldown_active" }
// After sending: set cooldown
await redis.set(cooldownKey, "1", { ex: 1800 })  // 30 minute cooldown
```

**Step 3b: Slack delivery (parallel to email)**
```
// Check integrations table for this org's Slack webhook
integration = SELECT config FROM integrations WHERE org_id = ? AND name = 'slack' AND status = 'connected'
if integration exists:
  slackPayload = buildSlackMessage(type, payload)
  await fetch(integration.config.webhook_url, { method: 'POST', body: JSON.stringify(slackPayload) })
  // Slack failure must not block email — wrap in separate try/catch
```

**Step 4: User prefs check**
```
prefs = SELECT * FROM notification_prefs WHERE user_id = (SELECT user_id FROM org_members WHERE org_id = ? AND role IN ('owner', 'admin') LIMIT 1)
// Map notification type to pref column:
type_to_pref_map = {
  incident_detected: 'event_incident',
  score_changed: 'event_score_change',
  agent_disconnected: 'event_incident',
  incident_resolved: 'event_incident',
  finding_critical: 'event_incident',
  weekly_digest: 'event_weekly_digest'
}
// Special types (invite_member, welcome, password_reset) always send — no pref check
if pref column exists AND prefs[mapped_col] === false:
  return { success: false, reason: "pref_disabled" }
```

**Step 5: HTML email template selection + rendering**
Select the correct template function based on `type`. Each template is a TypeScript function
that takes the payload and returns an HTML string. Inline CSS only — no `<style>` tags.

Templates to implement (see below for each spec):
- `templateIncidentDetected(payload)`
- `templateScoreChanged(payload)`
- `templateAgentDisconnected(payload)`
- `templateIncidentResolved(payload)`
- `templateFindingCritical(payload)`
- `templateWeeklyDigest(payload)`
- `templateInviteMember(payload)`
- `templateWelcome(payload)`

**Step 6: Resend API call**
```typescript
const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    from: 'AutoStack <alerts@autostack.io>',
    to: recipient_email,
    subject: subjectForType(type, payload),
    html: htmlContent
  })
})
if (!res.ok) {
  const err = await res.json()
  // Log to Sentry — do NOT throw — do NOT fail the response
  Sentry.captureException(new Error(`Resend failed: ${err.message}`), { extra: { type, org_id } })
  return { success: false, reason: "resend_error", detail: err.message }
}
return { success: true, email_id: (await res.json()).id }
```

### Email template specifications

**`incident_detected` subject:** `⚠️ AutoStack: [PATTERN_NAME] detected in [CLUSTER_NAME]`

Body structure:
```
[AutoStack logo — inline SVG, 24px height]
[Red alert banner: "Incident Detected" with warning icon]

Cluster: [cluster name]                    Severity: [critical|high|medium|low] badge
Detected: [detected_at formatted as "March 13, 2026 at 4:23 PM IST"]

[Gray card]
Pattern: [matched_pattern display name OR "Unknown Pattern"]
Confidence: [pattern_confidence as percentage]

[Root Cause section]
[root_cause text]

[Immediate Action section — blue highlight box]
[immediate_action text]

[CTA Button: "View Incident →" → links to /dashboard with incidents tab active]

[Footer: "AutoStack Monitoring" | "Manage Preferences" | "Unsubscribe" ]
```

**`score_changed` subject:** `📊 AutoStack: Cluster health score changed from [OLD] to [NEW]`

Body: Show 4 dimension score cards side by side (table layout for email compat).
Show the dimension that changed the most. Show the top new finding (if score dropped).
If score went up: celebrate with positive copy "Your [security] score improved by [N] points."

**`agent_disconnected` subject:** `🔴 AutoStack: Agent disconnected — [CLUSTER_NAME]`

Body: Cluster name, last seen time formatted as relative ("3 minutes ago"), reconnect
instructions (the helm upgrade command), link to Settings → Infrastructure.

**`invite_member` subject:** `You've been invited to [ORG_NAME] on AutoStack`

Body: Invited by [inviter name], org name, role they'll have, accept button linked to
`/accept-invite?token=[token]`, expires in 7 days note.

**`welcome` subject:** `Welcome to AutoStack, [first_name]! Connect your first cluster`

Body: First name, 3-step visual (numbered) of what to do next: 1) connect cluster,
2) add repository, 3) watch COIE score. Single CTA: "Connect Your Cluster →" → `/onboarding`.

### Slack message format (for each type)
Use Slack Block Kit (not plain text webhooks). Each Slack message:
- Header block with appropriate emoji and event type
- Section block with key details
- Context block with timestamp + cluster name
- Actions block with a "View in AutoStack →" button

### Unsubscribe endpoint
Create a separate Edge Function: `supabase/functions/unsubscribe/index.ts`
Accepts GET request with `?token=[signed_token]&type=[pref_column]`.
The signed token is generated when sending the email:
```typescript
// Generate: hmac-sha256 of (user_id + pref_column + secret_key)
// Include in email as query param
// Verify on receipt — if valid, UPDATE notification_prefs SET [pref_column] = false
// Show a "You've been unsubscribed" HTML page in the response
```
This must work WITHOUT requiring the user to log in.

### VERIFICATION
1. Deploy the function
2. curl it with a test payload (type: welcome)
3. Check: email arrives in test inbox within 60 seconds
4. Check: Resend dashboard logs the send
5. Call it again immediately: verify cooldown returns `{ reason: "cooldown_active" }`
6. Manually set the Redis quota to 91: verify `{ reason: "quota_exceeded" }`
7. Check: calling function does NOT crash — returns graceful error object

---

## TASK 3.2 — COIE NOTIFICATION WIRING

### What to add to `coie-cycle/index.ts`

After the COIE evaluation completes and DB writes are done, add notification calls.

**Notification trigger 1: New critical finding**
```typescript
const newCriticalFindings = insertedFindings.filter(f => f.severity === 'critical')
if (newCriticalFindings.length > 0) {
  await callSendNotification({
    type: 'finding_critical',
    org_id: cluster.org_id,
    cluster_id: cluster.id,
    payload: {
      cluster_name: cluster.name,
      findings: newCriticalFindings.slice(0, 3),  // top 3 only
      total_critical: newCriticalFindings.length,
      dashboard_url: `${APP_URL}/dashboard`
    }
  })
}
```

**Notification trigger 2: Score changed by 10+ points**
```typescript
const scoreDelta = Math.abs(newHealthScore - cluster.health_score)
if (scoreDelta >= 10) {
  await callSendNotification({
    type: 'score_changed',
    org_id: cluster.org_id,
    cluster_id: cluster.id,
    payload: {
      cluster_name: cluster.name,
      old_score: cluster.health_score,
      new_score: newHealthScore,
      direction: newHealthScore > cluster.health_score ? 'up' : 'down',
      old_dimensions: { security: cluster.score_security, ... },
      new_dimensions: { security: newSecurityScore, ... },
      top_finding: insertedFindings[0] || null
    }
  })
}
```

`callSendNotification` is a helper that fetches the send-notification Edge Function URL
from env vars and POSTs with the internal shared secret.

### VERIFICATION
1. Manually set a cluster's health_score to 80 in Supabase
2. Trigger coie-cycle with that cluster_id
3. If new score is 70 or below → check email inbox for score_changed notification
4. Check: COIE still completes even if the notification call fails (try/catch wraps it)

---

## TASK 3.3 — AIRE NOTIFICATION WIRING

### What to add to `aire-detect/index.ts`

After writing the diagnosis to the incidents table:

```typescript
// Always notify on AIRE diagnosis (regardless of confidence)
await callSendNotification({
  type: 'incident_detected',
  org_id: cluster.org_id,
  cluster_id: cluster.id,
  payload: {
    cluster_name: cluster.name,
    incident_id: incident.id,
    pattern_name: incident.matched_pattern || 'Unknown Pattern',
    pattern_display: formatPatternName(incident.matched_pattern),  // OOM_KILL → "Out of Memory Kill"
    confidence: incident.pattern_confidence,
    severity: incident.severity,
    affected_resource: incident.affected_resource,
    namespace: incident.namespace,
    root_cause: incident.root_cause,
    immediate_action: incident.immediate_action,
    detected_at: incident.detected_at,
    dashboard_url: `${APP_URL}/dashboard?tab=incidents&id=${incident.id}`
  }
})
```

### VERIFICATION
1. Insert a test incident with `trigger_type='pod_restart'`, `summary contains 'OOMKilled'`
2. Wait for AIRE webhook trigger (< 10 seconds)
3. Check incident row: matched_pattern populated, status = 'diagnosed'
4. Check email inbox: incident_detected email arrives
5. Check email content: resource name is correctly inserted (not a generic template)

---

## TASK 3.4 — AIRE TIER 2: SEMANTIC MATCHING VIA OPENAI + PGVECTOR

### Only start after Tasks 3.1, 3.2, 3.3 are verified working

### What this adds
When AIRE's keyword matching confidence is below 0.65, instead of immediately
giving up and writing "unknown pattern", it runs a semantic similarity search
using OpenAI embeddings against the incident_patterns table.

### Changes to `aire-detect/index.ts`

**Add after keyword matching section:**
```typescript
// If keyword confidence < 0.65, try semantic matching
if (bestMatch.confidence < 0.65) {
  const semanticMatch = await runSemanticMatch(incidentSummary, supabase)
  if (semanticMatch && semanticMatch.similarity > 0.80) {
    // Semantic match found — use it with lower confidence
    bestMatch = {
      pattern: semanticMatch.pattern,
      confidence: semanticMatch.similarity * 0.90,  // slight penalty vs keyword match
      source: 'semantic'
    }
  }
}
```

**The `runSemanticMatch` function:**
```typescript
async function runSemanticMatch(text: string, supabase: SupabaseClient) {
  // 1. Hash the input for cache key
  const hash = await hashText(text)  // sha256 hex string, first 16 chars
  const cacheKey = `aire:emb:${hash}`

  // 2. Check Redis cache
  let embedding: number[]
  const cached = await redis.get(cacheKey)
  if (cached) {
    embedding = JSON.parse(cached as string)
  } else {
    // 3. Generate embedding via OpenAI
    // IMPORTANT: wrap in try/catch — if OpenAI is down, return null gracefully
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',  // cheapest, still excellent
          input: text.slice(0, 512)         // limit tokens — incident summaries are short
        })
      })
      if (!res.ok) throw new Error(`OpenAI ${res.status}`)
      const data = await res.json()
      embedding = data.data[0].embedding
      // 4. Cache result for 24 hours
      await redis.set(cacheKey, JSON.stringify(embedding), { ex: 86400 })
    } catch (err) {
      // OpenAI unavailable — log and return null (graceful degradation)
      Sentry.captureException(err, { extra: { context: 'aire_semantic_match' } })
      return null
    }
  }

  // 5. pgvector similarity search
  const { data: patterns, error } = await supabase.rpc('match_incident_patterns', {
    query_embedding: embedding,
    match_threshold: 0.75,
    match_count: 1
  })
  if (error || !patterns?.length) return null
  return { pattern: patterns[0], similarity: patterns[0].similarity }
}
```

**Add the pgvector RPC function to the database:**
```sql
-- In a new migration: 003_pgvector_search.sql
CREATE OR REPLACE FUNCTION match_incident_patterns(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 1
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  diagnosis_template text,
  remediation_type text,
  immediate_action text,
  permanent_fix text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, name, description, diagnosis_template,
    remediation_type, immediate_action, permanent_fix,
    1 - (embedding <=> query_embedding) AS similarity
  FROM incident_patterns
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**Populate embeddings for the 10 seeded patterns:**
Create a one-time script: `supabase/scripts/populate-pattern-embeddings.ts`
This script reads all `incident_patterns` rows where `embedding IS NULL`,
generates an embedding for `name + ' ' + description + ' ' + matching_criteria::text`,
updates the row. Run once manually after deployment.

### Cost tracking
Add to AIRE: before every OpenAI call (cache miss), increment a daily counter:
```typescript
await redis.incr('openai:calls:' + todayKey())
// Set TTL on first write: await redis.expire('openai:calls:' + todayKey(), 86400)
```
Log to Sentry if this exceeds 100/day with severity 'warning'.
At ~100 tokens per call and $0.02/1M tokens: 100 calls costs $0.0002. Essentially free,
but tracking ensures you notice any abuse patterns.

### VERIFICATION
1. Remove keywords from a test incident that would trigger keyword matching
2. Use text that semantically describes OOM kill without using those words:
   e.g., "Container exceeded memory allocation and was forcibly terminated by kernel"
3. Trigger AIRE on this incident
4. Verify: `matched_pattern = 'OOM_KILL'`, `source` field shows 'semantic'
5. Check Redis: the embedding is cached (second call should not hit OpenAI)
6. Turn off OpenAI (set wrong API key): verify AIRE still completes, falls back to "unknown pattern"

---

# PHASE 4 — DIE ENGINE: DEPLOYMENT INTELLIGENCE
## Branch: `feature/phase4-die-engine`
## Milestone: v0.3.0
## Prerequisites: Phase 3 fully verified

---

## TASK 4.1 — GITHUB APP CREATION AND INSTALLATION

### GitHub App setup (manual step — document exact settings)

Create a GitHub App at `github.com/settings/apps/new`:

**Name:** `AutoStack`
**Homepage URL:** `https://autostack.io` (or your dev URL while testing)
**Webhook URL:** `https://[project-ref].supabase.co/functions/v1/github-webhook`
**Webhook Secret:** generate with `openssl rand -hex 32`, store in Supabase secrets as `GITHUB_WEBHOOK_SECRET`

**Repository Permissions:**
- Contents: Read and Write
- Pull requests: Read and Write
- Metadata: Read-only (forced, required)
- Actions: Read-only
- Checks: Read-only

**Subscribe to events:**
- workflow_run
- push
- pull_request
- installation (for tracking installs/uninstalls)

After creating: download the private key `.pem` file and store as `GITHUB_APP_PRIVATE_KEY` in Supabase secrets (the full PEM content as a string with `\n` for newlines).
Store App ID as `GITHUB_APP_ID`.

### Installation callback Edge Function

Create `supabase/functions/github-app-callback/index.ts`

This function is hit when GitHub redirects back after the user installs the App:
URL format: `/functions/v1/github-app-callback?installation_id=XXX&state=YYY`

**Steps:**
1. Verify the `state` parameter against a value stored in Redis before redirecting user to GitHub (CSRF protection). Key: `github:oauth:state:[state]`, TTL 10 minutes.
2. Exchange `installation_id` for an installation access token:
   - Generate a GitHub App JWT (valid for 10 minutes):
     - Header: `{ alg: "RS256", typ: "JWT" }`
     - Payload: `{ iat: now-60, exp: now+600, iss: GITHUB_APP_ID }`
     - Sign with the RSA private key
   - `POST https://api.github.com/app/installations/{installation_id}/access_tokens` with the JWT in the Authorization header
3. Fetch the list of accessible repositories from the installation
4. Upsert into `integrations` table:
   ```sql
   INSERT INTO integrations (org_id, name, status, config, connected_at)
   VALUES (?, 'github', 'connected', {installation_id, account_login, repos_count}, NOW())
   ON CONFLICT (org_id, name) DO UPDATE SET
     status = 'connected', config = EXCLUDED.config, connected_at = NOW()
   ```
5. Redirect user to `/dashboard?tab=settings&section=integrations&connected=github`
6. The redirect triggers a toast: "GitHub connected successfully"

### GitHub token helper (used by all DIE functions)

Create `supabase/functions/_shared/github.ts` (shared across functions):

```typescript
// Get a valid installation access token (auto-refreshes)
export async function getInstallationToken(installation_id: string, redis: Redis): Promise<string> {
  const cacheKey = `github:token:${installation_id}`
  const cached = await redis.get(cacheKey)
  if (cached) return cached as string

  // Generate App JWT
  const jwt = await generateAppJWT()

  // Exchange for installation token
  const res = await fetch(
    `https://api.github.com/app/installations/${installation_id}/access_tokens`,
    { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' } }
  )
  const data = await res.json()

  // Cache for 55 minutes (token expires in 60 min — 5 min buffer)
  await redis.set(cacheKey, data.token, { ex: 3300 })
  return data.token
}
```

### VERIFICATION
1. Go to Settings → Integrations → GitHub → "Connect GitHub App"
2. Complete GitHub installation flow
3. Return to app: integration card shows "Connected" in green
4. Check `integrations` table: one row with `name='github'`, `status='connected'`
5. Check Redis: `github:token:[installation_id]` key exists with ~55min TTL
6. Disconnect and reconnect: verify upsert works (no duplicate rows)

---

## TASK 4.2 — GITHUB WEBHOOK HARDENING + PIPELINE SYNC

### Update `supabase/functions/github-webhook/index.ts`

This function was partially implemented. Harden and complete it.

**HMAC verification (if not already done — this is FIX 11 from File2):**
```typescript
// MUST be the first thing after OPTIONS check
const signature = req.headers.get('X-Hub-Signature-256')
const body = await req.text()

if (!signature) return new Response('Unauthorized', { status: 401 })

const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET')!
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
const sigBytes = hexToBytes(signature.replace('sha256=', ''))
const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(body))

if (!valid) return new Response('Forbidden', { status: 403 })

const payload = JSON.parse(body)
```

**Event routing:**

Handle these GitHub event types:

`workflow_run` event:
```typescript
// A GitHub Actions workflow started, completed, or failed
if (event === 'workflow_run') {
  const run = payload.workflow_run
  // Find the project by repo URL
  const { data: project } = await supabase
    .from('projects')
    .select('id, cluster_id')
    .eq('repo_url', run.repository.html_url)
    .single()

  if (!project) return ok()  // not a repo we're tracking

  // Upsert pipeline record
  await supabase.from('pipelines').upsert({
    project_id: project.id,
    cluster_id: project.cluster_id,
    github_run_id: String(run.id),
    branch: run.head_branch,
    commit_sha: run.head_sha,
    status: mapGitHubStatus(run.status, run.conclusion),
    // status map: queued→queued, in_progress→running, completed+success→success,
    //             completed+failure→failed, completed+cancelled→cancelled
    stages: run.steps?.map(s => ({
      name: s.name,
      status: mapGitHubStatus(s.status, s.conclusion),
      duration_ms: s.completed_at ? Date.parse(s.completed_at) - Date.parse(s.started_at) : null
    })) || [],
    started_at: run.created_at,
    completed_at: run.completed_at || null,
    duration_ms: run.completed_at ? Date.parse(run.completed_at) - Date.parse(run.created_at) : null
  }, { onConflict: 'github_run_id' })
}
```

`push` event:
```typescript
if (event === 'push') {
  // Insert a deployment record for tracked repos
  const repoUrl = payload.repository.html_url
  const { data: project } = await supabase.from('projects')
    .select('id, cluster_id').eq('repo_url', repoUrl).single()
  if (!project) return ok()

  await supabase.from('deployments').insert({
    project_id: project.id,
    cluster_id: project.cluster_id,
    commit_sha: payload.after,
    commit_msg: payload.head_commit?.message?.slice(0, 200),
    branch: payload.ref.replace('refs/heads/', ''),
    triggered_by: 'github_push',
    status: 'running'  // agent will update this when it detects the rollout
  })
}
```

`pull_request` event:
```typescript
if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request.merged) {
  // A PR was merged — if it's a COIE/DIE PR, update the finding
  const prUrl = payload.pull_request.html_url
  await supabase.from('findings')
    .update({ status: 'resolved' })
    .eq('pr_url', prUrl)
}
```

### VERIFICATION
1. Push to a connected GitHub repository
2. Within 30 seconds: check `deployments` table — new row with the commit SHA
3. A GitHub Actions run should create/update a `pipelines` row
4. Send a fake webhook with wrong HMAC: verify 403 response
5. Send with correct HMAC but wrong event: verify graceful 200 (ignored)

---

## TASK 4.3 — DIE REPOSITORY ANALYSIS ENGINE

### Create `supabase/functions/die-analyze/index.ts`

This is the most complex Edge Function in the project.
It is called when a user submits a new project in the dashboard.
It runs the full analysis → generation → PR flow.

**Execution time budget:**
The entire function must complete within 8 seconds. If it will take longer (large repos),
immediately return `{ status: 'analyzing', project_id }` and continue in the background
by posting to a queue key in Redis that a separate scheduled function polls.
In practice: GitHub API fetches are fast enough for most repos to complete in < 8 seconds.

**Function signature:**
POST `/functions/v1/die-analyze`
Headers: Authorization: Bearer [user JWT]
Body: `{ project_id: string }`

The `project_id` must already exist in the `projects` table with `analysis_status = 'pending'`.
This means: the frontend creates the project row FIRST (via supabase-js client), then
calls this Edge Function. The project record's `analysis_status` provides progress state.

**Implementation — the full pipeline:**

```typescript
Deno.serve(async (req) => {
  // 1. CORS + Auth (standard pattern)
  if (req.method === 'OPTIONS') return corsResponse()
  const user = await verifyJWT(req)
  if (!user) return unauthorized()

  const { project_id } = await req.json()

  // 2. Fetch project record (verify it belongs to this user's org)
  const { data: project } = await supabase
    .from('projects')
    .select('*, clusters!inner(org_id)')
    .eq('id', project_id)
    .eq('clusters.org_id', user.user_metadata.org_id)
    .single()
  if (!project) return notFound()

  // 3. Get GitHub installation token for this org
  const { data: integration } = await supabase
    .from('integrations')
    .select('config')
    .eq('org_id', user.user_metadata.org_id)
    .eq('name', 'github')
    .single()
  if (!integration) return error('GitHub not connected')

  const token = await getInstallationToken(integration.config.installation_id, redis)

  // 4. Parse repo URL to get owner/repo
  const { owner, repo } = parseRepoUrl(project.repo_url)

  // 5. Update status: fetching
  await setAnalysisStatus(project_id, 'fetching', supabase)

  // 6. Fetch repository tree (top-level only)
  const tree = await fetchRepoTree(owner, repo, project.branch, token)

  // 7. Fetch content of config files (at most 15 files)
  const configFiles = await fetchConfigFiles(owner, repo, project.branch, token, tree)

  // 8. Update status: analyzing
  await setAnalysisStatus(project_id, 'analyzing', supabase)

  // 9. Run language detection
  const detection = detectStack(configFiles)
  // Returns: { language, framework, port, appType, resourceProfile, confidence }

  // 10. Update status: generating
  await setAnalysisStatus(project_id, 'generating', supabase)

  // 11. Generate manifests
  const manifests = generateManifests(detection, {
    appName: repo,
    orgName: owner,
    namespace: project.environment,
    imageRegistry: 'ghcr.io/' + owner + '/' + repo
  })
  // Returns: { 'autostack/Dockerfile': string, 'autostack/k8s/deployment.yaml': string, ... }

  // 12. Update status: opening_pr
  await setAnalysisStatus(project_id, 'opening_pr', supabase)

  // 13. Open PR via GitHub API
  const pr = await openManifestPR(owner, repo, project.branch, manifests, token, detection)
  // Returns: { url: string, number: number }

  // 14. Update project record: complete
  await supabase.from('projects').update({
    analysis_status: 'complete',
    pr_url: pr.url,
    pr_number: pr.number,
    stack: `${detection.framework} (${detection.language})`,
    status: 'healthy'
  }).eq('id', project_id)

  // 15. Send notification
  await callSendNotification({
    type: 'die_pr_opened',
    org_id: user.user_metadata.org_id,
    payload: { repo_url: project.repo_url, pr_url: pr.url, stack: detection.framework }
  })

  return success({ pr_url: pr.url, stack: detection.framework })
})
```

**The `detectStack` function — complete decision tree:**

Input: a `Map<filename, fileContent>` of fetched config files.

Rules (FIRST MATCH WINS — order matters):
```
1. If 'Dockerfile' exists:
   - Parse EXPOSE instruction for port (regex: /EXPOSE (\d+)/)
   - language = 'Docker', framework = 'Custom', appType = 'web-service'
   - resourceProfile = 'standard' (safe default)
   - Return immediately

2. If 'package.json' exists:
   - Parse as JSON
   - deps = { ...dependencies, ...devDependencies }
   - If deps['next']: framework='Next.js', port=3000, appType='web-service', profile='standard'
   - If deps['react-scripts'] OR scripts.build includes 'react-scripts':
     framework='React CRA', port=3000, appType='static-site', profile='micro'
   - If deps['@vitejs/plugin-react'] (standalone): framework='Vite React', appType='static-site', profile='micro'
   - If deps['express'] OR deps['@hapi/hapi'] OR deps['koa']:
     framework='Node.js API', port=3000, appType='api-service', profile='small'
   - If deps['fastify']: framework='Fastify', port=3000, appType='api-service', profile='small'
   - If deps['hono']: framework='Hono', port=8787, appType='api-service', profile='micro'
   - If deps['@nestjs/core']: framework='NestJS', port=3000, appType='api-service', profile='standard'
   - Else: framework='Node.js', port=3000, appType='web-service', profile='small'

3. If 'requirements.txt' OR 'pyproject.toml' exists:
   - content = file content lowercased
   - If contains 'django': framework='Django', port=8000, profile='standard'
   - If contains 'flask': framework='Flask', port=5000, profile='small'
   - If contains 'fastapi': framework='FastAPI', port=8000, profile='standard'
   - If contains 'celery' (no HTTP framework found): framework='Celery', appType='worker', profile='small'
   - If contains 'gunicorn' OR 'uvicorn': framework='Python WSGI/ASGI', port=8000, profile='standard'
   - Else: framework='Python', port=8000, profile='small'

4. If 'go.mod' exists:
   - framework='Go', port=8080, appType='api-service', profile='small'

5. If 'pom.xml' exists:
   - framework='Spring Boot', port=8080, appType='api-service', profile='compute'

6. If 'build.gradle' OR 'build.gradle.kts' exists:
   - framework='Gradle (Java/Kotlin)', port=8080, appType='api-service', profile='compute'

7. If 'Gemfile' exists:
   - If contains 'rails': framework='Ruby on Rails', port=3000, profile='standard'
   - Else: framework='Ruby', port=3000, profile='small'

8. If 'composer.json' exists:
   - If contains 'laravel': framework='Laravel', port=8000, profile='standard'
   - Else: framework='PHP', port=8000, profile='small'

9. If 'Cargo.toml' exists:
   - framework='Rust', port=8080, appType='api-service', profile='small'

10. Default: framework='Unknown', port=8080, appType='web-service', profile='standard'
    // Still generates manifests — user fills in the blanks
```

**The `generateManifests` function:**

Generate these files. Each file is a string with `[PLACEHOLDER]` values replaced:

For `web-service` and `api-service` app types:

`autostack/Dockerfile`:
```
Multi-stage build:
Stage 1 (builder): use the appropriate base image for the detected language/framework.
  Node: node:20-alpine, runs 'npm ci --only=production'
  Python: python:3.12-slim, runs 'pip install -r requirements.txt --no-cache-dir'
  Go: golang:1.22-alpine, runs 'go build -o app .'
  Java: eclipse-temurin:21-jdk, runs 'mvn package -q'
  Ruby: ruby:3.3-alpine, runs 'bundle install --without development test'

Stage 2 (runtime): use the smallest appropriate runtime image.
  Node: node:20-alpine (already slim)
  Python: python:3.12-slim
  Go: distroless/static-debian12 (no shell — most secure)
  Java: eclipse-temurin:21-jre
  Ruby: ruby:3.3-alpine

Non-root user: addgroup -g 1001 app && adduser -u 1001 -G app app
  COPY --chown=app:app files from builder
  USER app

HEALTHCHECK: CMD curl -f http://localhost:[PORT]/health || exit 1
EXPOSE: [detected port]
CMD: appropriate for framework
```

`autostack/k8s/deployment.yaml`:
```yaml
Key fields to populate:
  name: [APP_NAME]
  namespace: [NAMESPACE]  # same as project.environment
  replicas: 2             # always 2 — never 1 (reliability check would catch it)
  image: ghcr.io/[OWNER]/[REPO]:latest  # user will update this in CI
  containerPort: [PORT]
  resources:
    requests: { cpu: [REQUESTS_CPU], memory: [REQUESTS_MEM] }
    limits: { cpu: [LIMITS_CPU], memory: [LIMITS_MEM] }
    # Use the detected resourceProfile values
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities: { drop: [ALL] }
  readinessProbe:
    httpGet: { path: /health, port: [PORT] }
    initialDelaySeconds: 10
    periodSeconds: 5
  livenessProbe:
    httpGet: { path: /health, port: [PORT] }
    initialDelaySeconds: 30
    periodSeconds: 10
  env:
    - name: PORT
      value: "[PORT]"
    - name: NODE_ENV  # or equivalent for framework
      value: "production"
```

`autostack/k8s/service.yaml`: ClusterIP, ports mapped correctly.

`autostack/k8s/ingress.yaml`:
```yaml
annotations:
  cert-manager.io/cluster-issuer: letsencrypt-prod
  nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
    - hosts: [your-domain.com]  # USER MUST FILL THIS IN
      secretName: [APP_NAME]-tls
  rules:
    - host: your-domain.com  # USER MUST FILL THIS IN
```

`autostack/k8s/hpa.yaml`:
```yaml
minReplicas: 2
maxReplicas: 10
metrics:
  - type: Resource
    resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
  - type: Resource
    resource: { name: memory, target: { type: Utilization, averageUtilization: 80 } }
```

`autostack/k8s/networkpolicy.yaml`:
```yaml
# Deny all ingress by default, allow only from ingress-nginx namespace
policyTypes: [Ingress, Egress]
ingress:
  - from:
    - namespaceSelector:
        matchLabels: { kubernetes.io/metadata.name: ingress-nginx }
egress:
  - to: [{ podSelector: {} }]  # allow all within namespace (DB, Redis access)
  - to: []  # allow external (for outbound API calls)
    ports: [{ port: 443 }]
```

`autostack/argocd/application.yaml`:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: [APP_NAME]
  namespace: argocd
spec:
  project: default
  source:
    repoURL: [REPO_URL]
    targetRevision: main
    path: autostack/k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: [NAMESPACE]
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

For `static-site` app types:
Same as above but use nginx:alpine as the runtime, no port 8080, configure nginx.conf for SPA routing (try_files $uri $uri/ /index.html), resource profile is `micro`.

For `worker` app types:
Deployment only (no Service, no Ingress, no HPA).
Add a PodDisruptionBudget with minAvailable: 1.

**The `openManifestPR` function:**

```typescript
async function openManifestPR(owner, repo, baseBranch, manifests, token, detection) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  const branchName = 'autostack/initial-setup'
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`

  // 1. Get base branch SHA
  const refRes = await fetch(`${apiBase}/git/ref/heads/${baseBranch}`, { headers })
  const refData = await refRes.json()
  const sha = refData.object.sha

  // 2. Create branch (if exists, skip — it means we're updating)
  await fetch(`${apiBase}/git/refs`, {
    method: 'POST', headers,
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha })
  })

  // 3. Create each file
  for (const [path, content] of Object.entries(manifests)) {
    await fetch(`${apiBase}/contents/${path}`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        message: `Add ${path}`,
        content: btoa(content),  // base64 encode
        branch: branchName
      })
    })
  }

  // 4. Create PR
  const prBody = generatePRBody(detection, Object.keys(manifests))
  const prRes = await fetch(`${apiBase}/pulls`, {
    method: 'POST', headers,
    body: JSON.stringify({
      title: '🚀 AutoStack: Add Kubernetes manifests and Dockerfile',
      body: prBody,
      head: branchName,
      base: baseBranch
    })
  })
  const pr = await prRes.json()

  // 5. Add label
  await fetch(`${apiBase}/issues/${pr.number}/labels`, {
    method: 'POST', headers,
    body: JSON.stringify({ labels: ['autostack-generated'] })
  })

  return { url: pr.html_url, number: pr.number }
}
```

**The `generatePRBody` function:**
The PR body is the user's documentation. It must explain:
1. What was detected (language, framework, port)
2. What each generated file does (one paragraph per file)
3. What the user MUST fill in before merging (the Ingress hostname, any env vars)
4. What is production-ready by default (security context, probes, HPA, network policy)
5. Next steps: merge this PR, then ArgoCD will sync, then check the AutoStack dashboard

### Status broadcasts via Supabase Realtime
As the function progresses through stages, it updates `projects.analysis_status`.
The frontend (New Project modal) subscribes to this project row's changes and
renders a progress display:

```
[●] Fetching repository      ← spinner when current, checkmark when done
[●] Analyzing stack          ← spinner when current
[●] Generating manifests     ← spinner when current
[●] Opening pull request     ← spinner when current
[✓] Done! PR opened          ← success with PR link
```

### VERIFICATION
1. Create a test repository on GitHub with just a `package.json` containing `"express": "^4.18"`
2. In AutoStack dashboard → Projects → "New Project" → enter the repo URL
3. Watch the modal progress indicator advance through all stages
4. Wait for "Done!" state — click the PR link
5. Verify the PR exists on GitHub with all 7 files committed
6. Verify: Dockerfile uses multi-stage build and non-root user
7. Verify: deployment.yaml has readiness probe, liveness probe, resource limits, securityContext
8. Verify: `projects` table row has `analysis_status='complete'`, `stack='Express (Node.js)'`
9. Test with a Python repo (requirements.txt with flask): verify different manifests generated
10. Test with a repo with no recognizable files: verify "Unknown" stack with sensible defaults

---

## TASK 4.4 — COIE AUTOMATED FIX PRS

### What this does
After COIE creates a finding, for eligible check types, it automatically opens a PR
with the exact YAML change needed to fix the issue.

### Changes to `coie-cycle/index.ts`

After inserting each new finding, check if it's in the auto-PR list:

```typescript
const AUTO_PR_CHECKS = [
  'MISSING_RESOURCE_LIMITS',
  'MISSING_READINESS_PROBE',
  'MISSING_LIVENESS_PROBE',
  'LATEST_IMAGE_TAG',
  'MISSING_SECURITY_CONTEXT',
  'SINGLE_REPLICA'
]

for (const finding of newFindings) {
  if (AUTO_PR_CHECKS.includes(finding.check_name)) {
    // Don't block — fire and forget
    generateFixPR(finding, cluster, integration, redis).catch(err => {
      Sentry.captureException(err, { extra: { finding_id: finding.id } })
    })
  }
}
```

### The `generateFixPR` function (in a shared utility):

```typescript
async function generateFixPR(finding, cluster, githubIntegration, redis) {
  // 1. Look up the project for this finding
  const project = await getProject(finding.project_id)
  if (!project) return  // infrastructure finding with no associated project

  const { owner, repo } = parseRepoUrl(project.repo_url)
  const token = await getInstallationToken(githubIntegration.config.installation_id, redis)
  const branchName = `autostack/fix-${finding.check_name.toLowerCase().replace(/_/g, '-')}-${finding.affected_resource.replace(/[^a-z0-9]/g, '-')}`

  // 2. Check: is there already an open PR for this exact branch?
  const existingPR = await findOpenPR(owner, repo, branchName, token)

  // 3. Fetch the current deployment manifest from GitHub
  const manifestPath = `autostack/k8s/deployment.yaml`
  const currentContent = await fetchFileContent(owner, repo, manifestPath, project.branch, token)
  if (!currentContent) return  // no manifest yet (DIE hasn't run)

  // 4. Apply the specific fix to the manifest
  const fixedContent = applyFix(finding.check_name, currentContent, finding)
  if (fixedContent === currentContent) return  // fix already applied somehow

  // 5. Create/update branch and file
  if (!existingPR) {
    await createBranchAndFile(owner, repo, project.branch, branchName, manifestPath, fixedContent, token)
  } else {
    await updateFile(owner, repo, branchName, manifestPath, fixedContent, token)
  }

  // 6. Create/update PR
  const pr = existingPR
    ? existingPR
    : await createFixPR(owner, repo, project.branch, branchName, finding, token)

  // 7. Update finding with PR info
  await supabase.from('findings')
    .update({ pr_url: pr.url, pr_number: pr.number })
    .eq('id', finding.id)
}
```

**The `applyFix` function — for each check type:**

`MISSING_RESOURCE_LIMITS`: Parse the YAML, find the container, add resources block with
the cluster's detected average usage + 20% buffer as requests, average + 100% as limits.
If no metric data available, use the framework's resourceProfile defaults.

`MISSING_READINESS_PROBE`: Add standard HTTP probe on the detected port with
`initialDelaySeconds: 10, periodSeconds: 5, failureThreshold: 3`.

`MISSING_LIVENESS_PROBE`: Add standard HTTP probe with
`initialDelaySeconds: 30, periodSeconds: 10, failureThreshold: 3`.

`LATEST_IMAGE_TAG`: Replace `:latest` with `:stable` (safest generic fix).
Note in the PR body that the user should pin to a specific semantic version.

`MISSING_SECURITY_CONTEXT`: Add the standard security context block to the container spec.

`SINGLE_REPLICA`: Change `replicas: 1` to `replicas: 2`.

**PR title format:** `[AutoStack COIE] Fix: [human-readable description of check] in [resource name]`
Example: `[AutoStack COIE] Fix: Add resource limits to api-gateway deployment`

**Rules:**
- PR body explains what was wrong, what was changed, and why
- ONE PR per finding — never batch
- If the PR branch already exists, update the file on it (don't create a duplicate branch)
- If the finding is suppressed by user: cancel the PR (close it via GitHub API)

### VERIFICATION
1. Create a deployment manifest in a test repo WITHOUT resource limits
2. Run COIE on the connected cluster
3. Finding `MISSING_RESOURCE_LIMITS` should appear in `findings` table
4. Within 60 seconds: a PR should appear in the GitHub repo
5. PR title should match format: `[AutoStack COIE] Fix: Add resource limits to...`
6. The PR diff should show ONLY the resources block being added — nothing else changed
7. Merge the PR → the next COIE cycle should auto-resolve the finding

---

# PHASE 5 — THE AGENT (GO BINARY)
## Branch: `feature/phase5-agent-go`
## Milestone: v0.4.0
## Prerequisites: Phase 4 fully verified

---

## TASK 5.1 — GO PROJECT SETUP

### Repository structure
Create a new directory at the root: `agent/`

```
agent/
├── cmd/
│   └── agent/
│       └── main.go          ← entry point
├── internal/
│   ├── collector/
│   │   ├── events.go        ← Kubernetes event streaming
│   │   ├── metrics.go       ← Metrics server queries
│   │   └── inventory.go     ← Workload inventory
│   ├── client/
│   │   ├── supabase.go      ← HTTP client for Edge Functions
│   │   └── retry.go         ← Exponential backoff retry logic
│   ├── config/
│   │   └── config.go        ← Config from env vars + flags
│   └── registration/
│       └── registration.go  ← First-run agent token exchange
├── helm/
│   └── autostack-agent/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── namespace.yaml
│           ├── serviceaccount.yaml
│           ├── clusterrole.yaml
│           ├── clusterrolebinding.yaml
│           ├── secret.yaml
│           └── deployment.yaml
├── go.mod
├── go.sum
├── Dockerfile               ← for building the agent image
└── Makefile                 ← build, test, push commands
```

### `go.mod` dependencies:
```
k8s.io/client-go v0.29.0            ← Kubernetes client
k8s.io/api v0.29.0                  ← Kubernetes API types
k8s.io/apimachinery v0.29.0         ← Kubernetes utility types
sigs.k8s.io/controller-runtime v0.17.0  ← high-level controller utilities
github.com/go-logr/zapr v1.3.0      ← structured logging
go.uber.org/zap v1.27.0             ← fast structured logger
```

### Build configuration
`Dockerfile` for the agent:
```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o autostack-agent ./cmd/agent

FROM scratch  # smallest possible — no shell, no package manager
COPY --from=builder /app/autostack-agent /autostack-agent
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
ENTRYPOINT ["/autostack-agent"]
```

`Makefile` targets:
```make
build: go build -o bin/autostack-agent ./cmd/agent
test: go test ./...
docker-build: docker build -t ghcr.io/[OWNER]/autostack-agent:latest .
docker-push: docker push ghcr.io/[OWNER]/autostack-agent:latest
helm-lint: helm lint ./helm/autostack-agent
helm-package: helm package ./helm/autostack-agent
```

---

## TASK 5.2 — AGENT REGISTRATION AND HEARTBEAT

### `internal/config/config.go`

Read configuration from environment variables (set by Helm chart via the K8s Secret):
```go
type Config struct {
    ControlPlaneURL   string  // AUTOSTACK_CONTROL_PLANE_URL
    AgentToken        string  // AUTOSTACK_AGENT_TOKEN (one-time registration token)
    ClusterID         string  // AUTOSTACK_CLUSTER_ID (set after registration)
    AgentVersion      string  // injected at build time via ldflags
    HeartbeatInterval time.Duration  // default: 30s
    MetricsInterval   time.Duration  // default: 60s
    InventoryInterval time.Duration  // default: 5m
}
```

### `internal/registration/registration.go`

```go
// Called on startup if ClusterID is not set
// Uses the one-time AgentToken to register with the control plane
func Register(ctx context.Context, cfg *Config) (clusterID string, err error) {
    payload := map[string]string{
        "agent_token":   cfg.AgentToken,
        "agent_version": cfg.AgentVersion,
    }
    // POST to: [ControlPlaneURL]/functions/v1/agent-register
    // Response: { "cluster_id": "uuid" }
    // After success: persist cluster_id to a ConfigMap in the 'autostack-system' namespace
    // so it survives pod restarts
}
```

### Update `supabase/functions/agent-register/index.ts`

This function must:
1. Verify the `agent_token` exists in `clusters` table and `agent_token_used = FALSE`
2. Mark `agent_token_used = TRUE` (one-time use)
3. Update `clusters.agent_status = 'connected'`, `agent_version`, `last_seen_at`
4. Return `{ cluster_id: uuid }`

After this exchange: the agent uses the `cluster_id` as its identifier.
The token is burned — it cannot be used again.

### `internal/client/supabase.go`

HTTP client for all communication with Edge Functions:

```go
type Client struct {
    baseURL    string
    clusterID  string
    httpClient *http.Client
}

// All requests include:
//   X-Autostack-Cluster-ID: [cluster_id]
//   X-Autostack-Agent-Version: [version]
//   Content-Type: application/json
// No JWT — agents use cluster_id for identification (verified server-side against clusters table)
```

**Retry logic (in `internal/client/retry.go`):**
All outbound HTTP calls must use exponential backoff:
- First retry: 5 seconds
- Second retry: 30 seconds
- Third retry: 2 minutes
- After 3 failures: log the failure, continue operation (don't crash the agent)
- The agent MUST NEVER crash due to a network failure. It logs, retries, and keeps running.

### Update `supabase/functions/agent-heartbeat/index.ts`

This function receives heartbeats:
1. Verify the request's `X-Autostack-Cluster-ID` header maps to a real cluster row
2. UPDATE: `last_seen_at = NOW()`, `node_count`, `pod_count`, `agent_version`
3. Also check: if `last_seen_at` was > 5 minutes ago before this update, trigger an "agent reconnected" notification
4. Return `{ ok: true, next_check: 30 }`

**Agent disconnection detection:**
Add to the `coie-cycle` Edge Function (or a separate cron): check all connected clusters where
`last_seen_at < NOW() - INTERVAL '5 minutes'`. Update `agent_status = 'disconnected'`.
Trigger `agent_disconnected` notification.

### VERIFICATION
1. Build the agent binary locally: `go build ./cmd/agent`
2. Set env vars: AUTOSTACK_CONTROL_PLANE_URL, AUTOSTACK_AGENT_TOKEN
3. Run the binary: it should POST to agent-register
4. Check: `clusters` table row updated with `agent_status = 'connected'`, `agent_token_used = TRUE`
5. Check: agent printed the cluster_id to logs
6. After 30 seconds: `last_seen_at` should update (heartbeat working)
7. Kill the agent process: after 5 minutes, check `agent_status = 'disconnected'`
8. Restart agent: verify reconnection notification fires

---

## TASK 5.3 — EVENT STREAMING (KUBERNETES WATCH API)

### `internal/collector/events.go`

The K8s Watch API streams events in real time — much more efficient than polling.

```go
// StreamEvents watches the Kubernetes events API and forwards Warning events
// to the AutoStack control plane
func StreamEvents(ctx context.Context, k8sClient *kubernetes.Clientset, autostack *Client) {
    // Watch all namespaces
    watcher, err := k8sClient.CoreV1().Events("").Watch(ctx, metav1.ListOptions{
        Watch: true,
        // Only Warning events — Normal events are too noisy
        FieldSelector: "type=Warning",
    })
    // IMPORTANT: Handle watch restart on timeout (K8s watches expire after ~5 min)
    // Pattern: watch, on timeout or error, restart with ResourceVersion from last event

    for event := range watcher.ResultChan() {
        k8sEvent := event.Object.(*corev1.Event)

        // Deduplicate: if the same event reason+object was sent in the last 2 minutes, skip
        dedupeKey := k8sEvent.InvolvedObject.Name + ":" + k8sEvent.Reason
        if recentlySent(dedupeKey) { continue }

        // Forward to control plane
        autostack.SendEvent(ctx, EventPayload{
            ClusterID:        autostack.clusterID,
            Namespace:        k8sEvent.Namespace,
            Reason:           k8sEvent.Reason,
            Message:          k8sEvent.Message,
            InvolvedObject:   k8sEvent.InvolvedObject.Name,
            InvolvedKind:     k8sEvent.InvolvedObject.Kind,
            Count:            k8sEvent.Count,
            FirstTimestamp:   k8sEvent.FirstTimestamp.Time,
            LastTimestamp:    k8sEvent.LastTimestamp.Time,
        })
        markSent(dedupeKey, 2*time.Minute)
    }
}
```

### Update `supabase/functions/agent-metrics/index.ts`

This function now handles two payload types:

`type: 'events'` — batch of K8s events:
For each Warning event:
1. Determine if this event indicates a pod failure (match against known trigger types)
2. If yes: INSERT into `incidents` table with `status='detected'`
3. This INSERT triggers the Database Webhook → `aire-detect` automatically

Trigger type mapping:
```
event.reason contains 'OOM' OR 'Kill' → trigger_type = 'oom_kill'
event.reason = 'BackOff' AND count > 3 → trigger_type = 'crash_loop'
event.reason = 'ImagePullBackOff' OR 'ErrImagePull' → trigger_type = 'image_pull_failure'
event.reason = 'Evicted' → trigger_type = 'eviction'
event.reason = 'FailedMount' → trigger_type = 'volume_failure'
event.reason = 'NetworkNotReady' → trigger_type = 'network_issue'
count > 10 within 5 minutes for same object → trigger_type = 'repeated_warning'
```

`type: 'metrics'` — batch of metric samples (already partially implemented):
INSERT each sample into `cluster_metrics`. Existing behavior — keep it.

`type: 'inventory'` — workload inventory:
Store the full inventory JSON in a `cluster_inventory` key in Redis for COIE to read.
Key: `inventory:[cluster_id]`, TTL: 6 minutes (slightly longer than the 5-min collection interval).

### VERIFICATION
1. In a test cluster, create a pod that will OOM kill: set memory limit to 32Mi, run a memory hog
2. Watch the agent logs: it should detect the OOMKilled event within seconds
3. Check `incidents` table: new row with trigger_type='oom_kill', status='detected'
4. Within 10 seconds: check that AIRE diagnosed it (status='diagnosed', matched_pattern='OOM_KILL')
5. Check email: incident_detected notification arrives

---

## TASK 5.4 — METRICS AND WORKLOAD INVENTORY COLLECTION

### `internal/collector/metrics.go`

Queries Kubernetes Metrics Server (must be installed in the cluster — standard in EKS/GKE/AKS):

```go
func CollectMetrics(ctx context.Context, metricsClient *metricsv1beta1.MetricsV1beta1Client) MetricsPayload {
    // Node metrics
    nodeMetrics, _ := metricsClient.NodeMetricses().List(ctx, metav1.ListOptions{})
    // Pod metrics (all namespaces)
    podMetrics, _ := metricsClient.PodMetricses("").List(ctx, metav1.ListOptions{})

    return MetricsPayload{
        Nodes: extractNodeMetrics(nodeMetrics),
        Pods:  extractPodMetrics(podMetrics),
    }
}
```

Node metrics shape:
```go
type NodeMetric struct {
    Name      string
    CPUCores  float64  // nanocores → cores
    MemoryMiB float64  // bytes → MiB
    CPUPct    float64  // CPUCores / node.capacity.cpu
    MemPct    float64  // MemoryMiB / node.capacity.memory
}
```

Pod metrics shape:
```go
type PodMetric struct {
    Name       string
    Namespace  string
    Containers []ContainerMetric  // one per container
    TotalCPU   float64
    TotalMem   float64
}
```

### `internal/collector/inventory.go`

Collects workload definitions for COIE to analyze:

```go
func CollectInventory(ctx context.Context, k8sClient *kubernetes.Clientset) InventoryPayload {
    // Fetch these resource types across all namespaces:
    // Deployments, StatefulSets, DaemonSets, CronJobs
    // For each: name, namespace, spec.replicas, spec.template.spec.containers
    //           (which includes: image, resources, securityContext, probes, env)
    // Also: NetworkPolicies per namespace, PodDisruptionBudgets, HPAs

    // Shape each workload into a flat, analyzable structure
    // that COIE can evaluate without needing kubernetes client itself
}
```

**COIE reading inventory:**
Update `coie-cycle/index.ts` to read the inventory from Redis:
```typescript
const inventoryJson = await redis.get(`inventory:${cluster_id}`)
if (!inventoryJson) {
  // No recent inventory — use simulation mode for this run
  return runSimulatedChecks()
}
const inventory = JSON.parse(inventoryJson as string)
return runChecksAgainstInventory(inventory)
```

This is the bridge from simulation to real: once the agent starts sending inventory,
COIE automatically uses real data.

### VERIFICATION
1. Run the agent against a real cluster with at least 3 running workloads
2. After 60 seconds: check Redis key `inventory:[cluster_id]` — should contain workload JSON
3. Trigger COIE manually: it should now use real data (log line: "using real inventory")
4. Check `findings` table: findings should reflect ACTUAL issues in the cluster
5. The dashboard Overview tab should show scores based on real data

---

## TASK 5.5 — HELM CHART

### `agent/helm/autostack-agent/Chart.yaml`
```yaml
apiVersion: v2
name: autostack-agent
description: AutoStack Kubernetes agent for cluster intelligence
type: application
version: 0.1.0
appVersion: "0.1.0"
```

### `agent/helm/autostack-agent/values.yaml`
```yaml
# Required values — user must set these
controlPlane:
  url: ""           # https://[project].supabase.co/functions/v1

agent:
  token: ""         # Generated by AutoStack on cluster registration

cluster:
  id: ""            # Optional: set after first registration if known

# Optional: override resource usage of the agent itself
resources:
  requests:
    cpu: "10m"
    memory: "32Mi"
  limits:
    cpu: "100m"
    memory: "128Mi"

image:
  repository: ghcr.io/[OWNER]/autostack-agent
  tag: "latest"
  pullPolicy: IfNotPresent
```

### Templates

`templates/namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: autostack-system
  labels:
    app.kubernetes.io/managed-by: Helm
```

`templates/clusterrole.yaml`:
```yaml
# MINIMUM REQUIRED PERMISSIONS — DO NOT ADD WRITE PERMISSIONS
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: autostack-agent
rules:
- apiGroups: [""]
  resources: ["pods", "nodes", "events", "namespaces", "services",
              "persistentvolumeclaims", "resourcequotas"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "statefulsets", "daemonsets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["networking.k8s.io"]
  resources: ["networkpolicies", "ingresses"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["autoscaling"]
  resources: ["horizontalpodautoscalers"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["policy"]
  resources: ["poddisruptionbudgets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["metrics.k8s.io"]
  resources: ["nodes", "pods"]
  verbs: ["get", "list"]
```

`templates/secret.yaml`:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: autostack-agent-credentials
  namespace: autostack-system
type: Opaque
stringData:
  agent-token: {{ .Values.agent.token | quote }}
  control-plane-url: {{ .Values.controlPlane.url | quote }}
```

`templates/deployment.yaml`:
```yaml
# The agent deployment
# Key properties:
#   - namespace: autostack-system
#   - serviceAccountName: autostack-agent
#   - Resources: from values.yaml
#   - Env from the secret
#   - restartPolicy: Always
#   - securityContext: non-root, read-only FS
#   - No liveness/readiness probe on port (agent has no HTTP server — use exec probe instead)
```

### Publishing to GitHub Pages

Create a `gh-pages` branch in the repository. Add a GitHub Actions workflow that:
1. On every push to `main` with changes to `agent/helm/`:
2. Runs `helm package agent/helm/autostack-agent`
3. Runs `helm repo index . --url https://[github-username].github.io/[repo-name]`
4. Pushes the `.tgz` and `index.yaml` to the `gh-pages` branch

After this: `helm repo add autostack https://[github-username].github.io/[repo-name]` works.
Update the `connect-cluster` Edge Function to use this real URL.

### VERIFICATION
1. `helm lint agent/helm/autostack-agent` — must pass with no errors or warnings
2. `helm template autostack-agent agent/helm/autostack-agent --set agent.token=test --set controlPlane.url=https://test.supabase.co` — review the rendered output for correctness
3. Install into a test cluster: `helm install autostack-agent agent/helm/autostack-agent --namespace autostack-system --set agent.token=[real_token] --set controlPlane.url=[real_url]`
4. Check: pod starts and stays running (not CrashLoopBackOff)
5. Check: cluster shows `agent_status = 'connected'` in Supabase within 60 seconds

---

# PHASE 6 — PRODUCTION HARDENING
## Branch: `feature/phase6-production-hardening`
## Milestone: v1.0.0
## Prerequisites: Phase 5 fully verified

---

## TASK 6.1 — SECURITY HARDENING

### Agent token rotation UI

Add to Settings → Infrastructure tab:
- Show each cluster with its connection status
- "Regenerate Token" button per cluster (only for owner/admin roles)
- Clicking it: shows confirmation modal ("This will disconnect the current agent until you update the Helm chart")
- On confirm: call an Edge Function that generates a new token, sets `agent_token_used = FALSE`, `agent_status = 'disconnected'`
- Modal shows the `helm upgrade` command with the new token
- Old token is immediately invalid

### Rate limiting on all Edge Functions

Create `supabase/functions/_shared/rateLimit.ts`:
```typescript
export async function checkRateLimit(redis: Redis, identifier: string, endpoint: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:${endpoint}:${identifier}`
  const current = await redis.incr(key)
  if (current === 1) await redis.expire(key, windowSeconds)
  return { allowed: current <= limit, remaining: Math.max(0, limit - current) }
}
```

Apply to every Edge Function with these limits:
- `auth-hook`: 10 per IP per minute (use request IP from Supabase headers)
- `connect-cluster`: 5 per user per hour (cluster creation)
- `die-analyze`: 10 per org per day (repo analysis — costs GitHub API quota)
- `github-webhook`: 1000 per hour global (webhooks come in batches on push)
- `agent-heartbeat`: 200 per cluster per minute (chatty but necessary)
- `agent-metrics`: 60 per cluster per minute (one per second maximum)

On rate limit exceeded: return 429 with `{ error: 'rate_limited', retry_after: windowSeconds }`

### Input sanitization middleware

Create `supabase/functions/_shared/sanitize.ts`:
```typescript
export function sanitizeString(input: string, maxLength: number, pattern: RegExp): string | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim().slice(0, maxLength)
  if (!pattern.test(trimmed)) return null
  return trimmed
}
```

Apply to every user-provided field before it touches the database:
- Cluster name: `^[a-zA-Z0-9][a-zA-Z0-9\-_]{0,62}$`
- Org name: strip HTML, max 100 chars
- Project name: strip HTML, max 100 chars
- Repo URL: `^https://(github|gitlab|bitbucket)\.com/[a-zA-Z0-9\-_.]+/[a-zA-Z0-9\-_.]+$`
- Team member email: standard email regex, max 320 chars

### Audit log completion

Every significant action must write to `audit_log`. Create `supabase/functions/_shared/audit.ts`:
```typescript
export async function writeAudit(supabase, { org_id, actor_id, actor_type, action, target_type, target_id, description, metadata }) {
  await supabase.from('audit_log').insert({
    org_id, actor_type, actor_id, action, target_type, target_id, description,
    metadata: metadata || {}
  })
  // Never throw — audit log failure must not break the main flow
}
```

Wire to every action:
```
cluster.created      → target: cluster_id
cluster.deleted      → target: cluster_id
project.created      → target: project_id
project.deleted      → target: project_id
project.pr_opened    → target: project_id, metadata: { pr_url }
finding.suppressed   → target: finding_id, metadata: { reason }
finding.resolved     → target: finding_id
member.invited       → target: email
member.removed       → target: user_id
member.role_changed  → target: user_id, metadata: { old_role, new_role }
integration.connected → target: integration name
agent_token.regenerated → target: cluster_id
```

### Settings → Audit Log tab

Add a new sub-section to Settings: "Audit Log"
Display `audit_log` rows for this org, paginated (20 per page), with:
- Timestamp (relative + absolute on hover)
- Actor (user name + avatar initial)
- Action (formatted human-readable: "Member invited: jane@example.com")
- Filter by: action type, date range
- Only visible to owner and admin roles

---

## TASK 6.2 — LOG PERSISTENCE SYSTEM

### New Edge Function: `agent-logs`

Separate from `agent-metrics` — receives batched log lines:

Input: `{ cluster_id, logs: [{ ts, level, msg, pod, container, namespace }] }`

Storage path: `logs/{cluster_id}/{YYYY-MM-DD}/{HH}/{unix_timestamp}.jsonl`

Use Supabase Storage (bucket: `cluster-logs`, private):
```typescript
const content = logs.map(l => JSON.stringify(l)).join('\n')
const path = `${cluster_id}/${date}/${hour}/${Date.now()}.jsonl`
await supabase.storage.from('cluster-logs').upload(path, content, {
  contentType: 'application/x-ndjson'
})
```

### Log retention cleanup

Add to the daily cleanup cron job:
```sql
-- This runs on a storage delete via a cron-triggered Edge Function
-- because pg_cron can't delete Storage files directly
```

Create `supabase/functions/cleanup-old-logs/index.ts` (triggered daily by cron):
```typescript
// List all files in bucket older than 30 days
// Delete them
// Log count to Sentry as an info event: "Deleted N log files"
```

### LogsTab — real implementation

Replace the simulation in `LogsTab.jsx`:

**Live mode:**
Subscribe to a Supabase Realtime Broadcast channel: `logs:${clusterId}`
The `agent-logs` Edge Function broadcasts each batch via:
```typescript
await supabase.channel('logs:' + cluster_id).send({
  type: 'broadcast',
  event: 'new_logs',
  payload: { logs: batch }
})
```

**Historical mode:**
Fetch log files from the last N hours via a signed URL:
```typescript
// List files for the time range
const files = await supabase.storage.from('cluster-logs').list(`${clusterId}/${date}/${hour}/`)
// Generate signed URL for each file (valid 60 seconds)
const { data: signedUrl } = await supabase.storage.from('cluster-logs').createSignedUrl(filePath, 60)
// Fetch and parse each .jsonl file
const lines = await fetch(signedUrl).then(r => r.text())
  .then(text => text.split('\n').filter(Boolean).map(JSON.parse))
```

**Display rules:**
- Auto-scroll to bottom when new live lines arrive (unless user has scrolled up — detect via scroll position)
- Maximum 1000 lines in DOM at once — remove oldest when adding new
- Severity color coding: error → #f43f5e, warn → #f59e0b, info → #92a4c8, debug → #4a5168
- Filter bar: namespace dropdown, level multi-select, text search (client-side filter on displayed lines)
- "Clear" button: clears display only — does not delete from storage
- Export button: downloads current 1000 lines as a `.jsonl` file

### VERIFICATION
1. Agent sends log batch to `agent-logs` function
2. Check Supabase Storage: file appears at correct path
3. Open Logs tab in Live mode: log lines appear in real time (< 3 second delay)
4. Switch to Historical mode: loads logs from the last hour correctly
5. Apply namespace filter: only shows logs from selected namespace
6. Close the tab and reopen: historical logs still there (they persist in Storage)
7. After 31 days: cleanup job has deleted old files (verify in Storage bucket)

---

## TASK 6.3 — PERFORMANCE OPTIMIZATION

### Split `ui/index.jsx`

This is a refactoring task — zero behavior change. Pure file structure reorganization.

Create individual files:
```
src/components/ui/
├── Button.jsx         ← Button with ripple effect, all variants
├── Card.jsx           ← Card container component
├── Input.jsx          ← Text input with icon support
├── Select.jsx         ← Styled select dropdown
├── Modal.jsx          ← Modal with glassmorphism, spring animation
├── Toast.jsx          ← Toast notification component
├── ToastContext.jsx   ← Toast provider and hook
├── Skeleton.jsx       ← All skeleton variants
├── EmptyState.jsx     ← Empty state component
├── StatusDot.jsx      ← Animated status indicator
├── Tag.jsx            ← Colored label chip
├── ProgressBar.jsx    ← Animated progress bar
├── ToggleSwitch.jsx   ← On/off toggle
├── TerminalWindow.jsx ← macOS terminal card
└── index.js           ← Re-exports all of the above (backwards compat)
```

Rules for the split:
- Copy the component code exactly — do NOT change any component's behavior
- Keep the same prop interfaces
- The `index.js` re-exports everything so all existing imports continue to work
- Verify the app still builds and all components render after the split

### Vite chunk optimization

Update `vite.config.js`:
```javascript
build: {
  sourcemap: true,
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules/@sentry')) return 'vendor-sentry'
        if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) return 'vendor-charts'
        if (id.includes('node_modules/lucide-react')) return 'vendor-icons'
        if (id.includes('node_modules/@supabase')) return 'vendor-supabase'
        if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react'
        if (id.includes('node_modules/react-router')) return 'vendor-router'
      }
    }
  }
}
```

### Landing page performance

The landing page does not need Sentry, Recharts, or Lucide icons from the dashboard.
Implement lazy initialization:
- PostHog: init only after user lands on dashboard (auth success)
- Sentry: init only on the dashboard route (the landing page has few failure modes)
- Use `React.lazy` for the entire Dashboard component so its dependencies don't load on the landing page

### VERIFICATION
1. `npm run build` — check output chunk sizes
2. Sentry chunk should be isolated: `vendor-sentry-[hash].js`
3. Open `/` (landing page) in browser with Network tab open — Sentry SDK should NOT load on this page
4. Navigate to `/dashboard` — Sentry should load now
5. Google Lighthouse on landing page: Performance score should be 90+
6. Google Lighthouse on dashboard: Performance score should be 80+

---

## TASK 6.4 — ENTERPRISE FEATURES

### Team Management — Invite Member Flow

Currently the `invite-member` function may exist but the full flow needs verification:

Complete flow:
1. Owner/Admin clicks "Invite Member" in Settings → Team
2. Modal: email input, role select (Developer / Admin)
3. On submit: call `invite-member` Edge Function
4. Edge Function: INSERT into `invitations` table, send invite email via send-notification
5. Email: "You've been invited by [name] to join [org] on AutoStack"
6. CTA: "Accept Invitation →" links to `/accept-invite?token=[token]`

Accept invitation flow (new page: `/accept-invite`):
1. Fetch invitation by token: verify it exists and `expires_at > NOW()` and `accepted_at IS NULL`
2. Show: "You've been invited to [org] as [role]"
3. "Accept" button → if logged in: insert org_member, mark invitation accepted, redirect to dashboard
4. If not logged in: redirect to signup with `?invite_token=[token]` parameter, complete signup, THEN accept

### Role-based access control in the frontend

The sidebar and action buttons must respect the user's role:
- `viewer`: can see everything, cannot create/edit/delete anything
  - New Project button: hidden
  - Settings tabs (except Notifications): read-only display
  - Findings: cannot suppress
  - Incidents: cannot mark resolved
- `developer`: can create projects, see all data, cannot manage team or billing
  - Settings → Team: hidden
  - Settings → Billing: hidden
- `admin`: everything except billing
- `owner`: everything

Implement via a `useRole()` hook that reads the current user's role from `org_members`.
Use a `<RoleGate role="admin">` component that wraps restricted elements.
On render: if user doesn't have the required role, render `null` (not an error).

### API Key Management (for future programmatic access)

Add to Settings → a new "API Keys" section:
- List existing API keys (name, created_at, last_used_at, scope)
- "Generate API Key" button: creates a key with selected scopes (read:all, write:projects, etc.)
- Generated key shown ONCE in a modal (user must copy it)
- Keys stored as hashed values in a new `api_keys` table (SHA-256 of the raw key)
- Keys used to authenticate against a future `/api/v1/` REST endpoint

Database table for `api_keys`:
```sql
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id),
  name        TEXT NOT NULL,
  key_hash    TEXT UNIQUE NOT NULL,  -- SHA-256 of raw key, never store raw
  key_prefix  TEXT NOT NULL,        -- first 8 chars of raw key for display
  scopes      TEXT[] NOT NULL DEFAULT '{"read:all"}',
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

# THE FINAL PRODUCTION LAUNCH CHECKLIST

Before changing anything to v1.0.0 and public access, verify ALL of these:

## Security
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` in any file under `src/`
- [ ] No API keys, tokens, or secrets hardcoded in source files
- [ ] `.env.local` and `.env` are in `.gitignore` and never committed
- [ ] GitHub webhook HMAC verification: confirmed working
- [ ] All Edge Functions: rate limiting active
- [ ] All Edge Functions: input sanitization on user-provided fields
- [ ] RLS policy test: manually attempt cross-org data access, verify 0 rows returned
- [ ] Auth tokens: never stored in localStorage (Supabase handles this)
- [ ] Agent: read-only K8s permissions confirmed (no write permissions in ClusterRole)
- [ ] Unsubscribe links in all notification emails: verified working without login

## Reliability
- [ ] Every tab has: loading state (skeleton), empty state, error state with retry
- [ ] Every realtime subscription has: cleanup function in useEffect return
- [ ] Every async function has: try/catch with meaningful error handling
- [ ] Every Supabase query has: LIMIT clause
- [ ] Every Redis set has: TTL (expiry)
- [ ] AIRE verified: diagnoses an OOM kill within 10 seconds
- [ ] COIE verified: scores update in dashboard within 5 minutes of a finding
- [ ] Notifications verified: email arrives within 60 seconds of trigger
- [ ] Agent verified: reconnects automatically after being killed and restarted

## Performance
- [ ] Landing page Lighthouse score: 90+
- [ ] Dashboard initial load: < 3 seconds (including auth check)
- [ ] `npm run build`: no chunks over 500KB
- [ ] No unbounded database queries in production
- [ ] `cluster_metrics` and `cluster_scores` indexes: verified in place

## Cost
- [ ] Resend quota guard: tested at 91 requests — confirmed email blocked
- [ ] Upstash: all Redis keys have TTL (verify with `redis.scan()`)
- [ ] Sentry `tracesSampleRate`: confirmed 0.1 in production
- [ ] PostHog: confirmed NOT capturing events in development
- [ ] OpenAI hard limit: $5/month set in dashboard
- [ ] `cluster_metrics` cleanup cron: confirmed running (30-day TTL)
- [ ] Supabase realtime: confirmed max 15 channels respected

## User Experience
- [ ] Signup → email confirmation → onboarding → dashboard: complete in under 5 minutes
- [ ] GitHub OAuth: works end-to-end (signup + existing user)
- [ ] Connect cluster: helm command is real (not placeholder)
- [ ] New project: PR opens on GitHub within 90 seconds
- [ ] Incident: notified via email within 60 seconds of agent detecting OOM kill
- [ ] Role-based access: viewer cannot see team management settings
- [ ] Unsubscribe: works without login
- [ ] Mobile (375px): landing page is readable and usable

## Operations
- [ ] COIE cron: confirmed running every 5 minutes
- [ ] Weekly digest cron: confirmed scheduled Sunday 9am UTC
- [ ] Cleanup cron: confirmed scheduled daily 2am UTC
- [ ] Sentry: receiving and grouping errors
- [ ] PostHog: receiving events, funnel visible (signup → cluster → first PR)
- [ ] Audit log: all significant actions are logged
- [ ] `PROGRESS.md` file: all tasks marked ✅ DONE
```
