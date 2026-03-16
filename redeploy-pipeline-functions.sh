#!/bin/bash
# Redeploy pipeline functions with Redis made optional

set -e

echo "Redeploying pipeline functions..."
echo ""

# Deploy setup-build-pipeline
echo "1. Deploying setup-build-pipeline..."
supabase functions deploy setup-build-pipeline --no-verify-jwt

# Deploy run-build  
echo "2. Deploying run-build..."
supabase functions deploy run-build --no-verify-jwt

# Deploy provision-infrastructure
echo "3. Deploying provision-infrastructure..."
supabase functions deploy provision-infrastructure --no-verify-jwt

echo ""
echo "✓ All pipeline functions redeployed"
echo ""
echo "Changes:"
echo "  - Redis is now optional (functions work without UPSTASH secrets)"
echo "  - Credentials will be fetched fresh each time if Redis not available"
echo "  - No more 502 errors from missing Redis configuration"
echo ""
echo "Next: Run the test"
echo "  ./test-build-pipeline-only.sh"
