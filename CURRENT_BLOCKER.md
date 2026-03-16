# Current Blocker: Missing Database Table

## What's Blocking
The test script `test-build-pipeline-only.sh` fails because the `cloud_credentials` table doesn't exist in the database.

## Error Symptom
```bash
# Step 1b: Creating AWS credentials...
CREDS_INSERT=$(curl -s -X POST "$SUPABASE_URL/rest/v1/cloud_credentials" ...)
# Returns error because table doesn't exist
```

## Root Cause
The `cloud_credentials` table was referenced in code but never created in migrations:
- ❌ No CREATE TABLE statement in any migration
- ✅ Code expects it to exist (aws-assume-role-v2, test scripts)
- ✅ Indexes reference it (003_performance_indexes.sql)

## Solution
Created migration file: `supabase/migrations/20260316000004_cloud_credentials.sql`

## What You Need to Do (5 minutes)

### Quick Path
1. Open Supabase Dashboard SQL Editor
2. Run migration: `20260316000004_cloud_credentials.sql`
3. Run migration: `20260316120000_deployment_pipeline.sql`
4. Run: `./verify-migration.sh`
5. Run: `./test-build-pipeline-only.sh`

### Detailed Instructions
See: `MIGRATION_REQUIRED.md` or `apply-migration.md`

## After Migrations Applied

The test will:
1. ✅ Create test organization
2. ✅ Insert AWS credentials (currently fails here)
3. ✅ Create deployment record
4. ✅ Call setup-build-pipeline → Creates ECR + CodeBuild in AWS
5. ✅ Verify database updated with ECR URI

Then you can verify in AWS Console:
- ECR repository exists
- CodeBuild project exists

## Why This Matters

Without this table:
- Can't store AWS credentials
- Can't assume IAM roles
- Can't create AWS resources
- Pipeline can't work

With this table:
- Store org's AWS role ARN
- Assume role to create resources
- Track which org owns which AWS account
- Full pipeline works

## Files to Read
1. `MIGRATION_REQUIRED.md` - Detailed explanation
2. `apply-migration.md` - Step-by-step instructions
3. `supabase/migrations/20260316000004_cloud_credentials.sql` - The migration

## Current Status
- ✅ Intelligence system (Steps 1-5) works
- ✅ Edge functions deployed (setup-build-pipeline, run-build, provision-infrastructure)
- ✅ Migration files created
- ⏳ Migrations need to be applied manually
- ⏳ Test needs to run to verify AWS operations

## Next Steps
1. Apply migrations (you)
2. Run test script (automated)
3. Verify in AWS Console (you)
4. Take screenshots (you)
5. Proceed to design phase (me)
