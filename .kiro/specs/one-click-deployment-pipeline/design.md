# Design Document

## Overview

The one-click deployment pipeline is a sophisticated, multi-agent system that transforms GitHub repositories into live, production-ready applications on AWS infrastructure. The system consists of 10 specialized components working in concert: a database layer for state persistence, an AWS credential manager for secure multi-tenant operations, a Dockerfile generator for containerization, an ECR/CodeBuild setup agent, a build orchestrator with real-time log streaming, infrastructure provisioners for App Runner and ECS Fargate, a health validator, a real-time progress broadcaster, and error detection with rollback capabilities.

The architecture follows event-driven patterns with Supabase Realtime CDC enabling live UI updates, asynchronous processing via EdgeRuntime.waitUntil for long-running operations, and comprehensive resource tracking for teardown and cost management. Every AWS resource is tagged for traceability, every stage transition is logged for observability, and every deployment is validated before marking as successful.

Target performance: 8 minutes for simple Node.js apps on App Runner, 12 minutes for production apps on ECS Fargate, with real-time log streaming maintaining <5 second latency throughout the entire pipeline.

## Architecture

### System Components

1. **Deployment Orchestrator** (`deploy/index.ts`)
   - Entry point for all deployments
   - Creates deployment record and returns ID within 3 seconds
   - Coordinates agent execution sequence asynchronously
   - Handles top-level error catching and failure reporting

2. **AWS Credential Manager** (`_shared/aws-client.ts`)
   - Assumes organization-specific IAM roles via STS
   - Caches credentials in Redis (55-minute TTL)
   - Provides credential refresh logic
   - Shared by all AWS-touching components

3. **Dockerfile Generator** (`_shared/dockerfile-generator.ts`)
   - Generates production-grade, multi-stage Dockerfiles
   - Language-specific optimizations (Node.js, Python, Go, Java)
   - Security hardening (non-root users, minimal images)
   - Health check integration

4. **Build Pipeline Setup Agent** (`setup-build-pipeline/index.ts`)
   - Creates/reuses ECR repositories
   - Creates/reuses CodeBuild projects
   - Manages IAM roles for CodeBuild
   - Embeds Dockerfile in buildspec

5. **Build Orchestrator** (`run-build/index.ts`)
   - Starts CodeBuild jobs
   - Streams CloudWatch logs to database
   - Classifies log lines by severity
   - Triggers infrastructure provisioning on success
   - Analyzes errors on failure

6. **App Runner Provisioner** (`provision-infrastructure/index.ts` - App Runner path)
   - Creates App Runner services
   - Configures auto-scaling and auto-deployment
   - Polls for service readiness
   - Extracts service URL

7. **ECS Fargate Provisioner** (`provision-infrastructure/index.ts` - ECS path)
   - Creates VPC, subnets, IGW, route tables
   - Creates security groups with least-privilege rules
   - Creates ALB with target groups
   - Creates ECS cluster, task definition, service
   - Polls for task health

8. **Health Validator** (`_shared/health-checker.ts`)
   - Performs HTTP health checks with retries
   - Validates both /health and root paths
   - Measures response times
   - Marks deployment as active on success
   - Provides actionable error messages on failure

9. **Real-Time Progress Tracker** (Frontend: `DeploymentProgressView.jsx`)
   - Subscribes to Supabase Realtime CDC
   - Displays stage progress with visual indicators
   - Streams build logs in terminal UI
   - Shows success/error states
   - Provides clickable live URLs

10. **Resource Tracker & Rollback Manager** (`_shared/aws-client.ts` + rollback logic)
    - Tags all AWS resources consistently
    - Tracks resources in infra_resources table
    - Performs rollback on failure
    - Supports manual teardown

### Data Flow

```
User clicks Deploy
    ↓
Deployment Orchestrator creates deployment record (3s)
    ↓
Frontend subscribes to Realtime (deployment_id)
    ↓
[ASYNC] Dockerfile Generator creates Dockerfile from classification
    ↓
[ASYNC] Build Pipeline Setup creates ECR + CodeBuild (60-90s)
    ↓
[ASYNC] Build Orchestrator starts CodeBuild job
    ↓
[ASYNC] Log Streamer polls CloudWatch every 5s → inserts to build_log_entries
    ↓
Frontend receives log entries via Realtime CDC → displays in terminal
    ↓
[ASYNC] Build completes (2-4 minutes)
    ↓
[ASYNC] Infrastructure Provisioner creates App Runner OR ECS (3-6 minutes)
    ↓
[ASYNC] Provisioner polls for service readiness every 15-20s
    ↓
[ASYNC] Health Validator checks /health endpoint (up to 2 minutes)
    ↓
Deployment marked as active, live_url set
    ↓
Frontend receives stage update via Realtime → shows success state
```

### Communication Patterns

1. **Synchronous HTTP** (User → Orchestrator)
   - User clicks deploy → POST to /deploy
   - Returns deployment_id within 3 seconds
   - All subsequent work is async

2. **Asynchronous Function Invocation** (Orchestrator → Agents)
   - Uses EdgeRuntime.waitUntil for long-running work
   - Agents communicate via database state updates
   - No direct agent-to-agent calls

3. **Database-Driven State Machine** (All Agents → Database)
   - Every stage transition updates deployments.current_stage
   - Every log line inserts to build_log_entries
   - Every resource creation inserts to infra_resources

4. **Real-Time CDC Broadcast** (Database → Frontend)
   - Supabase Realtime broadcasts INSERT/UPDATE events
   - Frontend subscribes to deployment_id-specific channels
   - <2 second latency for stage updates
   - <5 second latency for log entries

5. **AWS API Polling** (Agents → AWS)
   - CodeBuild status: poll every 5 seconds
   - CloudWatch logs: poll every 5 seconds
   - App Runner status: poll every 15 seconds
   - ECS service status: poll every 20 seconds

## Components and Interfaces

### 1. Database Schema

**deployments table extensions:**
```sql
current_stage TEXT DEFAULT 'queued'
stage_started_at TIMESTAMPTZ
build_logs JSONB DEFAULT '[]'
error_analysis JSONB
live_url TEXT
ecr_repository_uri TEXT
image_tag TEXT
infra_type TEXT  -- app_runner | ecs_fargate | eks_fargate
app_runner_service_arn TEXT
ecs_cluster_arn TEXT
ecs_service_arn TEXT
alb_arn TEXT
alb_dns_name TEXT
vpc_id TEXT
subnet_ids JSONB DEFAULT '[]'
security_group_id TEXT
codebuild_project_name TEXT
codebuild_build_id TEXT
health_check_path TEXT DEFAULT '/health'
retry_count INT DEFAULT 0
rollback_available BOOLEAN DEFAULT FALSE
previous_image_tag TEXT
auto_deploy_on_push BOOLEAN DEFAULT TRUE
```

**build_log_entries table:**
```sql
id BIGSERIAL PRIMARY KEY
deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE
timestamp TIMESTAMPTZ DEFAULT NOW()
level TEXT NOT NULL DEFAULT 'info'  -- info | warn | error | success | step
text TEXT NOT NULL
source TEXT DEFAULT 'codebuild'  -- codebuild | autostack | k8s
```

**infra_resources table:**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE
org_id UUID REFERENCES organizations(id) ON DELETE CASCADE
provider TEXT NOT NULL DEFAULT 'aws'
resource_type TEXT NOT NULL  -- vpc | subnet | security_group | ecr | codebuild | app_runner | ecs_cluster | ecs_service | alb | nat_gateway | eip | igw
resource_id TEXT NOT NULL
resource_arn TEXT
region TEXT NOT NULL
created_at TIMESTAMPTZ DEFAULT NOW()
deleted_at TIMESTAMPTZ
deletion_status TEXT DEFAULT 'active'  -- active | deleting | deleted | failed
```

### 2. AWS Credential Manager Interface

```typescript
interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  region: string
}

async function getOrgAWSCredentials(
  orgId: string,
  redis: RedisClient,
  supabaseServiceClient: SupabaseClient
): Promise<AWSCredentials>

async function trackResource(
  supabase: SupabaseClient,
  deploymentId: string,
  orgId: string,
  resourceType: string,
  resourceId: string,
  resourceArn: string | null,
  region: string
): Promise<void>

async function setStage(
  supabase: SupabaseClient,
  deploymentId: string,
  stage: string,
  extraData?: Record<string, any>
): Promise<void>

async function appendLog(
  supabase: SupabaseClient,
  deploymentId: string,
  text: string,
  level: 'info' | 'warn' | 'error' | 'success' | 'step'
): Promise<void>
```

### 3. Dockerfile Generator Interface

```typescript
interface AppClassification {
  language: string  // Node.js | Python | Go | Java
  framework: string  // Express | FastAPI | Gin | Spring Boot
  appType: string  // api | static-site | server-rendered
  port: number
  healthCheckPath: string
  estimatedMemory: number
  estimatedCPU: number
  buildCommands: BuildCommands
}

interface BuildCommands {
  install?: string
  build?: string
  start: string
  nodeVersion?: string
  pythonVersion?: string
  goVersion?: string
}

function generateDockerfile(
  classification: AppClassification,
  commands: BuildCommands
): string
```

### 4. Build Pipeline Setup Interface

```typescript
interface SetupBuildPipelineRequest {
  deployment_id: string
  classification: AppClassification
  dockerfile_content: string
  github_repo_url: string
  branch: string
}

interface SetupBuildPipelineResponse {
  success: boolean
  ecr_repository_uri: string
  codebuild_project_name: string
}

// Internal functions
function generateBuildSpec(
  repositoryUri: string,
  port: number,
  dockerfileContent: string
): string

function getComputeType(classification: AppClassification): string

function sanitizeAppName(name: string): string
```

### 5. Build Orchestrator Interface

```typescript
interface RunBuildRequest {
  deployment_id: string
  branch: string
}

interface RunBuildResponse {
  success: boolean
  build_id: string
  message: string
}

// Internal functions
async function streamBuildLogs(
  buildId: string,
  deploymentId: string,
  orgId: string,
  awsCreds: AWSCredentials,
  region: string,
  supabase: SupabaseClient
): Promise<void>

function classifyLogLine(message: string): 'info' | 'warn' | 'error' | 'success' | 'step'

async function handleBuildFailure(
  deploymentId: string,
  buildId: string,
  awsCreds: AWSCredentials,
  region: string,
  supabase: SupabaseClient
): Promise<void>
```

### 6. Infrastructure Provisioner Interface

```typescript
interface ProvisionInfrastructureRequest {
  deployment_id: string
  image_tag: string
}

interface ProvisionInfrastructureResponse {
  success: boolean
}

// Internal functions
async function provisionAppRunner(
  deployment: Deployment,
  imageUri: string,
  awsCreds: AWSCredentials,
  region: string,
  supabase: SupabaseClient
): Promise<void>

async function provisionECSFargate(
  deployment: Deployment,
  imageUri: string,
  awsCreds: AWSCredentials,
  region: string,
  supabase: SupabaseClient
): Promise<void>

async function pollAppRunnerStatus(
  serviceArn: string,
  deploymentId: string,
  awsCreds: AWSCredentials,
  region: string,
  supabase: SupabaseClient
): Promise<void>

async function pollECSServiceStatus(
  clusterArn: string,
  serviceArn: string,
  albDns: string,
  deploymentId: string,
  awsCreds: AWSCredentials,
  region: string,
  supabase: SupabaseClient
): Promise<void>

function getCPUForMillicores(millicores: number): number
function getMemoryForMB(mb: number): number
```

### 7. Health Validator Interface

```typescript
interface HealthCheckResult {
  success: boolean
  live_url?: string
  error?: string
}

async function runHealthChecks(
  baseUrl: string,
  deploymentId: string,
  supabase: SupabaseClient
): Promise<HealthCheckResult>
```

### 8. Frontend Real-Time Subscriber Interface

```typescript
interface DeploymentProgressViewProps {
  deploymentId: string
  onComplete?: (liveUrl: string) => void
}

interface BuildLogEntry {
  id: number
  deployment_id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success' | 'step'
  text: string
  source: string
}

interface ErrorAnalysis {
  category: string
  title: string
  explanation: string
  exactError?: string
  suggestedFix: string
  estimatedFixTime: string
  autoFixAvailable: boolean
  autoFixAction?: string
  autoFixDescription?: string
}
```

## Data Models

### Deployment State Machine

```
States:
  queued → analyzing → cost_selection → provisioning_infra → 
  building_image → pushing_image → deploying → health_checking → 
  active | failed | rolling_back → rolled_back

Transitions:
  queued → analyzing: Orchestrator starts pipeline
  analyzing → cost_selection: Analysis complete, awaiting user selection
  cost_selection → provisioning_infra: User selects infrastructure tier
  provisioning_infra → building_image: ECR + CodeBuild setup complete
  building_image → pushing_image: Docker build complete
  pushing_image → deploying: Image pushed to ECR
  deploying → health_checking: Infrastructure provisioned
  health_checking → active: Health checks pass
  health_checking → failed: Health checks fail after retries
  building_image → failed: Build fails
  deploying → failed: Infrastructure provisioning fails
  failed → rolling_back: Rollback initiated
  rolling_back → rolled_back: All resources deleted
```

### Build Log Classification

```
Patterns:
  error: /^(error|err:|fatal|failed|exception|traceback)/i
  warn: /^(warning|warn:)/i
  success: /^(successfully|✓|step \d+\/\d+.*done|complete|pushed|built)/i
  step: /^step \d+\/\d+/i
  info: default

Examples:
  "Step 1/10 : FROM node:20-alpine" → step
  "Successfully built 8a3f2b1c9d4e" → success
  "ERROR: failed to solve: process exited with code 1" → error
  "warning: package.json has no license field" → warn
  "Logging in to ECR..." → info
```

### Resource Type Mapping

```
ECR Repository:
  resource_type: 'ecr'
  resource_id: repository name (e.g., 'autostack/my-app')
  resource_arn: repository ARN

CodeBuild Project:
  resource_type: 'codebuild'
  resource_id: project name
  resource_arn: null (CodeBuild projects don't have ARNs)

App Runner Service:
  resource_type: 'app_runner'
  resource_id: service ARN
  resource_arn: service ARN

VPC:
  resource_type: 'vpc'
  resource_id: vpc-xxxxx
  resource_arn: null

Subnet:
  resource_type: 'subnet'
  resource_id: subnet-xxxxx
  resource_arn: null

Security Group:
  resource_type: 'security_group'
  resource_id: sg-xxxxx
  resource_arn: null

ALB:
  resource_type: 'alb'
  resource_id: ALB ARN
  resource_arn: ALB ARN

ECS Cluster:
  resource_type: 'ecs_cluster'
  resource_id: cluster ARN
  resource_arn: cluster ARN

ECS Service:
  resource_type: 'ecs_service'
  resource_id: service ARN
  resource_arn: service ARN

Internet Gateway:
  resource_type: 'igw'
  resource_id: igw-xxxxx
  resource_arn: null
```
