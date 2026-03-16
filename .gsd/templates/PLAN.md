# PLAN.md — AutoStack Immediate Fixes + Phase 3

**Phase: Immediate Fixes + Phase 3 (AI Intelligence)**
**Target milestone: v0.2.0**
**Prerequisite: SPEC.md status is FINALIZED ✅**

---

## WAVE 1 — Critical Auth + Infrastructure Fixes
*Dependencies: none. Run these first. Everything else depends on auth working.*

<task type="auto" effort="high">
  <name>Fix auth-hook: org_id in user_metadata for ALL signup types</name>
  <files>supabase/functions/auth-hook/index.ts</files>
  <action>
    Replace the entire file with the production auth-hook implementation.

    The function must:
    1. Handle BOTH event types: 'SIGNED_UP' (email) and 'USER_CREATED' (OAuth/GitHub)
    2. Check if user already has org (handle re-registration edge case)
    3. Create organizations row with org name from user_metadata.organization_name
    4. Create org_members row with role='owner'
    5. Create notification_prefs row for user
    6. Call supabase.auth.admin.updateUserById(user.id, { user_metadata: { org_id: org.id, role: 'owner' } })
       THIS IS THE CRITICAL STEP — without this ALL RLS policies return 0 rows
    7. Call send-notification with type='welcome' (non-blocking, fire-and-forget)
    8. ALWAYS return 200 status — returning 5xx breaks the signup flow
    9. Wrap everything in try/catch — on error: log + return { ok: false, error } with status 200

    AVOID: returning 500 on any error (breaks signup for user)
    AVOID: using SUPABASE_ANON_KEY (use SERVICE_ROLE_KEY to bypass RLS for this function)
    USE: supabase.auth.admin.updateUserById() — this is the only way to set user_metadata server-side
  </action>
  <verify>
    1. supabase functions deploy auth-hook
    2. Go to Supabase Dashboard → Authentication → Hooks → "After user creation" → select auth-hook
    3. Sign up with a new test email in a private browser
    4. Run: SELECT id, raw_user_meta_data->>'org_id' FROM auth.users ORDER BY created_at DESC LIMIT 1;
    5. Run: SELECT COUNT(*) FROM organizations WHERE created_at > NOW() - INTERVAL '2 minutes';
  </verify>
  <done>
    - user_metadata.org_id is NOT null for the new user
    - organizations table has 1 new row
    - org_members table has 1 new row with role='owner'
    - Function registered as Auth Hook in Supabase dashboard
  </done>
</task>

<task type="auto" effort="medium">
  <name>Verify and fix CORS OPTIONS handler on all 23 Edge Functions</name>
  <files>supabase/functions/_shared/cors.ts</files>
  <action>
    1. Ensure _shared/cors.ts exists with:
       export const CORS_HEADERS = {
         'Access-Control-Allow-Origin': '*',
         'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-autostack-cluster-id',
       }
       export function corsResponse() {
         return new Response(null, { status: 200, headers: CORS_HEADERS })
       }

    2. Check EVERY function file. The FIRST code after imports must be:
       if (req.method === 'OPTIONS') return corsResponse()

    3. For any function missing this: add it as the first line in Deno.serve handler.

    AVOID: Adding CORS only to some functions. All 23 must have it.
    USE: The shared utility — don't duplicate CORS headers inline.

    Functions to check (all 23):
    auth-hook, aws-assume-role, infra-provision, infra-teardown, die-analyze,
    build-and-deploy, coie-cycle, aire-detect, send-notification, github-app-callback,
    github-webhook, agent-register, agent-heartbeat, agent-metrics, agent-logs,
    invite-member, unsubscribe, stripe-webhook, deploy-redeploy, deploy-rollback,
    deploy-preview, weekly-digest, cleanup-old-data
  </action>
  <verify>
    For each function, run:
    curl -X OPTIONS https://[project].supabase.co/functions/v1/[function-name] \
      -H "Origin: http://localhost:5173" -i
    Expected: HTTP 200 with Access-Control-Allow-Origin header
  </verify>
  <done>All 23 functions return 200 on OPTIONS preflight</done>
</task>

<task type="auto" effort="medium">
  <name>Register pg_cron jobs (COIE, weekly digest, cleanup)</name>
  <files>supabase/migrations/004_cron_jobs.sql</files>
  <action>
    Create a new migration file. It must be idempotent (safe to run twice).

    Register these 3 cron jobs using pg_cron:

    1. COIE evaluation — every 5 minutes:
       cron.schedule('coie-evaluation', '*/5 * * * *', $$
         SELECT net.http_post(
           url := current_setting('app.supabase_url') || '/functions/v1/coie-cycle',
           headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
           body := json_build_object('trigger', 'scheduled')::text
         ) FROM environments WHERE agent_status = 'connected';
       $$);

    2. Weekly digest — Sunday 9am UTC:
       cron.schedule('weekly-digest', '0 9 * * 0', $$...$$);

    3. Daily cleanup — 2am UTC:
       cron.schedule('cleanup-old-data', '0 2 * * *', $$...$$);

    Use: SELECT cron.unschedule('job-name') before scheduling to make idempotent.
    Each job: unschedule first (ignore error if not exists), then schedule.
  </action>
  <verify>
    SELECT jobname, schedule, active FROM cron.job;
    Expected: 3 rows — coie-evaluation, weekly-digest, cleanup-old-data
  </verify>
  <done>All 3 cron jobs appear in cron.job table with correct schedules</done>
</task>

<task type="auto" effort="medium">
  <name>Add HMAC verification to github-webhook</name>
  <files>supabase/functions/github-webhook/index.ts</files>
  <action>
    After the CORS OPTIONS handler, BEFORE parsing the body:

    1. Read raw body as text: const body = await req.text()
    2. Get signature header: const sig = req.headers.get('X-Hub-Signature-256')
    3. If no sig: return new Response('Unauthorized', { status: 401 })
    4. Verify HMAC:
       const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET')!
       const key = await crypto.subtle.importKey(
         'raw', new TextEncoder().encode(secret),
         { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
       )
       const sigBytes = Uint8Array.from(sig.replace('sha256=','').match(/.{2}/g)!.map(b=>parseInt(b,16)))
       const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(body))
       if (!valid) return new Response('Forbidden', { status: 403 })
    5. Parse body: const payload = JSON.parse(body)

    AVOID: Processing any payload before HMAC verification
    AVOID: Returning anything other than 401/403 on failed verification
  </action>
  <verify>
    Send webhook with wrong signature:
    curl -X POST https://[project].supabase.co/functions/v1/github-webhook \
      -H "X-Hub-Signature-256: sha256=wrong" -H "Content-Type: application/json" \
      -d '{"test": true}'
    Expected: HTTP 403

    Send without signature:
    Expected: HTTP 401
  </verify>
  <done>
    - Fake signature → 403
    - No signature → 401
    - Valid HMAC signature → processes normally
  </done>
</task>

---

## WAVE 2 — Frontend Fixes
*Dependencies: Wave 1 auth fix must be done first*

<task type="auto" effort="medium">
  <name>Fix AuthGuard loading state (eliminate auth flash)</name>
  <files>src/components/AuthGuard.jsx, src/hooks/useAuth.js</files>
  <action>
    The current AuthGuard shows the login page briefly before realizing user is logged in.

    Fix:
    1. In useAuth.js: add 'loading' state that is true until getSession() resolves
       - Start: loading=true, user=null
       - supabase.auth.getSession() → on result: loading=false, user=session?.user || null
       - Listen to onAuthStateChange for subsequent changes

    2. In AuthGuard.jsx: while loading===true, render a full-page skeleton:
       <div className="min-h-screen bg-[#111621] flex items-center justify-center">
         <div className="flex flex-col items-center gap-4">
           <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
           <p className="text-sm text-muted">Loading...</p>
         </div>
       </div>

    3. Only redirect to /login when loading===false AND user===null
    4. Only redirect to /onboarding when loading===false AND user exists AND no environments

    AVOID: Showing login page while session is loading
    AVOID: Using localStorage to check auth (Supabase manages this)
  </action>
  <verify>
    1. Log in to the app
    2. Refresh the page (F5)
    3. Observe: brief spinner appears, then dashboard loads — no flash of login page
  </verify>
  <done>No visible flash of login page on page refresh when user is logged in</done>
</task>

<task type="auto" effort="medium">
  <name>Wire real form validation (blur + submit) on Login and Signup</name>
  <files>src/pages/LoginPage.jsx, src/pages/SignupPage.jsx</files>
  <action>
    LoginPage:
    - Email field: validate on blur with /^[^\s@]+@[^\s@]+\.[^\s@]+$/ — show "Enter a valid email" if invalid
    - Password field: validate on blur — non-empty, show "Password is required" if empty
    - On submit with invalid fields: show errors, focus first invalid field, DO NOT call Supabase

    SignupPage:
    - Full name: non-empty, 2-50 chars
    - Email: same regex as above
    - Organization name: /^[a-zA-Z0-9\s\-_.]{2,60}$/ — show "Use letters, numbers, hyphens only"
    - Password: enforce ALL 4 rules before allowing submit (not just show the bar):
      * At least 8 characters
      * Contains a number (/[0-9]/)
      * Contains uppercase (/[A-Z]/)
      * Contains special char (/[!@#$%^&*]/)
    - Confirm password: must match on every keystroke of confirm field — show "Passwords don't match"
    - Terms: must be checked — show "Please accept terms" if not checked

    AVOID: Only validating on submit
    AVOID: Calling supabase.auth.signUp() with invalid form data
    USE: onBlur event on each field to trigger field-level validation
    USE: Red text-13px error message directly below the failing field
  </action>
  <verify>
    1. Submit login form empty → both fields show red errors
    2. Enter "notanemail" in email → error on blur
    3. In signup: enter 7-char password → strength bar shows "weak" AND submit is disabled
    4. Enter different confirm password → "Passwords don't match" shows immediately
    5. Fill everything correctly → submit calls Supabase (check Network tab)
  </verify>
  <done>
    - All validations fire on blur
    - Submit disabled if any field is invalid
    - Supabase is NOT called when form has errors
  </done>
</task>

<task type="auto" effort="medium">
  <name>Wire EmptyState component to all dashboard tabs</name>
  <files>
    src/components/tabs/DeploymentsTab.jsx,
    src/components/tabs/PipelinesTab.jsx,
    src/components/tabs/InfrastructureTab.jsx,
    src/components/tabs/LogsTab.jsx,
    src/components/tabs/IncidentsTab.jsx,
    src/components/tabs/OverviewTab.jsx
  </files>
  <action>
    For each tab, find the condition where data.length === 0 (or data is null after loading).
    Replace any null render / blank div / bare "No data" text with the EmptyState component.

    Each EmptyState must have:
    - icon: appropriate Lucide icon
    - title: specific to the tab
    - description: tells user WHY it's empty + what to do
    - action: CTA button where possible

    Specific empty states:
    - DeploymentsTab: icon=Rocket, title="No deployments yet", description="Deploy your first app to get started", action={label:"Deploy an app", onClick: openDeployModal}
    - PipelinesTab: icon=GitBranch, title="No pipeline runs", description="Runs appear when code is pushed to a connected repository"
    - InfrastructureTab: icon=Server, title="No infrastructure yet", description="Provision your first environment to see resources here"
    - LogsTab: icon=FileText, title="No logs yet", description="Logs appear once your environment is running"
    - IncidentsTab: icon=ShieldCheck, title="All clear", description="AIRE is monitoring your cluster — no incidents detected"
    - OverviewTab activity feed: icon=Activity, title="No recent activity", description="Activity appears after your first deployment"

    AVOID: Rendering null when data is empty
    AVOID: Generic "No data available" text
    USE: The existing EmptyState component from src/components/ui/
  </action>
  <verify>
    1. Log in with a fresh test account (no environments)
    2. Click each dashboard tab
    3. Each tab shows the specific EmptyState component with the CTA button
    4. No tab shows a blank area or "undefined" text
  </verify>
  <done>Every tab shows a purposeful EmptyState when data is absent</done>
</task>

---

## WAVE 3 — COIE Real Scoring Engine
*Dependencies: Wave 1 (auth + pg_cron) must be done first*

<task type="auto" effort="high">
  <name>COIE: Replace hardcoded scoring with real check array pattern</name>
  <files>supabase/functions/coie-cycle/index.ts</files>
  <action>
    Replace the current scoring logic with a structured check array.

    Each check is an object:
    {
      id: string,         // MISSING_RESOURCE_LIMITS
      dimension: string,  // security | reliability | cost | performance
      severity: string,   // critical | high | medium | low
      maxDeduction: number,
      title: string,      // human-readable one-liner
      description: string,
      remediation: string, // exact YAML change to fix
      evaluate: (inventory) => { failed: boolean, affectedResources: string[], deduction: number }
    }

    Implement ALL of these checks (not partial):

    SECURITY (weight 35%):
    - PRIVILEGED_CONTAINERS: containers with securityContext.privileged=true → 25pts
    - HOST_NAMESPACE: hostPID/hostIPC/hostNetwork=true → 20pts each
    - MISSING_RESOURCE_LIMITS: no cpu+memory limits → 10pts per workload (max 30)
    - LATEST_IMAGE_TAG: image using :latest → 5pts per image (max 15)
    - MISSING_SECURITY_CONTEXT: no runAsNonRoot+allowPrivilegeEscalation:false → 8pts (max 24)
    - SECRETS_IN_ENV: env var names matching /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/i → 15pts

    RELIABILITY (weight 30%):
    - SINGLE_REPLICA: replicas < 2 → 15pts
    - MISSING_READINESS_PROBE: no readinessProbe → 12pts (max 24)
    - MISSING_LIVENESS_PROBE: no livenessProbe → 10pts (max 20)
    - HIGH_RESTART_COUNT: restartCount > 3 in 24h → 15pts
    - NO_DISRUPTION_BUDGET: multi-replica without PDB → 8pts (max 16)
    - RECREATE_ROLLOUT: type: Recreate instead of RollingUpdate → 10pts

    COST (weight 20%):
    - OVER_PROVISIONED_CPU: usage < 50% of request → 20pts + projectedSaving calculation
    - OVER_PROVISIONED_MEMORY: usage < 60% of request → 15pts + projectedSaving
    - ORPHANED_LOAD_BALANCERS: LoadBalancer service with 0 endpoints → 10pts
    - UNUSED_NAMESPACES: namespace with 0 pods older than 7 days → 5pts

    PERFORMANCE (weight 15%):
    - HIGH_ERROR_RATE: 5xx rate > 1% → 20pts
    - NODE_MEMORY_PRESSURE: node memory > 85% → 10pts
    - CPU_THROTTLING: container throttled > 20% → 10pts
    - LATENCY_DEGRADATION: p99 increased > 20% over 24h → 15pts

    Data source:
    - Read inventory from Redis: redis.get('inventory:' + environment_id)
    - If inventory is null: log "No inventory available, skipping cycle" and return
    - DO NOT hardcode workload data for scoring

    AFTER SCORING — ALL THREE of these writes are MANDATORY:
    1. UPDATE environments SET health_score, score_security, score_reliability, score_cost,
       score_performance, score_updated_at WHERE id = environment_id
    2. INSERT INTO cluster_scores (environment_id, health_score, score_security, ...) VALUES (...)
    3. For each failed check: INSERT INTO findings WITH deduplication check
       (check if check_name + affected_resource + status='open' already exists)
       - If exists: UPDATE last_seen_at only
       - If resolved (check now passes): UPDATE status='resolved'

    AVOID: Writing to environments table only, skipping cluster_scores and findings
    AVOID: Hardcoding workload data for evaluation
    AVOID: Scores below 0 or above 100 (floor and ceil)
  </action>
  <verify>
    1. Manually insert inventory into Redis:
       redis.set('inventory:[env-id]', JSON.stringify({ workloads: [{ name: 'api', containers: [{ resources: {} }] }] }))
    2. POST to coie-cycle with { environment_id: '[env-id]' }
    3. SELECT health_score, score_security FROM environments WHERE id = '[env-id]'
       → scores must have changed from 0
    4. SELECT COUNT(*), MAX(evaluated_at) FROM cluster_scores WHERE environment_id = '[env-id]'
       → count > 0, evaluated_at is recent
    5. SELECT check_name, severity, title FROM findings WHERE environment_id = '[env-id]' LIMIT 5
       → rows exist with MISSING_RESOURCE_LIMITS or similar
  </verify>
  <done>
    - environments table: all 5 score columns updated after coie-cycle runs
    - cluster_scores: new row inserted per run
    - findings: rows inserted for each failed check
    - No rows written when inventory is absent (clean skip)
  </done>
</task>

---

## WAVE 4 — AIRE Real Pattern Matching + OpenAI
*Dependencies: Wave 3 (COIE) recommended but not required*

<task type="auto" effort="high">
  <name>AIRE Tier 1: Real pattern matching with confidence scoring</name>
  <files>supabase/functions/aire-detect/index.ts</files>
  <action>
    Replace the current keyword matching with a proper pattern array.

    Each pattern:
    {
      id: string,
      keywords: string[],    // searched in summary + log_excerpts
      exitCodes: number[],   // optional
      eventReasons: string[], // optional K8s event reasons
      confidence: number,    // max confidence if ALL conditions match
      rootCauseTemplate: string, // {resource} and {namespace} replaced at runtime
      immediateAction: string,
      permanentFix: string,
      remediationType: string // restart | patch_manifest | open_pr | scale
    }

    Implement ALL 10 patterns:
    OOM_KILL, APP_CRASH, IMAGE_PULL_FAILURE, LIVENESS_PROBE_FAILURE,
    CONFIG_MISSING, NODE_PRESSURE, ROLLOUT_STUCK, PVC_BINDING_FAILURE,
    RBAC_DENIAL, STARTUP_DEADLOCK

    Confidence scoring algorithm:
    const text = [incident.summary, ...incident.log_excerpts].join(' ').toLowerCase()
    for each pattern:
      let score = 0
      let total = pattern.keywords.length + (pattern.exitCodes?.length || 0) + (pattern.eventReasons?.length || 0)
      for each keyword: if text.includes(keyword) score++
      for each exitCode: if incident.exit_code === exitCode score++
      for each reason: if incident.event_reasons?.includes(reason) score++
      confidence = (score / total) * pattern.confidence

    Select pattern with highest confidence. Threshold: 0.65

    After matching — MUST update incidents table (nothing can stay null):
    await supabase.from('incidents').update({
      matched_pattern: bestMatch?.id || null,
      pattern_confidence: bestMatch?.confidence || 0,
      root_cause: bestMatch ? interpolate(bestMatch.rootCauseTemplate, incident) : 'AutoStack detected an anomaly that does not match known patterns.',
      immediate_action: bestMatch?.immediateAction || 'Check pod logs and recent K8s events.',
      permanent_fix: bestMatch?.permanentFix || 'Investigate manually.',
      remediation_type: bestMatch?.remediationType || 'manual',
      status: 'diagnosed',
      diagnosed_at: new Date().toISOString()
    }).eq('id', incident.id)

    AVOID: Leaving any incident with status='detected' indefinitely
    AVOID: Returning without updating the incident row
    USE: Confidence scoring — not binary match/no-match
  </action>
  <verify>
    INSERT INTO incidents (environment_id, trigger_type, summary, log_excerpts, severity)
    VALUES (
      '[your-env-id]',
      'pod_restart',
      'Pod api-gateway killed: OOMKilled exit code 137',
      '["OOMKilled: container exceeded memory limit 512Mi", "Killed process 1 (node) by signal 9"]',
      'high'
    );
    -- Wait 10 seconds --
    SELECT matched_pattern, pattern_confidence, root_cause, status
    FROM incidents ORDER BY detected_at DESC LIMIT 1;
    Expected: matched_pattern='OOM_KILL', confidence > 0.80, root_cause NOT null, status='diagnosed'
  </verify>
  <done>
    - Test incident diagnosed within 10 seconds
    - matched_pattern is NOT null
    - root_cause contains the affected resource name (not a generic template)
    - status = 'diagnosed'
  </done>
</task>

<task type="auto" effort="high">
  <name>AIRE Tier 2: OpenAI embedding + pgvector semantic fallback</name>
  <files>
    supabase/functions/aire-detect/index.ts,
    supabase/migrations/005_pgvector_rpc.sql
  </files>
  <action>
    Only runs when Tier 1 confidence < 0.65.

    1. Create migration for the pgvector RPC function:
       CREATE OR REPLACE FUNCTION match_incident_patterns(
         query_embedding vector(1536),
         match_threshold float DEFAULT 0.75,
         match_count int DEFAULT 1
       ) RETURNS TABLE (id uuid, name text, description text, ...)
       AS $$ SELECT ... FROM incident_patterns WHERE 1-(embedding <=> query_embedding) > match_threshold ... $$;

    2. In aire-detect, after Tier 1 fails:
       a. Hash the incident summary: sha256 hex, first 16 chars
       b. Check Redis: redis.get('aire:emb:' + hash)
       c. If miss: call OpenAI text-embedding-3-small with incident.summary.slice(0,512)
       d. Cache result: redis.set('aire:emb:' + hash, JSON.stringify(embedding), { ex: 86400 })
       e. pgvector similarity search via supabase.rpc('match_incident_patterns', ...)
       f. If similarity > 0.80: use semantic match with 0.90× confidence (slight penalty)

    3. If BOTH tiers fail: still update incident with generic RCA

    Cost tracking:
    await redis.incr('openai:calls:' + new Date().toISOString().split('T')[0])
    First write: set TTL to 86400 seconds

    Error handling for OpenAI:
    wrap in try/catch — if OpenAI is down, log to Sentry and fall through to generic RCA
    NEVER let OpenAI downtime break incident diagnosis

    AVOID: Calling OpenAI when Tier 1 already has high confidence
    AVOID: Missing the Redis cache check (every cache miss = cost)
    USE: text-embedding-3-small (cheapest model, still excellent for this use case)
  </action>
  <verify>
    1. Insert incident with text that semantically describes OOM without using "OOMKilled":
       summary: "Container terminated after exceeding its allocated memory budget by kernel"
    2. Wait 15 seconds (OpenAI call takes longer than keyword match)
    3. Query: SELECT matched_pattern, pattern_confidence FROM incidents ORDER BY detected_at DESC LIMIT 1
       Expected: OOM_KILL with confidence around 0.75-0.85
    4. Call again with same summary → check Redis has cached the embedding
    5. Temporarily set wrong OPENAI_API_KEY → verify incident still gets diagnosed (falls back gracefully)
  </verify>
  <done>
    - Semantically similar incident gets diagnosed with correct pattern
    - Second call uses Redis cache (no OpenAI API call)
    - OpenAI failure = graceful fallback, not broken diagnosis
  </done>
</task>

---

## WAVE 5 — Notifications Engine
*Dependencies: Wave 3 + Wave 4 (COIE and AIRE must write to DB first)*

<task type="auto" effort="high">
  <name>send-notification: complete implementation with all 8 templates</name>
  <files>supabase/functions/send-notification/index.ts</files>
  <action>
    This is the ONLY function that calls Resend. All other functions call this one.

    The function accepts POST with JSON: { type, org_id, cluster_id, recipient_email, recipient_name, payload }

    Required checks in this order:
    1. CORS OPTIONS handler
    2. Auth: verify NOTIFICATION_SECRET from Authorization header
       OR valid JWT — this function is called both internally and (future) externally
    3. Quota check:
       const today = new Date().toISOString().split('T')[0]
       const count = await redis.incr('email:quota:' + today)
       if (count === 1) await redis.expire('email:quota:' + today, 86400)
       if (count > 90) { capture to Sentry, return { success: false, reason: 'quota_exceeded' } }
    4. Cooldown check (for repeating events only): redis.get('notif:cooldown:' + org_id + ':' + cluster_id + ':' + type)
       if exists: return { success: false, reason: 'cooldown_active' }
    5. User prefs check: SELECT from notification_prefs
    6. Render HTML template based on type
    7. Call Resend API
    8. After success: set cooldown for repeating events: redis.set(..., { ex: 1800 })

    Implement ALL 8 templates as TypeScript functions:
    templateWelcome(payload) — "Welcome to AutoStack, {name}!"
    templateIncidentDetected(payload) — alert with root_cause + immediate_action
    templateScoreChanged(payload) — score card showing old vs new with delta
    templateAgentDisconnected(payload) — reconnect instructions
    templateFindingCritical(payload) — top 3 critical findings
    templateInviteMember(payload) — accept link with 7-day expiry
    templateIncidentResolved(payload) — resolution time + what fixed it
    templateWeeklyDigest(payload) — 7-day summary of scores + incidents

    All templates: HTML with INLINE CSS only (no <style> tags — Gmail strips them)
    All templates: unsubscribe link in footer using signed HMAC token

    Cooldown types (repeating events): incident_detected, score_changed, agent_disconnected, finding_critical
    No cooldown (transactional): welcome, invite_member, password_reset

    AVOID: Calling Resend directly from any other function
    AVOID: Sending email when quota > 90
    AVOID: Sending same notification type twice within 30 minutes
  </action>
  <verify>
    1. Call with type='welcome', recipient_email='your-test@email.com'
    2. Check: email arrives within 60 seconds
    3. Check: Resend dashboard logs the send
    4. Call again immediately: response should be { reason: 'cooldown_active' } for incident types
    5. Manually set redis 'email:quota:[today]' to 91
    6. Call any type: response should be { reason: 'quota_exceeded' }
    7. Check: calling function doesn't crash — gets graceful error response
  </verify>
  <done>
    - Welcome email arrives in real inbox within 60 seconds
    - Cooldown returns correct response on second call
    - Quota exceeded returns graceful response
    - No other function can send email except through this one
  </done>
</task>

<task type="auto" effort="low">
  <name>Wire COIE and AIRE to call send-notification</name>
  <files>supabase/functions/coie-cycle/index.ts, supabase/functions/aire-detect/index.ts</files>
  <action>
    In coie-cycle/index.ts, AFTER all DB writes:

    // Trigger 1: new critical findings
    const criticalFindings = newFindings.filter(f => f.severity === 'critical')
    if (criticalFindings.length > 0) {
      callNotification({ type: 'finding_critical', org_id, cluster_id: environment_id, payload: { ... } })
    }

    // Trigger 2: score changed by 10+ points
    const delta = Math.abs(newHealthScore - previousHealthScore)
    if (delta >= 10) {
      callNotification({ type: 'score_changed', org_id, cluster_id: environment_id, payload: { ... } })
    }

    In aire-detect/index.ts, AFTER updating the incident row:
    callNotification({ type: 'incident_detected', org_id, cluster_id, payload: {
      pattern_name: incident.matched_pattern,
      root_cause: incident.root_cause,
      immediate_action: incident.immediate_action,
      affected_resource: incident.affected_resource,
      severity: incident.severity
    }})

    callNotification is a helper function that fetches send-notification URL from env vars
    and POSTs with NOTIFICATION_SECRET in Authorization header.
    Wrap in try/catch — notification failure MUST NOT break COIE/AIRE cycle.
    Use fire-and-forget pattern for non-critical notifications.

    AVOID: Making COIE/AIRE wait synchronously for notification delivery
    AVOID: Crashing COIE/AIRE cycle if notification fails
  </action>
  <verify>
    1. Trigger coie-cycle with an inventory that has MISSING_RESOURCE_LIMITS
    2. Check email inbox: finding_critical notification arrives within 90 seconds
    3. Trigger again immediately: no second email (cooldown active)
    4. Insert OOM incident: check email arrives within 90 seconds of AIRE diagnosis
  </verify>
  <done>
    - COIE critical finding → email notification arrives
    - AIRE incident diagnosed → email notification arrives
    - Both are fire-and-forget (don't block the main cycle)
  </done>
</task>

---

## WAVE 6 — Verification & E2E Test

<task type="checkpoint:human-verify">
  <name>Full signup → onboarding → deploy E2E test</name>
  <action>
    Run this complete test. Record every result. Do not skip steps.

    1. Open a private browser window
    2. Go to /signup
    3. Sign up with a new test email (use a real email you can check)
    4. STOP — check:
       a. organizations table: COUNT(*) increased by 1
       b. org_members table: new row with role='owner'
       c. users.raw_user_meta_data contains org_id key (NOT null)
       d. Welcome email arrived in inbox
       If any of these fail: STOP. Fix auth-hook first.

    5. Click confirmation email link
    6. Land on /onboarding Step 1
    7. Connect AWS account (use CloudFormation OR manual IAM role)
    8. Click "Verify & Connect"
    9. STOP — check:
       a. cloud_credentials table: new row
       b. Response from aws-assume-role: contains { verified: true }
       If this fails: the IAM role trust policy is wrong.

    10. Go to Step 2
    11. Enter a real GitHub repo URL (public repo with package.json)
    12. Select "Hobby" size
    13. Click "Deploy"
    14. Watch progress stepper
    15. STOP after analysis stage — check:
        a. deployments.pr_url is NOT null
        b. GitHub repo has a new PR at autostack/initial-setup branch
        c. PR contains autostack/k8s/deployment.yaml
        If pr_url is null: DIE engine is broken.

    16. Wait for full provisioning (13-22 minutes)
    17. Check:
        a. environments.live_url is NOT null
        b. curl https://[live_url] returns HTTP 200
        c. AWS console: VPC with tag autostack:deployment exists
        d. AWS console: EKS cluster exists
        If live_url is null or returns non-200: infra-provision is broken.
  </action>
  <verify>
    Screenshot required for:
    - The welcome email in inbox
    - The GitHub PR opened in the test repo
    - curl output showing HTTP 200 from live URL
    - AWS console showing tagged VPC
  </verify>
  <done>
    - Welcome email arrived ✓
    - PR opened with all 7 files ✓
    - Live URL returns HTTP 200 ✓
    - All AWS resources tagged ✓
    Product is real. Ship it.
  </done>
</task>
