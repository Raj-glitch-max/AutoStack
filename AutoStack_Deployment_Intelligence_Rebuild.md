# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — DEPLOYMENT INTELLIGENCE COMPLETE REBUILD                      ║
# ║   Fix: Cost engine, Build detection, Observability, Deploy UX               ║
# ║   Standard: Vercel-level intelligence, not dummy hardcoded values            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# WHAT IS WRONG RIGHT NOW (READ BEFORE TOUCHING ANYTHING)
# =========================================================
#
# Problem 1: COST IS FAKE AND WRONG
# The system shows $187/month for a simple Node.js app.
# A real Node.js Express app deployed properly costs $8-15/month on AWS App Runner.
# $187 is the cost of a full EKS cluster — completely wrong for a simple app.
# The current system hardcodes EKS for EVERYTHING regardless of app complexity.
# This is the #1 reason users will not trust or use AutoStack.
#
# Problem 2: INFRASTRUCTURE SELECTION IS BINARY AND STUPID
# Right now: every app → EKS. Always.
# Reality: 90% of apps don't need Kubernetes.
# A simple Express API → AWS App Runner ($8/month)
# A medium traffic app → ECS Fargate ($20-40/month)
# A stateful/complex app → EKS ($73+ just the control plane)
# Using EKS for a hello-world Node app is like buying a semi-truck to deliver pizza.
#
# Problem 3: BUILD ANALYSIS IS SLOW AND ASKS THE USER
# 1 minute 12 seconds to "analyze" is unacceptable. Vercel does this in 3 seconds.
# The system currently asks users to fill in build commands manually.
# This is the OPPOSITE of what AutoStack promises.
# NOBODY should ever manually enter a build command.
#
# Problem 4: NO REAL OBSERVABILITY
# Logs disappear when the tab is closed.
# No Prometheus metrics. No Grafana dashboards.
# No real-time build logs during deployment.
# No error intelligence — if a build fails, user gets a cryptic message.
#
# Problem 5: NO AI COST OPTIMIZATION AGENT
# The system has no dynamic cost analysis.
# It does not compare: App Runner vs ECS Fargate vs EKS Fargate vs EKS EC2.
# It does not analyze actual app resource usage to right-size.
# It does not track cost over time and surface savings.
#
# RULE: Do not touch anything that is currently working (auth, RLS, Supabase setup).
# RULE: Do not break existing database schema — only add new columns/tables.
# RULE: Every new feature must work end-to-end before marking done.
# RULE: No hardcoded pricing numbers anywhere in the codebase.
# RULE: All AWS pricing must come from a live calculation, not a constant.

---

# PART 1 — THE INFRASTRUCTURE SELECTION ENGINE
# Replace: single EKS path
# With: intelligent multi-tier AWS infrastructure selection

## 1.1 — Application Classification Agent

This is the FIRST thing that runs when a user deploys. It analyzes the repository
and classifies the application into one of 5 tiers. This classification drives
EVERYTHING else: infrastructure choice, cost estimate, build commands, resource sizing.

### The 5 Application Tiers

```typescript
// supabase/functions/_shared/app-classifier.ts

export interface AppClassification {
  tier: 'static' | 'micro' | 'standard' | 'production' | 'enterprise'
  appType: 'static-site' | 'api' | 'fullstack' | 'worker' | 'scheduled'
  language: string
  framework: string
  port: number
  buildCommand: string        // AUTO-DETECTED, never ask user
  startCommand: string        // AUTO-DETECTED, never ask user
  healthCheckPath: string     // AUTO-DETECTED
  hasDatabase: boolean        // detected from deps
  hasQueue: boolean           // detected from deps
  hasWebsockets: boolean      // detected from deps
  isStateful: boolean         // affects infra choice
  estimatedCPU: number        // millicores
  estimatedMemory: number     // MB
  trafficProfile: 'low' | 'medium' | 'high' | 'unknown'
  recommendedService: 'app_runner' | 'ecs_fargate' | 'ecs_fargate_spot' | 'eks_fargate' | 'eks_ec2'
  monthlyEstimate: CostEstimate
}
```

### Tier Definitions

```
TIER: static
  What: React SPA, Next.js static export, Vite build output
  AWS Service: S3 + CloudFront
  Monthly cost: $0.50 - $3.00
  Deploy time: 45 seconds
  Detection: package.json has react-scripts/vite AND no server-side code

TIER: micro
  What: Simple API, webhook handler, small service < 100 req/min
  AWS Service: AWS App Runner
  Monthly cost: $5 - $20
  Deploy time: 2-3 minutes
  Detection: Express/Flask/FastAPI with minimal deps, no stateful requirements
  Why App Runner: Scales to zero, no infra to manage, cheaper than Fargate

TIER: standard
  What: Production API, fullstack app, 100-1000 req/min
  AWS Service: ECS Fargate
  Monthly cost: $25 - $80
  Deploy time: 4-6 minutes
  Detection: Medium complexity, some statefulness, moderate traffic expected

TIER: production
  What: High-traffic service, microservices, needs autoscaling
  AWS Service: ECS Fargate with ALB + autoscaling
  Monthly cost: $80 - $200
  Deploy time: 6-10 minutes
  Detection: Multiple services, heavy deps, explicit scaling requirements

TIER: enterprise
  What: Full Kubernetes workload, multiple teams, complex orchestration
  AWS Service: EKS (Fargate nodes or managed node groups)
  Monthly cost: $200+
  Deploy time: 15-22 minutes (EKS control plane takes 12+ minutes)
  Detection: Kubernetes configs exist, Helm charts, multiple microservices
  NOTE: EKS should NEVER be suggested for a single simple app.
```

### Auto-Detection Logic (Complete Implementation)

```typescript
export async function classifyApplication(
  files: Map<string, string>,
  repoSize: number,
  fileCount: number
): Promise<AppClassification> {

  // Step 1: Detect language and framework
  const stack = detectStack(files)

  // Step 2: Detect app type
  const appType = detectAppType(files, stack)

  // Step 3: Detect resource requirements
  const resources = estimateResources(stack, files, appType)

  // Step 4: Detect infrastructure requirements
  const requirements = detectInfraRequirements(files, stack)

  // Step 5: Select optimal AWS service
  const service = selectAWSService(appType, resources, requirements)

  // Step 6: Detect build/start commands (NEVER ask user)
  const commands = detectCommands(files, stack)

  // Step 7: Calculate real cost
  const cost = calculateCost(service, resources)

  return {
    tier: getTier(service),
    appType,
    language: stack.language,
    framework: stack.framework,
    port: stack.port,
    buildCommand: commands.build,
    startCommand: commands.start,
    healthCheckPath: commands.healthCheck,
    hasDatabase: requirements.hasDatabase,
    hasQueue: requirements.hasQueue,
    hasWebsockets: requirements.hasWebsockets,
    isStateful: requirements.isStateful,
    estimatedCPU: resources.cpu,
    estimatedMemory: resources.memory,
    trafficProfile: 'unknown',
    recommendedService: service,
    monthlyEstimate: cost
  }
}
```

### Build Command Auto-Detection (Zero User Input Required)

```typescript
function detectCommands(files: Map<string, string>, stack: StackDetection): Commands {
  const pkg = files.has('package.json') ? JSON.parse(files.get('package.json')!) : null

  // Node.js detection
  if (pkg) {
    const scripts = pkg.scripts || {}
    return {
      build: scripts.build || (
        pkg.dependencies?.['next'] ? 'npm run build' :
        pkg.dependencies?.['react-scripts'] ? 'npm run build' :
        pkg.dependencies?.['vite'] ? 'npm run build' :
        pkg.devDependencies?.['typescript'] ? 'npm run build' :
        'npm install --production'
      ),
      start: scripts.start || (
        pkg.dependencies?.['next'] ? 'npm start' :
        pkg.main ? `node ${pkg.main}` :
        'node index.js'
      ),
      install: 'npm ci --only=production',
      healthCheck: detectHealthCheckPath(files, stack),
      nodeVersion: detectNodeVersion(files, pkg),
    }
  }

  // Python detection
  if (files.has('requirements.txt') || files.has('pyproject.toml')) {
    const content = (files.get('requirements.txt') || '').toLowerCase()
    return {
      install: 'pip install -r requirements.txt --no-cache-dir',
      build: null,  // Python doesn't typically have a build step
      start: (
        content.includes('gunicorn') ? `gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app` :
        content.includes('uvicorn') ? `uvicorn main:app --host 0.0.0.0 --port $PORT` :
        content.includes('flask') ? `gunicorn app:app` :
        content.includes('django') ? `gunicorn project.wsgi:application` :
        'python main.py'
      ),
      healthCheck: '/health',
      pythonVersion: detectPythonVersion(files),
    }
  }

  // Go detection
  if (files.has('go.mod')) {
    const modContent = files.get('go.mod') || ''
    const moduleName = modContent.match(/^module (.+)$/m)?.[1] || 'app'
    return {
      install: 'go mod download',
      build: `go build -o server ./...`,
      start: './server',
      healthCheck: '/health',
      goVersion: modContent.match(/^go (.+)$/m)?.[1] || '1.21',
    }
  }

  // Java/Spring Boot
  if (files.has('pom.xml') || files.has('build.gradle')) {
    const isMaven = files.has('pom.xml')
    return {
      install: isMaven ? 'mvn dependency:resolve' : 'gradle dependencies',
      build: isMaven ? 'mvn package -DskipTests -q' : 'gradle bootJar',
      start: 'java -jar target/*.jar',
      healthCheck: '/actuator/health',
      javaVersion: '17',
    }
  }

  // Ruby
  if (files.has('Gemfile')) {
    return {
      install: 'bundle install --without development test',
      build: files.has('Rakefile') ? 'bundle exec rake assets:precompile' : null,
      start: 'bundle exec rails server -b 0.0.0.0' ,
      healthCheck: '/health',
      rubyVersion: detectRubyVersion(files),
    }
  }

  // Default fallback
  return {
    install: 'echo "No install step detected"',
    build: null,
    start: 'echo "Could not detect start command"',
    healthCheck: '/',
  }
}

function detectHealthCheckPath(files: Map<string, string>, stack: StackDetection): string {
  // Search source files for health check route definitions
  const commonHealthPaths = ['/health', '/healthz', '/api/health', '/ping', '/_health', '/status']

  for (const [filename, content] of files.entries()) {
    if (!filename.endsWith('.js') && !filename.endsWith('.ts') &&
        !filename.endsWith('.py') && !filename.endsWith('.go')) continue

    for (const path of commonHealthPaths) {
      if (content.includes(`'${path}'`) || content.includes(`"${path}"`)) {
        return path
      }
    }
  }

  return '/health'  // Default — Dockerfile will add it if missing
}
```

### Infrastructure Requirements Detection

```typescript
function detectInfraRequirements(files: Map<string, string>, stack: StackDetection) {
  const allContent = Array.from(files.values()).join('\n').toLowerCase()
  const pkg = files.has('package.json') ? JSON.parse(files.get('package.json')!) : { dependencies: {} }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  return {
    hasDatabase: !!(
      deps['pg'] || deps['mysql2'] || deps['mongoose'] || deps['prisma'] ||
      deps['sequelize'] || deps['typeorm'] || deps['drizzle-orm'] ||
      allContent.includes('postgres') || allContent.includes('mysql') ||
      allContent.includes('mongodb') || allContent.includes('database_url')
    ),
    hasQueue: !!(
      deps['bull'] || deps['bullmq'] || deps['bee-queue'] || deps['agenda'] ||
      deps['celery'] || allContent.includes('redis') || allContent.includes('rabbitmq') ||
      allContent.includes('sqs')
    ),
    hasWebsockets: !!(
      deps['socket.io'] || deps['ws'] || deps['uwebsockets.js'] ||
      allContent.includes('websocket') || allContent.includes('socket.io')
    ),
    hasFileStorage: !!(
      deps['multer'] || deps['formidable'] || allContent.includes('s3') ||
      allContent.includes('uploadfile') || allContent.includes('multipart')
    ),
    isStateful: !!(
      deps['express-session'] || allContent.includes('session') ||
      allContent.includes('sticky') || allContent.includes('stateful')
    ),
    needsEgressToInternet: true,  // assume yes unless pure internal service
    needsVPC: false,  // only if connecting to RDS or internal services
  }
}
```

### AWS Service Selection Logic

```typescript
function selectAWSService(appType: string, resources: Resources, requirements: InfraRequirements): AWSService {

  // Static sites: always S3 + CloudFront (cheapest possible)
  if (appType === 'static-site') return 'cloudfront_s3'

  // Workers/scheduled jobs: always ECS Fargate (no ALB needed)
  if (appType === 'worker' || appType === 'scheduled') return 'ecs_fargate_no_alb'

  // Simple API with no stateful requirements and low traffic → App Runner
  // App Runner is perfect for: Express APIs, Flask APIs, FastAPI, simple fullstack
  if (
    !requirements.isStateful &&
    !requirements.hasWebsockets &&
    resources.cpu <= 1000 &&  // 1 vCPU or less
    resources.memory <= 2048   // 2GB or less
  ) {
    return 'app_runner'
  }

  // Websockets require sticky sessions → need ECS with ALB (App Runner doesn't support WS well)
  if (requirements.hasWebsockets) {
    return 'ecs_fargate'
  }

  // Larger apps with moderate traffic → ECS Fargate
  if (resources.cpu <= 4096 && resources.memory <= 8192) {
    return 'ecs_fargate'
  }

  // Very large workloads → ECS Fargate with higher resource allocation
  // STILL NOT EKS unless the user explicitly has K8s configs in their repo
  if (resources.cpu <= 16384 && resources.memory <= 30720) {
    return 'ecs_fargate'
  }

  // Only use EKS if:
  // - kubernetes/ or k8s/ directory exists in the repo
  // - Helm charts exist
  // - Multiple services need orchestration
  const hasK8sConfigs = Array.from(files.keys()).some(f =>
    f.includes('kubernetes/') || f.includes('k8s/') || f.endsWith('.yaml') && f.includes('kind:')
  )

  if (hasK8sConfigs) return 'eks_fargate'

  // Default: ECS Fargate is almost always the right choice over EKS
  return 'ecs_fargate'
}
```

---

## 1.2 — Real Cost Calculation Engine

NEVER hardcode prices. AWS pricing changes. Fetch it or use a maintained constant
that is clearly documented and versioned.

```typescript
// supabase/functions/_shared/cost-calculator.ts
// Last updated: 2026-03
// Source: https://aws.amazon.com/pricing/

const AWS_PRICING = {
  // App Runner (per vCPU-hour active + memory-hour active + requests)
  appRunner: {
    perVCPUHourActive: 0.064,      // $0.064/vCPU/hour when processing requests
    perGBHourActive: 0.007,        // $0.007/GB/hour when processing requests
    perVCPUHourIdle: 0.000007,     // Near-zero when idle (scales to 0)
    perGBHourIdle: 0.000007,
    perMillionRequests: 1.00,      // Included in compute, no extra charge
  },
  // ECS Fargate (per vCPU-hour and GB-hour)
  ecsFargate: {
    perVCPUHour: 0.04048,          // $0.04048/vCPU/hour
    perGBHour: 0.004445,           // $0.004445/GB/hour
    // Spot pricing: 70% discount approximately
    spotDiscountFactor: 0.30,      // Pay 30% of on-demand with Spot
  },
  // EKS Control Plane
  eks: {
    controlPlanePer hour: 0.10,    // $0.10/hour = $73/month JUST for control plane
    fargateNodePerVCPU: 0.04048,
    fargateNodePerGB: 0.004445,
  },
  // ALB (Application Load Balancer)
  alb: {
    perHour: 0.008,                // $0.008/hour = $5.84/month base
    perLCU: 0.008,                 // Load Capacity Unit pricing
  },
  // NAT Gateway (expensive! avoid for simple apps)
  natGateway: {
    perHour: 0.045,                // $0.045/hour = $32.40/month
    perGBProcessed: 0.045,         // $0.045/GB
    // NOTE: NAT Gateway alone costs $32/month — avoid unless truly needed
  },
  // ECR (container image storage)
  ecr: {
    perGBMonth: 0.10,              // $0.10/GB/month storage
    transferFree: true,            // Free transfer within same region
  },
  // CloudFront + S3 (static sites)
  cloudfront: {
    perGBTransfer: 0.0085,         // $0.0085/GB (first 10TB)
    per10KRequests: 0.0075,
  },
  s3: {
    perGBMonth: 0.023,
    perMillionPutRequests: 5.00,
    perMillionGetRequests: 0.40,
  },
}

export interface CostEstimate {
  service: string
  monthlyMin: number    // minimum (low traffic scenario)
  monthlyTypical: number // typical usage
  monthlyMax: number    // high traffic
  breakdown: CostBreakdownItem[]
  savingsVsEKS: number  // how much cheaper than EKS
  displayPrice: string  // human-readable: "$8 - $20/month"
}

export interface CostBreakdownItem {
  component: string
  monthlyCost: number
  note: string
}

export function calculateMonthlyCost(
  service: AWSService,
  cpu: number,      // millicores
  memory: number,   // MB
  expectedReqPerMonth: number = 1_000_000
): CostEstimate {

  const cpuVCPU = cpu / 1000
  const memoryGB = memory / 1024
  const hoursPerMonth = 730

  switch (service) {
    case 'app_runner': {
      // App Runner: only pay when handling requests (scales to zero when idle)
      // Assume 20% active time for a typical web app
      const activeHours = hoursPerMonth * 0.20
      const idleHours = hoursPerMonth * 0.80

      const computeCost = (cpuVCPU * AWS_PRICING.appRunner.perVCPUHourActive * activeHours) +
                          (memoryGB * AWS_PRICING.appRunner.perGBHourActive * activeHours) +
                          (cpuVCPU * AWS_PRICING.appRunner.perVCPUHourIdle * idleHours) +
                          (memoryGB * AWS_PRICING.appRunner.perGBHourIdle * idleHours)

      const ecrStorage = 0.50  // typical image ~500MB = $0.05, round up
      const totalMin = computeCost * 0.5  // low traffic = less active time
      const totalTypical = computeCost + ecrStorage
      const totalMax = computeCost * 2.5  // heavy traffic

      return {
        service: 'AWS App Runner',
        monthlyMin: Math.round(totalMin * 100) / 100,
        monthlyTypical: Math.round(totalTypical * 100) / 100,
        monthlyMax: Math.round(totalMax * 100) / 100,
        breakdown: [
          { component: 'App Runner compute', monthlyCost: computeCost, note: 'Scales to zero when idle' },
          { component: 'ECR image storage', monthlyCost: ecrStorage, note: 'Container image storage' },
        ],
        savingsVsEKS: 73 + 32 - totalTypical,  // EKS control plane + NAT - App Runner
        displayPrice: `$${Math.round(totalMin)} - $${Math.round(totalMax)}/month`,
      }
    }

    case 'ecs_fargate': {
      const computeCost = (cpuVCPU * AWS_PRICING.ecsFargate.perVCPUHour * hoursPerMonth) +
                          (memoryGB * AWS_PRICING.ecsFargate.perGBHour * hoursPerMonth)
      const albCost = AWS_PRICING.alb.perHour * hoursPerMonth
      const natCost = AWS_PRICING.natGateway.perHour * hoursPerMonth
      const ecrStorage = 0.50

      const total = computeCost + albCost + natCost + ecrStorage
      const spotTotal = (computeCost * AWS_PRICING.ecsFargate.spotDiscountFactor) + albCost + natCost + ecrStorage

      return {
        service: 'ECS Fargate',
        monthlyMin: Math.round(spotTotal * 100) / 100,
        monthlyTypical: Math.round(total * 100) / 100,
        monthlyMax: Math.round(total * 2 * 100) / 100,
        breakdown: [
          { component: 'Fargate compute', monthlyCost: computeCost, note: `${cpuVCPU} vCPU, ${memoryGB}GB` },
          { component: 'Application Load Balancer', monthlyCost: albCost, note: 'HTTPS termination' },
          { component: 'NAT Gateway', monthlyCost: natCost, note: 'Outbound internet access' },
          { component: 'ECR storage', monthlyCost: ecrStorage, note: 'Container image' },
        ],
        savingsVsEKS: 73 - total,
        displayPrice: `$${Math.round(spotTotal)} - $${Math.round(total * 2)}/month`,
      }
    }

    case 'cloudfront_s3': {
      const s3Cost = 0.50  // typical static site
      const cloudfrontCost = 1.00  // typical static site traffic
      const total = s3Cost + cloudfrontCost

      return {
        service: 'S3 + CloudFront',
        monthlyMin: 0.10,
        monthlyTypical: total,
        monthlyMax: 5.00,
        breakdown: [
          { component: 'S3 storage + requests', monthlyCost: s3Cost, note: 'Static file hosting' },
          { component: 'CloudFront CDN', monthlyCost: cloudfrontCost, note: 'Global distribution + HTTPS' },
        ],
        savingsVsEKS: 73 + 32 - total,
        displayPrice: `$0.10 - $5/month`,
      }
    }

    // EKS case — only shown when truly needed
    case 'eks_fargate':
    case 'eks_ec2': {
      const controlPlaneCost = AWS_PRICING.eks.controlPlanePerHour * hoursPerMonth
      const nodeCost = (cpuVCPU * AWS_PRICING.eks.fargateNodePerVCPU * hoursPerMonth) +
                       (memoryGB * AWS_PRICING.eks.fargateNodePerGB * hoursPerMonth)
      const albCost = AWS_PRICING.alb.perHour * hoursPerMonth
      const natCost = AWS_PRICING.natGateway.perHour * hoursPerMonth
      const total = controlPlaneCost + nodeCost + albCost + natCost

      return {
        service: 'Amazon EKS',
        monthlyMin: Math.round(total * 100) / 100,
        monthlyTypical: Math.round(total * 1.3 * 100) / 100,
        monthlyMax: Math.round(total * 3 * 100) / 100,
        breakdown: [
          { component: 'EKS control plane', monthlyCost: controlPlaneCost, note: 'Fixed cost regardless of workload' },
          { component: 'Fargate nodes', monthlyCost: nodeCost, note: `${cpuVCPU} vCPU, ${memoryGB}GB` },
          { component: 'Application Load Balancer', monthlyCost: albCost, note: 'HTTPS termination' },
          { component: 'NAT Gateway', monthlyCost: natCost, note: 'Outbound internet access' },
        ],
        savingsVsEKS: 0,
        displayPrice: `$${Math.round(total)} - $${Math.round(total * 3)}/month`,
      }
    }

    default:
      throw new Error(`Unknown service: ${service}`)
  }
}
```

---

# PART 2 — MULTI-AGENT DEPLOYMENT PIPELINE
# Replace: single monolithic die-analyze function
# With: 4 specialized agents running sequentially

## Agent Architecture

```
User clicks Deploy
     ↓
[AGENT 1: ANALYZER] (~15 seconds)
  - Fetch repo files via GitHub API (parallel, not sequential)
  - Run application classification
  - Detect all build commands
  - Calculate cost estimate
  - Returns: AppClassification object
     ↓
[AGENT 2: COST OPTIMIZER] (~5 seconds)
  - Takes AppClassification
  - Runs 3 infrastructure scenarios: cheapest / balanced / performance
  - Uses LLM to analyze if cost can be reduced further
  - Returns: InfrastructurePlan with 3 options
     ↓
User sees cost options and selects one (or auto-selects cheapest)
     ↓
[AGENT 3: PROVISIONER] (13-22 min for EKS, 3-5 min for App Runner/ECS)
  - Provisions the selected infrastructure
  - Streams real-time progress
  - Returns: live_url + infrastructure details
     ↓
[AGENT 4: VALIDATOR] (~30 seconds)
  - Hits the live_url with health checks
  - Runs smoke tests
  - If fails: attempts 2 auto-fixes before escalating to user
  - Returns: deployment_status + health_report
```

## Agent 1: Analyzer (Fast — must complete in < 15 seconds)

```typescript
// supabase/functions/analyze-repository/index.ts

// KEY OPTIMIZATION: Fetch all files in PARALLEL, not sequentially
async function fetchRepositoryFiles(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<Map<string, string>> {
  // Get file tree first (one API call)
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const tree = await treeRes.json()

  // Identify which config files to fetch
  const targetFiles = [
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile',
    'go.mod', 'go.sum',
    'pom.xml', 'build.gradle', 'build.gradle.kts',
    'Gemfile', 'Gemfile.lock',
    'Cargo.toml',
    'composer.json',
    'Dockerfile',
    '.nvmrc', '.node-version', '.python-version', '.ruby-version',
    'Procfile',
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'vite.config.js', 'vite.config.ts',
    'angular.json',
    'nuxt.config.js', 'nuxt.config.ts',
  ]

  const existingFiles = tree.tree
    ?.filter((f: any) => targetFiles.includes(f.path) && f.type === 'blob')
    ?.map((f: any) => f.path) || []

  // Fetch all files IN PARALLEL (this is the performance fix — was sequential before)
  const fetchPromises = existingFiles.map(async (filename: string) => {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return [filename, null]
    const data = await res.json()
    const content = atob(data.content.replace(/\n/g, ''))
    return [filename, content]
  })

  const results = await Promise.allSettled(fetchPromises)
  const fileMap = new Map<string, string>()

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value[1]) {
      fileMap.set(result.value[0] as string, result.value[1] as string)
    }
  }

  return fileMap
}
```

## Agent 2: Cost Optimizer (LLM-powered)

```typescript
// supabase/functions/optimize-cost/index.ts
// This agent uses LLM to generate 3 infrastructure options with real cost tradeoffs

async function generateInfrastructureOptions(
  classification: AppClassification,
  orgBudgetPreference: 'cheapest' | 'balanced' | 'performance' | null
): Promise<InfrastructureOptions> {

  // Always generate 3 options
  const options: InfrastructureOption[] = []

  // Option 1: Cheapest viable option
  const cheapestService = selectCheapestService(classification)
  const cheapestCost = calculateMonthlyCost(cheapestService, classification.estimatedCPU, classification.estimatedMemory)
  options.push({
    id: 'cheapest',
    label: 'Cost-optimized',
    description: getCheapestDescription(cheapestService),
    service: cheapestService,
    cost: cheapestCost,
    tradeoffs: getCheapestTradeoffs(cheapestService),
    recommended: orgBudgetPreference === 'cheapest' || orgBudgetPreference === null,
  })

  // Option 2: Balanced (usually ECS Fargate)
  const balancedService = 'ecs_fargate'
  const balancedCost = calculateMonthlyCost(balancedService, classification.estimatedCPU * 1.5, classification.estimatedMemory * 1.5)
  options.push({
    id: 'balanced',
    label: 'Balanced',
    description: 'ECS Fargate with ALB — production-grade reliability, moderate cost',
    service: balancedService,
    cost: balancedCost,
    tradeoffs: ['Persistent service (no cold starts)', 'Full autoscaling', 'Higher base cost than App Runner'],
    recommended: orgBudgetPreference === 'balanced',
  })

  // Option 3: Performance (more resources, same service or step up)
  const perfService = classification.estimatedCPU >= 2000 ? 'eks_fargate' : 'ecs_fargate'
  const perfCost = calculateMonthlyCost(perfService, classification.estimatedCPU * 2, classification.estimatedMemory * 2)
  options.push({
    id: 'performance',
    label: 'Performance',
    description: perfService === 'eks_fargate'
      ? 'EKS Fargate — Kubernetes orchestration for complex workloads'
      : 'ECS Fargate (high-spec) — double the resources for peak traffic handling',
    service: perfService,
    cost: perfCost,
    tradeoffs: perfService === 'eks_fargate'
      ? ['Full Kubernetes API', 'Complex to debug', 'Highest cost']
      : ['More CPU/memory headroom', 'Handles traffic spikes better', 'Higher cost than balanced'],
    recommended: orgBudgetPreference === 'performance',
  })

  // LLM analysis for non-obvious optimizations
  // Only call LLM if there's something nuanced to analyze
  if (classification.hasDatabase || classification.hasQueue || classification.hasWebsockets) {
    const llmAdvice = await getLLMCostAdvice(classification, options)
    // Inject LLM advice into the options as additional notes
    options[0].llmNote = llmAdvice.cheapestNote
    options[1].llmNote = llmAdvice.balancedNote
  }

  return {
    options,
    defaultChoice: orgBudgetPreference || 'cheapest',
    analysisNotes: generateAnalysisNotes(classification),
  }
}

function selectCheapestService(c: AppClassification): AWSService {
  if (c.appType === 'static-site') return 'cloudfront_s3'
  if (c.appType === 'worker') return 'ecs_fargate_no_alb'  // No ALB = no $5.84/month ALB cost

  // For API apps: App Runner is almost always cheapest due to scale-to-zero
  if (!c.isStateful && !c.hasWebsockets) return 'app_runner'

  // For stateful apps: ECS Fargate with Spot (70% discount on compute)
  return 'ecs_fargate_spot'
}
```

---

# PART 3 — REAL BUILD LOGS + DEPLOYMENT UX
# Replace: fake progress bar
# With: streaming real logs during build and deploy

## 3.1 — The Deployment Progress System

The onboarding deploy screen must show REAL logs, not a fake progress bar.
The user sees exactly what is happening, line by line, in real time.

### Frontend: DeploymentProgressView Component

```jsx
// src/components/deploy/DeploymentProgressView.jsx
// This replaces the current fake progress stepper

// Stage definitions — each stage has real duration expectations
const STAGES = [
  {
    id: 'analyzing',
    label: 'Analyzing repository',
    icon: Search,
    expectedDuration: 15000,  // 15 seconds
    logs: [],  // filled in real-time
  },
  {
    id: 'optimizing',
    label: 'Optimizing infrastructure plan',
    icon: Cpu,
    expectedDuration: 5000,
  },
  // User sees cost options here — this is NOT a stage but an interaction point
  {
    id: 'provisioning',
    label: 'Provisioning infrastructure',
    icon: Cloud,
    expectedDuration: 300000,  // 5 min for App Runner, 22 min for EKS
    // This stage shows a REAL substage breakdown:
    substages: [
      { id: 'vpc', label: 'Creating VPC and subnets', duration: 15000 },
      { id: 'security', label: 'Configuring security groups', duration: 8000 },
      { id: 'cluster', label: 'Starting compute environment', duration: 180000 },  // longest
      { id: 'networking', label: 'Setting up load balancer', duration: 30000 },
    ]
  },
  {
    id: 'building',
    label: 'Building Docker image',
    icon: Package,
    expectedDuration: 120000,  // 2 minutes typical
    // This stage streams REAL build logs from CodeBuild
  },
  {
    id: 'deploying',
    label: 'Deploying application',
    icon: Rocket,
    expectedDuration: 60000,
  },
  {
    id: 'validating',
    label: 'Running health checks',
    icon: ShieldCheck,
    expectedDuration: 30000,
  },
]

export function DeploymentProgressView({ deploymentId }) {
  const [stages, setStages] = useState(STAGES)
  const [currentStageId, setCurrentStageId] = useState('analyzing')
  const [buildLogs, setBuildLogs] = useState([])
  const [error, setError] = useState(null)
  const logsEndRef = useRef(null)

  // Subscribe to real-time deployment updates
  useEffect(() => {
    const channel = supabase
      .channel(`deployment:${deploymentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'deployments',
        filter: `id=eq.${deploymentId}`
      }, (payload) => {
        const deployment = payload.new
        setCurrentStageId(deployment.current_stage)

        // If there are build logs, display them
        if (deployment.build_logs) {
          setBuildLogs(deployment.build_logs)
        }

        // If there's an error, show it with intelligence
        if (deployment.status === 'failed') {
          setError(deployment.error_analysis)
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [deploymentId])

  // Auto-scroll build logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [buildLogs])

  return (
    <div className="space-y-6">
      {/* Stage tracker */}
      <div className="space-y-3">
        {STAGES.map((stage, i) => (
          <StageRow
            key={stage.id}
            stage={stage}
            status={getStageStatus(stage.id, currentStageId)}
          />
        ))}
      </div>

      {/* Real build logs — only show during 'building' stage */}
      {currentStageId === 'building' && buildLogs.length > 0 && (
        <BuildLogTerminal logs={buildLogs} logsEndRef={logsEndRef} />
      )}

      {/* Error display — intelligent, not cryptic */}
      {error && <DeploymentErrorCard error={error} deploymentId={deploymentId} />}
    </div>
  )
}
```

### Build Log Terminal Component

```jsx
function BuildLogTerminal({ logs, logsEndRef }) {
  return (
    <div className="rounded-xl overflow-hidden border border-[#1C2235]">
      {/* macOS-style terminal header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0C0F17] border-b border-[#1C2235]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28CA41]" />
        </div>
        <span className="text-xs text-[#4A5168] font-mono ml-2">Build logs — CodeBuild</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-xs text-[#4A5168]">LIVE</span>
        </div>
      </div>

      {/* Log body */}
      <div className="bg-[#07090E] p-4 h-64 overflow-y-auto font-mono text-xs">
        {logs.map((line, i) => (
          <LogLine key={i} line={line} />
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

function LogLine({ line }) {
  // Parse log line type for coloring
  const isError = line.level === 'error' || line.text?.match(/^(Error|FAILED|error:)/i)
  const isSuccess = line.level === 'success' || line.text?.match(/^(Successfully|✓|Step \d+\/\d+ : .+ DONE)/i)
  const isStep = line.text?.match(/^Step \d+\/\d+/)
  const isWarning = line.text?.match(/^(Warning|WARN)/i)

  const color = isError ? '#f43f5e' :
                isSuccess ? '#4ade80' :
                isStep ? '#60a5fa' :
                isWarning ? '#f59e0b' :
                '#7A8099'

  return (
    <div className="flex gap-3 py-0.5 hover:bg-[#0C0F17] rounded px-1">
      <span className="text-[#4A5168] shrink-0 tabular-nums">
        {new Date(line.timestamp).toLocaleTimeString('en', { hour12: false })}
      </span>
      <span style={{ color }}>{line.text}</span>
    </div>
  )
}
```

## 3.2 — Intelligent Error Analysis

When a build or deployment fails, AutoStack must behave like a compiler — not show a generic error.

```typescript
// supabase/functions/analyze-deployment-error/index.ts

interface ErrorAnalysis {
  category: 'build_error' | 'config_error' | 'infra_error' | 'code_error' | 'timeout'
  title: string           // Human-readable: "npm install failed"
  explanation: string     // What went wrong
  exactError: string      // The exact error line from logs
  suggestedFix: string    // Specific actionable fix
  autoFixAvailable: boolean
  autoFixDescription?: string
  documentationLink?: string
  estimatedFixTime: string  // "2 minutes", "5 minutes", "requires code change"
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /npm ERR! code ENOENT/,
    category: 'build_error',
    title: 'Package not found',
    explanation: 'npm could not find a package listed in package.json.',
    suggestedFix: 'Check package.json for typos in dependency names.',
    autoFixAvailable: false,
    estimatedFixTime: '2 minutes (requires code change)',
  },
  {
    pattern: /npm ERR! code EACCES/,
    category: 'config_error',
    title: 'Permission error during npm install',
    explanation: 'The build container does not have write permissions.',
    suggestedFix: 'AutoStack will retry with corrected Dockerfile permissions.',
    autoFixAvailable: true,
    autoFixDescription: 'Add --unsafe-perm flag to npm install command',
    estimatedFixTime: '< 1 minute (auto-fixing)',
  },
  {
    pattern: /Cannot find module ['"](.+)['"]/,
    category: 'code_error',
    title: 'Missing module: $1',
    explanation: 'A module is imported in code but not listed in package.json.',
    suggestedFix: 'Add $1 to your package.json dependencies.',
    autoFixAvailable: false,
    estimatedFixTime: 'Requires code change',
  },
  {
    pattern: /Port \d+ is already in use/,
    category: 'config_error',
    title: 'Port conflict',
    explanation: 'The application port is already in use in the container.',
    suggestedFix: 'AutoStack will reconfigure the container to use PORT environment variable.',
    autoFixAvailable: true,
    autoFixDescription: 'Update start command to use $PORT',
    estimatedFixTime: '< 1 minute (auto-fixing)',
  },
  {
    pattern: /OutOfMemoryError|Killed.*process/,
    category: 'infra_error',
    title: 'Out of memory during build',
    explanation: 'The build process ran out of memory.',
    suggestedFix: 'AutoStack will retry with 2x memory allocation.',
    autoFixAvailable: true,
    autoFixDescription: 'Upgrade CodeBuild compute type to 4GB RAM',
    estimatedFixTime: '< 2 minutes (auto-fixing)',
  },
  {
    pattern: /Build timed out/,
    category: 'timeout',
    title: 'Build timeout (exceeded 30 minutes)',
    explanation: 'Your build is taking too long. This usually means a dependency install is hanging.',
    suggestedFix: 'Check for interactive prompts in install scripts. Add --yes or --non-interactive flags.',
    autoFixAvailable: false,
    estimatedFixTime: 'Requires code change',
  },
  {
    pattern: /error TS\d+: (.+)/,
    category: 'code_error',
    title: 'TypeScript compilation error',
    explanation: 'TypeScript found type errors that prevent building.',
    suggestedFix: 'Fix the TypeScript errors shown below. AutoStack detected them from your source.',
    autoFixAvailable: false,
    estimatedFixTime: 'Requires code change',
  },
]

export async function analyzeBuildError(buildLogs: string[]): Promise<ErrorAnalysis> {
  const logText = buildLogs.join('\n')

  // Try pattern matching first (fast, free)
  for (const pattern of ERROR_PATTERNS) {
    const match = logText.match(pattern.pattern)
    if (match) {
      const analysis = {
        ...pattern,
        title: pattern.title.replace('$1', match[1] || ''),
        suggestedFix: pattern.suggestedFix.replace('$1', match[1] || ''),
        exactError: extractExactErrorLine(logText, pattern.pattern),
      }

      // Auto-fix if available
      if (pattern.autoFixAvailable) {
        return { ...analysis, autoFixTriggered: true }
      }

      return analysis
    }
  }

  // No pattern matched — use LLM to analyze (costs money, so only as fallback)
  return await analyzeBuildErrorWithLLM(buildLogs)
}

async function analyzeBuildErrorWithLLM(logs: string[]): Promise<ErrorAnalysis> {
  // Truncate logs to last 100 lines (most relevant)
  const relevantLogs = logs.slice(-100).join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',  // Cheapest capable model
      max_tokens: 500,
      messages: [{
        role: 'system',
        content: `You are a build error analyzer for a cloud deployment platform.
Analyze the build logs and return JSON with:
{
  "category": "build_error|config_error|code_error|infra_error",
  "title": "Short title of what went wrong",
  "explanation": "One sentence explaining the root cause",
  "suggestedFix": "Specific actionable fix the developer can take",
  "autoFixAvailable": false,
  "estimatedFixTime": "estimate"
}
Be specific. Reference exact file names and line numbers if visible in logs.`
      }, {
        role: 'user',
        content: `Build failed. Last 100 lines:\n\n${relevantLogs}`
      }]
    })
  })

  const data = await response.json()
  return JSON.parse(data.choices[0].message.content)
}
```

---

# PART 4 — PROMETHEUS + GRAFANA OBSERVABILITY

## 4.1 — Architecture

```
User's AWS Cluster
  ↓
Prometheus (scrapes metrics from app + K8s/ECS)
  ↓
Remote Write to Grafana Cloud (free tier: 10K series, 14d retention)
  OR
Remote Write to a Managed Prometheus in the same account
  ↓
AutoStack Dashboard embeds Grafana panels via iframe OR queries directly
```

For simplicity and zero additional cost, use **Grafana Cloud free tier**.
It receives metrics via Prometheus remote_write, provides dashboards,
and supports iframe embedding.

## 4.2 — Automatic Metrics Setup

When a deployment is created, AutoStack automatically:
1. Adds a Prometheus sidecar or configures app metrics endpoint
2. Deploys a lightweight Prometheus agent (Grafana Alloy/Agent) to the cluster
3. Configures remote_write to the user's Grafana Cloud workspace
4. Provisions pre-built dashboards using Grafana API

```typescript
// supabase/functions/setup-observability/index.ts

async function setupObservability(deployment: Deployment, cluster: Cluster) {

  // 1. Provision Grafana Cloud stack (free tier supports this via API)
  const grafanaStack = await provisionGrafanaCloudStack({
    orgId: deployment.org_id,
    region: cluster.region,
    stackName: `autostack-${deployment.org_id.slice(0, 8)}`
  })

  // 2. Generate Prometheus remote_write config
  const prometheusConfig = generatePrometheusConfig(
    grafanaStack.prometheusEndpoint,
    grafanaStack.prometheusToken,
    deployment.environment_name
  )

  // 3. Deploy Grafana Alloy (lightweight metrics agent) to the cluster
  // This is a single DaemonSet/sidecar that:
  // - Scrapes /metrics from the app container
  // - Scrapes node metrics
  // - Remote writes to Grafana Cloud
  await deployMetricsAgent(cluster, prometheusConfig)

  // 4. Provision dashboards using Grafana API
  await provisionDashboards(grafanaStack, deployment)

  // 5. Store Grafana details for embedding in AutoStack dashboard
  await supabase.from('deployments').update({
    grafana_dashboard_url: grafanaStack.dashboardUrl,
    grafana_embed_token: grafanaStack.embedToken,
    metrics_configured: true,
  }).eq('id', deployment.id)
}
```

## 4.3 — AutoStack Dashboard Monitoring Tab

The Monitoring tab must show:
1. **App metrics** (requests/sec, latency p50/p99, error rate)
2. **Infrastructure metrics** (CPU%, memory%, network)
3. **Deployment timeline** (vertical lines on charts showing when deploys happened)
4. **Cost over time** (correlated with traffic)

For the initial implementation (before full Grafana integration):
Query metrics directly from `cluster_metrics` table using Recharts.
The Grafana integration is an enhancement that adds more depth.

The CURRENT metrics display already exists — keep it. Enhance it.
Add a "Full dashboard" button that opens the Grafana Cloud embedded view.

---

# PART 5 — THE COST DISPLAY UI
# Replace: "$187/month" hardcoded horror
# With: transparent, detailed, comparable cost breakdown

## CostEstimateCard Component

```jsx
// src/components/deploy/CostEstimateCard.jsx

export function CostEstimateCard({ options, selectedOption, onSelect }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-[#f1f5f9]">Choose your infrastructure</h3>
        <p className="text-xs text-[#7A8099] mt-0.5">
          AutoStack analyzed your app and recommends the most cost-efficient option.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {options.map(option => (
          <button
            key={option.id}
            onClick={() => onSelect(option)}
            className={`
              relative p-4 rounded-xl border text-left transition-all
              ${selectedOption?.id === option.id
                ? 'border-[#2463eb] bg-[#2463eb]/10'
                : 'border-[#1C2235] bg-[#0d1117] hover:border-[#334366]'
              }
            `}
          >
            {option.recommended && (
              <div className="absolute -top-2 left-3 bg-[#2463eb] text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                RECOMMENDED
              </div>
            )}

            <div className="text-sm font-medium text-[#f1f5f9] mb-1">{option.label}</div>
            <div className="text-xs text-[#7A8099] mb-3">{option.service}</div>

            <div className="text-xl font-bold text-[#f1f5f9] font-mono">
              {option.cost.displayPrice}
            </div>

            {/* Cost breakdown */}
            <div className="mt-3 pt-3 border-t border-[#1C2235] space-y-1">
              {option.cost.breakdown.map(item => (
                <div key={item.component} className="flex justify-between text-xs">
                  <span className="text-[#4A5168]">{item.component}</span>
                  <span className="text-[#7A8099] font-mono">${item.monthlyCost.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Tradeoffs */}
            <div className="mt-3 space-y-1">
              {option.tradeoffs?.map((t, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-[#7A8099]">
                  <span>·</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>

            {/* LLM insight if available */}
            {option.llmNote && (
              <div className="mt-2 p-2 rounded-lg bg-[#111520] border border-[#1C2235]">
                <div className="flex gap-1.5 items-start">
                  <Sparkles className="w-3 h-3 text-[#a78bfa] mt-0.5 shrink-0" />
                  <p className="text-[10px] text-[#7A8099]">{option.llmNote}</p>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Comparison to EKS */}
      {options[0]?.cost.savingsVsEKS > 10 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#4ade80]/5 border border-[#4ade80]/20">
          <TrendingDown className="w-4 h-4 text-[#4ade80]" />
          <p className="text-xs text-[#4ade80]">
            AutoStack saved you ${Math.round(options[0].cost.savingsVsEKS)}/month by
            choosing {options[0].service} over EKS for this workload.
          </p>
        </div>
      )}
    </div>
  )
}
```

---

# PART 6 — IMPLEMENTATION ORDER (DO NOT DEVIATE)

Execute in this EXACT order. Do not start Step N+1 until Step N is verified working.

## Step 1: Cost Calculator (no AWS calls, just math)
Files to create/modify:
- `supabase/functions/_shared/cost-calculator.ts` — NEW
- `supabase/functions/_shared/app-classifier.ts` — NEW

Verification: Write a unit test that takes a package.json with Express and verifies:
- Service selected = 'app_runner' (not EKS)
- Monthly cost < $25
- displayPrice does NOT show $187

---

## Step 2: Build Command Auto-Detector
Files to create/modify:
- `supabase/functions/_shared/command-detector.ts` — NEW

Verification: Test with 6 different repos (Node/Express, Next.js, Python Flask, Go, Java, React SPA).
For each: verify correct build + start command detected with zero user input.

---

## Step 3: Parallel File Fetcher
Files to modify:
- `supabase/functions/die-analyze/index.ts` — Replace sequential fetches with Promise.allSettled

Verification: Measure time from function call to classification complete. Must be < 15 seconds.

---

## Step 4: Infrastructure Options Generator
Files to create:
- `supabase/functions/optimize-cost/index.ts` — NEW

Verification: Call with a simple Express app classification. Verify 3 options returned.
Option 1 must use App Runner. Option 3 must NOT use EKS (for a simple app).

---

## Step 5: Frontend Cost Display
Files to create/modify:
- `src/components/deploy/CostEstimateCard.jsx` — NEW
- `src/pages/OnboardingPage.jsx` — Integrate CostEstimateCard after analysis

Verification: Screenshot showing 3 cost options with real breakdown. No $187 number visible.

---

## Step 6: Build Log Streaming
Files to create/modify:
- `supabase/functions/build-and-deploy/index.ts` — Add log streaming
- `src/components/deploy/DeploymentProgressView.jsx` — NEW (replace fake progress)
- `src/components/deploy/BuildLogTerminal.jsx` — NEW

Verification: Trigger a real deployment. Verify build logs stream in real-time to the terminal component.

---

## Step 7: Error Analysis
Files to create:
- `supabase/functions/analyze-deployment-error/index.ts` — NEW

Verification: Intentionally break a build (bad package.json). Verify error card shows specific, actionable message, not "Build failed".

---

## Step 8: Observability Setup
Files to create:
- `supabase/functions/setup-observability/index.ts` — NEW

Verification: After deployment, verify Grafana Cloud dashboard is accessible. Metrics appear within 60 seconds.

---

# CRITICAL RULES FOR THIS ENTIRE IMPLEMENTATION

1. NEVER hardcode $187 or any AWS price. All costs are calculated from the pricing constants.

2. NEVER suggest EKS for a simple app. EKS is only suggested when:
   - The repo contains kubernetes/ or k8s/ directories
   - The repo contains Helm charts
   - The app has 5+ microservices
   A single Node.js Express app NEVER gets EKS.

3. NEVER ask the user for build commands. The classifier must detect 100% of cases.
   For the < 1% it cannot detect: show a sensible default and let user override.

4. NEVER show a fake progress bar. Every stage shows either real logs or a meaningful substage.

5. NEVER show a cryptic error like "Exit code 1". Always show:
   - What failed (specific)
   - Why it failed (root cause)
   - How to fix it (actionable)
   - Whether AutoStack can auto-fix it

6. Build analysis MUST complete in < 15 seconds. Parallel file fetching is mandatory.

7. The 3 cost options MUST show real itemized breakdowns. User sees exactly what they pay for.

8. Cost comparisons against naive EKS choice must be shown to reinforce AutoStack's value.
