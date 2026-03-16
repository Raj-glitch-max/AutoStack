# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — ONE-CLICK DEPLOYMENT: COMPLETE IMPLEMENTATION                 ║
# ║   Build Pipeline + Real Infrastructure + Real-Time Progress + Validation    ║
# ║   Target: User clicks deploy → live HTTPS URL in 3-22 minutes              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# WHAT IS CONFIRMED WORKING (DO NOT TOUCH)
# =========================================
# ✅ Repo analysis: 12 seconds, detects language/framework
# ✅ Cost options: 3 tiers with real AWS pricing
# ✅ AWS credential verification: aws-assume-role works
# ✅ GitHub App: reads repo files, can create PRs
#
# WHAT WE ARE BUILDING NOW (IN ORDER)
# =====================================
# 1. Dockerfile generation + ECR repository setup
# 2. AWS CodeBuild project (actual Docker image building)
# 3. Infrastructure provisioning:
#    - App Runner (for micro/simple apps) — 3 minutes
#    - ECS Fargate + ALB (for standard/production apps) — 6 minutes
#    - EKS only if repo has k8s/ configs — 18 minutes
# 4. Real-time progress streaming via Supabase Realtime
# 5. Health checks + smoke tests
# 6. Error detection + auto-retry + user-facing error cards
# 7. Rollback on failure
#
# ABSOLUTE RULES (VIOLATIONS MEAN THE WORK IS REJECTED)
# ======================================================
# RULE 1: Every AWS API call uses the org's assumed IAM role, NEVER autostack's own credentials
# RULE 2: Every resource tagged: { autostack:deployment: deployment_id, autostack:org: org_id }
# RULE 3: Every stage writes progress to DB → frontend receives via Realtime → user sees real updates
# RULE 4: No fake progress. If we don't know the real status: say "waiting..." not "complete"
# RULE 5: Teardown must work. Every resource created must be destroy-able via tag scan
# RULE 6: If provisioning fails mid-way: rollback EVERYTHING, leave user's AWS clean
# RULE 7: App Runner for simple apps. ECS for medium. EKS ONLY for k8s-configured repos
# RULE 8: The live_url must return HTTP 200 before marking deployment as success
# RULE 9: Build logs stream in real-time. Not after. Not on completion. During.
# RULE 10: One deployment function max 8 seconds execution. Long work → async + Realtime updates

---

# PART 1 — DATABASE SCHEMA ADDITIONS
# Add these to a new migration file: supabase/migrations/006_deployment_pipeline.sql
# ALL migrations must be idempotent (safe to run twice — use IF NOT EXISTS)

```sql
-- Deployment pipeline stages tracking
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS build_logs JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS error_analysis JSONB,
  ADD COLUMN IF NOT EXISTS live_url TEXT,
  ADD COLUMN IF NOT EXISTS ecr_repository_uri TEXT,
  ADD COLUMN IF NOT EXISTS image_tag TEXT,
  ADD COLUMN IF NOT EXISTS infra_type TEXT, -- app_runner | ecs_fargate | eks_fargate
  ADD COLUMN IF NOT EXISTS app_runner_service_arn TEXT,
  ADD COLUMN IF NOT EXISTS ecs_cluster_arn TEXT,
  ADD COLUMN IF NOT EXISTS ecs_service_arn TEXT,
  ADD COLUMN IF NOT EXISTS alb_arn TEXT,
  ADD COLUMN IF NOT EXISTS alb_dns_name TEXT,
  ADD COLUMN IF NOT EXISTS vpc_id TEXT,
  ADD COLUMN IF NOT EXISTS subnet_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS security_group_id TEXT,
  ADD COLUMN IF NOT EXISTS codebuild_project_name TEXT,
  ADD COLUMN IF NOT EXISTS codebuild_build_id TEXT,
  ADD COLUMN IF NOT EXISTS health_check_path TEXT DEFAULT '/health',
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rollback_available BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS previous_image_tag TEXT,
  ADD COLUMN IF NOT EXISTS auto_deploy_on_push BOOLEAN DEFAULT TRUE;

-- Valid stage values (for documentation — Postgres TEXT is fine):
-- queued → analyzing → cost_selection → provisioning_infra → building_image
-- → pushing_image → deploying → health_checking → active → failed → rolling_back → rolled_back

-- Build log entries table (separate from JSONB for large logs)
CREATE TABLE IF NOT EXISTS build_log_entries (
  id          BIGSERIAL PRIMARY KEY,
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  timestamp   TIMESTAMPTZ DEFAULT NOW(),
  level       TEXT NOT NULL DEFAULT 'info', -- info | warn | error | success | step
  text        TEXT NOT NULL,
  source      TEXT DEFAULT 'codebuild'  -- codebuild | autostack | k8s
);
CREATE INDEX IF NOT EXISTS idx_build_logs_deployment ON build_log_entries(deployment_id, timestamp);

-- Infrastructure resources registry (for teardown tracking)
CREATE TABLE IF NOT EXISTS infra_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id   UUID REFERENCES deployments(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'aws',
  resource_type   TEXT NOT NULL,  -- vpc | subnet | security_group | ecr | codebuild | app_runner | ecs_cluster | ecs_service | alb | nat_gateway | eip | igw
  resource_id     TEXT NOT NULL,  -- the AWS resource ID/ARN
  resource_arn    TEXT,
  region          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  deletion_status TEXT DEFAULT 'active'  -- active | deleting | deleted | failed
);
CREATE INDEX IF NOT EXISTS idx_infra_resources_deployment ON infra_resources(deployment_id);
CREATE INDEX IF NOT EXISTS idx_infra_resources_org ON infra_resources(org_id, deletion_status);
```

---

# PART 2 — SHARED AWS CLIENT UTILITY
# File: supabase/functions/_shared/aws-client.ts
# This is used by ALL functions that touch AWS. Never duplicate this pattern.

```typescript
import { STSClient, AssumeRoleCommand } from 'https://esm.sh/@aws-sdk/client-sts@3.490.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  region: string
}

// Gets temporary credentials by assuming the org's IAM role
// Credentials are valid for 3600 seconds (1 hour)
// Cache in Redis to avoid repeated STS calls
export async function getOrgAWSCredentials(
  orgId: string,
  redis: any,
  supabaseServiceClient: any
): Promise<AWSCredentials> {

  // Check cache first (avoid STS call on every function invocation)
  const cacheKey = `aws:creds:${orgId}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    const parsed = JSON.parse(cached as string)
    // Check if expiring in < 5 minutes
    if (new Date(parsed.expiration) > new Date(Date.now() + 5 * 60 * 1000)) {
      return parsed.credentials
    }
  }

  // Fetch org's IAM role from DB
  const { data: creds, error } = await supabaseServiceClient
    .from('cloud_credentials')
    .select('role_arn, external_id, region')
    .eq('org_id', orgId)
    .eq('provider', 'aws')
    .single()

  if (error || !creds) {
    throw new Error(`No AWS credentials found for org ${orgId}. Has the user connected their AWS account?`)
  }

  // Assume the role
  const stsClient = new STSClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: Deno.env.get('AUTOSTACK_AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AUTOSTACK_AWS_SECRET_ACCESS_KEY')!,
    }
  })

  const assumed = await stsClient.send(new AssumeRoleCommand({
    RoleArn: creds.role_arn,
    RoleSessionName: `autostack-${Date.now()}`,
    ExternalId: creds.external_id || 'autostack',
    DurationSeconds: 3600,
  }))

  const credentials: AWSCredentials = {
    accessKeyId: assumed.Credentials!.AccessKeyId!,
    secretAccessKey: assumed.Credentials!.SecretAccessKey!,
    sessionToken: assumed.Credentials!.SessionToken!,
    region: creds.region || 'us-east-1',
  }

  // Cache for 55 minutes (5 min buffer before 1h expiry)
  await redis.set(cacheKey, JSON.stringify({
    credentials,
    expiration: assumed.Credentials!.Expiration!.toISOString()
  }), { ex: 3300 })

  return credentials
}

// Helper: track every AWS resource for teardown
export async function trackResource(
  supabase: any,
  deploymentId: string,
  orgId: string,
  resourceType: string,
  resourceId: string,
  resourceArn: string | null,
  region: string
) {
  await supabase.from('infra_resources').insert({
    deployment_id: deploymentId,
    org_id: orgId,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_arn: resourceArn,
    region,
  })
}

// Helper: update deployment stage and broadcast progress via Realtime
export async function setStage(
  supabase: any,
  deploymentId: string,
  stage: string,
  extraData?: Record<string, any>
) {
  await supabase.from('deployments').update({
    current_stage: stage,
    stage_started_at: new Date().toISOString(),
    ...extraData,
  }).eq('id', deploymentId)
  // Supabase Realtime CDC automatically broadcasts this UPDATE to frontend subscribers
}

// Helper: append a build log line
export async function appendLog(
  supabase: any,
  deploymentId: string,
  text: string,
  level: 'info' | 'warn' | 'error' | 'success' | 'step' = 'info'
) {
  await supabase.from('build_log_entries').insert({
    deployment_id: deploymentId,
    level,
    text,
  })
}
```

---

# PART 3 — DOCKERFILE GENERATION
# File: supabase/functions/_shared/dockerfile-generator.ts
# Generates production-grade, secure, minimal Dockerfiles

```typescript
import type { AppClassification } from './app-classifier.ts'

export function generateDockerfile(classification: AppClassification, commands: BuildCommands): string {

  switch (classification.language) {

    case 'Node.js': {
      const nodeVersion = commands.nodeVersion || '20'
      const isStaticSite = classification.appType === 'static-site'

      if (isStaticSite) {
        // React/Vite SPA — build static files, serve with nginx
        return `
# Stage 1: Build
FROM node:${nodeVersion}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --silent
COPY . .
RUN ${commands.build || 'npm run build'}

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/${detectOutputDir(classification)} /usr/share/nginx/html
# SPA routing: all routes serve index.html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } location /health { return 200 "OK"; add_header Content-Type text/plain; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
`.trim()
      }

      // Server-side Node.js app
      return `
# Stage 1: Dependencies
FROM node:${nodeVersion}-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --silent && npm cache clean --force

# Stage 2: Builder (only if there's a build step)
${commands.build ? `
FROM node:${nodeVersion}-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ${commands.build}
` : ''}

# Stage 3: Runtime (minimal image)
FROM node:${nodeVersion}-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
${commands.build ? `COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist` : ''}
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs
EXPOSE ${classification.port}
ENV NODE_ENV=production
ENV PORT=${classification.port}

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \\
  CMD wget -qO- http://localhost:${classification.port}${classification.healthCheckPath} || exit 1

# Use tini as PID 1 (handles signals correctly)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ${JSON.stringify((commands.start || 'node index.js').split(' '))}
`.trim()
    }

    case 'Python': {
      const pythonVersion = commands.pythonVersion || '3.12'
      const hasGunicorn = commands.start?.includes('gunicorn')
      const hasUvicorn = commands.start?.includes('uvicorn')

      return `
# Stage 1: Dependencies
FROM python:${pythonVersion}-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements.txt ${hasGunicorn ? 'gunicorn' : ''} ${hasUvicorn ? 'uvicorn[standard]' : ''}

# Stage 2: Runtime
FROM python:${pythonVersion}-slim AS runtime
WORKDIR /app

# Security: non-root user
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
COPY --from=deps /usr/local/lib/python${pythonVersion}/site-packages /usr/local/lib/python${pythonVersion}/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --chown=app:app . .

USER app
EXPOSE ${classification.port}
ENV PORT=${classification.port}
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \\
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${classification.port}${classification.healthCheckPath}')" || exit 1

CMD ${JSON.stringify((commands.start || 'python main.py').split(' '))}
`.trim()
    }

    case 'Go': {
      const goVersion = commands.goVersion || '1.22'
      return `
# Stage 1: Build (static binary)
FROM golang:${goVersion}-alpine AS builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./...

# Stage 2: Minimal runtime (distroless — no shell, maximum security)
FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=builder /app/server /server
EXPOSE ${classification.port}
ENV PORT=${classification.port}
HEALTHCHECK --interval=30s --timeout=5s \\
  CMD ["/server", "-health"] || exit 1
ENTRYPOINT ["/server"]
`.trim()
    }

    case 'Java': {
      return `
# Stage 1: Build with Maven/Gradle
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY . .
RUN ${commands.build || 'mvn package -DskipTests -q'}

# Stage 2: Runtime (JRE only)
FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S java && adduser -S java -G java
WORKDIR /app
COPY --from=builder --chown=java:java /app/target/*.jar app.jar
USER java
EXPOSE ${classification.port}
ENV SERVER_PORT=${classification.port}
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \\
  CMD wget -qO- http://localhost:${classification.port}${classification.healthCheckPath} || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
`.trim()
    }

    default: {
      // Fallback: universal Dockerfile with entrypoint detection
      return `
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
EXPOSE ${classification.port}
ENV PORT=${classification.port}
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:${classification.port}${classification.healthCheckPath} || exit 1
CMD ["${commands.start || 'echo No start command detected'}"]
`.trim()
    }
  }
}

function detectOutputDir(classification: AppClassification): string {
  // Try to detect the build output directory
  if (classification.framework === 'Next.js') return '.next'
  if (classification.framework === 'React CRA') return 'build'
  if (classification.framework === 'Vite React') return 'dist'
  if (classification.framework === 'Angular') return 'dist/app'
  if (classification.framework === 'Nuxt.js') return '.output/public'
  return 'dist'  // sensible default
}
```

---

# PART 4 — ECR SETUP + CODEBUILD PROJECT
# File: supabase/functions/setup-build-pipeline/index.ts
# Creates ECR repository and CodeBuild project in user's AWS account
# Called ONCE per deployment. Subsequent deploys reuse the same pipeline.

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { ECRClient, CreateRepositoryCommand, GetAuthorizationTokenCommand, DescribeRepositoriesCommand } from 'https://esm.sh/@aws-sdk/client-ecr@3.490.0'
import { CodeBuildClient, CreateProjectCommand, StartBuildCommand, BatchGetBuildsCommand } from 'https://esm.sh/@aws-sdk/client-codebuild@3.490.0'
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, GetRoleCommand } from 'https://esm.sh/@aws-sdk/client-iam@3.490.0'
import { CORS_HEADERS } from '../_shared/cors.ts'
import { getOrgAWSCredentials, trackResource, setStage, appendLog } from '../_shared/aws-client.ts'
import { generateDockerfile } from '../_shared/dockerfile-generator.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { deployment_id, classification, dockerfile_content, github_repo_url, branch } = await req.json()

  const { data: deployment } = await supabase
    .from('deployments')
    .select('*, organizations!inner(id)')
    .eq('id', deployment_id)
    .single()

  const orgId = deployment.org_id
  const region = deployment.region || 'us-east-1'
  const appName = sanitizeAppName(deployment.app_name || github_repo_url.split('/').pop())

  // Get AWS credentials
  const { Redis } = await import('https://esm.sh/@upstash/redis@1.20.1')
  const redis = new Redis({
    url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
    token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
  })

  const awsCreds = await getOrgAWSCredentials(orgId, redis, supabase)
  const credConfig = {
    region,
    credentials: {
      accessKeyId: awsCreds.accessKeyId,
      secretAccessKey: awsCreds.secretAccessKey,
      sessionToken: awsCreds.sessionToken,
    }
  }
  const tags = [
    { Key: 'autostack:deployment', Value: deployment_id },
    { Key: 'autostack:org', Value: orgId },
    { Key: 'autostack:app', Value: appName },
  ]

  // ─── STEP 1: Create ECR Repository ────────────────────────────────────────
  await setStage(supabase, deployment_id, 'provisioning_infra')
  await appendLog(supabase, deployment_id, '▶ Creating container registry (ECR)...', 'step')

  const ecrClient = new ECRClient(credConfig)
  const repoName = `autostack/${appName}`
  let repositoryUri: string

  try {
    // Check if already exists
    const { repositories } = await ecrClient.send(new DescribeRepositoriesCommand({ repositoryNames: [repoName] }))
    repositoryUri = repositories![0].repositoryUri!
    await appendLog(supabase, deployment_id, `✓ Using existing ECR repository: ${repositoryUri}`, 'success')
  } catch {
    // Create new
    const { repository } = await ecrClient.send(new CreateRepositoryCommand({
      repositoryName: repoName,
      imageTagMutability: 'MUTABLE',
      imageScanningConfiguration: { scanOnPush: true },
      tags,
    }))
    repositoryUri = repository!.repositoryUri!
    await trackResource(supabase, deployment_id, orgId, 'ecr', repoName, repository!.repositoryArn!, region)
    await appendLog(supabase, deployment_id, `✓ ECR repository created: ${repositoryUri}`, 'success')
  }

  await supabase.from('deployments').update({ ecr_repository_uri: repositoryUri }).eq('id', deployment_id)

  // ─── STEP 2: Create CodeBuild Service Role (if not exists) ─────────────────
  await appendLog(supabase, deployment_id, '▶ Setting up build service role...', 'step')

  const iamClient = new IAMClient(credConfig)
  const roleName = 'AutoStackCodeBuildRole'
  let codeBuildRoleArn: string

  try {
    const { Role } = await iamClient.send(new GetRoleCommand({ RoleName: roleName }))
    codeBuildRoleArn = Role!.Arn!
  } catch {
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'codebuild.amazonaws.com' },
        Action: 'sts:AssumeRole'
      }]
    }
    const { Role } = await iamClient.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      Tags: tags,
    }))
    codeBuildRoleArn = Role!.Arn!

    // Attach required policies
    await Promise.all([
      iamClient.send(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: 'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser' })),
      iamClient.send(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: 'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess' })),
    ])

    // Wait for role propagation (IAM is eventually consistent — 10 second delay required)
    await new Promise(r => setTimeout(r, 10000))
  }

  // ─── STEP 3: Create CodeBuild Project ──────────────────────────────────────
  await appendLog(supabase, deployment_id, '▶ Creating build pipeline (CodeBuild)...', 'step')

  const codeBuildClient = new CodeBuildClient(credConfig)
  const projectName = `autostack-${appName}-${deployment_id.slice(0, 8)}`

  // Write the Dockerfile content to the deployment record so CodeBuild can use it
  const buildSpec = generateBuildSpec(repositoryUri, classification.port, dockerfile_content)

  try {
    await codeBuildClient.send(new CreateProjectCommand({
      name: projectName,
      source: {
        type: 'GITHUB',
        location: github_repo_url,
        buildspec: buildSpec,
        auth: {
          type: 'OAUTH',
          resource: Deno.env.get('CODEBUILD_GITHUB_TOKEN')!, // AutoStack's GitHub App token
        },
        gitCloneDepth: 1,  // Shallow clone for speed
      },
      artifacts: { type: 'NO_ARTIFACTS' },
      environment: {
        type: 'LINUX_CONTAINER',
        computeType: getComputeType(classification),
        image: 'aws/codebuild/standard:7.0',  // Latest CodeBuild image
        privilegedMode: true,  // Required for Docker builds
        environmentVariables: [
          { name: 'AWS_DEFAULT_REGION', value: region },
          { name: 'ECR_REPO_URI', value: repositoryUri },
          { name: 'APP_PORT', value: String(classification.port) },
        ],
      },
      serviceRole: codeBuildRoleArn,
      tags,
    }))

    await trackResource(supabase, deployment_id, orgId, 'codebuild', projectName, null, region)
    await appendLog(supabase, deployment_id, `✓ Build pipeline ready: ${projectName}`, 'success')
  } catch (err: any) {
    if (!err.message.includes('already exists')) throw err
    await appendLog(supabase, deployment_id, `✓ Using existing build pipeline: ${projectName}`, 'success')
  }

  await supabase.from('deployments').update({ codebuild_project_name: projectName }).eq('id', deployment_id)

  return new Response(JSON.stringify({
    success: true,
    ecr_repository_uri: repositoryUri,
    codebuild_project_name: projectName,
  }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})

function generateBuildSpec(repositoryUri: string, port: number, dockerfileContent: string): string {
  // This buildspec is embedded in the CodeBuild project
  // It builds the Docker image using the AI-generated Dockerfile
  return JSON.stringify({
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          'echo "AutoStack Build Pipeline"',
          'IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)',
          'echo "Building image tag: $IMAGE_TAG"',
          // Login to ECR
          `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${repositoryUri.split('/')[0]}`,
          // Write the AI-generated Dockerfile (avoids needing one in the repo)
          `cat << 'DOCKERFILE_EOF' > Dockerfile\n${dockerfileContent}\nDOCKERFILE_EOF`,
        ],
      },
      build: {
        commands: [
          'echo "Building Docker image..."',
          `docker build --build-arg PORT=${port} -t ${repositoryUri}:$IMAGE_TAG -t ${repositoryUri}:latest .`,
        ],
      },
      post_build: {
        commands: [
          `docker push ${repositoryUri}:$IMAGE_TAG`,
          `docker push ${repositoryUri}:latest`,
          `echo "IMAGE_URI=${repositoryUri}:$IMAGE_TAG" > imageUri.env`,
          'echo "Build complete. Image pushed to ECR."',
        ],
      },
    },
    artifacts: {
      files: ['imageUri.env'],
    },
  })
}

function getComputeType(classification: AppClassification): string {
  // Choose CodeBuild compute based on app complexity
  if (classification.language === 'Java') return 'BUILD_GENERAL1_MEDIUM'  // Java needs more RAM
  if (classification.estimatedMemory > 1024) return 'BUILD_GENERAL1_MEDIUM'
  return 'BUILD_GENERAL1_SMALL'  // $0.005/min — cheapest
}

function sanitizeAppName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}
```

---

# PART 5 — BUILD ORCHESTRATOR (starts and monitors CodeBuild)
# File: supabase/functions/run-build/index.ts
# Starts the CodeBuild job and streams logs to Supabase in real-time
# CodeBuild takes 2-10 minutes — this function must stream logs async

```typescript
import { CodeBuildClient, StartBuildCommand, BatchGetBuildsCommand } from 'https://esm.sh/@aws-sdk/client-codebuild@3.490.0'
import { CloudWatchLogsClient, GetLogEventsCommand, DescribeLogStreamsCommand } from 'https://esm.sh/@aws-sdk/client-cloudwatch-logs@3.490.0'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  const { deployment_id, branch } = await req.json()

  // Get deployment details
  const { data: deployment } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', deployment_id)
    .single()

  const awsCreds = await getOrgAWSCredentials(deployment.org_id, redis, supabase)
  const codeBuildClient = new CodeBuildClient({ region: deployment.region, credentials: awsCreds })

  // ─── Start the build ─────────────────────────────────────────────────────
  await setStage(supabase, deployment_id, 'building_image')
  await appendLog(supabase, deployment_id, '▶ Starting Docker image build...', 'step')
  await appendLog(supabase, deployment_id, `  Repository: ${deployment.repo_url}`, 'info')
  await appendLog(supabase, deployment_id, `  Branch: ${branch}`, 'info')

  const { build } = await codeBuildClient.send(new StartBuildCommand({
    projectName: deployment.codebuild_project_name,
    sourceVersion: branch,
  }))

  await supabase.from('deployments')
    .update({ codebuild_build_id: build!.id })
    .eq('id', deployment_id)

  await appendLog(supabase, deployment_id, `  Build ID: ${build!.id}`, 'info')
  await appendLog(supabase, deployment_id, '  Waiting for build environment to start...', 'info')

  // ─── Stream logs asynchronously ──────────────────────────────────────────
  // Return immediately — log streaming continues in background via EdgeRuntime.waitUntil
  // The frontend is already subscribed to build_log_entries via Realtime
  EdgeRuntime.waitUntil(streamBuildLogs(
    build!.id!,
    deployment_id,
    deployment.org_id,
    awsCreds,
    deployment.region,
    supabase
  ))

  return new Response(JSON.stringify({
    success: true,
    build_id: build!.id,
    message: 'Build started — streaming logs'
  }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})

async function streamBuildLogs(
  buildId: string,
  deploymentId: string,
  orgId: string,
  awsCreds: AWSCredentials,
  region: string,
  supabase: any
) {
  const codeBuildClient = new CodeBuildClient({ region, credentials: awsCreds })
  const cwLogsClient = new CloudWatchLogsClient({ region, credentials: awsCreds })
  const logGroupName = '/aws/codebuild/' + buildId.split(':')[0]

  let lastLogToken: string | undefined
  let buildComplete = false
  let lastStatus = ''

  while (!buildComplete) {
    await new Promise(r => setTimeout(r, 5000))  // Poll every 5 seconds

    // Check build status
    const { builds } = await codeBuildClient.send(new BatchGetBuildsCommand({ ids: [buildId] }))
    const build = builds![0]
    const status = build.buildStatus!

    if (status !== lastStatus) {
      lastStatus = status
      const statusMap: Record<string, string> = {
        'IN_PROGRESS': 'Building...',
        'SUCCEEDED': '✓ Build succeeded',
        'FAILED': '✗ Build failed',
        'TIMED_OUT': '✗ Build timed out (exceeded 30 minutes)',
        'STOPPED': '✗ Build was cancelled',
      }
      await appendLog(supabase, deploymentId, statusMap[status] || status,
        status === 'SUCCEEDED' ? 'success' : status === 'IN_PROGRESS' ? 'info' : 'error')
    }

    // Fetch new log events from CloudWatch
    try {
      const logStreams = await cwLogsClient.send(new DescribeLogStreamsCommand({
        logGroupName,
        orderBy: 'LastEventTime',
        descending: true,
        limit: 1,
      }))

      if (logStreams.logStreams?.length) {
        const { events, nextForwardToken } = await cwLogsClient.send(new GetLogEventsCommand({
          logGroupName,
          logStreamName: logStreams.logStreams[0].logStreamName,
          nextToken: lastLogToken,
          startFromHead: !lastLogToken,
          limit: 100,
        }))

        if (events && events.length > 0) {
          lastLogToken = nextForwardToken

          // Batch insert log entries for efficiency
          const logEntries = events
            .filter(e => e.message?.trim())
            .map(e => ({
              deployment_id: deploymentId,
              timestamp: new Date(e.timestamp!).toISOString(),
              level: classifyLogLine(e.message!),
              text: e.message!.trim(),
              source: 'codebuild',
            }))

          if (logEntries.length > 0) {
            await supabase.from('build_log_entries').insert(logEntries)
          }
        }
      }
    } catch {
      // CloudWatch logs may not be available immediately — that's fine
    }

    if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'STOPPED'].includes(status)) {
      buildComplete = true

      if (status === 'SUCCEEDED') {
        // Extract image URI from build artifacts
        const imageTag = build.resolvedSourceVersion?.slice(0, 8) || 'latest'
        await supabase.from('deployments')
          .update({ image_tag: imageTag, current_stage: 'pushing_image' })
          .eq('id', deploymentId)

        // Trigger next step: infrastructure provisioning
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/provision-infrastructure`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deployment_id: deploymentId, image_tag: imageTag })
        })
      } else {
        // Build failed — analyze the error
        await handleBuildFailure(deploymentId, buildId, awsCreds, region, supabase)
      }
    }
  }
}

function classifyLogLine(message: string): string {
  const m = message.toLowerCase()
  if (m.match(/^(error|err:|fatal|failed|exception|traceback)/)) return 'error'
  if (m.match(/^(warning|warn:)/)) return 'warn'
  if (m.match(/^(successfully|✓|step \d+\/\d+.*done|complete|pushed|built)/)) return 'success'
  if (m.match(/^step \d+\/\d+/)) return 'step'
  return 'info'
}

async function handleBuildFailure(deploymentId: string, buildId: string, awsCreds: any, region: string, supabase: any) {
  await setStage(supabase, deploymentId, 'failed')

  // Fetch all logs for error analysis
  const { data: logs } = await supabase
    .from('build_log_entries')
    .select('text, level')
    .eq('deployment_id', deploymentId)
    .order('timestamp', { ascending: true })

  const logTexts = logs?.map((l: any) => l.text) || []

  // Analyze error using pattern matching + LLM fallback
  const errorAnalysis = await analyzeBuildError(logTexts)

  await supabase.from('deployments').update({
    error_analysis: errorAnalysis,
    retry_count: supabase.rpc('increment', { table: 'deployments', id: deploymentId, column: 'retry_count' })
  }).eq('id', deploymentId)

  // Auto-fix if possible
  if (errorAnalysis.autoFixAvailable && errorAnalysis.autoFixAction) {
    await appendLog(supabase, deploymentId, `⟳ AutoStack is applying a fix: ${errorAnalysis.autoFixDescription}`, 'info')
    await applyAutoFix(deploymentId, errorAnalysis.autoFixAction, supabase)
  }
}
```

---

# PART 6 — INFRASTRUCTURE PROVISIONER
# File: supabase/functions/provision-infrastructure/index.ts
# Creates App Runner OR ECS Fargate based on app classification
# This runs AFTER the Docker image is built and pushed to ECR

```typescript
import { AppRunnerClient, CreateServiceCommand, DescribeServiceCommand } from 'https://esm.sh/@aws-sdk/client-apprunner@3.490.0'
import { ECSClient, CreateClusterCommand, RegisterTaskDefinitionCommand, CreateServiceCommand as ECSCreateServiceCommand, DescribeServicesCommand } from 'https://esm.sh/@aws-sdk/client-ecs@3.490.0'
import { ElasticLoadBalancingV2Client, CreateLoadBalancerCommand, CreateTargetGroupCommand, CreateListenerCommand, DescribeLoadBalancersCommand } from 'https://esm.sh/@aws-sdk/client-elastic-load-balancing-v2@3.490.0'
import { EC2Client, CreateVpcCommand, CreateSubnetCommand, CreateInternetGatewayCommand, AttachInternetGatewayCommand, CreateRouteTableCommand, CreateRouteCommand, AssociateRouteTableCommand, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand, DescribeAvailabilityZonesCommand } from 'https://esm.sh/@aws-sdk/client-ec2@3.490.0'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  const { deployment_id, image_tag } = await req.json()

  const { data: deployment } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', deployment_id)
    .single()

  const infra_type = deployment.infra_type  // set during analysis: app_runner | ecs_fargate | eks_fargate
  const awsCreds = await getOrgAWSCredentials(deployment.org_id, redis, supabase)
  const region = deployment.region || 'us-east-1'
  const imageUri = `${deployment.ecr_repository_uri}:${image_tag}`

  if (infra_type === 'app_runner') {
    await provisionAppRunner(deployment, imageUri, awsCreds, region, supabase)
  } else if (infra_type === 'ecs_fargate') {
    await provisionECSFargate(deployment, imageUri, awsCreds, region, supabase)
  } else {
    // EKS — expensive, slow, only for repos that truly need it
    await provisionEKS(deployment, imageUri, awsCreds, region, supabase)
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 202,  // Accepted — actual completion is async via Realtime
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  })
})

// ─── APP RUNNER (for simple apps — fastest, cheapest) ─────────────────────────
async function provisionAppRunner(deployment: any, imageUri: string, awsCreds: AWSCredentials, region: string, supabase: any) {
  await setStage(supabase, deployment.id, 'provisioning_infra')
  await appendLog(supabase, deployment.id, '▶ Provisioning AWS App Runner service...', 'step')
  await appendLog(supabase, deployment.id, '  App Runner auto-scales to zero — no idle costs', 'info')

  const client = new AppRunnerClient({ region, credentials: awsCreds })
  const appName = `autostack-${deployment.app_name}`

  // Create App Runner service
  const { Service } = await client.send(new CreateServiceCommand({
    ServiceName: appName,
    SourceConfiguration: {
      ImageRepository: {
        ImageIdentifier: imageUri,
        ImageRepositoryType: 'ECR',
        ImageConfiguration: {
          Port: String(deployment.port || 3000),
          RuntimeEnvironmentVariables: {
            PORT: String(deployment.port || 3000),
            NODE_ENV: 'production',
          },
        },
      },
      AutoDeploymentsEnabled: true,  // Auto-deploy when ECR image is updated
      AuthenticationConfiguration: {
        AccessRoleArn: await getOrCreateAppRunnerRole(awsCreds, region, supabase),
      },
    },
    InstanceConfiguration: {
      Cpu: getCPUForClassification(deployment.cpu_millicores),
      Memory: getMemoryForClassification(deployment.memory_mb),
    },
    HealthCheckConfiguration: {
      Protocol: 'HTTP',
      Path: deployment.health_check_path || '/health',
      Interval: 10,
      Timeout: 5,
      HealthyThreshold: 1,
      UnhealthyThreshold: 3,
    },
    Tags: [
      { Key: 'autostack:deployment', Value: deployment.id },
      { Key: 'autostack:org', Value: deployment.org_id },
    ],
  }))

  await trackResource(supabase, deployment.id, deployment.org_id, 'app_runner', Service!.ServiceArn!, Service!.ServiceArn!, region)
  await supabase.from('deployments').update({ app_runner_service_arn: Service!.ServiceArn! }).eq('id', deployment.id)
  await appendLog(supabase, deployment.id, `  Service ARN: ${Service!.ServiceArn}`, 'info')
  await appendLog(supabase, deployment.id, '  Waiting for App Runner to start (2-3 minutes)...', 'info')

  // Poll for App Runner to become RUNNING
  EdgeRuntime.waitUntil(pollAppRunnerStatus(Service!.ServiceArn!, deployment.id, awsCreds, region, supabase))
}

async function pollAppRunnerStatus(serviceArn: string, deploymentId: string, awsCreds: AWSCredentials, region: string, supabase: any) {
  const client = new AppRunnerClient({ region, credentials: awsCreds })
  let attempts = 0
  const maxAttempts = 40  // 40 × 15s = 10 minutes max

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 15000))  // Poll every 15 seconds
    attempts++

    const { Service } = await client.send(new DescribeServiceCommand({ ServiceArn: serviceArn }))
    const status = Service!.Status

    if (status === 'RUNNING') {
      const liveUrl = `https://${Service!.ServiceUrl}`
      await appendLog(supabase, deploymentId, `✓ App Runner service is RUNNING`, 'success')
      await appendLog(supabase, deploymentId, `  URL: ${liveUrl}`, 'success')

      // Run health check before marking as done
      await runHealthChecks(liveUrl, deploymentId, supabase)
      return
    }

    if (status === 'CREATE_FAILED' || status === 'OPERATION_IN_PROGRESS') {
      if (status === 'CREATE_FAILED') {
        await appendLog(supabase, deploymentId, '✗ App Runner failed to start', 'error')
        await setStage(supabase, deploymentId, 'failed')
        return
      }
      await appendLog(supabase, deploymentId, `  Status: ${status} (attempt ${attempts}/${maxAttempts})`, 'info')
    }
  }

  await appendLog(supabase, deploymentId, '✗ Timed out waiting for App Runner (10 minutes)', 'error')
  await setStage(supabase, deploymentId, 'failed')
}

// ─── ECS FARGATE (for medium/production apps) ─────────────────────────────────
async function provisionECSFargate(deployment: any, imageUri: string, awsCreds: AWSCredentials, region: string, supabase: any) {
  await setStage(supabase, deployment.id, 'provisioning_infra')
  await appendLog(supabase, deployment.id, '▶ Provisioning ECS Fargate + ALB...', 'step')

  const ec2Client = new EC2Client({ region, credentials: awsCreds })
  const ecsClient = new ECSClient({ region, credentials: awsCreds })
  const albClient = new ElasticLoadBalancingV2Client({ region, credentials: awsCreds })

  const tags = [
    { Key: 'autostack:deployment', Value: deployment.id },
    { Key: 'autostack:org', Value: deployment.org_id },
  ]

  // Get AZs for this region
  const { AvailabilityZones } = await ec2Client.send(new DescribeAvailabilityZonesCommand({ Filters: [{ Name: 'state', Values: ['available'] }] }))
  const azNames = AvailabilityZones!.slice(0, 2).map(az => az.ZoneName!)

  // ── 1. VPC ──────────────────────────────────────────────────────────────────
  await appendLog(supabase, deployment.id, '  Creating VPC (10.0.0.0/16)...', 'info')
  const { Vpc } = await ec2Client.send(new CreateVpcCommand({
    CidrBlock: '10.0.0.0/16',
    TagSpecifications: [{ ResourceType: 'vpc', Tags: [...tags, { Key: 'Name', Value: `autostack-${deployment.app_name}` }] }]
  }))
  const vpcId = Vpc!.VpcId!
  await trackResource(supabase, deployment.id, deployment.org_id, 'vpc', vpcId, null, region)
  await appendLog(supabase, deployment.id, `  ✓ VPC: ${vpcId}`, 'success')

  // ── 2. Subnets (public + private for each AZ) ───────────────────────────────
  await appendLog(supabase, deployment.id, '  Creating subnets...', 'info')

  const publicSubnetIds: string[] = []
  const privateSubnetIds: string[] = []

  for (let i = 0; i < azNames.length; i++) {
    const { Subnet: pubSub } = await ec2Client.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: `10.0.${i}.0/24`, AvailabilityZone: azNames[i],
      TagSpecifications: [{ ResourceType: 'subnet', Tags: [...tags, { Key: 'Name', Value: `autostack-public-${i + 1}` }] }]
    }))
    publicSubnetIds.push(pubSub!.SubnetId!)
    await trackResource(supabase, deployment.id, deployment.org_id, 'subnet', pubSub!.SubnetId!, null, region)

    const { Subnet: privSub } = await ec2Client.send(new CreateSubnetCommand({
      VpcId: vpcId, CidrBlock: `10.0.${i + 10}.0/24`, AvailabilityZone: azNames[i],
      TagSpecifications: [{ ResourceType: 'subnet', Tags: [...tags, { Key: 'Name', Value: `autostack-private-${i + 1}` }] }]
    }))
    privateSubnetIds.push(privSub!.SubnetId!)
    await trackResource(supabase, deployment.id, deployment.org_id, 'subnet', privSub!.SubnetId!, null, region)
  }

  await appendLog(supabase, deployment.id, `  ✓ Subnets: ${publicSubnetIds.length} public, ${privateSubnetIds.length} private`, 'success')

  // ── 3. Internet Gateway ─────────────────────────────────────────────────────
  await appendLog(supabase, deployment.id, '  Attaching internet gateway...', 'info')
  const { InternetGateway } = await ec2Client.send(new CreateInternetGatewayCommand({
    TagSpecifications: [{ ResourceType: 'internet-gateway', Tags: tags }]
  }))
  const igwId = InternetGateway!.InternetGatewayId!
  await ec2Client.send(new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }))
  await trackResource(supabase, deployment.id, deployment.org_id, 'igw', igwId, null, region)

  // Public route table → IGW
  const { RouteTable } = await ec2Client.send(new CreateRouteTableCommand({
    VpcId: vpcId,
    TagSpecifications: [{ ResourceType: 'route-table', Tags: tags }]
  }))
  await ec2Client.send(new CreateRouteCommand({
    RouteTableId: RouteTable!.RouteTableId!,
    DestinationCidrBlock: '0.0.0.0/0',
    GatewayId: igwId,
  }))
  for (const subnetId of publicSubnetIds) {
    await ec2Client.send(new AssociateRouteTableCommand({
      RouteTableId: RouteTable!.RouteTableId!,
      SubnetId: subnetId,
    }))
  }
  await appendLog(supabase, deployment.id, `  ✓ Internet Gateway: ${igwId}`, 'success')

  // ── 4. Security Groups ──────────────────────────────────────────────────────
  await appendLog(supabase, deployment.id, '  Creating security groups...', 'info')

  // ALB Security Group: allow 80 + 443 from internet
  const { GroupId: albSgId } = await ec2Client.send(new CreateSecurityGroupCommand({
    GroupName: `autostack-alb-${deployment.id.slice(0, 8)}`,
    Description: 'AutoStack ALB - allow HTTP/HTTPS from internet',
    VpcId: vpcId,
    TagSpecifications: [{ ResourceType: 'security-group', Tags: tags }]
  }))
  await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
    GroupId: albSgId,
    IpPermissions: [
      { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
      { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
    ],
  }))

  // App Security Group: only allow from ALB
  const { GroupId: appSgId } = await ec2Client.send(new CreateSecurityGroupCommand({
    GroupName: `autostack-app-${deployment.id.slice(0, 8)}`,
    Description: 'AutoStack App - only allow from ALB',
    VpcId: vpcId,
    TagSpecifications: [{ ResourceType: 'security-group', Tags: tags }]
  }))
  await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
    GroupId: appSgId,
    IpPermissions: [{
      IpProtocol: 'tcp',
      FromPort: deployment.port || 3000,
      ToPort: deployment.port || 3000,
      UserIdGroupPairs: [{ GroupId: albSgId }]  // Only allow traffic from ALB
    }],
  }))

  await trackResource(supabase, deployment.id, deployment.org_id, 'security_group', albSgId!, null, region)
  await trackResource(supabase, deployment.id, deployment.org_id, 'security_group', appSgId!, null, region)
  await appendLog(supabase, deployment.id, '  ✓ Security groups created', 'success')

  // ── 5. Application Load Balancer ────────────────────────────────────────────
  await appendLog(supabase, deployment.id, '  Creating Application Load Balancer...', 'info')

  const { LoadBalancers } = await albClient.send(new CreateLoadBalancerCommand({
    Name: `autostack-${deployment.id.slice(0, 8)}`,
    Subnets: publicSubnetIds,
    SecurityGroups: [albSgId!],
    Scheme: 'internet-facing',
    Type: 'application',
    Tags: tags,
  }))
  const alb = LoadBalancers![0]
  await trackResource(supabase, deployment.id, deployment.org_id, 'alb', alb.LoadBalancerArn!, alb.LoadBalancerArn!, region)
  await appendLog(supabase, deployment.id, `  ✓ ALB: ${alb.DNSName}`, 'success')

  // Target group
  const { TargetGroups } = await albClient.send(new CreateTargetGroupCommand({
    Name: `autostack-tg-${deployment.id.slice(0, 8)}`,
    Protocol: 'HTTP',
    Port: deployment.port || 3000,
    VpcId: vpcId,
    TargetType: 'ip',  // Required for Fargate
    HealthCheckPath: deployment.health_check_path || '/health',
    HealthCheckIntervalSeconds: 30,
    HealthyThresholdCount: 2,
    UnhealthyThresholdCount: 3,
    Tags: tags,
  }))
  const targetGroupArn = TargetGroups![0].TargetGroupArn!

  // HTTP listener (redirect to HTTPS when cert is available, for now serve HTTP)
  await albClient.send(new CreateListenerCommand({
    LoadBalancerArn: alb.LoadBalancerArn!,
    Protocol: 'HTTP',
    Port: 80,
    DefaultActions: [{ Type: 'forward', TargetGroupArn: targetGroupArn }],
  }))

  // ── 6. ECS Cluster ──────────────────────────────────────────────────────────
  await appendLog(supabase, deployment.id, '  Creating ECS cluster...', 'info')

  const { cluster } = await ecsClient.send(new CreateClusterCommand({
    clusterName: `autostack-${deployment.id.slice(0, 8)}`,
    tags,
    capacityProviders: ['FARGATE', 'FARGATE_SPOT'],
    defaultCapacityProviderStrategy: [
      { capacityProvider: 'FARGATE', weight: 1, base: 1 },  // Always at least 1 FARGATE task
    ],
  }))
  const clusterArn = cluster!.clusterArn!
  await trackResource(supabase, deployment.id, deployment.org_id, 'ecs_cluster', clusterArn, clusterArn, region)

  // Task Definition
  const cpu = getCPUForMillicores(deployment.cpu_millicores)
  const memory = getMemoryForMB(deployment.memory_mb)

  const ecsExecutionRoleArn = await getOrCreateECSExecutionRole(awsCreds, region)
  const { taskDefinition } = await ecsClient.send(new RegisterTaskDefinitionCommand({
    family: `autostack-${deployment.app_name}`,
    networkMode: 'awsvpc',
    requiresCompatibilities: ['FARGATE'],
    cpu: String(cpu),
    memory: String(memory),
    executionRoleArn: ecsExecutionRoleArn,
    tags,
    containerDefinitions: [{
      name: 'app',
      image: imageUri,
      portMappings: [{ containerPort: deployment.port || 3000, protocol: 'tcp' }],
      environment: [
        { name: 'PORT', value: String(deployment.port || 3000) },
        { name: 'NODE_ENV', value: 'production' },
      ],
      logConfiguration: {
        logDriver: 'awslogs',
        options: {
          'awslogs-group': `/autostack/${deployment.id}`,
          'awslogs-region': region,
          'awslogs-stream-prefix': 'ecs',
          'awslogs-create-group': 'true',
        },
      },
      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${deployment.port || 3000}${deployment.health_check_path || '/health'} || exit 1`],
        interval: 30,
        timeout: 5,
        retries: 3,
        startPeriod: 60,
      },
      essential: true,
    }],
  }))

  // ECS Service
  const { service } = await ecsClient.send(new ECSCreateServiceCommand({
    cluster: clusterArn,
    serviceName: `autostack-${deployment.app_name}`,
    taskDefinition: taskDefinition!.taskDefinitionArn!,
    desiredCount: 2,  // Always 2 for high availability
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: publicSubnetIds,  // TODO: use private subnets with NAT for production
        securityGroups: [appSgId!],
        assignPublicIp: 'ENABLED',  // Simplified for now — no NAT Gateway needed
      },
    },
    loadBalancers: [{
      targetGroupArn,
      containerName: 'app',
      containerPort: deployment.port || 3000,
    }],
    deploymentConfiguration: {
      maximumPercent: 200,
      minimumHealthyPercent: 100,  // Zero downtime deployments
    },
    enableECSManagedTags: true,
    tags,
  }))

  await trackResource(supabase, deployment.id, deployment.org_id, 'ecs_service', service!.serviceArn!, service!.serviceArn!, region)
  await supabase.from('deployments').update({
    ecs_cluster_arn: clusterArn,
    ecs_service_arn: service!.serviceArn!,
    alb_arn: alb.LoadBalancerArn!,
    alb_dns_name: alb.DNSName!,
    vpc_id: vpcId,
  }).eq('id', deployment.id)

  await appendLog(supabase, deployment.id, `✓ ECS Fargate service deployed`, 'success')
  await appendLog(supabase, deployment.id, `  Waiting for tasks to become healthy...`, 'info')

  // Poll for service stability
  EdgeRuntime.waitUntil(pollECSServiceStatus(clusterArn, service!.serviceArn!, alb.DNSName!, deployment.id, awsCreds, region, supabase))
}

async function pollECSServiceStatus(clusterArn: string, serviceArn: string, albDns: string, deploymentId: string, awsCreds: any, region: string, supabase: any) {
  const ecsClient = new ECSClient({ region, credentials: awsCreds })
  let attempts = 0
  const maxAttempts = 30  // 30 × 20s = 10 minutes

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 20000))
    attempts++

    const { services } = await ecsClient.send(new DescribeServicesCommand({
      cluster: clusterArn,
      services: [serviceArn],
    }))
    const service = services![0]
    const running = service.runningCount || 0
    const desired = service.desiredCount || 2

    await appendLog(supabase, deploymentId, `  Tasks running: ${running}/${desired} (attempt ${attempts}/${maxAttempts})`, 'info')

    if (running >= 1) {
      const liveUrl = `http://${albDns}`  // HTTP for now, HTTPS after ACM cert
      await runHealthChecks(liveUrl, deploymentId, supabase)
      return
    }
  }

  await appendLog(supabase, deploymentId, '✗ ECS tasks failed to start after 10 minutes', 'error')
  await setStage(supabase, deploymentId, 'failed')
}
```

---

# PART 7 — HEALTH CHECKER + VALIDATOR
# After deployment, verify the app actually works before telling the user it's live

```typescript
// supabase/functions/_shared/health-checker.ts

export async function runHealthChecks(baseUrl: string, deploymentId: string, supabase: any) {
  await setStage(supabase, deploymentId, 'health_checking')
  await appendLog(supabase, deploymentId, '▶ Running health checks...', 'step')

  const maxAttempts = 12  // 12 × 10s = 2 minutes
  let lastError: string = ''

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000))

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${baseUrl}/health`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'AutoStack-HealthCheck/1.0' }
      })
      clearTimeout(timeout)

      if (response.ok) {
        // Get response time
        const start = Date.now()
        await fetch(`${baseUrl}/health`)
        const responseTime = Date.now() - start

        await appendLog(supabase, deploymentId, `  ✓ Health check passed (${response.status} in ${responseTime}ms)`, 'success')

        // Run a simple smoke test — check the root path too
        const rootResponse = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) })
        if (rootResponse.ok || rootResponse.status === 301 || rootResponse.status === 302) {
          await appendLog(supabase, deploymentId, `  ✓ Root path accessible (${rootResponse.status})`, 'success')
        }

        // Mark deployment as active
        await supabase.from('deployments').update({
          current_stage: 'active',
          live_url: baseUrl,
          status: 'healthy',
        }).eq('id', deploymentId)

        await appendLog(supabase, deploymentId, `\n✅ Deployment complete!`, 'success')
        await appendLog(supabase, deploymentId, `   ${baseUrl}`, 'success')

        // Send success notification
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('NOTIFICATION_SECRET')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'deployment_success',
            deployment_id: deploymentId,
            payload: { live_url: baseUrl }
          })
        })

        return { success: true, live_url: baseUrl }
      }

      lastError = `HTTP ${response.status}`
    } catch (err: any) {
      lastError = err.name === 'AbortError' ? 'Request timed out' : err.message
    }

    await appendLog(supabase, deploymentId, `  Attempt ${i + 1}/${maxAttempts}: ${lastError}`, 'warn')
  }

  // Health checks failed after 2 minutes
  await appendLog(supabase, deploymentId, `✗ Health checks failed after 2 minutes. Last error: ${lastError}`, 'error')

  // Analyze why the health check is failing
  const errorAnalysis = {
    category: 'health_check_failure',
    title: 'Application not responding on health endpoint',
    explanation: `The app deployed successfully but isn't responding at /health. Last error: ${lastError}`,
    suggestedFix: 'Check that your app listens on the correct PORT (use process.env.PORT, not hardcoded port). Add a /health endpoint that returns HTTP 200.',
    autoFixAvailable: false,
    estimatedFixTime: 'Requires code change',
  }

  await supabase.from('deployments').update({
    current_stage: 'failed',
    error_analysis: errorAnalysis,
    status: 'failed',
  }).eq('id', deploymentId)
}
```

---

# PART 8 — FRONTEND: REAL-TIME DEPLOYMENT UI
# File: src/components/deploy/DeploymentProgressView.jsx
# This replaces ALL fake progress bars. Every update comes from Supabase Realtime.

```jsx
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle, Circle, Clock, XCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react'

const STAGE_CONFIG = {
  queued:           { label: 'Queued',                    icon: Clock,     color: '#7A8099' },
  analyzing:        { label: 'Analyzing repository',      icon: null,      color: '#60a5fa' },
  cost_selection:   { label: 'Selecting infrastructure',  icon: null,      color: '#60a5fa' },
  provisioning_infra: { label: 'Provisioning infrastructure', icon: null,  color: '#a78bfa' },
  building_image:   { label: 'Building Docker image',     icon: null,      color: '#f59e0b' },
  pushing_image:    { label: 'Pushing to registry',       icon: null,      color: '#f59e0b' },
  deploying:        { label: 'Deploying application',     icon: null,      color: '#4ade80' },
  health_checking:  { label: 'Running health checks',     icon: null,      color: '#4ade80' },
  active:           { label: 'Deployment active',         icon: CheckCircle, color: '#4ade80' },
  failed:           { label: 'Deployment failed',         icon: XCircle,   color: '#f43f5e' },
}

const STAGE_ORDER = [
  'analyzing', 'cost_selection', 'provisioning_infra',
  'building_image', 'pushing_image', 'deploying', 'health_checking', 'active'
]

export function DeploymentProgressView({ deploymentId, onComplete }) {
  const [deployment, setDeployment] = useState(null)
  const [buildLogs, setBuildLogs] = useState([])
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef(null)
  const logsContainerRef = useRef(null)

  // Subscribe to deployment updates
  useEffect(() => {
    // Initial fetch
    supabase.from('deployments').select('*').eq('id', deploymentId).single()
      .then(({ data }) => setDeployment(data))

    // Realtime subscription
    const deploymentChannel = supabase
      .channel(`deployment:${deploymentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'deployments',
        filter: `id=eq.${deploymentId}`
      }, ({ new: updated }) => {
        setDeployment(updated)
        if (updated.current_stage === 'active') {
          onComplete?.(updated.live_url)
        }
      })
      .subscribe()

    // Subscribe to build log entries
    const logsChannel = supabase
      .channel(`logs:${deploymentId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'build_log_entries',
        filter: `deployment_id=eq.${deploymentId}`
      }, ({ new: logEntry }) => {
        setBuildLogs(prev => [...prev.slice(-500), logEntry])  // Keep last 500 lines
      })
      .subscribe()

    // Initial log fetch
    supabase.from('build_log_entries')
      .select('*')
      .eq('deployment_id', deploymentId)
      .order('timestamp', { ascending: true })
      .limit(500)
      .then(({ data }) => setBuildLogs(data || []))

    return () => {
      supabase.removeChannel(deploymentChannel)
      supabase.removeChannel(logsChannel)
    }
  }, [deploymentId])

  // Auto-scroll build logs
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [buildLogs, autoScroll])

  if (!deployment) return <div className="animate-pulse h-48 bg-[#0d1117] rounded-xl" />

  const currentStageIndex = STAGE_ORDER.indexOf(deployment.current_stage)
  const isFailed = deployment.current_stage === 'failed'
  const isActive = deployment.current_stage === 'active'
  const showLogs = ['building_image', 'pushing_image', 'deploying', 'failed', 'active'].includes(deployment.current_stage)

  return (
    <div className="space-y-6">

      {/* Stage progress tracker */}
      <div className="space-y-2">
        {STAGE_ORDER.map((stageId, index) => {
          const config = STAGE_CONFIG[stageId]
          const isDone = index < currentStageIndex || isActive
          const isCurrent = stageId === deployment.current_stage
          const isPending = index > currentStageIndex && !isActive

          return (
            <div
              key={stageId}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                isCurrent && !isFailed
                  ? 'bg-[#111520] border border-[#1C2235]'
                  : ''
              }`}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle className="w-4 h-4 text-[#4ade80]" />
                ) : isCurrent && !isFailed ? (
                  <Loader2 className="w-4 h-4 text-[#60a5fa] animate-spin" />
                ) : isCurrent && isFailed ? (
                  <XCircle className="w-4 h-4 text-[#f43f5e]" />
                ) : (
                  <Circle className="w-4 h-4 text-[#1C2235]" />
                )}
              </div>

              {/* Label */}
              <span className={`text-sm ${
                isDone ? 'text-[#7A8099]' :
                isCurrent && !isFailed ? 'text-[#f1f5f9] font-medium' :
                isCurrent && isFailed ? 'text-[#f43f5e] font-medium' :
                'text-[#2a3347]'
              }`}>
                {config.label}
              </span>

              {/* Time elapsed for current stage */}
              {isCurrent && !isFailed && deployment.stage_started_at && (
                <StageTimer startedAt={deployment.stage_started_at} />
              )}
            </div>
          )
        })}
      </div>

      {/* Build log terminal */}
      {showLogs && buildLogs.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-[#1C2235]">
          {/* Terminal header */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0C0F17] border-b border-[#1C2235]">
            <div className="flex gap-1.5">
              {['#FF5F57', '#FFBD2E', '#28CA41'].map(c => (
                <div key={c} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="text-xs text-[#4A5168] font-mono ml-2">Build output</span>
            <div className="ml-auto flex items-center gap-3">
              {deployment.current_stage === 'building_image' && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
                  <span className="text-xs text-[#4A5168]">LIVE</span>
                </div>
              )}
              <button
                onClick={() => setAutoScroll(v => !v)}
                className={`text-xs ${autoScroll ? 'text-[#60a5fa]' : 'text-[#4A5168]'}`}
              >
                {autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
              </button>
            </div>
          </div>

          {/* Log lines */}
          <div
            ref={logsContainerRef}
            className="bg-[#07090E] p-4 h-56 overflow-y-auto font-mono text-xs"
            onScroll={(e) => {
              const el = e.currentTarget
              const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50
              setAutoScroll(atBottom)
            }}
          >
            {buildLogs.map((log, i) => (
              <BuildLogLine key={log.id || i} log={log} />
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Success state */}
      {isActive && deployment.live_url && (
        <div className="p-4 rounded-xl bg-[#4ade80]/5 border border-[#4ade80]/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#4ade80]">✓ Deployment live</p>
              <p className="text-xs text-[#4A5168] font-mono mt-0.5">{deployment.live_url}</p>
            </div>
            <a
              href={deployment.live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4ade80] text-[#07090E] rounded-lg text-xs font-medium hover:bg-[#4ade80]/90 transition-colors"
            >
              Open app
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Error state */}
      {isFailed && deployment.error_analysis && (
        <DeploymentErrorCard
          error={deployment.error_analysis}
          deploymentId={deploymentId}
        />
      )}
    </div>
  )
}

function BuildLogLine({ log }) {
  const colors = {
    error: '#f43f5e',
    warn: '#f59e0b',
    success: '#4ade80',
    step: '#60a5fa',
    info: '#7A8099',
  }

  return (
    <div className="flex gap-3 py-0.5 leading-5">
      <span className="text-[#2a3347] shrink-0 tabular-nums select-none">
        {new Date(log.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span style={{ color: colors[log.level] || colors.info }}>{log.text}</span>
    </div>
  )
}

function StageTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return (
    <span className="ml-auto text-xs text-[#4A5168] font-mono tabular-nums">
      {m > 0 ? `${m}m ` : ''}{s}s
    </span>
  )
}

function DeploymentErrorCard({ error, deploymentId }) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    setRetrying(true)
    await supabase.functions.invoke('retry-deployment', { body: { deployment_id: deploymentId } })
  }

  return (
    <div className="p-4 rounded-xl bg-[#f43f5e]/5 border border-[#f43f5e]/30 space-y-3">
      <div className="flex items-start gap-3">
        <XCircle className="w-4 h-4 text-[#f43f5e] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#f43f5e]">{error.title}</p>
          <p className="text-xs text-[#7A8099]">{error.explanation}</p>
        </div>
      </div>

      {error.exactError && (
        <div className="p-2 rounded-lg bg-[#07090E] border border-[#1C2235]">
          <p className="text-xs font-mono text-[#f43f5e]">{error.exactError}</p>
        </div>
      )}

      <div className="p-3 rounded-lg bg-[#111520] border border-[#1C2235]">
        <p className="text-xs font-medium text-[#f1f5f9] mb-1">How to fix this:</p>
        <p className="text-xs text-[#7A8099]">{error.suggestedFix}</p>
        <p className="text-xs text-[#4A5168] mt-1">Estimated fix time: {error.estimatedFixTime}</p>
      </div>

      <div className="flex gap-2">
        {error.autoFixAvailable ? (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2463eb] text-white rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {retrying ? 'Applying fix...' : 'Auto-fix and retry'}
          </button>
        ) : (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#334366] text-[#7A8099] rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Retry deployment
          </button>
        )}
      </div>
    </div>
  )
}
```

---

# PART 9 — THE ORCHESTRATOR FUNCTION
# File: supabase/functions/deploy/index.ts
# This is the single entry point called when user clicks "Deploy"
# It coordinates all 4 agents in sequence

```typescript
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  // Auth
  const authHeader = req.headers.get('Authorization')
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader! } }
  })
  const { data: { user } } = await supabaseClient.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { repo_url, branch = 'main', infra_option, environment_name } = await req.json()

  // 1. Create deployment record (immediately — frontend can start subscribing)
  const { data: deployment } = await supabaseServiceClient
    .from('deployments')
    .insert({
      org_id: user.user_metadata.org_id,
      repo_url,
      branch,
      status: 'queued',
      current_stage: 'analyzing',
      infra_type: infra_option?.service || 'app_runner',  // from cost selection step
      port: infra_option?.classification?.port || 3000,
      cpu_millicores: infra_option?.classification?.estimatedCPU || 256,
      memory_mb: infra_option?.classification?.estimatedMemory || 512,
      health_check_path: infra_option?.classification?.healthCheckPath || '/health',
      region: user.user_metadata?.preferred_region || 'us-east-1',
    })
    .select()
    .single()

  // Return deployment ID immediately — frontend starts subscribing to Realtime
  // All subsequent work happens async via EdgeRuntime.waitUntil
  EdgeRuntime.waitUntil(runDeploymentPipeline(deployment.id, {
    repo_url, branch, infra_option, org_id: user.user_metadata.org_id
  }))

  return json({ deployment_id: deployment.id, status: 'started' }, 202)
})

async function runDeploymentPipeline(deploymentId: string, params: DeployParams) {
  try {
    // Agent 1: Repo Analysis (already done if cost_selection was shown)
    // If coming from cost selection, classification is already in infra_option
    const classification = params.infra_option.classification

    // Generate Dockerfile from classification
    const dockerfileContent = generateDockerfile(classification, classification.buildCommands)

    // Agent 2: Setup ECR + CodeBuild
    const buildPipelineRes = await callFunction('setup-build-pipeline', {
      deployment_id: deploymentId,
      classification,
      dockerfile_content: dockerfileContent,
      github_repo_url: params.repo_url,
      branch: params.branch,
    })

    if (!buildPipelineRes.success) throw new Error('Failed to setup build pipeline')

    // Agent 3: Build Docker image (streaming logs async)
    const buildRes = await callFunction('run-build', {
      deployment_id: deploymentId,
      branch: params.branch,
    })

    // Note: run-build returns immediately, build continues async
    // Infrastructure provisioning is triggered by run-build when build succeeds

  } catch (err: any) {
    console.error('Deployment pipeline failed:', err)
    await setStage(supabaseServiceClient, deploymentId, 'failed')
    await supabaseServiceClient.from('deployments').update({
      error_analysis: {
        category: 'pipeline_error',
        title: 'Deployment pipeline error',
        explanation: err.message,
        suggestedFix: 'Contact support if this persists.',
        autoFixAvailable: false,
        estimatedFixTime: 'Unknown',
      }
    }).eq('id', deploymentId)
  }
}
```

---

# PART 10 — IMPLEMENTATION ORDER + VERIFICATION

## Step 1: Database migration
File: supabase/migrations/006_deployment_pipeline.sql
Run: supabase db push
Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'deployments'`
Must include: current_stage, build_logs, live_url, ecr_repository_uri, app_runner_service_arn

---

## Step 2: Shared utilities
Create:
- supabase/functions/_shared/aws-client.ts
- supabase/functions/_shared/dockerfile-generator.ts

Verify: Import in a test function. No TypeScript errors.

---

## Step 3: setup-build-pipeline function
Create: supabase/functions/setup-build-pipeline/index.ts
Deploy: supabase functions deploy setup-build-pipeline
Verify:
1. Trigger with a real org_id that has valid AWS credentials
2. Check AWS console → ECR → repository autostack/[appname] exists
3. Check AWS console → CodeBuild → project autostack-[appname] exists
4. Both resources tagged with autostack:deployment

---

## Step 4: run-build function
Create: supabase/functions/run-build/index.ts
Deploy: supabase functions deploy run-build
Verify:
1. Trigger after setup-build-pipeline completes
2. AWS console → CodeBuild → builds → build started
3. Supabase → build_log_entries table → rows appearing as build progresses
4. Frontend subscribed to build_log_entries → logs appear in terminal UI in real time

---

## Step 5: provision-infrastructure function
Create: supabase/functions/provision-infrastructure/index.ts
Deploy: supabase functions deploy provision-infrastructure
Verify (App Runner path):
1. Trigger after build succeeds with infra_type='app_runner'
2. AWS console → App Runner → service created
3. Service status becomes RUNNING within 3 minutes
4. deployments.live_url is set and not null
5. curl [live_url]/health returns HTTP 200

Verify (ECS Fargate path):
1. Trigger with infra_type='ecs_fargate'
2. AWS console → VPC → new VPC with autostack: tag exists
3. AWS console → ECS → cluster and service created
4. ALB DNS name is accessible
5. curl http://[alb-dns]/health returns HTTP 200

---

## Step 6: health checker
Verify: After provisioning, deployments.current_stage becomes 'active'
Verify: deployments.live_url is not null
Verify: curl [live_url] returns HTTP 200 (not 502, not timeout)

---

## Step 7: Frontend DeploymentProgressView
Replace the current fake progress bar with DeploymentProgressView
Verify:
1. Click Deploy on a real repo
2. Watch: each stage appears as it completes (from Realtime)
3. Watch: build log lines appear in real-time during CodeBuild
4. Watch: success state shows with clickable live URL
5. Click "Open app" → browser opens the live URL → app loads

---

## Step 8: End-to-end test (mandatory before marking any task done)
Test repo: any public Node.js Express app on GitHub
Expected flow:
- T+0s: Click Deploy
- T+3s: deploymentId returned, frontend subscribing
- T+15s: Analysis complete, cost options shown
- T+30s: User selects option, Deploy triggered
- T+90s: ECR + CodeBuild setup complete (logged)
- T+120s: Build started, logs streaming
- T+240s: Build complete, image pushed to ECR
- T+270s: App Runner service creation started (for simple app)
- T+450s: App Runner service RUNNING
- T+460s: Health check passes
- T+465s: deployment.current_stage = 'active', live_url set
- T+470s: Frontend shows success state with clickable URL
- T+475s: User clicks URL → app loads in browser → HTTP 200

Total: ~8 minutes for a simple Node.js app on App Runner
This is the target. If it takes longer: find the bottleneck, optimize.
