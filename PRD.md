# PRD.md — AutoStack Autonomous Task List
# For: Ralph Loop (Antigravity VS Code Extension)
# How Ralph Loop works:
#   1. Reads tasks from this file
#   2. Checks progress.txt for completed tasks
#   3. Completes exactly ONE task per iteration
#   4. Appends to progress.txt (never deletes)
#   5. Commits changes
#   6. Repeats until all tasks done
#
# RULES FOR RALPH:
# - Read STATE.md and ARCHITECTURE.md before starting any task
# - Read SPEC.md before writing any code
# - Verify EVERY task using the proof method listed
# - One commit per task, format: fix(scope): description
# - If a task fails 3 times: write the failure to progress.txt and skip it
# - NEVER mark a task done without running the verification
# - NEVER fake a test result
# - All realtime subscriptions MUST have cleanup: return () => supabase.removeChannel(channel)
# - All Redis set() calls MUST have { ex: N } expiry
# - All Edge Functions MUST have CORS OPTIONS handler as FIRST line

## TASK 001 — auth-hook: production implementation
FILE: supabase/functions/auth-hook/index.ts

WHAT TO DO:
Replace the entire file with a production auth-hook that:
1. Has CORS OPTIONS handler as FIRST line in Deno.serve
2. Handles BOTH event types: 'SIGNED_UP' and 'USER_CREATED'
3. Checks if org already exists for user (idempotency)
4. Creates organizations row
5. Creates org_members row with role='owner'
6. Creates notification_prefs row
7. Calls supabase.auth.admin.updateUserById(user.id, { user_metadata: { org_id, role: 'owner' } })
   — THIS IS THE MOST CRITICAL STEP
8. Calls send-notification with type='welcome' (fire-and-forget, wrapped in .catch())
9. Always returns HTTP 200 (even on error — 5xx breaks signup)
10. Uses SUPABASE_SERVICE_ROLE_KEY (not anon key)

THEN: Go to Supabase Dashboard → Authentication → Hooks → "After user creation" → select this function
Document that this registration step was done in progress.txt

PROOF: Sign up with new email → SELECT raw_user_meta_data->>'org_id' FROM auth.users ORDER BY created_at DESC LIMIT 1 → must NOT be null

COMMIT: fix(auth): production auth-hook with org_id injection for email and OAuth users

---

## TASK 002 — CORS: verify all 23 Edge Functions
FILE: supabase/functions/_shared/cors.ts + all function index.ts files

WHAT TO DO:
1. Ensure _shared/cors.ts exists with CORS_HEADERS constant and corsResponse() function
2. Check each of the 23 functions listed in ARCHITECTURE.md
3. For any function missing the OPTIONS handler: add as first line in Deno.serve
4. Deploy all modified functions: supabase functions deploy [name]

PROOF: Run OPTIONS preflight against 5 random functions. All must return 200 with Access-Control-Allow-Origin header.
curl -X OPTIONS https://[project].supabase.co/functions/v1/coie-cycle -H "Origin: http://localhost:5173" -i

COMMIT: fix(cors): add OPTIONS preflight handler to all edge functions

---

## TASK 003 — pg_cron: register 3 background jobs
FILE: supabase/migrations/004_cron_jobs.sql

WHAT TO DO:
Create idempotent migration that registers:
1. coie-evaluation: */5 * * * * (every 5 minutes)
2. weekly-digest: 0 9 * * 0 (Sunday 9am UTC)
3. cleanup-old-data: 0 2 * * * (daily 2am UTC)

Each uses: cron.unschedule('job-name'); -- ignore error if not exists
            cron.schedule('job-name', 'schedule', $$ ... $$);

Apply: supabase db push OR run SQL in Supabase dashboard

PROOF: SELECT jobname, schedule, active FROM cron.job → 3 rows present

COMMIT: feat(db): register pg_cron jobs for coie, digest, cleanup

---

## TASK 004 — github-webhook: HMAC signature verification
FILE: supabase/functions/github-webhook/index.ts

WHAT TO DO:
After CORS OPTIONS handler, before any payload parsing:
1. Get raw body as text
2. Get X-Hub-Signature-256 header
3. If no signature: return 401
4. Verify HMAC-SHA256 using crypto.subtle
5. If invalid: return 403
6. Then parse body as JSON and proceed with existing logic

PROOF:
curl -X POST .../github-webhook -H "X-Hub-Signature-256: sha256=wrong" -d '{}' → 403
curl -X POST .../github-webhook -d '{}' → 401

COMMIT: security(webhook): add HMAC-SHA256 verification to github-webhook

---

## TASK 005 — AuthGuard: eliminate login flash on page refresh
FILE: src/hooks/useAuth.js, src/components/AuthGuard.jsx

WHAT TO DO:
1. useAuth.js: add loading state, true until getSession() resolves
2. AuthGuard.jsx: while loading=true, show full-page spinner (dark bg + spinning circle)
3. Only redirect to /login when loading=false AND user=null
4. Only check for environments (redirect to onboarding) when loading=false AND user exists

PROOF: Log in → refresh page (F5) → observe: spinner appears briefly → dashboard loads → NO flash of login page

COMMIT: fix(auth): eliminate login page flash on session refresh

---

## TASK 006 — Form validation: inline on blur
FILE: src/pages/LoginPage.jsx, src/pages/SignupPage.jsx

WHAT TO DO:
LoginPage:
- Email: validate onBlur with regex, show red inline error below field
- Password: validate onBlur for non-empty
- Prevent submit if validation fails

SignupPage:
- Full name: non-empty, 2-50 chars
- Email: regex validation
- Org name: /^[a-zA-Z0-9\s\-_.]{2,60}$/
- Password: enforce ALL 4 rules (8 chars + number + uppercase + special)
- Confirm password: real-time match check on every keystroke
- Terms: must be checked

PROOF:
1. Submit empty login form → both fields show red errors
2. Type "bad-email" in email → blur → error shows
3. Type 7-char password in signup → submit stays disabled

COMMIT: fix(forms): add inline blur validation to login and signup pages

---

## TASK 007 — EmptyState: wire to all dashboard tabs
FILE: src/components/tabs/*.jsx

WHAT TO DO:
For each tab, replace null/blank/bare-text empty states with EmptyState component:
- DeploymentsTab: Rocket icon + "No deployments yet" + "Deploy an app" button
- PipelinesTab: GitBranch icon + "No pipeline runs" + description
- InfrastructureTab: Server icon + "No infrastructure" + description
- LogsTab: FileText icon + "No logs yet" + description
- IncidentsTab: ShieldCheck icon + "All clear" + description
- OverviewTab activity feed: Activity icon + "No recent activity"

PROOF: Log in with fresh account with no data → click each tab → every tab shows its EmptyState component (not blank)

COMMIT: fix(ui): wire EmptyState component to all dashboard tabs

---

## TASK 008 — COIE: real check array + mandatory DB writes
FILE: supabase/functions/coie-cycle/index.ts

WHAT TO DO:
1. Implement the check array pattern (see PLAN.md Wave 3 for complete spec)
2. Read inventory from Redis: redis.get('inventory:' + environment_id)
3. If inventory is null: log + return early (do NOT score with fake data)
4. Run all 16 checks across 4 dimensions
5. MANDATORY write 1: UPDATE environments SET all 5 score columns
6. MANDATORY write 2: INSERT INTO cluster_scores
7. MANDATORY write 3: INSERT/UPDATE findings with deduplication

PROOF:
1. Insert test inventory into Redis key 'inventory:[env-id]'
2. Trigger coie-cycle manually
3. SELECT health_score FROM environments WHERE id = '[env-id]' → must have changed
4. SELECT COUNT(*) FROM cluster_scores WHERE environment_id = '[env-id]' → count > 0
5. SELECT COUNT(*) FROM findings WHERE environment_id = '[env-id]' → count > 0

COMMIT: feat(coie): implement real check array with all 16 checks and mandatory DB writes

---

## TASK 009 — AIRE Tier 1: confidence-scored pattern matching
FILE: supabase/functions/aire-detect/index.ts

WHAT TO DO:
1. Implement pattern array with all 10 patterns (see PLAN.md Wave 4)
2. Implement confidence scoring algorithm (not just string.includes())
3. After matching: ALWAYS update incidents row (no field can stay null)
4. Even no-match: update with generic RCA + status='diagnosed'

PROOF:
INSERT test incident with "OOMKilled exit code 137" in log_excerpts
Wait 10 seconds
SELECT matched_pattern, pattern_confidence, status FROM incidents ORDER BY detected_at DESC LIMIT 1
→ matched_pattern = 'OOM_KILL', confidence > 0.80, status = 'diagnosed'

COMMIT: feat(aire): implement 10-pattern Tier 1 matching with confidence scoring

---

## TASK 010 — AIRE Tier 2: OpenAI embedding + pgvector semantic search
FILE: supabase/functions/aire-detect/index.ts, supabase/migrations/005_pgvector_rpc.sql

WHAT TO DO:
1. Create migration: match_incident_patterns(query_embedding vector, ...) RPC function
2. In aire-detect: when Tier 1 confidence < 0.65:
   a. Hash incident summary
   b. Check Redis cache
   c. If miss: call OpenAI text-embedding-3-small
   d. Cache embedding 24h
   e. Run pgvector similarity search
   f. Use result if similarity > 0.80
3. Track daily OpenAI call count in Redis
4. Wrap in try/catch — OpenAI failure = graceful fallback

PROOF:
1. Insert incident with "Container terminated after exceeding allocated memory budget"
   (no OOMKilled keyword — forces semantic search)
2. Wait 15s
3. SELECT matched_pattern FROM incidents ORDER BY detected_at DESC LIMIT 1 → should be OOM_KILL

COMMIT: feat(aire): add Tier 2 OpenAI semantic matching with Redis caching

---

## TASK 011 — send-notification: complete implementation
FILE: supabase/functions/send-notification/index.ts

WHAT TO DO:
1. Complete the full function per PLAN.md Wave 5 spec
2. Implement quota guard (Redis counter, stop at 90)
3. Implement cooldown per org+cluster+type (30 min)
4. Implement all 8 HTML email templates (inline CSS only)
5. Implement unsubscribe signed URL generation

PROOF:
1. Call with type='welcome' → email arrives in inbox within 60s
2. Call again immediately with incident type → { reason: 'cooldown_active' }
3. Set Redis quota to 91 → { reason: 'quota_exceeded' }

COMMIT: feat(notifications): complete send-notification with quota guard and all 8 templates

---

## TASK 012 — Wire notifications: COIE → send-notification
FILE: supabase/functions/coie-cycle/index.ts

WHAT TO DO:
After all DB writes in coie-cycle:
1. If new critical findings: callNotification({ type: 'finding_critical', ... })
2. If health_score changed by 10+ points: callNotification({ type: 'score_changed', ... })
Both as fire-and-forget (don't await, wrap in .catch())

PROOF:
Trigger coie-cycle with inventory containing privileged container
Check email: finding_critical arrives within 90 seconds

COMMIT: feat(coie): wire critical finding and score change notifications

---

## TASK 013 — Wire notifications: AIRE → send-notification
FILE: supabase/functions/aire-detect/index.ts

WHAT TO DO:
After updating incidents row with diagnosis:
1. callNotification({ type: 'incident_detected', org_id, cluster_id, payload: { ... } })
Fire-and-forget, wrapped in .catch()

PROOF:
Insert OOM_KILL test incident
Wait for AIRE to diagnose
Check email: incident_detected arrives within 90 seconds

COMMIT: feat(aire): wire incident notification after diagnosis

---

## TASK 014 — die-analyze: REAL GitHub API + REAL PR opening
FILE: supabase/functions/die-analyze/index.ts

WHAT TO DO:
1. Verify file fetching uses REAL GitHub App installation token (not hardcoded)
2. Implement complete language detection tree (12 frameworks — see PLAN.md)
3. Implement generateManifests() for all 7 files with real content
4. Implement openManifestPR() that ACTUALLY creates branch + files + PR via GitHub API
5. After PR created: UPDATE deployments SET pr_url = pr.html_url (CANNOT be null)
6. Handle GitHub 404 specifically: if App not installed → show user: "Install AutoStack GitHub App"

PROOF:
1. Create test repo with package.json containing { "dependencies": { "express": "^4.18" } }
2. Trigger die-analyze on this repo
3. SELECT pr_url FROM deployments ORDER BY created_at DESC LIMIT 1 → NOT null
4. Open GitHub: PR exists at autostack/initial-setup branch with all 7 files

COMMIT: feat(die): implement real GitHub API integration with PR generation

---

## TASK 015 — infra-provision: real AWS SDK calls
FILE: supabase/functions/infra-provision/index.ts

WHAT TO DO:
1. Import real AWS SDK v3: @aws-sdk/client-sts, @aws-sdk/client-ec2, @aws-sdk/client-eks
2. Assume org's IAM role using STS (read credentials from Vault)
3. Create VPC, subnets, IGW, NAT, route tables, security groups
4. Create EKS cluster (this takes 10-13 minutes — stream progress via Realtime)
5. Create node group
6. Create ECR repository
7. TAG EVERY RESOURCE: { Key: 'autostack:deployment', Value: deployment_id }
8. Update environments.provisioning_stage at each step (Realtime progress)
9. When complete: set live_url and provisioning_status='active'

PROOF:
1. Trigger infra-provision with real org's IAM role ARN
2. AWS Console → EC2 → VPCs: look for tag autostack:deployment = [deployment_id]
3. AWS Console → EKS: cluster exists
4. SELECT live_url, provisioning_status FROM environments WHERE id = '[id]'
   → live_url NOT null, status = 'active'

COMMIT: feat(infra): implement real AWS SDK provisioning with full VPC+EKS stack

---

## TASK 016 — Go agent: compile and run registration
FILE: agent/cmd/agent/main.go, agent/internal/registration/register.go

WHAT TO DO:
1. Ensure go.mod has all required dependencies (client-go, zap)
2. Implement registration.go: POST to agent-register with token, receive environment_id
3. Save environment_id to K8s ConfigMap for persistence across pod restarts
4. Implement main.go: load config, call Register(), start goroutines (heartbeat, events, metrics)
5. Build the binary: go build -o bin/autostack-agent ./cmd/agent

PROOF:
cd agent && go build -o bin/autostack-agent ./cmd/agent
→ Binary exists at agent/bin/autostack-agent (no build errors)
Run binary with test token → check agent_register function was called
SELECT agent_status FROM environments WHERE id = '[env-id]' → 'connected'

COMMIT: feat(agent): implement Go agent registration and heartbeat

---

## TASK 017 — Go agent: K8s event streaming → incidents
FILE: agent/internal/collector/events.go

WHAT TO DO:
1. Watch K8s events API for Warning type events
2. For each Warning event: POST to agent-metrics with type='events' payload
3. Include deduplication: don't send same event+object within 2 minutes
4. Handle watch restart gracefully (K8s watches expire after ~5 minutes)
5. All network errors: log + retry with exponential backoff, NEVER crash

PROOF:
1. Deploy agent to a test cluster
2. Create a pod that will OOMKill (memory limit too low)
3. Watch agent logs: should detect OOMKilled event
4. SELECT trigger_type, summary FROM incidents ORDER BY detected_at DESC LIMIT 1
   → trigger_type = 'oom_kill'

COMMIT: feat(agent): implement K8s Watch API event streaming for AIRE detection

---

## TASK 018 — Go agent: metrics + inventory collection
FILE: agent/internal/collector/metrics.go, agent/internal/collector/inventory.go

WHAT TO DO:
Metrics (every 60 seconds):
1. Query metrics-server for all node + pod metrics
2. POST to agent-metrics with type='metrics' + node/pod data array

Inventory (every 5 minutes):
1. List all Deployments, StatefulSets, DaemonSets across all namespaces
2. For each: extract name, namespace, replicas, containers (with resources, probes, securityContext)
3. Also: NetworkPolicies, PodDisruptionBudgets, HPAs
4. Store in Redis: redis.set('inventory:' + environment_id, JSON.stringify(data), { ex: 360 })
   This is what COIE reads for its scoring

PROOF:
1. Run agent for 5 minutes against a real cluster
2. Check Redis key 'inventory:[env-id]': should contain workload JSON
3. Trigger coie-cycle: log should say "using real inventory" not "simulation mode"
4. SELECT cpu_pct, memory_pct FROM cluster_metrics WHERE environment_id = '[id]' ORDER BY sampled_at DESC LIMIT 1
   → real values, not null or 0

COMMIT: feat(agent): implement metrics and workload inventory collection

---

## TASK 019 — Helm chart: publish to GitHub Pages
FILE: agent/helm/autostack-agent/, .github/workflows/helm-release.yml

WHAT TO DO:
1. Build agent Docker image: docker build -t ghcr.io/[username]/autostack-agent:latest agent/
2. Push to GHCR: docker push ghcr.io/[username]/autostack-agent:latest
3. Update helm/values.yaml with real image repository + tag
4. Create GitHub Actions workflow: on push to main with changes in agent/helm/:
   - helm package agent/helm/autostack-agent
   - helm repo index . --url https://[username].github.io/[repo]
   - Push to gh-pages branch
5. Update connect-cluster Edge Function: replace 'charts.autostack.io' with real chart URL

PROOF:
helm repo add autostack https://[username].github.io/[repo]
helm repo update
helm search repo autostack → shows autostack/autostack-agent

COMMIT: feat(agent): publish Helm chart to GitHub Pages

---

## TASK 020 — E2E production verification
FILE: None (verification only)

WHAT TO DO:
Run the complete E2E test from PLAN.md Wave 6.
Record EVERY result in progress.txt.
Screenshot required for:
1. Welcome email in inbox
2. GitHub PR opened with all 7 files
3. curl output showing HTTP 200 from live URL
4. AWS console showing VPC with autostack:deployment tag

If ANY of these fails: write the failure clearly in progress.txt with exact error.
Do NOT mark this task done unless all 4 screenshots exist.

PROOF: 4 screenshots + curl output

COMMIT: test(e2e): production verification - all systems operational

---

# END OF TASK LIST
# When all tasks are done, write "ALL TASKS COMPLETE" to progress.txt
# Then run infra-teardown to destroy the test environment and stop AWS costs
