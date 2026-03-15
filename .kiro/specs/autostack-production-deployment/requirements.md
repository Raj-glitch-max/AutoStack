# AutoStack Production Deployment Specification

## Overview
Deploy the complete AutoStack platform to production following the Ultimate Production Readiness Prompt. This spec covers system setup, database verification, Edge Function deployment, AWS infrastructure, auth system, frontend build, and E2E testing.

## User Stories

### US-1: System Setup and Tool Installation
**As a** deployment engineer  
**I want** all required CLI tools installed and configured  
**So that** I can execute deployment commands

**Acceptance Criteria:**
1.1. Supabase CLI v1.200.3+ is installed and accessible  
1.2. GitHub CLI (gh) is installed and authenticated  
1.3. AWS CLI is configured with valid credentials  
1.4. jq, curl, and node are available  
1.5. All credentials are stored in `/tmp/autostack-env.sh` and can be sourced

### US-2: Database Schema Verification
**As a** deployment engineer  
**I want** to verify all database tables, RLS policies, and functions exist  
**So that** the application has a complete data layer

**Acceptance Criteria:**
2.1. All 30+ required tables exist in the database  
2.2. Row Level Security (RLS) is enabled on all tables  
2.3. `auth.org_id()` function exists and returns UUID  
2.4. pgvector extension is installed for AIRE  
2.5. pg_cron extension is installed with all scheduled jobs  
2.6. incident_patterns table has >= 10 seeded patterns  
2.7. Performance indexes exist on all time-series tables

### US-3: Edge Function Deployment
**As a** deployment engineer  
**I want** all Edge Functions deployed with correct CORS and auth patterns  
**So that** the API layer is fully functional

**Acceptance Criteria:**
3.1. All 23+ Edge Functions have CORS OPTIONS handlers  
3.2. All functions include Authorization header checks (except webhooks)  
3.3. auth-hook function creates organizations on signup  
3.4. aws-assume-role function validates IAM permissions  
3.5. All functions respond with HTTP 200 to OPTIONS requests  
3.6. Shared utilities (_shared/) are present and correct  
3.7. All function secrets are set in Supabase

### US-4: AWS Infrastructure Setup
**As a** deployment engineer  
**I want** AWS IAM role created with correct permissions  
**So that** AutoStack can provision infrastructure

**Acceptance Criteria:**
4.1. AutoStackDeploymentRole exists in AWS IAM  
4.2. Role has trust policy allowing same-account assumption  
4.3. Role has all required managed policies attached  
4.4. Role can be assumed with ExternalId parameter  
4.5. Temporary credentials from AssumeRole work correctly

### US-5: Auth System Verification
**As a** deployment engineer  
**I want** auth hook registered and tested  
**So that** user signups create organizations automatically

**Acceptance Criteria:**
5.1. auth-hook is registered in Supabase Dashboard  
5.2. Test signup creates user with org_id in user_metadata  
5.3. Organization record is created in database  
5.4. org_members record links user to organization  
5.5. Trial subscription is created for new organization  
5.6. RLS isolation prevents cross-org data access

### US-6: Frontend Build Verification
**As a** deployment engineer  
**I want** frontend to build successfully  
**So that** the UI can be deployed

**Acceptance Criteria:**
6.1. `.env.local` file exists with all required variables  
6.2. `npm install` completes without errors  
6.3. `npm run build` produces dist/ directory  
6.4. No bundle exceeds 500KB  
6.5. TypeScript compilation has zero errors

### US-7: Test Repository Creation
**As a** deployment engineer  
**I want** a test GitHub repository created  
**So that** E2E deployment can be tested

**Acceptance Criteria:**
7.1. Repository `autostack-e2e-test` exists on GitHub  
7.2. Repository contains Node.js HTTP server  
7.3. Server has /health and /metrics endpoints  
7.4. package.json specifies Node.js >= 20  
7.5. Repository is public and accessible

### US-8: End-to-End Deployment Test
**As a** deployment engineer  
**I want** to deploy the test app to AWS via AutoStack  
**So that** I can verify the complete deployment pipeline works

**Acceptance Criteria:**
8.1. AWS credentials are verified via aws-assume-role function  
8.2. Project is created in database  
8.3. DIE analysis detects Node.js and generates infrastructure plan  
8.4. Infrastructure provisioning completes in < 20 minutes  
8.5. Live URL is returned and responds with HTTP 200  
8.6. /health endpoint returns valid JSON  
8.7. All AWS resources are tagged with autostack:project_id  
8.8. Infrastructure teardown removes all resources

## Non-Functional Requirements

### NFR-1: Security
- No credentials stored in database (only role ARNs)
- All API endpoints require authentication
- RLS policies enforce org-level isolation
- ExternalId prevents confused deputy attacks

### NFR-2: Performance
- Edge Functions respond in < 500ms
- Database queries use indexes (no seq scans)
- Frontend bundle size < 2MB total
- Infrastructure provisioning < 20 minutes

### NFR-3: Reliability
- All functions have try-catch error handling
- CORS headers on all responses
- Idempotent operations (can retry safely)
- Graceful degradation if external services fail

### NFR-4: Observability
- All operations logged to infrastructure_events
- Audit log captures all user actions
- Error responses include structured error codes
- pg_cron jobs run on schedule

## Out of Scope
- Multi-cloud deployment (GCP/Azure)
- On-premise installation
- Stripe billing integration (optional)
- External penetration testing
- SOC2 compliance evidence collection

## Dependencies
- Supabase project: prrmrukwmrjkdxcyzovd
- AWS Account: 367749063363
- GitHub App ID: 3089423
- All API keys from user

## Success Criteria
1. All 8 user stories pass acceptance criteria
2. E2E test deploys app and returns live URL
3. Zero manual steps required after initial setup
4. All AWS resources cleaned up after test
5. Documentation updated with deployment results
