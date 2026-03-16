# AutoStack Deployment Intelligence — Deployment Checklist

Use this checklist to ensure a smooth, error-free deployment.

---

## Pre-Deployment Checklist

### 1. Code Validation
- [ ] Run test suite: `./test-deployment-intelligence.sh`
- [ ] All 6 tests passed
- [ ] No TypeScript compilation errors
- [ ] No breaking changes detected
- [ ] Cost calculator logic validated
- [ ] Classifier logic validated

### 2. Environment Check
- [ ] Supabase CLI installed and logged in
- [ ] Project ref correct: `prrmrukwmrjkdxcyzovd`
- [ ] Current branch: `dev`
- [ ] No uncommitted changes that could cause conflicts

### 3. Backup Preparation
- [ ] Backup directory created: `backups/YYYYMMDD_HHMMSS/`
- [ ] Current `die-analyze` function backed up
- [ ] Rollback procedure documented and understood

---

## Deployment Checklist

### Step 1: Database Migration
- [ ] Open Supabase SQL Editor
- [ ] Copy migration: `supabase/migrations/20260316100000_ensure_analysis_fields.sql`
- [ ] Run migration
- [ ] Verify: No errors in output
- [ ] Verify: Columns added successfully
  ```sql
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'projects' 
  AND column_name IN ('analysis_status', 'stack', 'infra_plan_json');
  ```
- [ ] Result shows 3 rows

### Step 2: Environment Variables
- [ ] Open Supabase Dashboard → Settings → Edge Functions
- [ ] Add secret: `NVIDIA_API_KEY`
- [ ] Value: `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`
- [ ] Click "Add secret"
- [ ] Verify: Secret appears in list

### Step 3: Deploy optimize-cost Function
- [ ] Run: `supabase functions deploy optimize-cost --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt`
- [ ] Verify: "Deployed Functions on project prrmrukwmrjkdxcyzovd: optimize-cost"
- [ ] Verify: No errors in output
- [ ] Check Dashboard: Function appears in list

### Step 4: Deploy die-analyze Function
- [ ] Run: `supabase functions deploy die-analyze --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt`
- [ ] Verify: "Deployed Functions on project prrmrukwmrjkdxcyzovd: die-analyze"
- [ ] Verify: No errors in output
- [ ] Check Dashboard: Function updated timestamp changed

### Step 5: Smoke Tests
- [ ] Test optimize-cost responds (auth required is OK)
- [ ] Test die-analyze responds (auth required is OK)
- [ ] Check function logs: No errors
- [ ] Check function logs: Recent invocations visible

---

## Post-Deployment Verification

### Immediate Checks (0-5 minutes)
- [ ] Open Supabase Dashboard → Logs → Edge Functions
- [ ] Verify: No error messages
- [ ] Verify: Functions showing as "deployed"
- [ ] Verify: Green status indicators

### Functional Tests (5-15 minutes)
- [ ] Open AutoStack frontend
- [ ] Navigate to onboarding flow
- [ ] Connect cloud (Step 1) — Should work as before
- [ ] Enter GitHub repo URL (Step 2)
- [ ] Click "Analyze & Deploy"
- [ ] Verify: Analysis starts immediately
- [ ] Verify: Progress indicators show
- [ ] Verify: Analysis completes in 10-15 seconds (not 1m12s)
- [ ] Verify: Shows detected framework (e.g., "Express detected")
- [ ] Verify: Shows 3 cost options (not hardcoded $187)
- [ ] Verify: Each option has itemized breakdown
- [ ] Verify: Can select an option
- [ ] Verify: Deploy button shows selected option and price

### Integration Tests (15-30 minutes)
- [ ] Test with Node.js Express repo
  - [ ] Detects: Node.js/Express
  - [ ] Recommends: App Runner
  - [ ] Cost: $5-20/month range
  
- [ ] Test with Next.js repo
  - [ ] Detects: Node.js/Next.js
  - [ ] Recommends: ECS Fargate or App Runner
  - [ ] Cost: $20-80/month range
  
- [ ] Test with Python Flask repo
  - [ ] Detects: Python/Flask
  - [ ] Recommends: App Runner
  - [ ] Cost: $5-20/month range
  
- [ ] Test with repo containing k8s/ folder
  - [ ] Detects: Kubernetes configs
  - [ ] Recommends: EKS Fargate
  - [ ] Cost: $200+/month range

### Regression Tests (30-60 minutes)
- [ ] Test existing aws-assume-role function
  - [ ] Still responds correctly
  - [ ] No errors in logs
  
- [ ] Test existing auth-hook function
  - [ ] Still triggers on user signup
  - [ ] No errors in logs
  
- [ ] Test existing projects table queries
  - [ ] Can read projects
  - [ ] Can update projects
  - [ ] RLS policies still work

---

## Monitoring Checklist (First 24 Hours)

### Hour 1
- [ ] Check function logs every 15 minutes
- [ ] Verify: No error spikes
- [ ] Verify: Response times < 15 seconds

### Hour 6
- [ ] Check function logs
- [ ] Check database performance
- [ ] Verify: No memory issues
- [ ] Verify: No timeout errors

### Hour 24
- [ ] Review all function invocations
- [ ] Check error rate: Should be < 1%
- [ ] Check average response time: Should be 10-15s
- [ ] Verify: Cost estimates are realistic
- [ ] Verify: No user complaints

---

## Rollback Checklist (If Needed)

### Immediate Rollback (< 5 minutes)
- [ ] Stop accepting new deployments (pause frontend)
- [ ] Restore die-analyze from backup:
  ```bash
  cp backups/YYYYMMDD_HHMMSS/die-analyze.ts.backup supabase/functions/die-analyze/index.ts
  supabase functions deploy die-analyze --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt
  ```
- [ ] Verify: Old function deployed
- [ ] Verify: System working again
- [ ] Resume accepting deployments

### Full Rollback (If Needed)
- [ ] Disable optimize-cost function (via Dashboard)
- [ ] Revert database migration (run DROP COLUMN SQL)
- [ ] Remove NVIDIA_API_KEY secret
- [ ] Verify: System back to original state
- [ ] Document what went wrong
- [ ] Fix issues before redeploying

---

## Success Criteria

Mark deployment as successful when:

- [ ] All deployment steps completed without errors
- [ ] All post-deployment verification checks passed
- [ ] All functional tests passed
- [ ] All integration tests passed
- [ ] All regression tests passed
- [ ] No errors in function logs after 1 hour
- [ ] Response times consistently < 15 seconds
- [ ] Cost estimates are realistic (not $187 for simple apps)
- [ ] User feedback is positive (if any)
- [ ] No rollback needed

---

## Sign-Off

**Deployed by**: _________________  
**Date**: _________________  
**Time**: _________________  
**Status**: ☐ Success ☐ Partial ☐ Rollback Required  
**Notes**: _________________

---

## Next Actions After Successful Deployment

1. **Monitor for 24 hours** before marking as stable
2. **Update documentation** with any learnings
3. **Integrate frontend components** (DeploymentFlow)
4. **Continue with Steps 6-8** (build logs, error analysis, observability)
5. **Merge to staging branch** after 24-hour monitoring period
6. **Plan production release** after staging validation

---

**Last Updated**: 2026-03-16  
**Version**: 1.0  
**Status**: Ready for use
