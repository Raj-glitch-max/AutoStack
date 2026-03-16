#!/bin/bash
# AutoStack Edge Function Deployment Script
# Run this after: supabase login

set -e
source autostack-env.sh

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  AutoStack Edge Function Deployment                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check if logged in
if ! supabase projects list > /dev/null 2>&1; then
  echo "❌ Not logged in to Supabase"
  echo "Run: supabase login"
  exit 1
fi

echo "✅ Supabase CLI authenticated"
echo ""

# Link project
echo "Linking to project ${SUPABASE_PROJECT_REF}..."
supabase link --project-ref ${SUPABASE_PROJECT_REF} || echo "Already linked"
echo ""

# Set secrets
echo "Setting environment secrets..."
supabase secrets set \
  SUPABASE_URL="${SUPABASE_URL}" \
  SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}" \
  AWS_REGION="${AWS_REGION}" \
  GITHUB_APP_ID="${GITHUB_APP_ID}" \
  GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID}" \
  GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET}" \
  GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET}" \
  RESEND_API_KEY="${RESEND_API_KEY}" \
  UPSTASH_REDIS_REST_URL="${UPSTASH_REDIS_REST_URL}" \
  UPSTASH_REDIS_REST_TOKEN="${UPSTASH_REDIS_REST_TOKEN}" \
  NVIDIA_API_KEY_1="${NVIDIA_API_KEY_1}" \
  NVIDIA_API_KEY_2="${NVIDIA_API_KEY_2}" \
  POSTHOG_KEY="${POSTHOG_KEY}" \
  SENTRY_DSN="${SENTRY_DSN}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY}" \
  STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET}"

echo "✅ Secrets configured"
echo ""

# Deploy functions in priority order
CRITICAL_FUNCTIONS=(
  "auth-hook"
  "aws-assume-role"
  "die-analyze"
  "infra-provision"
  "infra-teardown"
)

echo "Deploying critical functions..."
for func in "${CRITICAL_FUNCTIONS[@]}"; do
  echo -n "  Deploying ${func}..."
  if supabase functions deploy "${func}" --no-verify-jwt 2>&1 | tail -1; then
    echo " ✅"
  else
    echo " ❌ FAILED"
  fi
done

echo ""
echo "Deploying remaining functions..."
DEPLOYED=0
FAILED=0

for dir in supabase/functions/*/; do
  func_name=$(basename "$dir")
  
  # Skip _shared and already deployed
  if [ "$func_name" = "_shared" ]; then
    continue
  fi
  
  # Skip if already deployed
  if [[ " ${CRITICAL_FUNCTIONS[@]} " =~ " ${func_name} " ]]; then
    continue
  fi
  
  echo -n "  Deploying ${func_name}..."
  if supabase functions deploy "${func_name}" --no-verify-jwt 2>&1 | tail -1; then
    echo " ✅"
    DEPLOYED=$((DEPLOYED + 1))
  else
    echo " ❌"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Deployment Complete                                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Deployed: ${DEPLOYED} functions"
echo "Failed: ${FAILED} functions"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ ALL FUNCTIONS DEPLOYED SUCCESSFULLY"
  echo ""
  echo "NEXT STEPS:"
  echo "1. Register auth-hook in Supabase Dashboard:"
  echo "   https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/auth/hooks"
  echo ""
  echo "2. Test authentication:"
  echo "   bash test-auth.sh"
else
  echo "⚠️ Some functions failed to deploy"
  echo "Check errors above and retry"
fi
