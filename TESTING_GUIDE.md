# Testing Guide - One-Click Deployment Pipeline

## Quick Test Commands

### 1. Test Build Pipeline Only
Tests ECR, IAM, and CodeBuild setup:
```bash
./test-build-pipeline-only.sh
```

Expected output:
- ✓ ECR repository created
- ✓ IAM role configured
- ✓ CodeBuild project created

### 2. Test Full Deployment (E2E)
Tests complete pipeline including App Runner:
```bash
./test-e2e-deployment.sh
```

Expected output:
- ✓ All build pipeline steps
- ✓ Docker build completes
- ✓ App Runner service created
- ✓ Health checks pass
- ✓ Live URL provided

## Manual Testing Steps

### Step 1: Verify AWS Credentials
```bash
# Check Supabase secrets
curl -s "https://prrmrukwmrjkdxcyzovd.supabase.co/rest/v1/rpc/get_secret" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"secret_name": "AWS_ACCESS_KEY_ID"}'
```

### Step 2: Test Individual Functions

#### Test setup-build-pipeline
```bash
curl -X POST "https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/setup-build-pipeline" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_id": "test-deployment-id",
    "org_id": "00000000-0000-0000-0000-000000000001",
    "classification": {
      "language": "JavaScript",
      "framework": "Express",
      "port": 3000,
      "estimatedMemory": 512
    },
    "dockerfile_content": "FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nEXPOSE 3000\nCMD [\"npm\", \"start\"]",
    "github_repo_url": "https://github.com/user/repo",
    "branch": "main"
  }'
```

#### Test run-build
```bash
curl -X POST "https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/run-build" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_id": "test-deployment-id",
    "branch": "main"
  }'
```

#### Test provision-infrastructure
```bash
curl -X POST "https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/provision-infrastructure" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_id": "test-deployment-id",
    "image_tag": "latest"
  }'
```

### Step 3: Verify in AWS Console

#### ECR Repositories
https://console.aws.amazon.com/ecr/repositories?region=us-east-1

Look for: `autostack/*` repositories

#### IAM Roles
https://console.aws.amazon.com/iam/home#/roles

Look for:
- `AutoStackCodeBuildRole`
- `AutoStackAppRunnerAccessRole`

#### CodeBuild Projects
https://console.aws.amazon.com/codebuild/home?region=us-east-1

Look for: `autostack-*` projects

#### App Runner Services
https://console.aws.amazon.com/apprunner/home?region=us-east-1

Look for: `autostack-*` services

## Troubleshooting

### 502 Bad Gateway Errors
- Check function bundle sizes (should be <100kB)
- Verify no AWS SDK imports
- Check Supabase function logs

### AWS Permission Errors
- Verify IAM role trust policy
- Check AWS credentials in Supabase secrets
- Ensure role has required policies

### Build Failures
- Check CodeBuild logs in AWS Console
- Verify Dockerfile syntax
- Ensure GitHub repository is accessible

### App Runner Failures
- Check App Runner service logs
- Verify ECR image exists
- Ensure health endpoint returns 200

## Monitoring

### View Deployment Logs
```bash
curl -s "https://prrmrukwmrjkdxcyzovd.supabase.co/rest/v1/build_log_entries?deployment_id=eq.DEPLOYMENT_ID&order=timestamp.asc" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" | jq -r '.[] | "\(.timestamp) [\(.level)] \(.text)"'
```

### Check Deployment Status
```bash
curl -s "https://prrmrukwmrjkdxcyzovd.supabase.co/rest/v1/deployments?id=eq.DEPLOYMENT_ID" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" | jq '.[0] | {current_stage, status, live_url}'
```

## Success Criteria

A successful deployment should:
1. Create ECR repository
2. Create IAM roles
3. Create CodeBuild project
4. Build Docker image
5. Push image to ECR
6. Create App Runner service
7. Pass health checks
8. Return live URL

Total time: ~7-10 minutes
