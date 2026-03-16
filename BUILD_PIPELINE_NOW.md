# Build the Pipeline - Implementation Order
**Target:** Working E2E deployment in 8 hours  
**Test Repo:** `test-repo/` (Node.js Express app with /health endpoint)

## The Plan

Build in order. Test each piece before moving to next. No skipping.

---

## Step 1: Database Migration (15 min)

Create `supabase/migrations/20260316120000_deployment_pipeline.sql`:

```sql
-- Add deployment pipeline columns
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_url TEXT,
  ADD COLUMN IF NOT EXISTS ecr_repository_uri TEXT,
  ADD COLUMN IF NOT EXISTS image_tag TEXT,
  ADD COLUMN IF NOT EXISTS infra_type TEXT,
  ADD COLUMN IF NOT EXISTS app_runner_service_arn TEXT,
  ADD COLUMN IF NOT EXISTS codebuild_project_name TEXT,
  ADD COLUMN IF NOT EXISTS codebuild_build_id TEXT,
  ADD COLUMN IF NOT EXISTS health_check_path TEXT DEFAULT '/health',
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_analysis JSONB;

-- Build log entries (for real-time streaming)
CREATE TABLE IF NOT EXISTS build_log_entries (
  id BIGSERIAL PRIMARY KEY,
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  level TEXT NOT NULL DEFAULT 'info',
  text TEXT NOT NULL,
  source TEXT DEFAULT 'codebuild'
);

CREATE INDEX IF NOT EXISTS idx_build_logs_deployment 
  ON build_log_entries(deployment_id, timestamp);

-- Enable realtime for log streaming
ALTER PUBLICATION supabase_realtime ADD TABLE build_log_entries;

-- Infrastructure resources tracking (for teardown)
CREATE TABLE IF NOT EXISTS infra_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_arn TEXT,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_infra_resources_deployment 
  ON infra_resources(deployment_id);
```

**Test:**
```bash
supabase db push
supabase db dump --schema public | grep "current_stage"
```

---

## Step 2: AWS Client Utility (30 min)

Create `supabase/functions/_shared/aws-client.ts`:

Key functions:
- `getOrgAWSCredentials()` - assumes role, caches in Redis
- `trackResource()` - records AWS resources
- `setStage()` - updates deployment stage
- `appendLog()` - writes log entries

**Critical:** Use `AWS_ACCESS_KEY_ID` not `AUTOSTACK_AWS_ACCESS_KEY_ID` (that's what exists in secrets)

**Test:** Import in a test function, call `getOrgAWSCredentials()`, verify it returns credentials

---

## Step 3: Dockerfile Generator (30 min)

Create `supabase/functions/_shared/dockerfile-generator.ts`:

Must support:
- Node.js (multi-stage, non-root user)
- Python (slim image, gunicorn)
- Go (distroless, static binary)
- Static sites (nginx)

**Test:** Call `generateDockerfile()` with different classifications, verify output looks correct

---

## Step 4: Setup Build Pipeline Function (45 min)

Create `supabase/functions/setup-build-pipeline/index.ts`:

Does:
1. Create ECR repository (or reuse if exists)
2. Create CodeBuild project with embedded buildspec
3. Create/reuse CodeBuild IAM role
4. Tag everything

**Test:**
```bash
supabase functions deploy setup-build-pipeline

curl -X POST https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/setup-build-pipeline \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_id": "test-uuid",
    "org_id": "test-org-uuid",
    "classification": {...},
    "dockerfile_content": "FROM node:20...",
    "github_repo_url": "https://github.com/Raj-glitch-max/AutoStack",
    "branch": "main"
  }'
```

**Verify:** Check AWS console → ECR → repository exists

---

## Step 5: Run Build Function (1 hour)

Create `supabase/functions/run-build/index.ts`:

Does:
1. Start CodeBuild job
2. Stream CloudWatch logs to `build_log_entries` every 5 seconds
3. Poll build status
4. On success: trigger `provision-infrastructure`
5. On failure: analyze error

**Test:**
```bash
supabase functions deploy run-build

# Trigger build
curl -X POST .../run-build -d '{"deployment_id": "...", "branch": "main"}'

# Watch logs appear in DB
supabase db dump --data-only --table build_log_entries
```

**Verify:** CodeBuild job starts in AWS console, logs appear in DB

---

## Step 6: Provision Infrastructure - App Runner Only (1 hour)

Refactor `supabase/functions/provision-infrastructure/index.ts`:

For now: **App Runner path only** (simplest, fastest)

Does:
1. Create App Runner service from ECR image
2. Poll until status = RUNNING
3. Extract live URL
4. Run health checks
5. Mark deployment as active

**Test:**
```bash
supabase functions deploy provision-infrastructure

# Trigger after build completes
curl -X POST .../provision-infrastructure -d '{
  "deployment_id": "...",
  "image_tag": "abc123"
}'
```

**Verify:** 
- App Runner service appears in AWS console
- Service status becomes RUNNING
- `deployments.live_url` is set
- curl live_url/health returns 200

---

## Step 7: Health Checker (20 min)

Add to `provision-infrastructure` or create separate utility:

```typescript
async function runHealthChecks(baseUrl: string, deploymentId: string) {
  for (let i = 0; i < 12; i++) {
    await sleep(10000)
    try {
      const res = await fetch(`${baseUrl}/health`, { timeout: 5000 })
      if (res.ok) {
        await setStage(supabase, deploymentId, 'active', { live_url: baseUrl })
        return true
      }
    } catch {}
  }
  await setStage(supabase, deploymentId, 'failed')
  return false
}
```

---

## Step 8: E2E Test Script (30 min)

Create `test-e2e-deployment.sh`:

```bash
#!/bin/bash
# Full pipeline test

DEPLOYMENT_ID=$(uuidgen)
ORG_ID="your-org-uuid"
REPO_URL="https://github.com/Raj-glitch-max/AutoStack"

echo "1. Analyzing repo..."
ANALYSIS=$(curl -X POST .../die-analyze -d '{"repo_url": "'$REPO_URL'"}')

echo "2. Getting cost options..."
COST=$(curl -X POST .../optimize-cost -d '{"classification": ...}')

echo "3. Setting up build pipeline..."
PIPELINE=$(curl -X POST .../setup-build-pipeline -d '{...}')

echo "4. Starting build..."
BUILD=$(curl -X POST .../run-build -d '{"deployment_id": "'$DEPLOYMENT_ID'"}')

echo "5. Waiting for build to complete..."
while true; do
  STATUS=$(curl .../deployments?id=eq.$DEPLOYMENT_ID | jq -r '.[0].current_stage')
  echo "   Stage: $STATUS"
  if [ "$STATUS" = "active" ]; then
    LIVE_URL=$(curl .../deployments?id=eq.$DEPLOYMENT_ID | jq -r '.[0].live_url')
    echo "✓ Deployment complete: $LIVE_URL"
    curl $LIVE_URL/health
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo "✗ Deployment failed"
    exit 1
  fi
  sleep 10
done
```

**Run:** `./test-e2e-deployment.sh`

**Expected:**
- Total time: 5-8 minutes
- Final output: Live URL that returns HTTP 200

---

## Step 9: Evidence Collection

Take 3 screenshots:

1. **Browser:** Live URL showing the app running
2. **Supabase Dashboard:** `deployments` table showing `current_stage='active'` and `live_url` populated
3. **Supabase Dashboard:** `build_log_entries` table showing real CodeBuild logs

Save as:
- `evidence-live-url.png`
- `evidence-database.png`
- `evidence-logs.png`

---

## Step 10: Frontend Integration (1 hour)

Only after E2E test passes.

Create `frontend/src/components/deploy/DeploymentProgressView.jsx`:
- Subscribe to `deployments` table via Realtime
- Subscribe to `build_log_entries` via Realtime
- Show stage progress
- Show streaming logs
- Show success/error states

Integrate into `OnboardingPage.jsx`:
- Replace fake progress with `DeploymentProgressView`
- Remove setTimeout simulations
- Use real deployment_id from API

**Test:** Click deploy in UI, watch real progress

---

## Success Criteria

✅ E2E test completes in < 10 minutes  
✅ Live URL returns HTTP 200  
✅ Database shows correct state  
✅ Logs stream in real-time  
✅ Frontend shows real progress  

**Then:** Design phase can proceed with confidence.

---

## If Something Fails

**CodeBuild can't clone repo:**
- Check `GITHUB_PAT` secret exists
- Verify token has `repo` scope
- Check CodeBuild project source auth config

**App Runner fails to start:**
- Check IAM role has ECR pull permissions
- Verify image was actually pushed to ECR
- Check App Runner service logs in AWS console

**Health check fails:**
- Verify app listens on `process.env.PORT`
- Verify `/health` endpoint exists
- Check App Runner service logs for errors

**Logs don't stream:**
- Verify `build_log_entries` table has RLS policies allowing reads
- Check Realtime is enabled for the table
- Verify frontend Supabase client has correct anon key

---

## Time Estimate

- Step 1: 15 min
- Step 2: 30 min
- Step 3: 30 min
- Step 4: 45 min
- Step 5: 1 hour
- Step 6: 1 hour
- Step 7: 20 min
- Step 8: 30 min
- Step 9: 10 min
- Step 10: 1 hour

**Total: ~6 hours** (with buffer = 8 hours)

**Start now. Build in order. Test each step. No shortcuts.**
