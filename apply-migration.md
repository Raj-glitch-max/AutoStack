# Apply Database Migrations

Two migrations need to be applied manually via Supabase Dashboard.

## Migration Files (Apply in Order)

1. `supabase/migrations/20260316000004_cloud_credentials.sql` - Cloud credentials table
2. `supabase/migrations/20260316120000_deployment_pipeline.sql` - Deployment pipeline

## Steps

### Step 1: Apply Cloud Credentials Migration

1. Go to: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/sql

2. Copy the entire contents of `supabase/migrations/20260316000004_cloud_credentials.sql`

3. Paste into the SQL Editor

4. Click "Run"

5. Verify success - you should see "Success. No rows returned"

### Step 2: Apply Deployment Pipeline Migration

1. Stay in the SQL Editor

2. Copy the entire contents of `supabase/migrations/20260316120000_deployment_pipeline.sql`

3. Paste into the SQL Editor (replacing previous content)

4. Click "Run"

5. Verify success - you should see "Success. No rows returned"

## What These Migrations Do

### Cloud Credentials Migration
- Creates `cloud_credentials` table for storing AWS IAM role ARNs
- Adds indexes and RLS policies
- Required for AWS operations (setup-build-pipeline, run-build, provision-infrastructure)

### Deployment Pipeline Migration
1. **Adds columns to `deployments` table:**
   - `org_id` - Links deployment to organization
   - `repo_url`, `app_name`, `port`, `memory_mb`, `region` - App configuration
   - `current_stage` - Tracks deployment state machine
   - `live_url` - The deployed application URL
   - `ecr_repository_uri`, `image_tag` - Docker image tracking
   - `infra_type` - app_runner | ecs_fargate | eks_fargate
   - AWS resource ARNs for tracking
   - `error_analysis` - JSONB for AI-powered error insights

2. **Creates `build_log_entries` table:**
   - For real-time log streaming
   - Indexed by deployment_id and timestamp
   - Realtime enabled for frontend subscriptions

3. **Creates `infra_resources` table:**
   - Tracks every AWS resource created
   - Used for teardown/cleanup
   - Indexed by deployment_id and org_id

4. **Sets up RLS policies:**
   - Users can only see logs for their org's deployments
   - Service role can insert logs
   - Users can only see their org's resources

## Verification

After applying both migrations, run:

```bash
./verify-migration.sh
```

This will check if the new tables and columns exist in the database.

Or verify manually with:

```sql
-- Check cloud_credentials table exists
SELECT COUNT(*) FROM cloud_credentials;

-- Check deployments table has new columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'deployments' 
AND column_name IN ('org_id', 'current_stage', 'live_url', 'ecr_repository_uri');

-- Check build_log_entries table exists
SELECT COUNT(*) FROM build_log_entries;

-- Check infra_resources table exists
SELECT COUNT(*) FROM infra_resources;
```

Expected: All queries should succeed without errors.

## If You See Errors

### "column already exists" or "table already exists"
- Safe to ignore - migrations are idempotent
- The `IF NOT EXISTS` clauses handle this

### "relation is already member of publication"
- Safe to ignore - the migration now checks before adding to publication
- This means the table was already set up for realtime

### "relation does not exist"
- This means a referenced table (like `organizations` or `projects`) doesn't exist
- Check that previous migrations were applied

## After Migrations Applied

Run the simplified test to verify the pipeline works:

```bash
./test-build-pipeline-only.sh
```

This will test ECR + CodeBuild creation without requiring full auth setup.
