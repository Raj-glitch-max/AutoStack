#!/bin/bash
# Test AutoStack Authentication Flow

set -e
source autostack-env.sh

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  AutoStack Authentication Test                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Generate unique test email
TEST_EMAIL="test-$(date +%s)@autostack-e2e.io"
TEST_PASSWORD="TestPassword123!"

echo "Creating test user: ${TEST_EMAIL}"
echo ""

# Signup
SIGNUP_RESULT=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\",
    \"options\": {
      \"data\": {
        \"full_name\": \"E2E Test User\",
        \"organization_name\": \"E2E Test Corp\"
      }
    }
  }")

echo "Signup response:"
echo "${SIGNUP_RESULT}" | jq '.'
echo ""

# Extract key fields
ACCESS_TOKEN=$(echo "${SIGNUP_RESULT}" | jq -r '.access_token // empty')
USER_ID=$(echo "${SIGNUP_RESULT}" | jq -r '.user.id // empty')
ORG_ID=$(echo "${SIGNUP_RESULT}" | jq -r '.user.user_metadata.org_id // empty')
ROLE=$(echo "${SIGNUP_RESULT}" | jq -r '.user.user_metadata.role // empty')

echo "=== VERIFICATION ==="
echo ""

# Check 1: Access token
if [ -n "${ACCESS_TOKEN}" ]; then
  echo "✅ Access token received"
  echo "   Token: ${ACCESS_TOKEN:0:20}..."
else
  echo "❌ No access token - signup failed"
  exit 1
fi

# Check 2: User ID
if [ -n "${USER_ID}" ]; then
  echo "✅ User ID: ${USER_ID}"
else
  echo "❌ No user ID"
  exit 1
fi

# Check 3: org_id (CRITICAL)
if [ -n "${ORG_ID}" ] && [ "${ORG_ID}" != "null" ]; then
  echo "✅ org_id present: ${ORG_ID}"
  echo "   → auth-hook executed successfully"
else
  echo "❌ CRITICAL: org_id MISSING"
  echo "   → auth-hook did NOT run"
  echo ""
  echo "FIX: Register auth-hook in Supabase Dashboard:"
  echo "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/auth/hooks"
  exit 1
fi

# Check 4: Role
if [ "${ROLE}" = "owner" ]; then
  echo "✅ Role: owner"
else
  echo "⚠️ Role: ${ROLE} (expected: owner)"
fi

echo ""
echo "=== DATABASE VERIFICATION ==="
echo ""

# Check organization exists
ORG=$(curl -s "${SUPABASE_URL}/rest/v1/organizations?id=eq.${ORG_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

ORG_NAME=$(echo "${ORG}" | jq -r '.[0].name // empty')
if [ -n "${ORG_NAME}" ]; then
  echo "✅ Organization created: ${ORG_NAME}"
else
  echo "❌ Organization NOT in database"
fi

# Check subscription
SUB=$(curl -s "${SUPABASE_URL}/rest/v1/subscriptions?org_id=eq.${ORG_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

SUB_STATUS=$(echo "${SUB}" | jq -r '.[0].status // empty')
if [ "${SUB_STATUS}" = "trialing" ]; then
  echo "✅ Trial subscription created"
else
  echo "⚠️ Subscription status: ${SUB_STATUS}"
fi

echo ""
echo "=== EDGE FUNCTION TEST ==="
echo ""

# Test aws-assume-role with the JWT
echo "Testing aws-assume-role function..."
AWS_TEST=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/aws-assume-role" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"role_arn\": \"${AUTOSTACK_ROLE_ARN}\",
    \"account_id\": \"${AWS_ACCOUNT_ID}\",
    \"external_id\": \"${ORG_ID}\"
  }")

echo "Response:"
echo "${AWS_TEST}" | jq '.'
echo ""

VERIFIED=$(echo "${AWS_TEST}" | jq -r '.verified // false')
if [ "${VERIFIED}" = "true" ]; then
  echo "✅ AWS credentials verified"
  echo "   → JWT authentication working"
  echo "   → Edge Function accessible"
else
  ERROR=$(echo "${AWS_TEST}" | jq -r '.error // "unknown"')
  echo "❌ AWS verification failed: ${ERROR}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Test Complete                                            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if [ -n "${ORG_ID}" ] && [ "${ORG_ID}" != "null" ] && [ "${VERIFIED}" = "true" ]; then
  echo "✅ ALL TESTS PASSED"
  echo ""
  echo "Test credentials (save these):"
  echo "  Email: ${TEST_EMAIL}"
  echo "  Password: ${TEST_PASSWORD}"
  echo "  JWT: ${ACCESS_TOKEN:0:30}..."
  echo "  Org ID: ${ORG_ID}"
  echo ""
  echo "NEXT: Run E2E deployment test"
else
  echo "⚠️ SOME TESTS FAILED"
  echo "Review errors above and fix before proceeding"
fi
