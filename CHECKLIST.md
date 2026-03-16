# Deployment Pipeline Verification Checklist

## Pre-Test Setup

- [ ] Open Supabase Dashboard: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/sql
- [ ] Navigate to SQL Editor

## Step 1: Apply Cloud Credentials Migration

- [ ] Open file: `supabase/migrations/20260316000004_cloud_credentials.sql`
- [ ] Copy entire contents
- [ ] Paste into Supabase SQL Editor
- [ ] Click "Run"
- [ ] Verify: "Success. No rows returned"

## Step 2: Apply Deployment Pipeline Migration

- [ ] Open file: `supabase/migrations/20260316120000_deployment_pipeline.sql`
- [ ] Copy entire contents
- [ ] Paste into Supabase SQL Editor (replace previous)
- [ ] Click "Run"
- [ ] Verify: "Success. No rows returned"

## Step 3: Verify Migrations Applied

```bash
./verify-migration.sh
```

Expected output:
- [ ] ✓ cloud_credentials table exists
- [ ] ✓ deployments.org_id column exists
- [ ] ✓ deployments.ecr_repository_uri column exists
- [ ] ✓ build_log_entries table exists
- [ ] ✓ infra_resources table exists

## Step 4: Run Pipeline Test

```bash
./test-build-pipeline-only.sh
```

Expected results:
- [ ] ✓ Test organization created
- [ ] ✓ AWS credentials created
- [ ] ✓ Deployment record created
- [ ] ✓ Build pipeline created (ECR + CodeBuild)
- [ ] ✓ Database updated with ECR URI
- [ ] ✓ Test shows "BUILD PIPELINE TEST PASSED"

## Step 5: Verify in AWS Console

### ECR Repository
- [ ] Open: https://console.aws.amazon.com/ecr/repositories?region=us-east-1
- [ ] Verify: Repository named `autostack-test-app` exists
- [ ] Take screenshot

### CodeBuild Project
- [ ] Open: https://console.aws.amazon.com/codebuild/home?region=us-east-1
- [ ] Verify: Project named `autostack-build-test-app-*` exists
- [ ] Take screenshot

## Step 6: Collect Evidence

- [ ] Screenshot 1: ECR repository in AWS Console
- [ ] Screenshot 2: CodeBuild project in AWS Console
- [ ] Screenshot 3: Test script output showing success

## Step 7: Verify Database State

```bash
# Check deployment record
curl -s "https://prrmrukwmrjkdxcyzovd.supabase.co/rest/v1/deployments?select=ecr_repository_uri,codebuild_project_name&limit=1" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k" | jq
```

Expected:
- [ ] Response shows `ecr_repository_uri` populated
- [ ] Response shows `codebuild_project_name` populated

## Completion Criteria

All checkboxes above must be checked to proceed to design phase.

## If Something Fails

### Migration fails with "relation does not exist"
- Check that `organizations` table exists
- Check that previous migrations were applied

### Test fails at "Creating AWS credentials"
- Verify migrations were applied: `./verify-migration.sh`
- Check cloud_credentials table exists

### Test fails at "Setting up build pipeline"
- Check AWS secrets exist in Supabase:
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
  - AWS_REGION
- Check IAM role is assumable: `arn:aws:iam::367749063363:role/AutoStackDeploymentRole`

### No resources in AWS Console
- Check test script output for errors
- Check Supabase Edge Function logs
- Verify AWS credentials are correct

## Success Criteria

When all items checked:
- ✅ Database schema complete
- ✅ Pipeline creates real AWS resources
- ✅ Database tracking works
- ✅ Ready for design phase

## Next Phase

After checklist complete:
1. Review evidence (screenshots)
2. Document what works
3. Proceed to design phase
4. Build UI for deployment flow

## Estimated Time

- Migrations: 5 minutes
- Verification: 2 minutes
- Test: 5 minutes
- AWS Console check: 3 minutes
- Screenshots: 2 minutes
- **Total: ~15 minutes**
