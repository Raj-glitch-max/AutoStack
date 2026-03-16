# ⚠️ MIGRATION REQUIRED - Action Needed

## Issue Found
The `cloud_credentials` table doesn't exist in the database. This is why the test script fails when trying to insert AWS credentials.

## Root Cause
The table was referenced in code but never created in migrations. The `aws-assume-role-v2` function and test scripts expect this table to exist.

## Solution Created
Created new migration: `supabase/migrations/20260316000004_cloud_credentials.sql`

This migration creates:
- `cloud_credentials` table with proper schema
- Indexes for performance
- RLS policies for security
- Unique constraint on (org_id, role_arn)

## Required Actions (5 minutes)

### Step 1: Apply Cloud Credentials Migration

1. Open: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/sql

2. Copy contents of: `supabase/migrations/20260316000004_cloud_credentials.sql`

3. Paste into SQL Editor and click "Run"

4. Should see: "Success. No rows returned"

### Step 2: Apply Deployment Pipeline Migration

1. Stay in SQL Editor

2. Copy contents of: `supabase/migrations/20260316120000_deployment_pipeline.sql`

3. Paste into SQL Editor and click "Run"

4. Should see: "Success. No rows returned"

### Step 3: Verify Migrations

```bash
chmod +x verify-migration.sh
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

### Step 4: Run Pipeline Test

```bash
chmod +x test-build-pipeline-only.sh
./test-build-pipeline-only.sh
```

This will:
1. Create test organization
2. Insert AWS credentials (now works!)
3. Create deployment record
4. Call setup-build-pipeline (creates ECR + CodeBuild)
5. Verify resources in AWS

Expected: All steps pass, ECR and CodeBuild created in AWS.

## What Happens After Migrations

Once migrations are applied:
- ✅ Test script can insert cloud_credentials
- ✅ setup-build-pipeline can create ECR repositories
- ✅ run-build can start CodeBuild jobs
- ✅ provision-infrastructure can create App Runner services
- ✅ Full pipeline works end-to-end

## Files Modified

1. **Created:**
   - `supabase/migrations/20260316000004_cloud_credentials.sql` - New table
   - `MIGRATION_REQUIRED.md` - This document

2. **Updated:**
   - `apply-migration.md` - Instructions for both migrations
   - `verify-migration.sh` - Checks cloud_credentials table

## Why This Wasn't Caught Earlier

The code referenced `cloud_credentials` table but it was never created in migrations. The table likely exists in production but not in the migration files, causing issues when setting up new environments or running tests.

## Timeline

- **Now:** Apply migrations (5 minutes)
- **Next:** Run test script to verify pipeline works
- **Then:** Collect evidence (screenshots) and proceed to design phase

## Questions?

If migrations fail, check:
1. Does `organizations` table exist? (Required for foreign key)
2. Are you using service_role key? (Required for RLS bypass)
3. Any previous migration errors? (Check Supabase logs)
