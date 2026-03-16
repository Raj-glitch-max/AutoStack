#!/bin/bash
# End-to-End Deployment Test
# Tests the complete pipeline from repo URL to live URL

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  AutoStack E2E Deployment Test - Real AWS Operations          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
SUPABASE_URL="https://prrmrukwmrjkdxcyzovd.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k"

# Test configuration
TEST_REPO="https://github.com/Raj-glitch-max/AutoStack"
TEST_BRANCH="main"
ORG_ID="test-org-$(date +%s)"
DEPLOYMENT_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

echo "Test Configuration:"
echo "  Repository: $TEST_REPO"
echo "  Branch: $TEST_BRANCH"
echo "  Deployment ID: $DEPLOYMENT_ID"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_step() {
    echo -e "${GREEN}▶${NC} $1"
}

log_info() {
    echo "  $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Step 1: Analyze repository
log_step "Step 1: Analyzing repository..."

ANALYSIS=$(curl -s -X POST "$SUPABASE_URL/functions/v1/die-analyze" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"repo_url\": \"$TEST_REPO\",
    \"branch\": \"$TEST_BRANCH\"
  }")

if echo "$ANALYSIS" | grep -q '"success":true'; then
    log_success "Repository analyzed"
    LANGUAGE=$(echo "$ANALYSIS" | grep -o '"language":"[^"]*"' | cut -d'"' -f4)
    FRAMEWORK=$(echo "$ANALYSIS" | grep -o '"framework":"[^"]*"' | cut -d'"' -f4)
    log_info "Detected: $LANGUAGE - $FRAMEWORK"
else
    log_error "Analysis failed"
    echo "$ANALYSIS"
    exit 1
fi

# Step 2: Get cost options
log_step "Step 2: Getting infrastructure options..."

COST_OPTIONS=$(curl -s -X POST "$SUPABASE_URL/functions/v1/optimize-cost" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"classification\": $(echo "$ANALYSIS" | jq '.classification'),
    \"repo_url\": \"$TEST_REPO\"
  }")

if echo "$COST_OPTIONS" | grep -q '"success":true'; then
    log_success "Cost options generated"
    OPTION_COUNT=$(echo "$COST_OPTIONS" | jq '.options | length')
    log_info "Generated $OPTION_COUNT infrastructure options"
else
    log_error "Cost optimization failed"
    echo "$COST_OPTIONS"
    exit 1
fi

# Step 3: Create deployment record
log_step "Step 3: Creating deployment record..."

# Note: In real scenario, this would be done by the frontend/API
# For testing, we'll create a minimal deployment record
echo "  (Skipping - would be created by frontend in real flow)"

# Step 4: Setup build pipeline
log_step "Step 4: Setting up build pipeline (ECR + CodeBuild)..."

CLASSIFICATION=$(echo "$ANALYSIS" | jq '.classification')
DOCKERFILE=$(cat <<'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
ENV PORT=8080
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "index.js"]
EOF
)

BUILD_SETUP=$(curl -s -X POST "$SUPABASE_URL/functions/v1/setup-build-pipeline" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"deployment_id\": \"$DEPLOYMENT_ID\",
    \"org_id\": \"$ORG_ID\",
    \"classification\": $CLASSIFICATION,
    \"dockerfile_content\": $(echo "$DOCKERFILE" | jq -Rs .),
    \"github_repo_url\": \"$TEST_REPO\",
    \"branch\": \"$TEST_BRANCH\"
  }")

if echo "$BUILD_SETUP" | grep -q '"success":true'; then
    log_success "Build pipeline created"
    ECR_URI=$(echo "$BUILD_SETUP" | jq -r '.ecr_repository_uri')
    CODEBUILD_PROJECT=$(echo "$BUILD_SETUP" | jq -r '.codebuild_project_name')
    log_info "ECR: $ECR_URI"
    log_info "CodeBuild: $CODEBUILD_PROJECT"
else
    log_error "Build pipeline setup failed"
    echo "$BUILD_SETUP"
    exit 1
fi

# Step 5: Start build
log_step "Step 5: Starting Docker image build..."

BUILD_START=$(curl -s -X POST "$SUPABASE_URL/functions/v1/run-build" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"deployment_id\": \"$DEPLOYMENT_ID\",
    \"branch\": \"$TEST_BRANCH\"
  }")

if echo "$BUILD_START" | grep -q '"success":true'; then
    log_success "Build started"
    BUILD_ID=$(echo "$BUILD_START" | jq -r '.build_id')
    log_info "Build ID: $BUILD_ID"
else
    log_error "Build start failed"
    echo "$BUILD_START"
    exit 1
fi

# Step 6: Monitor deployment progress
log_step "Step 6: Monitoring deployment progress..."
log_info "Polling deployment status every 10 seconds..."
log_info "(This will take 5-10 minutes for a real deployment)"
echo ""

MAX_WAIT=600  # 10 minutes
ELAPSED=0
LAST_STAGE=""

while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 10
    ELAPSED=$((ELAPSED + 10))
    
    # Check deployment status
    STATUS=$(curl -s "$SUPABASE_URL/rest/v1/deployments?id=eq.$DEPLOYMENT_ID&select=current_stage,live_url,status" \
      -H "apikey: $SUPABASE_SERVICE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")
    
    CURRENT_STAGE=$(echo "$STATUS" | jq -r '.[0].current_stage // "unknown"')
    LIVE_URL=$(echo "$STATUS" | jq -r '.[0].live_url // ""')
    DEPLOY_STATUS=$(echo "$STATUS" | jq -r '.[0].status // "unknown"')
    
    if [ "$CURRENT_STAGE" != "$LAST_STAGE" ]; then
        echo -e "  ${YELLOW}Stage:${NC} $CURRENT_STAGE (${ELAPSED}s elapsed)"
        LAST_STAGE="$CURRENT_STAGE"
    fi
    
    # Check for completion
    if [ "$CURRENT_STAGE" = "active" ]; then
        echo ""
        log_success "Deployment complete!"
        log_info "Live URL: $LIVE_URL"
        log_info "Status: $DEPLOY_STATUS"
        log_info "Total time: ${ELAPSED}s"
        
        # Step 7: Verify live URL
        echo ""
        log_step "Step 7: Verifying live URL..."
        
        sleep 5  # Give it a moment
        
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$LIVE_URL/health" || echo "000")
        
        if [ "$HTTP_CODE" = "200" ]; then
            log_success "Health check passed (HTTP $HTTP_CODE)"
            
            # Try root path
            ROOT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$LIVE_URL" || echo "000")
            log_info "Root path: HTTP $ROOT_CODE"
            
            echo ""
            echo "╔════════════════════════════════════════════════════════════════╗"
            echo "║                    E2E TEST PASSED ✓                           ║"
            echo "╚════════════════════════════════════════════════════════════════╝"
            echo ""
            echo "Summary:"
            echo "  • Repository analyzed: ✓"
            echo "  • Build pipeline created: ✓"
            echo "  • Docker image built: ✓"
            echo "  • Infrastructure provisioned: ✓"
            echo "  • Health checks passed: ✓"
            echo "  • Live URL accessible: ✓"
            echo ""
            echo "Live URL: $LIVE_URL"
            echo "Total time: ${ELAPSED}s (~$((ELAPSED / 60)) minutes)"
            echo ""
            exit 0
        else
            log_error "Health check failed (HTTP $HTTP_CODE)"
            exit 1
        fi
    fi
    
    if [ "$CURRENT_STAGE" = "failed" ]; then
        echo ""
        log_error "Deployment failed"
        
        # Fetch error details
        ERROR=$(curl -s "$SUPABASE_URL/rest/v1/deployments?id=eq.$DEPLOYMENT_ID&select=error_analysis" \
          -H "apikey: $SUPABASE_SERVICE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")
        
        echo "$ERROR" | jq '.[0].error_analysis'
        exit 1
    fi
done

log_error "Timeout waiting for deployment (${MAX_WAIT}s)"
log_info "Last known stage: $CURRENT_STAGE"
exit 1
