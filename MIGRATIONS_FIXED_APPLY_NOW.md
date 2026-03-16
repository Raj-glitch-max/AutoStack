# ✅ Migrations Fixed - Apply Now

## What Was Fixed

Both migration files have been updated to be fully idempotent. They now:
- Drop existing policies before recreating them
- Check before adding tables to realtime publication
- Use `IF NOT EXISTS` for all table/index creation

This means they can be run multiple times safely without errors.

## Apply Migrations (5 Minutes)

### Step 1: Cloud Credentials Migration (FIXED)

1. Open: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/sql

2. Copy entire contents of: `supabase/migrations/20260316000004_cloud_credentials.sql`

3. Paste into SQL Editor

4. Click "Run"

5. Should see: "Success. No rows returned"

### Step 2: Deployment Pipeline Migration (FIXED)

1. Stay in SQL Editor

2. Copy entire contents of: `supabase/migrations/20260316120000_deployment_pipeline.sql`

3. Paste into SQL Editor

4. Click "Run"

5. Should see: "Success. No rows returned"

## What Changed

### Cloud Credentials Migration
```sql
-- Now drops existing policies before recreating
DO $$
BEGIN
  DROP POLICY IF EXISTS "cloud_credentials_org_access" ON cloud_credentials;
  DROP POLICY IF EXISTS "cloud_credentials_service_role" ON cloud_credentials;
END $$;

-- Then creates them fresh
CREATE POLICY "cloud_credentials_org_access" ...
```

### Deployment Pipeline Migration
```sql
-- Checks before adding to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'build_log_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE build_log_entries;
  END IF;
END $$;

-- Drops existing policies before recreating
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view logs for their org's deployments" ON build_log_entries;
  DROP POLICY IF EXISTS "Service role can insert logs" ON build_log_entries;
END $$;
```

## Verify Migrations

```bash
./verify-migration.sh
```

Expected output:
```
Verifying database migrations...

1. Checking cloud_credentials table...
   ✓ cloud_credentials table exists
2. Checking deployments.org_id column...
   ✓ deployments.org_id column exists
3. Checking deployments.ecr_repository_uri column...
   ✓ deployments.ecr_repository_uri column exists
4. Checking build_log_entries table...
   ✓ build_log_entries table exists
5. Checking infra_resources table...
   ✓ infra_resources table exists

✓ All migrations verified successfully!
```

## Test Pipeline

```bash
./test-build-pipeline-only.sh
```

Expected output:
```
╔════════════════════════════════════════════════════════════════╗
║  Build Pipeline Test - Real AWS Operations                     ║
╚════════════════════════════════════════════════════════════════╝

▶ Step 1: Creating test organization...
  ✓ Test organization created

▶ Step 1b: Creating AWS credentials...
  ✓ AWS credentials created
    Role ARN: arn:aws:iam::367749063363:role/AutoStackDeploymentRole

▶ Step 2: Creating deployment record...
  ✓ Deployment record created

▶ Step 3: Setting up build pipeline (ECR + CodeBuild)...
  ✓ Build pipeline created
    ECR: 367749063363.dkr.ecr.us-east-1.amazonaws.com/autostack-test-app
    CodeBuild: autostack-build-test-app-xxxxx

  ✓ Verified: ECR repository created in AWS
  ✓ Verified: CodeBuild project created in AWS

▶ Step 4: Verifying deployment record updated...
  ✓ Deployment record updated with ECR URI

╔════════════════════════════════════════════════════════════════╗
║                    BUILD PIPELINE TEST PASSED ✓                ║
╚════════════════════════════════════════════════════════════════╝
```

## Verify in AWS Console

1. **ECR Repository:**
   https://console.aws.amazon.com/ecr/repositories?region=us-east-1
   - Should see: `autostack-test-app` repository

2. **CodeBuild Project:**
   https://console.aws.amazon.com/codebuild/home?region=us-east-1
   - Should see: `autostack-build-test-app-*` project

## Why These Errors Happened

The tables and policies already existed from previous migrations or manual setup. The original migrations tried to create them again, which PostgreSQL doesn't allow.

The fixed migrations now:
1. Check if things exist before creating them
2. Drop and recreate policies (safe operation)
3. Can be run multiple times without errors

## Summary

✅ Both migration files fixed
✅ Now fully idempotent
✅ Safe to run multiple times
✅ No more "already exists" errors

Just apply both migrations and run the test! 🚀
