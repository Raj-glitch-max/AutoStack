# AutoStack One-Click Deployment - Reality Check
**Date:** March 16, 2026  
**Status:** Pre-Implementation Verification Complete

## Executive Summary

The requirements document (`AutoStack_OneClick_Deploy_Complete.md`) is **architecturally sound and well-designed**. However, before proceeding to implementation, this document confirms what actually exists vs. what needs to be built.

**Bottom Line:** The intelligence system (Steps 1-5) works. The actual build+deploy pipeline (Steps 6-10) needs to be built and tested on real AWS.

---

## ✅ What Actually Works (Verified)

### 1. AWS Credentials & Secrets
- ✅ `AWS_ACCESS_KEY_ID` exists in Supabase secrets
- ✅ `AWS_SECRET_ACCESS_KEY` exists in Supabase secrets  
- ✅ `AWS_REGION` exists in Supabase secrets
- ✅ `GITHUB_PAT` exists for GitHub API access
- ✅ `NVIDIA_API_KEY` exists for AI cost optimization
- ✅ `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` exist

**Note:** The spec calls for `AUTOSTACK_AWS_ACCESS_KEY_ID` but we have `AWS_ACCESS_KEY_ID`. This is fine - just need to update the code to use the correct env var names.

### 2. Intelligence System (Steps 1-5 from previous work)
- ✅ `die-analyze` function - analyzes repos, detects language/framework
- ✅ `app-classifier.ts` - intelligent app detection (Node.js, Python, Go, Java)
- ✅ `cost-calculator.ts` - real AWS pricing calculations (no hardcoded values)
- ✅ `optimize-cost` function - generates 3 infrastructure options with AI insights
- ✅ Parallel file fetching - reduced analysis time from 1m12s to ~12s
- ✅ Frontend components created: `CostEstimateCard.jsx`, `DeploymentFlow.jsx`

### 3. AWS Connectivity
- ✅ `aws-assume-role` function works - can assume user's IAM role
- ✅ Trust policy configured correctly
- ✅ IAM role `AutoStackDeploymentRole` exists in AWS account 367749063363

### 4. Database Foundation
- ✅ `deployments` table exists
- ✅ `projects` table exists
- ✅ `cloud_credentials` table exists
- ✅ Basic RLS policies in place

---

## ⚠️ What Needs to Be Built (Per Spec)

### 1. Database Migration: `006_deployment_pipeline.sql`
**Status:** Not applied  
**Required columns missing from `deployments` table:**
- `current_stage` - tracks deployment state machine
- `stage_started_at` - for real-time elapsed time display
- `build_logs` - JSONB for quick log access
- `error_analysis` - JSONB for AI-powered error insights
- `live_url` - the actual deployed URL
- `ecr_repository_uri` - Docker image registry
- `image_tag` - specific image version deployed
- `infra_type` - app_runner | ecs_fargate | eks_fargate
- `app_runner_service_arn` - AWS resource tracking
- `ecs_cluster_arn`, `ecs_service_arn`, `alb_arn`, `alb_dns_name`
- `vpc_id`, `subnet_ids`, `security_group_id`
- `codebuild_project_name`, `codebuild_build_id`
- `health_check_path`, `retry_count`, `rollback_available`

**Required new table:**
- `build_log_entries` - separate table for streaming logs (not JSONB)
- `infra_resources` - tracks every AWS resource for teardown

**Action:** Create and apply migration file

### 2. Shared Utilities (Critical Dependencies)

#### `supabase/functions/_shared/aws-client.ts`
**Status:** Does not exist  
**Why critical:** Every AWS operation depends on this. Contains:
- `getOrgAWSCredentials()` - assumes user's IAM role, caches in Redis
- `trackResource()` - records every AWS resource for teardown
- `setStage()` - updates deployment stage, broadcasts via Realtime
- `appendLog()` - writes build log entries for streaming

**Without this:** Nothing can talk to AWS. All functions fail at STS call.

#### `supabase/functions/_shared/dockerfile-generator.ts`
**Status:** Does not exist  
**Why needed:** Generates production-grade Dockerfiles based on app classification
- Multi-stage builds for minimal image size
- Security: non-root users, distroless for Go
- Health checks built-in
- Supports Node.js, Python, Go, Java, static sites

**Without this:** Can't build Docker images. Build pipeline fails.

### 3. Build Pipeline Functions

#### `supabase/functions/setup-build-pipeline/`
**Status:** Does not exist  
**What it does:**
1. Creates ECR repository in user's AWS account
2. Creates CodeBuild project with AI-generated Dockerfile
3. Creates IAM role for CodeBuild (if not exists)
4. Tags all resources for tracking

**Expected output:** ECR repo URI, CodeBuild project name

#### `supabase/functions/run-build/`
**Status:** Does not exist  
**What it does:**
1. Starts CodeBuild job
2. Streams CloudWatch logs to `build_log_entries` table in real-time
3. Polls build status every 5 seconds
4. On success: triggers `provision-infrastructure`
5. On failure: runs AI error analysis

**Expected output:** Build ID, logs streaming via Realtime

#### `supabase/functions/provision-infrastructure/`
**Status:** Exists but is a stub (dispatches to GitHub Actions)  
**What it needs to do:**
- **App Runner path:** Create App Runner service, wait for RUNNING, return live URL
- **ECS Fargate path:** Create VPC, subnets, IGW, ALB, security groups, ECS cluster, task definition, service
- **EKS path:** Only if repo has k8s/ configs (use existing GitHub Actions workflow)

**Current implementation:** Just dispatches to GitHub Actions for EKS only

### 4. Health Checker & Validator
**Status:** Does not exist  
**What it does:**
- Polls live URL every 10 seconds for up to 2 minutes
- Checks `/health` endpoint returns HTTP 200
- Checks root path is accessible
- On success: marks deployment as `active`, sends notification
- On failure: runs AI error analysis, suggests fixes

### 5. Frontend Real-Time UI
**Status:** Components created but not integrated  
**What exists:**
- `DeploymentFlow.jsx` - multi-phase deployment UX
- `CostEstimateCard.jsx` - cost comparison UI

**What's missing:**
- `DeploymentProgressView.jsx` - real-time stage tracker with Realtime subscription
- Integration into `OnboardingPage.jsx` to replace fake progress
- Build log terminal component with auto-scroll
- Error card with auto-fix button

---

## 🔴 Critical Blocker: No E2E Test on Real AWS

**The Problem:**  
The spec describes what should happen. The code doesn't exist yet. Even when written, it needs to be tested on real AWS to confirm:
1. CodeBuild actually starts and builds the image
2. ECR push succeeds
3. App Runner service actually becomes RUNNING
4. The live URL returns HTTP 200
5. Logs stream in real-time to the frontend

**What's Required Before Design Phase:**
1. Create the 5 missing components above
2. Deploy them to Supabase
3. Run E2E test with a real GitHub repo (use `test-repo/` in this project)
4. Provide 3 pieces of evidence:
   - Screenshot of live URL returning HTTP 200 in browser
   - Screenshot of `deployments` table showing `current_stage='active'` and `live_url` not null
   - Screenshot of `build_log_entries` table showing real CodeBuild logs

**Without this:** Design phase is premature. We'd be designing UI for a pipeline that might not work.

---

## 📋 Implementation Checklist (In Order)

### Phase A: Foundation (30 minutes)
- [ ] Create migration `supabase/migrations/006_deployment_pipeline.sql`
- [ ] Apply migration: `supabase db push`
- [ ] Verify columns exist in `deployments` table
- [ ] Verify `build_log_entries` table exists

### Phase B: Shared Utilities (45 minutes)
- [ ] Create `supabase/functions/_shared/aws-client.ts`
  - Implement `getOrgAWSCredentials()` with Redis caching
  - Implement `trackResource()` for AWS resource tracking
  - Implement `setStage()` for Realtime updates
  - Implement `appendLog()` for log streaming
- [ ] Create `supabase/functions/_shared/dockerfile-generator.ts`
  - Implement `generateDockerfile()` for all languages
  - Add multi-stage builds
  - Add security best practices
- [ ] Test imports in a dummy function

### Phase C: Build Pipeline (2 hours)
- [ ] Create `supabase/functions/setup-build-pipeline/index.ts`
  - ECR repository creation
  - CodeBuild project creation
  - IAM role creation/reuse
  - Resource tagging
- [ ] Deploy: `supabase functions deploy setup-build-pipeline`
- [ ] Test with real org_id and AWS credentials
- [ ] Verify ECR repo appears in AWS console

- [ ] Create `supabase/functions/run-build/index.ts`
  - Start CodeBuild job
  - Stream CloudWatch logs to DB
  - Poll build status
  - Trigger next step on success
- [ ] Deploy: `supabase functions deploy run-build`
- [ ] Test: verify logs appear in `build_log_entries` table

### Phase D: Infrastructure Provisioning (2 hours)
- [ ] Refactor `supabase/functions/provision-infrastructure/index.ts`
  - Implement App Runner path (simple apps)
  - Implement ECS Fargate path (production apps)
  - Keep EKS path as GitHub Actions dispatch
- [ ] Deploy: `supabase functions deploy provision-infrastructure`
- [ ] Test App Runner path with simple Node.js app
- [ ] Verify service becomes RUNNING in AWS console

### Phase E: Health Checks (30 minutes)
- [ ] Create `supabase/functions/_shared/health-checker.ts`
  - Implement `runHealthChecks()` with retry logic
  - Implement smoke tests
  - Implement AI error analysis on failure
- [ ] Test with a deployed App Runner service

### Phase F: E2E Test (1 hour)
- [ ] Create test script that:
  1. Calls `die-analyze` on test-repo
  2. Calls `optimize-cost` to get infrastructure options
  3. Calls `setup-build-pipeline`
  4. Calls `run-build`
  5. Waits for `provision-infrastructure` to complete
  6. Polls `deployments` table until `current_stage='active'`
  7. Curls the `live_url` and verifies HTTP 200
- [ ] Run test, capture screenshots
- [ ] Document any failures and fixes

### Phase G: Frontend Integration (1 hour)
- [ ] Create `DeploymentProgressView.jsx` with Realtime subscription
- [ ] Integrate into `OnboardingPage.jsx`
- [ ] Replace fake progress with real stage tracking
- [ ] Add build log terminal
- [ ] Add error card with auto-fix
- [ ] Test in browser with real deployment

---

## 🎯 Success Criteria

**Before moving to design phase, must have:**

1. ✅ All 5 functions deployed and working
2. ✅ E2E test passes with real GitHub repo
3. ✅ Screenshot: Live URL returns HTTP 200
4. ✅ Screenshot: Database shows `current_stage='active'`
5. ✅ Screenshot: Build logs streaming in real-time
6. ✅ Total time from "Deploy" click to live URL: < 10 minutes for simple app

**Then and only then:** Design phase makes sense because there's something real to design around.

---

## 📊 Estimated Time to Production-Ready

- **Foundation + Utilities:** 1.5 hours
- **Build Pipeline:** 2 hours
- **Infrastructure Provisioning:** 2 hours  
- **Health Checks:** 0.5 hours
- **E2E Testing + Fixes:** 1 hour
- **Frontend Integration:** 1 hour

**Total:** ~8 hours of focused work

**Deadline:** Tomorrow (achievable if started now)

---

## 🚨 Key Risks

1. **CodeBuild GitHub Auth:** The buildspec needs `CODEBUILD_GITHUB_TOKEN` env var. If missing, builds fail.
2. **App Runner IAM Role:** `getOrCreateAppRunnerRole()` is referenced but not implemented. App Runner can't pull from ECR without it.
3. **ECS Public IP without NAT:** Current spec uses `assignPublicIp: ENABLED` but no NAT Gateway. Outbound calls will fail. For first test, use App Runner only.
4. **EdgeRuntime.waitUntil:** Only works if functions deployed with correct flags. Verify deployment settings.

---

## 📝 Notes

- The architecture in the spec is **correct**
- The state machine design is **sound**
- The data models make **sense**
- The code just needs to be **written and tested**

This is not a design problem. This is an implementation + verification problem.

Once the E2E test passes on real AWS, the design phase can proceed with confidence because we'll be designing UI for a pipeline that actually works.
