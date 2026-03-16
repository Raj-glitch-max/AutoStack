# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — FINAL E2E VALIDATION, GAP CLOSURE & DIAGNOSTIC REPORT        ║
# ║  Mission: 92% → 100%. Prove the core product works. Kill all costs.       ║
# ║  Mode: No restrictions. Full access. Brutal honesty required.              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

---

# ══════════════════════════════════════════════════
# STEP 0 — PRE-FLIGHT: ASK BEFORE TOUCHING ANYTHING
# ══════════════════════════════════════════════════

Before running a single command or making any AWS API call, answer these questions
by checking what you already have access to. Do NOT assume. Do NOT proceed until
every required item is confirmed ✅ or you have explicitly flagged it as ❌ MISSING.

Print your answers in this exact format:

```
PRE-FLIGHT CHECK
════════════════

AWS ACCESS:
  AWS Account ID:          [value or ❌ MISSING]
  AWS Region:              [value or ❌ MISSING]
  IAM Role ARN:            [value or ❌ MISSING]
  Can AssumeRole right now: [✅ YES — tested / ❌ NO — error: ...]
  AWS CLI / SDK configured: [✅ YES / ❌ NO]

SUPABASE ACCESS:
  Project URL:             [value or ❌ MISSING]
  Anon Key:                [✅ present / ❌ MISSING]
  Service Role Key:        [✅ present / ❌ MISSING]
  DB direct access:        [✅ YES / ❌ NO]
  Edge Functions deployable:[✅ YES / ❌ NO]

GITHUB ACCESS:
  GitHub App ID:           [value or ❌ MISSING]
  GitHub Webhook Secret:   [✅ present / ❌ MISSING]
  Test repo URL:           [value or ❌ MISSING — will create if needed]
  Can clone repos:         [✅ YES / ❌ NO]

OTHER SERVICES:
  Stripe Secret Key:       [✅ present / ❌ MISSING]
  Resend API Key:          [✅ present / ❌ MISSING]
  Upstash Redis URL+Token: [✅ present / ❌ MISSING]
  Anthropic API Key:       [✅ present for AI features / ❌ MISSING / N/A]

WHAT I NEED FROM USER (list ONLY things you genuinely cannot proceed without):
  [ ] Item 1 — why you need it
  [ ] Item 2 — why you need it
  (or: "Nothing. I have everything needed to proceed.")

ESTIMATED COST OF THIS TEST RUN:
  EKS cluster (1 cluster × ~2 hours):  ~$0.20 (control plane only)
  EC2 nodes (2 × t3.medium × 2 hours): ~$0.17
  ALB (2 hours):                       ~$0.06
  NAT Gateway (2 hours):               ~$0.19
  CodeBuild (1 build × 5 min):         ~$0.01
  TOTAL ESTIMATED:                     ~$0.63 USD
  NOTE: All resources will be destroyed at the end. Actual bill ≈ $1-2 USD.
```

If ANYTHING is ❌ MISSING that you cannot work around: STOP HERE and list exactly
what the user needs to provide. Do not start provisioning with incomplete credentials.

If everything is ✅: print "ALL CLEAR — STARTING TEST SEQUENCE" and proceed to Step 1.

---

# ══════════════════════════════════════════════════
# STEP 1 — ENVIRONMENT VERIFICATION (5 minutes)
# ══════════════════════════════════════════════════

Before any AWS provisioning, verify the full stack is healthy RIGHT NOW.
These are read-only checks. Nothing is created yet.

## 1.1 — Database Health

Run these SQL queries against Supabase and print every result:

```sql
-- Tables exist and have RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- EXPECTED: ~20 tables, ALL with rowsecurity = true
-- FAIL if: any table is missing or has rowsecurity = false

-- auth.org_id() function exists (THE critical function)
SELECT routine_name, routine_schema
FROM information_schema.routines
WHERE routine_schema = 'auth' AND routine_name = 'org_id';
-- EXPECTED: 1 row
-- FAIL if: 0 rows — this breaks ALL RLS policies silently

-- pg_cron jobs registered
SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
-- EXPECTED: coie-evaluation, weekly-digest, cleanup-old-metrics at minimum
-- FAIL if: empty — COIE never runs automatically

-- incident_patterns seeded
SELECT COUNT(*) as pattern_count FROM incident_patterns;
-- EXPECTED: >= 10
-- FAIL if: 0 — AIRE cannot match any incident

-- cloud_credentials table exists with correct columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cloud_credentials'
ORDER BY ordinal_position;
-- EXPECTED: id, org_id, provider, role_arn, external_id, status, etc.

-- infrastructure_events table exists
SELECT COUNT(*) FROM infrastructure_events;
-- EXPECTED: query executes without error (0 rows is fine)

-- Performance indexes exist
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('cluster_metrics', 'cluster_scores', 'findings',
                    'incidents', 'deployments', 'infrastructure_events')
ORDER BY tablename, indexname;
-- EXPECTED: time-series indexes for every table listed above
```

## 1.2 — Edge Functions Health

For each deployed Edge Function, send an OPTIONS preflight and confirm CORS:

```bash
FUNCTIONS=(
  "aws-assume-role"
  "die-analyze"
  "infra-provision"
  "github-webhook"
  "coie-cycle"
  "aire-detect"
  "agent-heartbeat"
  "agent-metrics"
  "send-notification"
  "stripe-webhook"
  "auth-hook"
)

SUPABASE_URL="[your-project-url]"

for fn in "${FUNCTIONS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X OPTIONS \
    -H "Origin: https://autostack.io" \
    -H "Access-Control-Request-Method: POST" \
    "${SUPABASE_URL}/functions/v1/${fn}")

  CORS=$(curl -s -I \
    -X OPTIONS \
    "${SUPABASE_URL}/functions/v1/${fn}" \
    | grep -i "access-control-allow-origin")

  if [ "$STATUS" = "200" ] && [ -n "$CORS" ]; then
    echo "✅ ${fn}: CORS OK"
  else
    echo "❌ ${fn}: CORS FAIL (status: ${STATUS}, cors: ${CORS:-MISSING})"
  fi
done
```

Print every line. Every ❌ must be fixed before proceeding.

## 1.3 — Security Baseline Checks

```bash
# CRITICAL: No service role key in frontend source
echo "=== SERVICE_ROLE check ==="
grep -r "SERVICE_ROLE" frontend/src/ 2>/dev/null && echo "❌ LEAK FOUND" || echo "✅ Clean"

# No hardcoded tokens anywhere
echo "=== Token patterns check ==="
grep -rE "(eyJ[a-zA-Z0-9_-]+\.|re_[a-z0-9]{24,}|sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})" \
  --include="*.ts" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.git \
  . 2>/dev/null && echo "❌ HARDCODED TOKENS FOUND" || echo "✅ Clean"

# .env.local never committed
echo "=== .env.local commit history ==="
git log --all --full-history -- .env.local 2>/dev/null | head -3
# EXPECTED: empty output

# Rate limiting active (try to hit a function 6 times fast)
echo "=== Rate limit check ==="
for i in {1..6}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/functions/v1/aws-assume-role" \
    -H "Content-Type: application/json" \
    -d '{"test": true}')
  echo "  Request ${i}: HTTP ${CODE}"
done
# EXPECTED: first ~5 return 401 (no auth), 6th might still be 401 or 429
# The important thing: no 500 errors, function responds
```

## 1.4 — Frontend Build Health

```bash
cd frontend
npm run build 2>&1 | tail -20
# EXPECTED: Build complete, 0 errors
# Print exact bundle sizes for each chunk
```

Print a summary table:
```
ENVIRONMENT VERIFICATION SUMMARY
═════════════════════════════════
Database tables:     [N]/[expected] ✅/❌
RLS on all tables:   ✅/❌ (list any ❌ tables)
auth.org_id():       ✅/❌
pg_cron jobs:        [N] jobs registered
incident_patterns:   [N] rows
Edge Functions CORS: [N]/[total] passing
Security checks:     ✅/❌
Frontend build:      ✅/❌
READY TO PROCEED:    ✅ YES / ❌ NO (fix issues above first)
```

---

# ══════════════════════════════════════════════════
# STEP 2 — CREATE TEST INFRASTRUCTURE
# (ONE-TIME, takes 2 minutes)
# ══════════════════════════════════════════════════

## 2.1 — Create Test GitHub Repository

If a test repo does not already exist, create it now:

```bash
# Create: github.com/[your-username]/autostack-e2e-test
# Contents:

# index.js
cat > /tmp/autostack-test/index.js << 'EOF'
const http = require('http')
const port = process.env.PORT || 3000

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      healthy: true,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'unknown',
      version: '1.0.0',
      host: req.headers.host
    }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', message: 'AutoStack E2E test app' }))
})

server.listen(port, '0.0.0.0', () => {
  console.log(`AutoStack test server running on port ${port}`)
})
EOF

# package.json
cat > /tmp/autostack-test/package.json << 'EOF'
{
  "name": "autostack-e2e-test",
  "version": "1.0.0",
  "description": "AutoStack end-to-end test application",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "echo 'no tests'"
  },
  "engines": { "node": ">=20" }
}
EOF

# .gitignore
echo "node_modules/" > /tmp/autostack-test/.gitignore

# Push to GitHub (use gh CLI or GitHub API)
gh repo create autostack-e2e-test --public --source /tmp/autostack-test --push
```

Note the repo URL. This is your test deployment target.

## 2.2 — Create Test Supabase User

Create a fresh test user that goes through the full signup → onboarding flow:

```bash
# Call Supabase auth signup endpoint
curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "e2e-test@autostack-test.io",
    "password": "TestPassword123!",
    "options": {
      "data": {
        "full_name": "E2E Test User",
        "organization_name": "AutoStack E2E Tests"
      }
    }
  }' | jq .

# EXPECTED RESULT:
# {
#   "access_token": "eyJ...",
#   "user": {
#     "id": "...",
#     "user_metadata": {
#       "org_id": "...",    ← THIS MUST EXIST (auth-hook ran successfully)
#       "role": "owner"     ← THIS MUST EXIST
#     }
#   }
# }

# FAIL if: user_metadata.org_id is null/missing → auth-hook did NOT run
# This is the most critical check in the entire system

# Save the access token
export TEST_JWT="[access_token from response]"
export TEST_ORG_ID="[org_id from user_metadata]"

echo "Test JWT: ${TEST_JWT:0:20}..."
echo "Test Org ID: ${TEST_ORG_ID}"
```

If `org_id` is missing from `user_metadata`: **STOP. Fix auth-hook registration before continuing.**
Go to Supabase Dashboard → Authentication → Hooks → verify auth-hook is registered.

---

# ══════════════════════════════════════════════════
# STEP 3 — AWS IAM ROLE VERIFICATION
# ══════════════════════════════════════════════════

## 3.1 — Validate IAM Role Can Be Assumed

```bash
# Test STS AssumeRole with the exact parameters AutoStack uses
aws sts assume-role \
  --role-arn "${AUTOSTACK_IAM_ROLE_ARN}" \
  --role-session-name "AutoStack-E2E-Test" \
  --external-id "${TEST_ORG_ID}" \
  --duration-seconds 900 \
  2>&1

# EXPECTED: JSON with Credentials object containing AccessKeyId, SecretAccessKey, SessionToken
# FAIL if: AccessDenied (trust policy wrong), NoSuchEntity (role doesn't exist),
#          InvalidClientTokenId (wrong account), etc.
```

## 3.2 — Test aws-assume-role Edge Function End-to-End

```bash
curl -s -X POST "${SUPABASE_URL}/functions/v1/aws-assume-role" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"account_id\": \"${AWS_ACCOUNT_ID}\",
    \"region\": \"${AWS_REGION}\",
    \"role_arn\": \"${AUTOSTACK_IAM_ROLE_ARN}\",
    \"display_name\": \"E2E Test AWS Account\"
  }" | jq .

# EXPECTED:
# {
#   "success": true,
#   "permissions_ok": true,
#   "credential_id": "uuid...",
#   "verified_at": "2026-..."
# }

# FAIL if: success: false → print the exact error and diagnose

# Save credential ID
export TEST_CRED_ID="[credential_id from response]"

# Verify it was saved to DB
curl -s "${SUPABASE_URL}/rest/v1/cloud_credentials?id=eq.${TEST_CRED_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" | jq .

# CRITICAL CHECK: no access_key or secret_key in the DB response
# EXPECTED: role_arn present, status: 'verified', NO credentials in any column
```

---

# ══════════════════════════════════════════════════
# STEP 4 — THE CORE E2E DEPLOY TEST
# Full pipeline: Repo → Live URL on real AWS
# Expected time: 12-18 minutes
# ══════════════════════════════════════════════════

This is the test that matters. Everything before this was setup.
From here: real AWS API calls, real infrastructure, real costs (~$0.60).

## 4.1 — Create Project Record

```bash
# Create project in DB (this triggers die-analyze)
PROJECT_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/projects" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"org_id\": \"${TEST_ORG_ID}\",
    \"name\": \"e2e-test-app\",
    \"repo_url\": \"https://github.com/[your-username]/autostack-e2e-test\",
    \"branch\": \"main\",
    \"environment\": \"production\",
    \"size\": \"small\"
  }")

echo "${PROJECT_RESPONSE}" | jq .
export TEST_PROJECT_ID=$(echo "${PROJECT_RESPONSE}" | jq -r '.[0].id')
echo "Project ID: ${TEST_PROJECT_ID}"
```

## 4.2 — Trigger DIE Analysis (Stages 1 + 2)

```bash
START_TIME=$(date +%s)

# Call die-analyze Edge Function
ANALYZE_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/die-analyze" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"${TEST_PROJECT_ID}\",
    \"credential_id\": \"${TEST_CRED_ID}\"
  }")

echo "die-analyze response:"
echo "${ANALYZE_RESPONSE}" | jq .

# EXPECTED:
# {
#   "success": true,
#   "status": "waiting_confirm",
#   "infra_plan": {
#     "nodeInstance": "t3.medium",
#     "nodeCount": 2,
#     "totalMonthlyCost": [some number],
#     "costBreakdown": {...}
#   },
#   "repo_profile": {
#     "language": "Node.js",
#     "framework": "Node.js",
#     "port": 3000
#   }
# }

# FAIL if: error in response, missing infra_plan, missing repo_profile
# FAIL if: language is not detected (shows how good the detection is)

# Check project was updated in DB
curl -s "${SUPABASE_URL}/rest/v1/projects?id=eq.${TEST_PROJECT_ID}&select=provisioning_status,detected_language,infra_plan,estimated_monthly_cost" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" | jq .

# EXPECTED: provisioning_status = 'waiting_confirm', detected_language = 'Node.js', infra_plan populated
```

## 4.3 — Confirm and Trigger Infrastructure Provisioning (Stage 3)

```bash
echo "=== STARTING AWS PROVISIONING — REAL COSTS BEGIN HERE ==="
PROVISION_START=$(date +%s)

# Call infra-provision to start Stage 3
PROVISION_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/infra-provision" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"${TEST_PROJECT_ID}\",
    \"credential_id\": \"${TEST_CRED_ID}\",
    \"confirmed\": true
  }")

echo "infra-provision response:"
echo "${PROVISION_RESPONSE}" | jq .

echo ""
echo "Provisioning started. Polling for progress..."
echo "This will take 12-18 minutes. Checking every 30 seconds."
echo ""

# Poll infrastructure_events and project status
LAST_STAGE=""
while true; do
  # Get latest infrastructure events
  EVENTS=$(curl -s "${SUPABASE_URL}/rest/v1/infrastructure_events?project_id=eq.${TEST_PROJECT_ID}&order=created_at.desc&limit=5" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}")

  # Get current project status
  PROJECT=$(curl -s "${SUPABASE_URL}/rest/v1/projects?id=eq.${TEST_PROJECT_ID}&select=provisioning_status,die_stage,live_url" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}")

  STATUS=$(echo "${PROJECT}" | jq -r '.[0].provisioning_status')
  STAGE=$(echo "${PROJECT}" | jq -r '.[0].die_stage // "unknown"')
  ELAPSED=$(( $(date +%s) - PROVISION_START ))

  # Print new stages as they appear
  if [ "${STAGE}" != "${LAST_STAGE}" ]; then
    echo "[${ELAPSED}s] Stage: ${STAGE}"
    LAST_STAGE="${STAGE}"

    # Print latest event details
    echo "${EVENTS}" | jq -r '.[0] | "  └─ \(.event_type): \(.message)"' 2>/dev/null
  fi

  # Check terminal states
  if [ "${STATUS}" = "live" ]; then
    LIVE_URL=$(echo "${PROJECT}" | jq -r '.[0].live_url')
    PROVISION_TIME=$(( $(date +%s) - PROVISION_START ))
    echo ""
    echo "╔═══════════════════════════════════════════╗"
    echo "║  ✅ DEPLOYMENT LIVE!                       ║"
    echo "║  Time: ${PROVISION_TIME}s                  ║"
    echo "║  URL: ${LIVE_URL}                          ║"
    echo "╚═══════════════════════════════════════════╝"
    export TEST_LIVE_URL="${LIVE_URL}"
    break
  fi

  if [ "${STATUS}" = "failed" ]; then
    echo ""
    echo "╔═══════════════════════════════════════════╗"
    echo "║  ❌ DEPLOYMENT FAILED                      ║"
    echo "║  Stage: ${STAGE}                           ║"
    echo "╚═══════════════════════════════════════════╝"
    # Print all events for diagnosis
    echo "All infrastructure events:"
    curl -s "${SUPABASE_URL}/rest/v1/infrastructure_events?project_id=eq.${TEST_PROJECT_ID}&order=created_at.asc" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[] | "[\(.stage)] [\(.event_type)] \(.message)"'
    export DEPLOY_FAILED=true
    break
  fi

  # Timeout after 25 minutes
  if [ $ELAPSED -gt 1500 ]; then
    echo "❌ TIMEOUT: Deployment took more than 25 minutes"
    export DEPLOY_FAILED=true
    break
  fi

  sleep 30
done
```

---

# ══════════════════════════════════════════════════
# STEP 5 — LIVE URL VALIDATION (if deploy succeeded)
# ══════════════════════════════════════════════════

Run ALL of these. Print every result. Do not skip any.

```bash
if [ -z "${DEPLOY_FAILED}" ]; then

  echo "=== LIVE URL VALIDATION ==="

  # Test 1: Basic health check
  echo "[Test 1] Basic health check..."
  HEALTH=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "${TEST_LIVE_URL}/health")
  HTTP_CODE=$(echo "${HEALTH}" | grep "HTTP_STATUS:" | cut -d: -f2)
  BODY=$(echo "${HEALTH}" | grep -v "HTTP_STATUS:")
  echo "  Status: ${HTTP_CODE}"
  echo "  Body: ${BODY}"
  [ "${HTTP_CODE}" = "200" ] && echo "  ✅ PASS" || echo "  ❌ FAIL"

  # Test 2: Root endpoint
  echo "[Test 2] Root endpoint..."
  ROOT=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "${TEST_LIVE_URL}/")
  HTTP_CODE=$(echo "${ROOT}" | grep "HTTP_STATUS:" | cut -d: -f2)
  [ "${HTTP_CODE}" = "200" ] && echo "  ✅ PASS: HTTP 200" || echo "  ❌ FAIL: HTTP ${HTTP_CODE}"

  # Test 3: SSL/TLS
  echo "[Test 3] HTTPS/SSL..."
  curl -s --max-time 10 "https://${TEST_LIVE_URL#https://}/health" > /dev/null 2>&1 \
    && echo "  ✅ PASS: TLS working" || echo "  ❌ FAIL: TLS error"

  # Test 4: Response time (latency)
  echo "[Test 4] Response time..."
  LATENCY=$(curl -s -o /dev/null -w "%{time_total}" "${TEST_LIVE_URL}/health")
  echo "  Latency: ${LATENCY}s"
  LATENCY_INT=$(echo "${LATENCY}" | cut -d. -f1)
  [ "${LATENCY_INT}" -lt 2 ] && echo "  ✅ PASS: < 2s" || echo "  ⚠️ WARN: > 2s"

  # Test 5: Load test (10 concurrent requests)
  echo "[Test 5] 10 concurrent requests..."
  FAIL_COUNT=0
  for i in {1..10}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${TEST_LIVE_URL}/health" &)
    echo -n "${CODE} "
  done
  wait
  echo ""
  echo "  (Check above — all should be 200)"

  # Test 6: Kubernetes pods are Running
  echo "[Test 6] Kubernetes pod status..."
  # Get kubeconfig from the provisioned cluster
  aws eks update-kubeconfig \
    --region "${AWS_REGION}" \
    --name "autostack-${TEST_PROJECT_ID:0:8}" \
    --role-arn "${AUTOSTACK_IAM_ROLE_ARN}" 2>/dev/null
  kubectl get pods -n e2e-test-app 2>/dev/null || echo "  ⚠️ kubectl not accessible from here (check AWS console)"

  # Test 7: Verify AWS resources are tagged
  echo "[Test 7] AWS resource tagging..."
  aws ec2 describe-vpcs \
    --filters "Name=tag:autostack:project_id,Values=${TEST_PROJECT_ID}" \
    --region "${AWS_REGION}" \
    --output json 2>/dev/null | jq -r '.Vpcs[0].VpcId // "NOT FOUND"' | \
    xargs -I {} echo "  VPC: {}"

  echo ""
  echo "=== LIVE URL VALIDATION COMPLETE ==="
fi
```

---

# ══════════════════════════════════════════════════
# STEP 6 — INTELLIGENCE LAYER VALIDATION
# ══════════════════════════════════════════════════

## 6.1 — Trigger COIE Cycle

```bash
echo "=== COIE VALIDATION ==="

# Trigger a COIE cycle for this cluster
CLUSTER_ID=$(curl -s "${SUPABASE_URL}/rest/v1/clusters?org_id=eq.${TEST_ORG_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].id')

echo "Cluster ID: ${CLUSTER_ID}"

curl -s -X POST "${SUPABASE_URL}/functions/v1/coie-cycle" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"cluster_id\": \"${CLUSTER_ID}\"}" | jq .

sleep 10

# Check cluster scores updated
curl -s "${SUPABASE_URL}/rest/v1/clusters?id=eq.${CLUSTER_ID}&select=health_score,score_security,score_reliability,score_cost,score_performance,score_updated_at" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" | jq .
# EXPECTED: all 5 scores populated (not null, not 0)

# Check findings created
FINDING_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/findings?cluster_id=eq.${CLUSTER_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" | jq length)

echo "Findings created: ${FINDING_COUNT}"
[ "${FINDING_COUNT}" -gt 0 ] && echo "✅ COIE created findings" || echo "⚠️ COIE ran but no findings (check if metrics data exists)"
```

## 6.2 — Trigger AIRE Incident Detection

```bash
echo "=== AIRE VALIDATION ==="

# Manually insert a test incident to simulate agent detecting a crash
INCIDENT_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/incidents" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"cluster_id\": \"${CLUSTER_ID}\",
    \"trigger_type\": \"oom_kill\",
    \"affected_resource\": \"e2e-test-app-pod\",
    \"namespace\": \"e2e-test-app\",
    \"severity\": \"high\",
    \"status\": \"detected\",
    \"log_excerpts\": [
      \"OOMKilled: container e2e-test-app in pod e2e-test-app-7d9f8b-xxx exceeded memory limit\",
      \"Killed process 1 (node) total-vm:524288kB, anon-rss:512000kB, file-rss:1024kB\",
      \"BackOff 5m0s Back-off restarting failed container\"
    ]
  }")

INCIDENT_ID=$(echo "${INCIDENT_RESPONSE}" | jq -r '.[0].id')
echo "Test incident created: ${INCIDENT_ID}"

# Wait for AIRE to diagnose it (should trigger via DB webhook or trigger)
echo "Waiting 30 seconds for AIRE to diagnose..."
sleep 30

# Check incident was diagnosed
INCIDENT=$(curl -s "${SUPABASE_URL}/rest/v1/incidents?id=eq.${INCIDENT_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}")

echo "Incident status after AIRE:"
echo "${INCIDENT}" | jq -r '.[0] | {status, matched_pattern, root_cause, immediate_action}'

STATUS=$(echo "${INCIDENT}" | jq -r '.[0].status')
ROOT_CAUSE=$(echo "${INCIDENT}" | jq -r '.[0].root_cause')

if [ "${STATUS}" = "diagnosed" ] && [ "${ROOT_CAUSE}" != "null" ]; then
  echo "✅ AIRE diagnosed incident correctly"
else
  echo "❌ AIRE failed to diagnose (status: ${STATUS}, root_cause: ${ROOT_CAUSE})"
fi
```

## 6.3 — Realtime Subscription Test

```bash
echo "=== REALTIME VALIDATION ==="
echo "Subscribe to cluster updates and trigger COIE cycle..."
echo "(Run this in a separate terminal to observe Realtime events)"
echo ""
echo "node -e \"
const { createClient } = require('@supabase/supabase-js')
const sb = createClient('${SUPABASE_URL}', '${SUPABASE_ANON_KEY}')
sb.channel('test')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'clusters',
    filter: 'id=eq.${CLUSTER_ID}'
  }, (p) => console.log('Realtime event received:', p.new.health_score))
  .subscribe()
console.log('Subscribed. Waiting for events...')
\""
# This verifies Realtime works — trigger a COIE cycle after subscribing to see updates
```

---

# ══════════════════════════════════════════════════
# STEP 7 — NEGATIVE PATH TESTING (Failure Scenarios)
# ══════════════════════════════════════════════════

Test all the ways things can go wrong. Confirm each is handled gracefully.

## 7.1 — Auth Security Tests

```bash
echo "=== SECURITY TESTS ==="

# Test 1: No auth header
echo "[Security 1] No auth header..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${SUPABASE_URL}/functions/v1/die-analyze" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "fake"}')
[ "${CODE}" = "401" ] && echo "  ✅ PASS: Returns 401" || echo "  ❌ FAIL: Returns ${CODE}"

# Test 2: Invalid JWT
echo "[Security 2] Invalid JWT..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${SUPABASE_URL}/functions/v1/die-analyze" \
  -H "Authorization: Bearer eyJfake.token.here" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "fake"}')
[ "${CODE}" = "401" ] && echo "  ✅ PASS: Returns 401" || echo "  ❌ FAIL: Returns ${CODE}"

# Test 3: RLS isolation — try to read another org's data
# Create a second user with different org
SECOND_USER=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email": "attacker@evil.io", "password": "Attack123!", "options": {"data": {"organization_name": "Evil Corp"}}}')
SECOND_JWT=$(echo "${SECOND_USER}" | jq -r '.access_token')

echo "[Security 3] RLS isolation — second user tries to read first user's cluster..."
STOLEN=$(curl -s "${SUPABASE_URL}/rest/v1/clusters?id=eq.${CLUSTER_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SECOND_JWT}")
COUNT=$(echo "${STOLEN}" | jq length)
[ "${COUNT}" = "0" ] && echo "  ✅ PASS: RLS blocked cross-org read" || echo "  ❌ CRITICAL FAIL: RLS BYPASSED — ${COUNT} rows leaked"

# Test 4: GitHub webhook without signature
echo "[Security 4] Webhook without HMAC signature..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${SUPABASE_URL}/functions/v1/github-webhook" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"ref": "refs/heads/main", "repository": {"clone_url": "https://github.com/fake/repo"}}')
[ "${CODE}" = "401" ] && echo "  ✅ PASS: Returns 401" || echo "  ❌ FAIL: Returns ${CODE} (webhook accepts unsigned requests!)"

# Test 5: Rate limiting
echo "[Security 5] Rate limiting on die-analyze..."
for i in {1..4}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/functions/v1/die-analyze" \
    -H "Authorization: Bearer ${TEST_JWT}" \
    -H "Content-Type: application/json" \
    -d '{"project_id": "fake-id", "credential_id": "fake-id"}')
  echo "  Request ${i}: HTTP ${CODE}"
done
# Request 4 should be 429 (3 per hour limit)

# Test 6: SQL injection attempt in input
echo "[Security 6] SQL injection in input..."
INJECT_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${SUPABASE_URL}/functions/v1/aws-assume-role" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "1; DROP TABLE organizations;--", "region": "us-east-1", "role_arn": "arn:aws:iam::000000000000:role/test"}')
[ "${INJECT_CODE}" = "400" ] && echo "  ✅ PASS: Validation caught it (HTTP 400)" || echo "  ⚠️ Check: HTTP ${INJECT_CODE}"
```

## 7.2 — Redeploy and Rollback Test

```bash
if [ -z "${DEPLOY_FAILED}" ]; then
  echo "=== REDEPLOY TEST ==="

  # Get first deployment ID
  FIRST_DEPLOY=$(curl -s "${SUPABASE_URL}/rest/v1/deployments?project_id=eq.${TEST_PROJECT_ID}&order=started_at.asc&limit=1" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].id')

  echo "First deployment ID: ${FIRST_DEPLOY}"

  # Trigger redeploy
  echo "Triggering redeploy..."
  REDEPLOY=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/deploy-redeploy" \
    -H "Authorization: Bearer ${TEST_JWT}" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"${TEST_PROJECT_ID}\",
      \"commit_sha\": \"abc12345\",
      \"commit_msg\": \"E2E test redeploy\"
    }")

  echo "Redeploy response: $(echo ${REDEPLOY} | jq .)"

  SECOND_DEPLOY_ID=$(echo "${REDEPLOY}" | jq -r '.deployment_id')
  echo "Waiting 3 minutes for redeploy..."
  sleep 180

  SECOND_DEPLOY=$(curl -s "${SUPABASE_URL}/rest/v1/deployments?id=eq.${SECOND_DEPLOY_ID}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}")
  STATUS=$(echo "${SECOND_DEPLOY}" | jq -r '.[0].status')
  [ "${STATUS}" = "success" ] && echo "✅ Redeploy succeeded" || echo "❌ Redeploy failed (status: ${STATUS})"

  # Test rollback
  echo "Testing rollback..."
  ROLLBACK=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/deploy-rollback" \
    -H "Authorization: Bearer ${TEST_JWT}" \
    -H "Content-Type: application/json" \
    -d "{\"deployment_id\": \"${FIRST_DEPLOY}\"}")

  echo "Rollback response: $(echo ${ROLLBACK} | jq .)"
  sleep 180
  curl -s -w "\nHTTP:%{http_code}" "${TEST_LIVE_URL}/health" | tail -1 | grep -q "200" \
    && echo "✅ Rollback succeeded — app still live" || echo "❌ Rollback failed"
fi
```

---

# ══════════════════════════════════════════════════
# STEP 8 — GENERATE DIAGNOSTIC REPORT
# Every finding, every pass, every failure
# ══════════════════════════════════════════════════

After running ALL tests above, generate this report. Be exhaustive. Be brutal.
Do not summarize problems — describe them exactly with file names, line numbers, error messages.

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  AUTOSTACK — FINAL DIAGNOSTIC REPORT                                        ║
║  Generated: [timestamp]                                                      ║
║  Test Duration: [total time]                                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════
SECTION 1 — OVERALL VERDICT
═══════════════════════════════════════

CORE PRODUCT PROMISE:
  "User pastes GitHub URL, connects AWS, gets live URL in < 15 min"
  Status: [✅ DELIVERED / ❌ NOT DELIVERED]
  Actual time (if delivered): [X minutes Y seconds]
  Live URL (if delivered): [URL]
  Live URL responds: [✅ HTTP 200 / ❌ ERROR]

READINESS SCORE: [X/100]
  (0-59: Not ready. 60-79: Beta ready. 80-89: Soft launch ready. 90+: Production ready.)

═══════════════════════════════════════
SECTION 2 — WHAT PASSED (with proof)
═══════════════════════════════════════

For each passing item, include:
- What was tested
- Exact test command/input
- Exact response/output
- Why this confirms it works

[List every ✅ from Steps 1-7]

═══════════════════════════════════════
SECTION 3 — WHAT FAILED (with exact diagnosis)
═══════════════════════════════════════

For each failure:

FAILURE: [name]
  Severity:    P0 / P1 / P2
  What broke:  [exact description]
  Error:       [exact error message, status code, response body]
  Root cause:  [what is actually wrong — not just what failed]
  File:        [exact file path and line number if applicable]
  Fix:         [exact code change or configuration change needed]
  Time to fix: [estimate]
  Blocks:      [what else this prevents]

═══════════════════════════════════════
SECTION 4 — PERFORMANCE NUMBERS (real, from this test run)
═══════════════════════════════════════

Infrastructure provisioning:
  VPC creation:        [X seconds]
  EKS cluster:         [X minutes]
  Node group:          [X minutes]
  ECR + CodeBuild:     [X minutes]
  ArgoCD sync:         [X minutes]
  Total:               [X minutes Y seconds]

Application performance:
  Health endpoint p50: [Xms]
  Health endpoint p99: [Xms]
  Under 10 concurrent: [all 200 / X failures]

Database performance (from EXPLAIN ANALYZE):
  cluster_metrics query: [index scan / seq scan]
  findings query:        [index scan / seq scan]
  deployments query:     [index scan / seq scan]

Frontend:
  Build time:    [X.XX seconds]
  Bundle sizes:  [list all chunks]
  Any chunk > 500KB: [yes/no — list them]

═══════════════════════════════════════
SECTION 5 — SECURITY AUDIT RESULTS
═══════════════════════════════════════

For each security check from Step 7:
  [✅/❌] [test name]: [result]

Critical findings (if any): [describe exactly]
CVSS score estimate: [X.X]
Pen test required before: [public launch / enterprise sales / SOC2]

═══════════════════════════════════════
SECTION 6 — THE 8% GAP: WHAT'S ACTUALLY MISSING
═══════════════════════════════════════

Based on this test run (not the theoretical plans), what is genuinely incomplete?

Format each gap as:
  GAP [N]: [title]
  Category: [Core product / Security / Performance / Feature / Documentation]
  Severity: P0 / P1 / P2
  Evidence: [what this test showed was missing/broken]
  Effort: [X hours / X days]
  Blocks launch: [YES / NO]

List ALL gaps found. Including small ones.

═══════════════════════════════════════
SECTION 7 — LAUNCH READINESS ASSESSMENT
═══════════════════════════════════════

WHAT WORKS RIGHT NOW AND WOULD SURVIVE REAL USERS:
[List only things that were actually tested in this run and passed]

WHAT WOULD BREAK WITH 10 REAL USERS:
[Be specific. What edge cases did this test miss?]

WHAT WOULD BREAK WITH 100 REAL USERS:
[Scaling, rate limits, DB performance, concurrency issues]

EARLIEST REALISTIC LAUNCH DATE:
  With 1 developer fixing all P0s:    [X days from today]
  With 2 developers:                  [X days from today]
  Blocker not in code (pen test):     [X weeks — external dependency]

MVP SCOPE (what to keep for v1):
  Keep:  [list — be specific]
  Cut:   [list — be specific, explain why each can wait]

POST-MVP ROADMAP VERDICT:
  Phases 12-25 were planned. Are they the right order?
  [Your honest assessment. Reorder if needed based on what you saw.]

═══════════════════════════════════════
SECTION 8 — AWS RESOURCE AUDIT
═══════════════════════════════════════

Resources created during this test run:
  VPC ID:             [value or 'not created']
  EKS Cluster ARN:    [value or 'not created']
  Node Group:         [value or 'not created']
  ECR Repository:     [value or 'not created']
  ALB DNS:            [value or 'not created']
  NAT Gateway IDs:    [list or 'not created']

All resources tagged with autostack:project_id: [✅ YES / ❌ NO]
Teardown required: [✅ YES — Step 9 will destroy everything]

═══════════════════════════════════════
SECTION 9 — PRODUCT VIABILITY PREDICTION
═══════════════════════════════════════

Based on what you observed during this test run — not the plans, not theory —
give an honest assessment of this product's commercial viability.

CORE VALUE PROP WORKS: [✅/❌] 
  Evidence: [what you saw]

DIFFERENTIATION FROM TOYSTACK: [✅ real / ⚠️ marginal / ❌ not proven]
  Evidence: [what makes it actually different in practice]

BIGGEST TECHNICAL RISK: [1 sentence — what could kill this product]

BIGGEST MARKET RISK: [1 sentence — what non-technical thing could kill this]

HONEST PROBABILITY OF FIRST PAYING CUSTOMER IN 30 DAYS: [X%]
  What would need to be true for that to happen: [list]

RECOMMENDED NEXT 7 DAYS OF WORK (ordered by impact):
  Day 1: [most important thing]
  Day 2: [second most important]
  Day 3: [third]
  Day 4-5: [batch of smaller things]
  Day 6-7: [cleanup / polish / first demo]

THE ONE THING that if it works perfectly makes everything else secondary:
  [Your answer — be direct]
```

---

# ══════════════════════════════════════════════════
# STEP 9 — DESTROY EVERYTHING
# ══════════════════════════════════════════════════

## ⚠️ RUN THIS LAST. AFTER THE REPORT IS COMPLETE AND SAVED.

Do NOT skip this step. Every minute you delay costs real money.

```bash
echo "=== STARTING TEARDOWN — ALL AWS RESOURCES WILL BE DELETED ==="
TEARDOWN_START=$(date +%s)

# Step 1: Call infra-teardown Edge Function
TEARDOWN_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/infra-teardown" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"${TEST_PROJECT_ID}\"}")

echo "Teardown initiated: $(echo ${TEARDOWN_RESPONSE} | jq .)"

# Step 2: Poll until project.provisioning_status = 'deleted'
echo "Waiting for teardown to complete (5-15 minutes)..."
while true; do
  STATUS=$(curl -s "${SUPABASE_URL}/rest/v1/projects?id=eq.${TEST_PROJECT_ID}&select=provisioning_status" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].provisioning_status')
  ELAPSED=$(( $(date +%s) - TEARDOWN_START ))
  echo "[${ELAPSED}s] Status: ${STATUS}"
  [ "${STATUS}" = "deleted" ] && break
  [ $ELAPSED -gt 1200 ] && echo "⚠️ Teardown taking > 20 min — check AWS console" && break
  sleep 30
done

# Step 3: MANDATORY VERIFICATION — confirm zero orphaned resources
echo ""
echo "=== ORPHAN RESOURCE CHECK ==="

# Check by tag
echo "Resources with autostack:project_id tag (should be 0):"
aws resourcegroupstaggingapi get-resources \
  --tag-filters "Key=autostack:project_id,Values=${TEST_PROJECT_ID}" \
  --region "${AWS_REGION}" \
  --output json | jq '.ResourceTagMappingList | length'

# Check EKS specifically
echo "EKS clusters with our tag (should be 0):"
aws eks list-clusters --region "${AWS_REGION}" --output json | \
  jq -r '.clusters[]' | while read cluster; do
    TAGS=$(aws eks describe-cluster --name "${cluster}" --region "${AWS_REGION}" \
      --query 'cluster.tags' --output json 2>/dev/null)
    if echo "${TAGS}" | grep -q "${TEST_PROJECT_ID}"; then
      echo "  ⚠️ ORPHAN FOUND: EKS cluster ${cluster}"
    fi
  done
echo "  (no output = clean)"

# Check NAT Gateways (these are easy to miss and expensive)
echo "NAT Gateways with our tag (should be 0, each costs $35/mo):"
aws ec2 describe-nat-gateways \
  --filter "Name=tag:autostack:project_id,Values=${TEST_PROJECT_ID}" \
  --region "${AWS_REGION}" \
  --output json | jq -r '.NatGateways[] | "\(.NatGatewayId) [\(.State)]"'
echo "  (no output = clean)"

# Check VPCs
echo "VPCs with our tag (should be 0):"
aws ec2 describe-vpcs \
  --filters "Name=tag:autostack:project_id,Values=${TEST_PROJECT_ID}" \
  --region "${AWS_REGION}" \
  --output json | jq -r '.Vpcs[].VpcId'
echo "  (no output = clean)"

# Check ALBs
echo "Load balancers with our tag (should be 0):"
aws elbv2 describe-load-balancers --region "${AWS_REGION}" --output json | \
  jq -r '.LoadBalancers[].LoadBalancerArn' | while read arn; do
    TAGS=$(aws elbv2 describe-tags --resource-arns "${arn}" \
      --region "${AWS_REGION}" --output json 2>/dev/null)
    if echo "${TAGS}" | grep -q "${TEST_PROJECT_ID}"; then
      echo "  ⚠️ ORPHAN FOUND: ALB ${arn}"
    fi
  done
echo "  (no output = clean)"

# Delete test Supabase users
echo ""
echo "=== CLEANING UP TEST USERS ==="
# Delete test users via Supabase admin API
curl -s -X DELETE "${SUPABASE_URL}/auth/v1/admin/users/${TEST_USER_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | jq .

echo ""
TOTAL_TIME=$(( $(date +%s) - TEARDOWN_START ))
echo "╔══════════════════════════════════════════════╗"
echo "║  TEARDOWN COMPLETE                            ║"
echo "║  Time: ${TOTAL_TIME}s                         ║"
echo "║  All AWS costs stopped.                       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "FINAL CHECK: Open AWS Cost Explorer tomorrow."
echo "Expected cost for this run: under $2 USD."
echo "If you see charges > $5: contact AWS support."
echo "URL: https://console.aws.amazon.com/cost-management/home"
```

---

# ══════════════════════════════════════════════════
# EXECUTION NOTES FOR ANTIGRAVITY
# ══════════════════════════════════════════════════

1. Run Steps 0-1 first (verification, no cost).
2. Only proceed to Step 2+ after Step 0 pre-flight shows ALL CLEAR.
3. Steps 2-8 create real AWS resources (~$0.63/hr while running).
4. Step 9 MUST run. Not optional. Not "I'll do it later."
5. Save the diagnostic report from Step 8 to a file BEFORE Step 9.
6. The report is the product of this entire exercise. Make it honest.
7. If Step 4 (EKS provisioning) fails: document the exact error, attempt to fix it,
   retry ONCE, and if still failing document it as a P0 gap in the report.
8. Do not modify the codebase during this test run. Observe. Report. Fix after.
9. The "product viability prediction" in Section 9 of the report is NOT optional.
   That is the most important part of the entire document.

WHAT SUCCESS LOOKS LIKE:
  - A URL that returns HTTP 200
  - A report with real numbers (not estimates)
  - Zero orphaned AWS resources
  - A clear list of what to fix next

WHAT FAILURE LOOKS LIKE:
  - A report that says "everything is great" without real test data
  - Skipping Step 9 (teardown)
  - Vague descriptions of what broke
  - Claiming something "works" based on code review instead of actual execution
