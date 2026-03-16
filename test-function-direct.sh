#!/bin/bash
# Direct test of setup-build-pipeline function to see actual error

SUPABASE_URL="https://prrmrukwmrjkdxcyzovd.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k"

echo "Testing setup-build-pipeline function directly..."
echo ""

RESPONSE=$(curl -v -X POST "$SUPABASE_URL/functions/v1/setup-build-pipeline" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_id": "test-123",
    "org_id": "00000000-0000-0000-0000-000000000001",
    "classification": {"language": "Node.js"},
    "dockerfile_content": "FROM node:20",
    "github_repo_url": "https://github.com/test/repo",
    "branch": "main"
  }' 2>&1)

echo "$RESPONSE"
