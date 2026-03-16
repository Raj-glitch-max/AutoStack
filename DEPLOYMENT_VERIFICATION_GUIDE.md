# AutoStack Deployment Intelligence — Verification Guide

## Overview

This guide helps you verify that the new deployment intelligence system is working correctly and won't cause errors like the previous cloud connection issues.

---

## What Changed

### Backend Changes:
1. **New Shared Modules** (no breaking changes):
   - `supabase/functions/_shared/cost-calculator.ts` — Real AWS cost calculations
   - `supabase/functions/_shared/app-classifier.ts` — Intelligent app detection

2. **New Function**:
   - `supabase/functions/optimize-cost/index.ts` — Generates 3 infrastructure options

3. **Updated Function**:
   - `supabase/functions/die-analyze/index.ts` — Now uses classifier and optimizer
   - **Backward compatible**: Still accepts same input, returns enhanced output

4. **Database Migration**:
   - `supabase/migrations/20260316100000_ensure_analysis_fields.sql`
   - **Safe**: Only adds columns if they don't exist (no data loss)

### Frontend Changes:
1. **New Components** (not yet integrated):
   - `frontend/src/components/deploy/CostEstimateCard.jsx`
   - `frontend/src/components/deploy/DeploymentFlow.jsx`
   - **No breaking changes**: Existing OnboardingPage still works

---

## Safety Measures Implemented

### 1. Backward Compatibility
- `die-analyze` function still accepts the same input format
- Old response fields are still present
- New fields are added, not replaced

### 2. Graceful Degradation
- If `optimize-cost` call fails, `die-analyze` continues without infrastructure options
- If NVIDIA API is unavailable, system works without LLM insights
- If classification fails, falls back to safe defaults

### 3. Database Safety
- Migration uses `ADD COLUMN IF NOT EXISTS` (idempotent)
- No data deletion or modification
- Indexes added for performance, not required for functionality

### 4. Error Handling
- All new functions have try-catch blocks
- Errors are logged but don't crash the system
- User-friendly error messages

---

## Pre-Deployment Checklist

Run the test script:
```bash
./test-deployment-intelligence.sh
```

Expected output:
```
✓ Supabase CLI found
✓ Logged in to Supabase
✓ Migration file ready
✓ All TypeScript files validated
✓ All frontend components validated
✓ No breaking changes detected
✓ Cost calculator logic validated
✓ Classifier logic validated
ALL TESTS PASSED ✓
```

---

## Deployment Steps

### Option 1: Automated (Recommended)
```bash
./deploy-intelligence-system.sh
```

This script will:
1. Run all pre-flight checks
2. Create backups of current functions
3. Guide you through manual steps (migration, env vars)
4. Deploy functions safely
5. Run smoke tests
6. Provide rollback instructions if needed

### Option 2: Manual

#### Step 1: Apply Database Migration
1. Open: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/sql/new
2. Copy contents of `supabase/migrations/20260316100000_ensure_analysis_fields.sql`
3. Click "Run"
4. Verify: No errors in output

#### Step 2: Set Environment Variable
1. Open: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/settings/functions
2. Add secret:
   - Name: `NVIDIA_API_KEY`
   - Value: `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`
3. Click "Add secret"

#### Step 3: Deploy Functions
```bash
# Deploy new function first
supabase functions deploy optimize-cost --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt

# Deploy updated function
supabase functions deploy die-analyze --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt
```

---

## Post-Deployment Verification

### 1. Check Function Logs
Open: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/logs/edge-functions

Look for:
- ✅ No error messages
- ✅ Functions showing as "deployed"
- ✅ Recent invocations (if any)

### 2. Test optimize-cost Function
```bash
curl -X POST "https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/optimize-cost" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "classification": {
      "language": "Node.js",
      "framework": "Express",
      "appType": "api",
      "tier": "micro",
      "estimatedCPU": 512,
      "estimatedMemory": 1024,
      "hasDatabase": false,
      "hasQueue": false,
      "hasWebsockets": false,
      "isStateful": false
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "options": [
    {
      "id": "cheapest",
      "label": "Cost-optimized",
      "service": "app_runner",
      "cost": {
        "displayPrice": "$4 - $23/month",
        ...
      }
    },
    ...
  ]
}
```

### 3. Test die-analyze Function
This requires a valid project_id and installation_id. Test via frontend instead.

### 4. Frontend Integration Test
1. Open AutoStack frontend
2. Go to onboarding flow
3. Connect cloud (Step 1)
4. Enter a GitHub repository URL (Step 2)
5. Click "Analyze & Deploy"
6. Verify:
   - ✅ Analysis completes in ~10-15 seconds (not 1m12s)
   - ✅ Shows detected framework (e.g., "Express detected")
   - ✅ Shows 3 cost options (not hardcoded $187)
   - ✅ Each option has itemized breakdown
   - ✅ Can select an option
   - ✅ Deploy button shows selected option and price

---

## Common Issues and Solutions

### Issue 1: "Missing Authorization header"
**Cause**: Function requires authentication
**Solution**: This is expected. Use a valid Supabase auth token in the Authorization header.

### Issue 2: "NVIDIA_API_KEY not set"
**Cause**: Environment variable not configured
**Solution**: 
1. Go to Supabase Dashboard → Project Settings → Edge Functions
2. Add NVIDIA_API_KEY secret
3. Redeploy functions

### Issue 3: "Failed to generate infrastructure options"
**Cause**: optimize-cost function not deployed or erroring
**Solution**:
1. Check function logs
2. Verify optimize-cost is deployed
3. System will continue without options (graceful degradation)

### Issue 4: "Analysis taking too long"
**Cause**: GitHub API rate limiting or network issues
**Solution**:
1. Check GitHub App installation
2. Verify installation_id is correct
3. Check Supabase function logs for GitHub API errors

### Issue 5: "Still showing $187 cost"
**Cause**: Frontend not updated or using cached data
**Solution**:
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache
3. Verify die-analyze is returning new response format

---

## Rollback Procedure

If something goes wrong:

### 1. Restore die-analyze Function
```bash
# Find your backup
ls -la backups/

# Restore from backup
cp backups/YYYYMMDD_HHMMSS/die-analyze.ts.backup supabase/functions/die-analyze/index.ts

# Redeploy
supabase functions deploy die-analyze --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt
```

### 2. Remove optimize-cost Function
```bash
# Delete via Supabase Dashboard
# Or deploy an empty version
echo 'Deno.serve(() => new Response("Disabled", { status: 503 }))' > supabase/functions/optimize-cost/index.ts
supabase functions deploy optimize-cost --project-ref prrmrukwmrjkdxcyzovd --no-verify-jwt
```

### 3. Revert Database Migration
```sql
-- Run in Supabase SQL Editor
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS analysis_status,
  DROP COLUMN IF EXISTS stack,
  DROP COLUMN IF EXISTS infra_plan_json;

DROP INDEX IF EXISTS idx_projects_analysis_status;
DROP INDEX IF EXISTS idx_projects_stack;
```

---

## Monitoring

### Key Metrics to Watch:
1. **Function execution time**:
   - die-analyze: Should be 10-15 seconds (was 1m12s)
   - optimize-cost: Should be < 5 seconds

2. **Error rate**:
   - Should be < 1% for die-analyze
   - Should be < 5% for optimize-cost (LLM can fail gracefully)

3. **Cost estimates**:
   - Simple Express app: $5-20/month (not $187)
   - Static site: $0.10-5/month
   - EKS: Only when K8s configs exist

### Where to Monitor:
- Supabase Dashboard → Logs → Edge Functions
- Supabase Dashboard → Database → Query Performance
- Frontend browser console (for client-side errors)

---

## Success Criteria

✅ All tests pass  
✅ Functions deploy without errors  
✅ No breaking changes to existing functionality  
✅ Analysis completes in < 15 seconds  
✅ Cost estimates are realistic (not hardcoded)  
✅ 3 infrastructure options shown  
✅ Frontend displays new cost cards  
✅ No errors in function logs  
✅ Existing aws-assume-role function still works  

---

## Support

If you encounter issues:

1. **Check function logs**: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/logs/edge-functions
2. **Check database logs**: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/logs/postgres-logs
3. **Review test output**: `./test-deployment-intelligence.sh`
4. **Check browser console**: F12 → Console tab
5. **Rollback if needed**: Follow rollback procedure above

---

## Next Steps After Verification

Once everything is verified working:

1. **Integrate frontend components**:
   - Update `OnboardingPage.jsx` to use `DeploymentFlow`
   - Replace hardcoded size selection with cost options

2. **Continue with Steps 6-8**:
   - Build log streaming
   - Error analysis
   - Observability setup

3. **Merge to staging branch**:
   ```bash
   git add .
   git commit -m "feat: intelligent deployment system with real cost calculation"
   git push origin dev
   # Test in dev, then merge to staging
   ```

---

**Last Updated**: 2026-03-16  
**Version**: 1.0  
**Status**: Ready for deployment
