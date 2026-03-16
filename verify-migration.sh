#!/bin/bash
# Verify that database migrations have been applied

SUPABASE_URL="https://prrmrukwmrjkdxcyzovd.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k"

echo "Verifying database migrations..."
echo ""

# Check cloud_credentials table
echo "1. Checking cloud_credentials table..."
CLOUD_CREDS=$(curl -s "$SUPABASE_URL/rest/v1/cloud_credentials?limit=0" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")

if echo "$CLOUD_CREDS" | grep -q "error"; then
  echo "   ✗ cloud_credentials table NOT found"
  echo "   Error: $CLOUD_CREDS"
  echo ""
  echo "   → Apply migration: supabase/migrations/20260316000004_cloud_credentials.sql"
  exit 1
else
  echo "   ✓ cloud_credentials table exists"
fi

# Check deployments.org_id column
echo "2. Checking deployments.org_id column..."
ORG_ID_CHECK=$(curl -s "$SUPABASE_URL/rest/v1/deployments?select=org_id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")

if echo "$ORG_ID_CHECK" | grep -q "column.*org_id.*does not exist"; then
  echo "   ✗ deployments.org_id column NOT found"
  echo ""
  echo "   → Apply migration: supabase/migrations/20260316120000_deployment_pipeline.sql"
  exit 1
else
  echo "   ✓ deployments.org_id column exists"
fi

# Check deployments.ecr_repository_uri column
echo "3. Checking deployments.ecr_repository_uri column..."
ECR_CHECK=$(curl -s "$SUPABASE_URL/rest/v1/deployments?select=ecr_repository_uri&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")

if echo "$ECR_CHECK" | grep -q "column.*ecr_repository_uri.*does not exist"; then
  echo "   ✗ deployments.ecr_repository_uri column NOT found"
  echo ""
  echo "   → Apply migration: supabase/migrations/20260316120000_deployment_pipeline.sql"
  exit 1
else
  echo "   ✓ deployments.ecr_repository_uri column exists"
fi

# Check build_log_entries table
echo "4. Checking build_log_entries table..."
BUILD_LOGS=$(curl -s "$SUPABASE_URL/rest/v1/build_log_entries?limit=0" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")

if echo "$BUILD_LOGS" | grep -q "error"; then
  echo "   ✗ build_log_entries table NOT found"
  echo ""
  echo "   → Apply migration: supabase/migrations/20260316120000_deployment_pipeline.sql"
  exit 1
else
  echo "   ✓ build_log_entries table exists"
fi

# Check infra_resources table
echo "5. Checking infra_resources table..."
INFRA_RESOURCES=$(curl -s "$SUPABASE_URL/rest/v1/infra_resources?limit=0" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")

if echo "$INFRA_RESOURCES" | grep -q "error"; then
  echo "   ✗ infra_resources table NOT found"
  echo ""
  echo "   → Apply migration: supabase/migrations/20260316120000_deployment_pipeline.sql"
  exit 1
else
  echo "   ✓ infra_resources table exists"
fi

echo ""
echo "✓ All migrations verified successfully!"
echo ""
echo "Next step: Run the pipeline test"
echo "  ./test-build-pipeline-only.sh"
echo ""
