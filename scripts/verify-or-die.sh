#!/bin/bash
# AutoStack Phase 1: Verify-or-Die Script (v4)
# Final verification of the TPA Foundation.

set -uo pipefail

# Load credentials
source /home/raj/Documents/AutoStack/autostack-env.sh
export SUPABASE_ACCESS_TOKEN=sbp_2806335530d512e92fcbebb45deb33cf76485cd3

PASS_COUNT=0
FAIL_COUNT=0

log_success() { echo -e "  \033[0;32m✅ $1\033[0m"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_failure() { echo -e "  \033[0;31m❌ $1\033[0m"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
log_step() { echo -e "\n\033[1;34m[Step $1/5] $2\033[0m"; }

echo "═══════════════════════════════════════════════════════"
echo "        AutoStack TPA: VERIFY-OR-DIE (FOUNDATION)"
echo "═══════════════════════════════════════════════════════"

# 1. AWS Identity & Role Check
log_step 1 "Verifying AWS Identity & Role"
IDENT=$(aws sts get-caller-identity --query 'Arn' --output text 2>/dev/null || echo "FAILED")
if [[ $IDENT == *"root"* ]] || [[ $IDENT == *"AutoStack"* ]]; then
    log_success "AWS Identity verified: $IDENT"
else
    log_failure "AWS Identity mismatch: $IDENT"
fi

ROLE_ARN=$(aws iam get-role --role-name AutoStackDeploymentRole --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [ -n "$ROLE_ARN" ]; then
    log_success "AutoStackDeploymentRole exists: $ROLE_ARN"
else
    log_failure "AutoStackDeploymentRole not found"
fi

# 2. AWS Trust Policy Audit
log_step 2 "Auditing AWS Trust Policy"
TRUST_POLICY=$(aws iam get-role --role-name AutoStackDeploymentRole --query 'Role.AssumeRolePolicyDocument' --output json 2>/dev/null)
if [[ $TRUST_POLICY == *"${AWS_ACCOUNT_ID}:root"* ]]; then
    log_success "Trust Policy correctly allows Account Root"
else
    log_failure "Trust Policy does not include Account Root"
fi

# 3. Supabase Migration & Schema Check (Using CLI source of truth)
log_step 3 "Verifying Supabase Schema (Migration Audit)"
MIGRATIONS=$(supabase migration list 2>/dev/null || echo "ERROR")

if [[ $MIGRATIONS == *"20260316000000"* ]]; then
    log_success "Golden TPA Migration (Hardening) is APPLIED"
else
    log_failure "Golden TPA Migration missing from remote"
fi

if [[ $MIGRATIONS == *"20260316000001"* ]]; then
    log_success "Zero-Touch Auth Trigger Migration is APPLIED"
else
    log_failure "Zero-Touch Auth Migration missing from remote"
fi

# 4. Edge Function Security (CORS/Preflight)
log_step 4 "Verifying Edge Function Security"
CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "${SUPABASE_URL}/functions/v1/aws-assume-role" -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST")
if [ "$CORS_STATUS" = "200" ]; then
    log_success "CORS Preflight responds (HTTP 200)"
else
    log_failure "CORS Preflight FAILED (HTTP $CORS_STATUS)"
fi

# 5. Frontend Production Readiness
log_step 5 "Verifying Frontend Build"
if [ -d "frontend/dist" ] && [ -f "frontend/nginx.conf" ]; then
    log_success "Frontend Production Build & Nginx Config READY"
else
    log_failure "Frontend artifacts missing"
fi

echo -e "\n═══════════════════════════════════════════════════════"
echo "  FINAL RESULT: ${PASS_COUNT} PASSED, ${FAIL_COUNT} FAILED"
echo "═══════════════════════════════════════════════════════"

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "\033[1;32m✅ ALL FOUNDATIONAL SYSTEMS GO. PHASE 1 SECURED.\033[0m"
    exit 0
else
    echo -e "\033[1;31m❌ CORE SYSTEM FAILED. FIX DISCREPANCIES.\033[0m"
    exit 1
fi
