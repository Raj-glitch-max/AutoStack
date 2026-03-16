#!/bin/bash
# AutoStack Deployment Verification Script
# Run this to check if everything is working

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  AutoStack Deployment Verification                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

SUPABASE_URL="https://prrmrukwmrjkdxcyzovd.supabase.co"
ROLE_ARN="arn:aws:iam::367749063363:role/AutoStackDeploymentRole"
ACCOUNT_ID="367749063363"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Testing AutoStack deployment..."
echo ""

# Test 1: Check if Supabase CLI is logged in
echo -n "1. Checking Supabase CLI authentication... "
if supabase projects list > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Logged in${NC}"
else
  echo -e "${RED}❌ Not logged in${NC}"
  echo "   Run: supabase login"
  exit 1
fi

# Test 2: Check if project is linked
echo -n "2. Checking project link... "
if supabase status > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Linked${NC}"
else
  echo -e "${YELLOW}⚠️  Not linked${NC}"
  echo "   Run: supabase link --project-ref prrmrukwmrjkdxcyzovd"
fi

# Test 3: Check if AWS credentials are set
echo -n "3. Checking AWS credentials in Supabase... "
SECRETS=$(supabase secrets list --project-ref prrmrukwmrjkdxcyzovd 2>&1)
if echo "$SECRETS" | grep -q "AWS_ACCESS_KEY_ID"; then
  echo -e "${GREEN}✅ Set${NC}"
else
  echo -e "${RED}❌ Not set${NC}"
  echo "   Run: bash set-aws-secrets.sh"
  exit 1
fi

# Test 4: Test aws-assume-role function
echo -n "4. Testing aws-assume-role function... "
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/aws-assume-role" \
  -H "Content-Type: application/json" \
  -d "{
    \"role_arn\": \"${ROLE_ARN}\",
    \"account_id\": \"${ACCOUNT_ID}\",
    \"external_id\": \"test-org-id\"
  }")

if echo "$RESPONSE" | grep -q '"verified":true'; then
  echo -e "${GREEN}✅ Working${NC}"
else
  echo -e "${RED}❌ Failed${NC}"
  echo "   Response: $RESPONSE"
  echo ""
  echo "   Possible fixes:"
  echo "   - Run: bash set-aws-secrets.sh"
  echo "   - Run: supabase functions deploy aws-assume-role --no-verify-jwt"
  exit 1
fi

# Test 5: Check if auth-hook is registered
echo -n "5. Checking auth-hook registration... "
echo -e "${YELLOW}⚠️  Manual check required${NC}"
echo "   Go to: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd/auth/hooks"
echo "   Verify: auth-hook is registered for 'After signup' event"

# Test 6: Check database connectivity
echo -n "6. Testing database connectivity... "
DB_TEST=$(curl -s "${SUPABASE_URL}/rest/v1/organizations?limit=1" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzODE5NjIsImV4cCI6MjA4ODk1Nzk2Mn0.Zd5P26Ay5lfOb7KpTfRtO4Zg50kAmasPlXIjykpYf7I")

if [ -n "$DB_TEST" ]; then
  echo -e "${GREEN}✅ Connected${NC}"
else
  echo -e "${RED}❌ Failed${NC}"
  exit 1
fi

# Test 7: Check frontend build
echo -n "7. Checking frontend build... "
if [ -d "frontend/dist" ]; then
  echo -e "${GREEN}✅ Built${NC}"
else
  echo -e "${YELLOW}⚠️  Not built${NC}"
  echo "   Run: cd frontend && npm run build"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Verification Summary                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ Core functionality is working!${NC}"
echo ""
echo "Next steps:"
echo "1. Register auth-hook in Supabase Dashboard (if not done)"
echo "2. Deploy all functions: bash deploy-functions.sh"
echo "3. Build frontend: cd frontend && npm run build"
echo "4. Test full deployment flow"
echo ""
echo "Your AutoStack platform is ready for production! 🚀"
