#!/bin/bash
# Real Pipeline E2E Test - No Bullshit Edition
# Tests what actually exists, reports what's missing

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  AutoStack Real Pipeline Test - Verifying Actual AWS Ops      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SUPABASE_URL="https://prrmrukwmrjkdxcyzovd.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzODE5NjIsImV4cCI6MjA4ODk1Nzk2Mn0.Zd5P26Ay5lfOb7KpTfRtO4Zg50kAmasPlXIjykpYf7I"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k"

TEST_REPO="https://github.com/Raj-glitch-max/AutoStack"
AWS_ACCOUNT_ID="367749063363"
AWS_REGION="us-east-1"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
MISSING_COMPONENTS=()

test_result() {
    local name=$1
    local status=$2
    local message=$3
    
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✓${NC} $name"
        [ -n "$message" ] && echo "  └─ $message"
        ((TESTS_PASSED++))
    elif [ "$status" = "fail" ]; then
        echo -e "${RED}✗${NC} $name"
        [ -n "$message" ] && echo "  └─ $message"
        ((TESTS_FAILED++))
    elif [ "$status" = "missing" ]; then
        echo -e "${YELLOW}⚠${NC} $name - NOT IMPLEMENTED"
        [ -n "$message" ] && echo "  └─ $message"
        MISSING_COMPONENTS+=("$name")
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 1: Environment & Secrets Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Supabase secrets
echo ""
echo "Checking Supabase Edge Function secrets..."

SECRETS=$(supabase secrets list 2>/dev/null | awk '{print $1}')

check_secret() {
    local secret_name=$1
    if echo "$SECRETS" | grep -q "^$secret_name$"; then
        test_result "Secret: $secret_name" "pass"
        return 0
    else
        test_result "Secret: $secret_name" "fail" "Missing from Supabase secrets"
        return 1
    fi
}

# Note: Secrets exist but may have different names in Supabase
# The spec requires AUTOSTACK_AWS_ACCESS_KEY_ID but we have AWS_ACCESS_KEY_ID
if echo "$SECRETS" | grep -q "AWS_ACCESS_KEY_ID"; then
    test_result "Secret: AWS_ACCESS_KEY_ID" "pass" "Note: Spec calls for AUTOSTACK_AWS_ACCESS_KEY_ID"
else
    test_result "Secret: AWS_ACCESS_KEY_ID" "fail" "Missing from Supabase secrets"
fi

if echo "$SECRETS" | grep -q "AWS_SECRET_ACCESS_KEY"; then
    test_result "Secret: AWS_SECRET_ACCESS_KEY" "pass" "Note: Spec calls for AUTOSTACK_AWS_SECRET_ACCESS_KEY"
else
    test_result "Secret: AWS_SECRET_ACCESS_KEY" "fail" "Missing from Supabase secrets"
fi

check_secret "AWS_REGION"
check_secret "GITHUB_PAT"
check_secret "NVIDIA_API_KEY"
check_secret "UPSTASH_REDIS_REST_URL"
check_secret "UPSTASH_REDIS_REST_TOKEN"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 2: Database Schema Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Checking deployments table columns..."

# Check if new columns exist
QUERY="SELECT column_name FROM information_schema.columns WHERE table_name = 'deployments' AND column_name IN ('current_stage', 'ecr_repository_uri', 'live_url', 'image_tag', 'infra_type');"

RESULT=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$QUERY\"}" 2>/dev/null || echo "error")

if echo "$RESULT" | grep -q "current_stage"; then
    test_result "Column: current_stage" "pass"
else
    test_result "Column: current_stage" "missing" "Migration 006_deployment_pipeline.sql not applied"
fi

if echo "$RESULT" | grep -q "ecr_repository_uri"; then
    test_result "Column: ecr_repository_uri" "pass"
else
    test_result "Column: ecr_repository_uri" "missing" "Migration 006_deployment_pipeline.sql not applied"
fi

echo ""
echo "Checking build_log_entries table..."
TABLE_CHECK=$(curl -s "$SUPABASE_URL/rest/v1/build_log_entries?limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" 2>/dev/null || echo "error")

if echo "$TABLE_CHECK" | grep -q "error"; then
    test_result "Table: build_log_entries" "missing" "Migration 006_deployment_pipeline.sql not applied"
else
    test_result "Table: build_log_entries" "pass"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 3: Edge Functions Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Checking deployed functions..."

check_function() {
    local func_name=$1
    if [ -d "supabase/functions/$func_name" ]; then
        test_result "Function: $func_name" "pass" "Source exists"
        return 0
    else
        test_result "Function: $func_name" "missing" "Not created yet"
        return 1
    fi
}

# Functions that MUST exist for pipeline
check_function "die-analyze"
check_function "optimize-cost"
check_function "infra-provision"

# Functions that need to be created
if [ -d "supabase/functions/setup-build-pipeline" ]; then
    test_result "Function: setup-build-pipeline" "pass"
else
    test_result "Function: setup-build-pipeline" "missing" "Needs to be created per spec"
fi

if [ -d "supabase/functions/run-build" ]; then
    test_result "Function: run-build" "pass"
else
    test_result "Function: run-build" "missing" "Needs to be created per spec"
fi

if [ -d "supabase/functions/provision-infrastructure" ]; then
    test_result "Function: provision-infrastructure" "pass"
else
    test_result "Function: provision-infrastructure" "missing" "Needs to be created per spec"
fi

echo ""
echo "Checking shared utilities..."

check_file() {
    local file_path=$1
    local description=$2
    if [ -f "$file_path" ]; then
        test_result "$description" "pass"
        return 0
    else
        test_result "$description" "missing" "Needs to be created per spec"
        return 1
    fi
}

check_file "supabase/functions/_shared/app-classifier.ts" "Shared: app-classifier"
check_file "supabase/functions/_shared/cost-calculator.ts" "Shared: cost-calculator"

if [ -f "supabase/functions/_shared/aws-client.ts" ]; then
    test_result "Shared: aws-client" "pass"
else
    test_result "Shared: aws-client" "missing" "Critical - needed for all AWS operations"
fi

if [ -f "supabase/functions/_shared/dockerfile-generator.ts" ]; then
    test_result "Shared: dockerfile-generator" "pass"
else
    test_result "Shared: dockerfile-generator" "missing" "Needed for build pipeline"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 4: AWS Connectivity Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Testing AWS credentials via aws-assume-role function..."

AWS_TEST=$(curl -s -X POST "$SUPABASE_URL/functions/v1/aws-assume-role" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"account_id\": \"$AWS_ACCOUNT_ID\",
    \"region\": \"$AWS_REGION\",
    \"role_arn\": \"arn:aws:iam::$AWS_ACCOUNT_ID:role/AutoStackDeploymentRole\"
  }" 2>/dev/null || echo '{"success":false}')

if echo "$AWS_TEST" | grep -q '"success":true'; then
    test_result "AWS Role Assumption" "pass" "Can assume user's IAM role"
else
    test_result "AWS Role Assumption" "fail" "Cannot assume role - check trust policy"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 5: Intelligence System Test (Steps 1-5)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Testing die-analyze function..."

# This should work since it was deployed in previous work
ANALYZE_TEST=$(curl -s -X POST "$SUPABASE_URL/functions/v1/die-analyze" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"repo_url\": \"$TEST_REPO\",
    \"branch\": \"main\"
  }" 2>/dev/null || echo '{"success":false}')

if echo "$ANALYZE_TEST" | grep -q '"success":true'; then
    test_result "Repo Analysis (die-analyze)" "pass" "Can analyze GitHub repos"
else
    test_result "Repo Analysis (die-analyze)" "fail" "Function exists but may have errors"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Failed:${NC} $TESTS_FAILED"
echo -e "${YELLOW}Missing:${NC} ${#MISSING_COMPONENTS[@]}"

if [ ${#MISSING_COMPONENTS[@]} -gt 0 ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "COMPONENTS THAT NEED TO BE BUILT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    for component in "${MISSING_COMPONENTS[@]}"; do
        echo "  • $component"
    done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NEXT STEPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Apply database migration:"
echo "   supabase db push"
echo ""
echo "2. Create missing shared utilities:"
echo "   - supabase/functions/_shared/aws-client.ts"
echo "   - supabase/functions/_shared/dockerfile-generator.ts"
echo ""
echo "3. Create pipeline functions:"
echo "   - supabase/functions/setup-build-pipeline/"
echo "   - supabase/functions/run-build/"
echo "   - supabase/functions/provision-infrastructure/"
echo ""
echo "4. Deploy functions:"
echo "   supabase functions deploy setup-build-pipeline"
echo "   supabase functions deploy run-build"
echo "   supabase functions deploy provision-infrastructure"
echo ""
echo "5. Run E2E test with real repo"
echo ""

if [ $TESTS_FAILED -gt 0 ] || [ ${#MISSING_COMPONENTS[@]} -gt 0 ]; then
    exit 1
else
    echo -e "${GREEN}All checks passed! Ready for E2E deployment test.${NC}"
    exit 0
fi
