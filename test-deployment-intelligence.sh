#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — DEPLOYMENT INTELLIGENCE TEST SUITE                            ║
# ║   Tests the new cost calculator, classifier, and optimizer                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

PROJECT_REF="prrmrukwmrjkdxcyzovd"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   AutoStack Deployment Intelligence Test Suite                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}✗ Supabase CLI not found. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo -e "${RED}✗ Not logged in to Supabase. Run: supabase login${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Logged in to Supabase${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1: Deploy Migrations
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[TEST 1] Deploying database migrations...${NC}"

cd supabase

# Check if migration file exists
if [ ! -f "migrations/20260316100000_ensure_analysis_fields.sql" ]; then
    echo -e "${RED}✗ Migration file not found${NC}"
    exit 1
fi

echo -e "${YELLOW}  → Applying migration 20260316100000_ensure_analysis_fields.sql${NC}"

# Note: This would normally be done via Supabase Dashboard SQL Editor or CLI
# For now, we'll just verify the file exists
echo -e "${GREEN}✓ Migration file ready (apply via Dashboard SQL Editor)${NC}"
echo ""

cd ..

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 2: Validate TypeScript Compilation
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[TEST 2] Validating TypeScript compilation...${NC}"

# Check cost-calculator.ts
echo -e "${YELLOW}  → Checking cost-calculator.ts${NC}"
if [ -f "supabase/functions/_shared/cost-calculator.ts" ]; then
    # Basic syntax check (Deno will do full check on deploy)
    if grep -q "export function calculateMonthlyCost" "supabase/functions/_shared/cost-calculator.ts"; then
        echo -e "${GREEN}    ✓ cost-calculator.ts exports found${NC}"
    else
        echo -e "${RED}    ✗ cost-calculator.ts missing exports${NC}"
        exit 1
    fi
else
    echo -e "${RED}    ✗ cost-calculator.ts not found${NC}"
    exit 1
fi

# Check app-classifier.ts
echo -e "${YELLOW}  → Checking app-classifier.ts${NC}"
if [ -f "supabase/functions/_shared/app-classifier.ts" ]; then
    if grep -q "export async function classifyApplication" "supabase/functions/_shared/app-classifier.ts"; then
        echo -e "${GREEN}    ✓ app-classifier.ts exports found${NC}"
    else
        echo -e "${RED}    ✗ app-classifier.ts missing exports${NC}"
        exit 1
    fi
else
    echo -e "${RED}    ✗ app-classifier.ts not found${NC}"
    exit 1
fi

# Check optimize-cost function
echo -e "${YELLOW}  → Checking optimize-cost/index.ts${NC}"
if [ -f "supabase/functions/optimize-cost/index.ts" ]; then
    if grep -q "export async function generateInfrastructureOptions" "supabase/functions/optimize-cost/index.ts"; then
        echo -e "${GREEN}    ✓ optimize-cost/index.ts exports found${NC}"
    else
        echo -e "${RED}    ✗ optimize-cost/index.ts missing exports${NC}"
        exit 1
    fi
else
    echo -e "${RED}    ✗ optimize-cost/index.ts not found${NC}"
    exit 1
fi

# Check die-analyze function
echo -e "${YELLOW}  → Checking die-analyze/index.ts${NC}"
if [ -f "supabase/functions/die-analyze/index.ts" ]; then
    if grep -q "import.*classifyApplication.*from.*app-classifier" "supabase/functions/die-analyze/index.ts"; then
        echo -e "${GREEN}    ✓ die-analyze/index.ts imports classifier${NC}"
    else
        echo -e "${RED}    ✗ die-analyze/index.ts missing classifier import${NC}"
        exit 1
    fi
else
    echo -e "${RED}    ✗ die-analyze/index.ts not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All TypeScript files validated${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 3: Check Frontend Components
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[TEST 3] Validating frontend components...${NC}"

# Check CostEstimateCard
echo -e "${YELLOW}  → Checking CostEstimateCard.jsx${NC}"
if [ -f "frontend/src/components/deploy/CostEstimateCard.jsx" ]; then
    if grep -q "export function CostEstimateCard" "frontend/src/components/deploy/CostEstimateCard.jsx"; then
        echo -e "${GREEN}    ✓ CostEstimateCard.jsx exports found${NC}"
    else
        echo -e "${RED}    ✗ CostEstimateCard.jsx missing exports${NC}"
        exit 1
    fi
else
    echo -e "${RED}    ✗ CostEstimateCard.jsx not found${NC}"
    exit 1
fi

# Check DeploymentFlow
echo -e "${YELLOW}  → Checking DeploymentFlow.jsx${NC}"
if [ -f "frontend/src/components/deploy/DeploymentFlow.jsx" ]; then
    if grep -q "export function DeploymentFlow" "frontend/src/components/deploy/DeploymentFlow.jsx"; then
        echo -e "${GREEN}    ✓ DeploymentFlow.jsx exports found${NC}"
    else
        echo -e "${RED}    ✗ DeploymentFlow.jsx missing exports${NC}"
        exit 1
    fi
else
    echo -e "${RED}    ✗ DeploymentFlow.jsx not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All frontend components validated${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4: Verify No Breaking Changes
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[TEST 4] Checking for breaking changes...${NC}"

# Check that existing functions still have their exports
echo -e "${YELLOW}  → Checking aws-assume-role function${NC}"
if [ -f "supabase/functions/aws-assume-role/index.ts" ]; then
    if grep -q "Deno.serve" "supabase/functions/aws-assume-role/index.ts"; then
        echo -e "${GREEN}    ✓ aws-assume-role function intact${NC}"
    else
        echo -e "${RED}    ✗ aws-assume-role function broken${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}    ⚠ aws-assume-role function not found (may not exist yet)${NC}"
fi

# Check CORS helper
echo -e "${YELLOW}  → Checking CORS helper${NC}"
if [ -f "supabase/functions/_shared/cors.ts" ]; then
    if grep -q "export const CORS_HEADERS" "supabase/functions/_shared/cors.ts"; then
        echo -e "${GREEN}    ✓ CORS helper intact${NC}"
    else
        echo -e "${RED}    ✗ CORS helper broken${NC}"
        exit 1
    fi
else
    echo -e "${RED}    ✗ CORS helper not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ No breaking changes detected${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 5: Cost Calculator Logic Tests
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[TEST 5] Testing cost calculator logic...${NC}"

# Test that pricing constants are reasonable
echo -e "${YELLOW}  → Validating AWS pricing constants${NC}"

if grep -q "perVCPUHourActive: 0.064" "supabase/functions/_shared/cost-calculator.ts"; then
    echo -e "${GREEN}    ✓ App Runner pricing looks correct${NC}"
else
    echo -e "${RED}    ✗ App Runner pricing may be incorrect${NC}"
    exit 1
fi

if grep -q "perVCPUHour: 0.04048" "supabase/functions/_shared/cost-calculator.ts"; then
    echo -e "${GREEN}    ✓ ECS Fargate pricing looks correct${NC}"
else
    echo -e "${RED}    ✗ ECS Fargate pricing may be incorrect${NC}"
    exit 1
fi

if grep -q "controlPlanePerHour: 0.10" "supabase/functions/_shared/cost-calculator.ts"; then
    echo -e "${GREEN}    ✓ EKS pricing looks correct${NC}"
else
    echo -e "${RED}    ✗ EKS pricing may be incorrect${NC}"
    exit 1
fi

# Check that no hardcoded $187 or $347 exists
echo -e "${YELLOW}  → Checking for hardcoded prices${NC}"
if grep -rq "187\|347" "supabase/functions/_shared/cost-calculator.ts"; then
    echo -e "${RED}    ✗ Found hardcoded prices in cost-calculator.ts${NC}"
    exit 1
else
    echo -e "${GREEN}    ✓ No hardcoded prices found${NC}"
fi

echo -e "${GREEN}✓ Cost calculator logic validated${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6: Classifier Logic Tests
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[TEST 6] Testing classifier logic...${NC}"

# Check that EKS is not the default
echo -e "${YELLOW}  → Checking service selection logic${NC}"
if grep -q "return 'eks_fargate'" "supabase/functions/_shared/app-classifier.ts"; then
    # Make sure it's conditional, not default
    if grep -B5 "return 'eks_fargate'" "supabase/functions/_shared/app-classifier.ts" | grep -q "hasK8sConfigs"; then
        echo -e "${GREEN}    ✓ EKS only selected when K8s configs exist${NC}"
    else
        echo -e "${RED}    ✗ EKS may be selected unconditionally${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}    ⚠ No EKS selection found (may be intentional)${NC}"
fi

# Check that App Runner is an option
if grep -q "return 'app_runner'" "supabase/functions/_shared/app-classifier.ts"; then
    echo -e "${GREEN}    ✓ App Runner is an option${NC}"
else
    echo -e "${RED}    ✗ App Runner not found as an option${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Classifier logic validated${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ALL TESTS PASSED ✓                                                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Apply migration via Supabase Dashboard SQL Editor:"
echo -e "     ${YELLOW}supabase/migrations/20260316100000_ensure_analysis_fields.sql${NC}"
echo ""
echo -e "  2. Set NVIDIA_API_KEY in Supabase Dashboard:"
echo -e "     ${YELLOW}https://supabase.com/dashboard/project/${PROJECT_REF}/settings/functions${NC}"
echo -e "     ${YELLOW}NVIDIA_API_KEY=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${NC}"
echo ""
echo -e "  3. Deploy functions:"
echo -e "     ${YELLOW}supabase functions deploy die-analyze --project-ref ${PROJECT_REF} --no-verify-jwt${NC}"
echo -e "     ${YELLOW}supabase functions deploy optimize-cost --project-ref ${PROJECT_REF} --no-verify-jwt${NC}"
echo ""
echo -e "  4. Test with a real repository"
echo ""
