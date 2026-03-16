#!/bin/bash
# Test ECR creation with direct API calls

set -e

SUPABASE_URL="https://prrmrukwmrjkdxcyzovd.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k"

ORG_ID="00000000-0000-0000-0000-000000000001"
DEPLOYMENT_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

echo "🚀 Testing ECR Creation with Direct API Calls"
echo ""
echo "Deployment ID: $DEPLOYMENT_ID"
echo ""

# Create deployment record
echo "1. Creating deployment record..."
INSERT_RESULT=$(curl -s -X POST "$SUPABASE_URL/rest/v1/deployments" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"id\": \"$DEPLOYMENT_ID\",
    \"org_id\": \"$ORG_ID\",
    \"repo_url\": \"https://github.com/test/app\",
    \"branch\": \"main\",
    \"commit_sha\": \"test-$(date +%s)\",
    \"app_name\": \"test-app\",
    \"region\": \"us-east-1\",
    \"current_stage\": \"queued\",
    \"status\": \"pending\",
    \"triggered_by\": \"manual\"
  }")

if echo "$INSERT_RESULT" | grep -q "\"id\""; then
    echo "✓ Deployment record created"
else
    echo "❌ Failed to create deployment:"
    echo "$INSERT_RESULT" | jq '.'
    exit 1
fi
echo ""

# Call setup-build-pipeline-v2
echo "2. Creating ECR repository..."
RESULT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/setup-build-pipeline-v2" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"deployment_id\": \"$DEPLOYMENT_ID\",
    \"org_id\": \"$ORG_ID\",
    \"github_repo_url\": \"https://github.com/test/app\"
  }")

echo "$RESULT" | jq '.'

if echo "$RESULT" | grep -q '"success":true'; then
    echo ""
    echo "✅ SUCCESS! ECR repository created on real AWS!"
    echo ""
    ECR_URI=$(echo "$RESULT" | jq -r '.ecr_repository_uri')
    echo "ECR URI: $ECR_URI"
    echo ""
    echo "Verify in AWS Console:"
    echo "https://console.aws.amazon.com/ecr/repositories?region=us-east-1"
else
    echo ""
    echo "❌ Failed to create ECR repository"
    exit 1
fi
