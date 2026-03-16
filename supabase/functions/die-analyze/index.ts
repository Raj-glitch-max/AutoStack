import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getInstallationToken } from '../_shared/github.ts'
import { CORS_HEADERS, corsResponse, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { createRedisClient } from '../_shared/redis.ts'
import { validateOrRespond } from '../_shared/validator.ts'
import { classifyApplication, AppClassification } from '../_shared/app-classifier.ts'

// ---------------------------------------------------------------------------
// Parallel File Fetcher — PERFORMANCE CRITICAL
// ---------------------------------------------------------------------------

async function fetchRepositoryFiles(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<{ files: Map<string, string>; fileCount: number; repoSize: number }> {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'AutoStack-App',
    'Accept': 'application/vnd.github+json'
  }

  // Get file tree (one API call)
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  )

  if (!treeRes.ok) {
    if (treeRes.status === 404) {
      throw new Error('GITHUB_APP_NOT_INSTALLED')
    }
    throw new Error(`GitHub API error: ${treeRes.statusText}`)
  }

  const treeData = await treeRes.json()
  const tree = treeData.tree || []

  // Target config files to fetch
  const targetFiles = [
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile',
    'go.mod', 'go.sum',
    'pom.xml', 'build.gradle', 'build.gradle.kts',
    'Gemfile', 'Gemfile.lock',
    'Cargo.toml',
    'composer.json',
    'Dockerfile', 'docker-compose.yml',
    '.nvmrc', '.node-version', '.python-version', '.ruby-version',
    'Procfile',
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'vite.config.js', 'vite.config.ts',
    'angular.json',
    'nuxt.config.js', 'nuxt.config.ts',
  ]

  const existingFiles = tree
    .filter((f: any) => targetFiles.includes(f.path) && f.type === 'blob')
    .map((f: any) => f.path)

  // Fetch all files IN PARALLEL (critical performance optimization)
  const fetchPromises = existingFiles.map(async (filename: string) => {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`,
        { headers }
      )
      if (!res.ok) return [filename, null]
      
      const data = await res.json()
      const content = atob(data.content.replace(/\n/g, ''))
      return [filename, content]
    } catch {
      return [filename, null]
    }
  })

  const results = await Promise.allSettled(fetchPromises)
  const fileMap = new Map<string, string>()

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value[1]) {
      fileMap.set(result.value[0] as string, result.value[1] as string)
    }
  }

  const repoSize = tree.reduce((sum: number, f: any) => sum + (f.size || 0), 0)
  const fileCount = tree.length

  return { files: fileMap, fileCount, repoSize }
}

// ---------------------------------------------------------------------------
// Manifest Generation — 7 K8s/Docker files
// ---------------------------------------------------------------------------

function generateDockerfile(classification: AppClassification): string | null {
  const stack = {
    language: classification.language,
    framework: classification.framework,
    port: classification.port,
    startCmd: classification.startCommand
  }
  switch (stack.language) {
    case 'Node.js':
      if (stack.framework === 'Next.js') {
        return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE ${stack.port}
CMD ["npm", "start"]`
      }
      return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE ${stack.port}
CMD ["npm", "start"]`

    case 'Python':
      return `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${stack.port}
CMD ["${stack.startCmd.split(' ')[0]}", ${stack.startCmd.split(' ').slice(1).map(a => `"${a}"`).join(', ')}]`

    case 'Go':
      return `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o main .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE ${stack.port}
CMD ["./main"]`

    case 'Java':
      return `FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE ${stack.port}
CMD ["java", "-jar", "app.jar"]`

    case 'Rust':
      return `FROM rust:1.77 AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/app /usr/local/bin/
EXPOSE ${stack.port}
CMD ["app"]`

    default:
      return null
  }
}

function generateK8sDeployment(projectName: string, classification: AppClassification): string {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${projectName}
  labels:
    app: ${projectName}
    managed-by: autostack
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${projectName}
  template:
    metadata:
      labels:
        app: ${projectName}
    spec:
      containers:
        - name: ${projectName}
          image: IMAGE_PLACEHOLDER
          ports:
            - containerPort: ${classification.port}
          resources:
            requests:
              cpu: "${classification.estimatedCPU}m"
              memory: "${classification.estimatedMemory}Mi"
            limits:
              cpu: "${classification.estimatedCPU * 2}m"
              memory: "${classification.estimatedMemory * 2}Mi"
          livenessProbe:
            httpGet:
              path: ${classification.healthCheckPath}
              port: ${classification.port}
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: ${classification.healthCheckPath}
              port: ${classification.port}
            initialDelaySeconds: 5
            periodSeconds: 5
          securityContext:
            runAsNonRoot: true
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false`
}

function generateK8sService(projectName: string, classification: AppClassification): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: ${projectName}
  labels:
    app: ${projectName}
    managed-by: autostack
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: ${classification.port}
      protocol: TCP
  selector:
    app: ${projectName}`
}

function generateIngress(projectName: string): string {
  return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${projectName}
  labels:
    managed-by: autostack
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  rules:
    - host: ${projectName}.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${projectName}
                port:
                  number: 80
  tls:
    - hosts:
        - ${projectName}.example.com
      secretName: ${projectName}-tls`
}

function generateHPA(projectName: string): string {
  return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${projectName}
  labels:
    managed-by: autostack
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${projectName}
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70`
}

function generateNetworkPolicy(projectName: string): string {
  return `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${projectName}
  labels:
    managed-by: autostack
spec:
  podSelector:
    matchLabels:
      app: ${projectName}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 80
  egress:
    - to: []`
}

function generateArgoApp(projectName: string, repoUrl: string, branch: string): string {
  return `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${projectName}
  namespace: argocd
  labels:
    managed-by: autostack
spec:
  project: default
  source:
    repoURL: ${repoUrl}
    targetRevision: ${branch}
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: ${projectName}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true`
}

// ---------------------------------------------------------------------------
// GitHub PR Creation — real branch + file tree + PR via API
// ---------------------------------------------------------------------------

async function openManifestPR(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  files: { path: string; content: string }[],
  classification: AppClassification
): Promise<string> {
  const prBranch = 'autostack/initial-setup'
  const headers = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'AutoStack-App',
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  }

  // 1. Get SHA of the base branch
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers })
  if (!refRes.ok) {
    if (refRes.status === 404) {
      throw new Error('GITHUB_APP_NOT_INSTALLED: Cannot access the repository. Please install the AutoStack GitHub App at https://github.com/apps/autostack')
    }
    throw new Error(`Failed to read branch ref: ${refRes.status}`)
  }
  const refData = await refRes.json()
  const baseSha = refData.object.sha

  // 2. Create blobs for each file
  const blobs = []
  for (const file of files) {
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' })
    })
    if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`)
    const blob = await blobRes.json()
    blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  // 3. Create tree
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ base_tree: baseSha, tree: blobs })
  })
  if (!treeRes.ok) throw new Error('Failed to create git tree')
  const tree = await treeRes.json()

  // 4. Create commit
  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: `chore(autostack): add infrastructure for ${classification.framework} deployment\n\nGenerated by AutoStack.\nStack: ${classification.language}/${classification.framework}\nService: ${classification.recommendedService}\nEstimated cost: ${classification.monthlyEstimate.displayPrice}\n\n[autostack-skip]`,
      tree: tree.sha,
      parents: [baseSha]
    })
  })
  if (!commitRes.ok) throw new Error('Failed to create commit')
  const commit = await commitRes.json()

  // 5. Create branch (or update if exists)
  const createBranchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: commit.sha })
  })

  if (!createBranchRes.ok && createBranchRes.status === 422) {
    // Branch already exists — update it
    await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${prBranch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commit.sha, force: true })
    })
  }

  // 6. Create Pull Request
  const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `[AutoStack] Add infrastructure for ${classification.framework}`,
      body: `## 🚀 AutoStack Infrastructure Setup

This PR was generated by **AutoStack**.

### Detected Stack
- **Language**: ${classification.language}
- **Framework**: ${classification.framework}
- **Type**: ${classification.appType}
- **Port**: ${classification.port}
- **Service**: ${classification.recommendedService}

### Cost Estimate
${classification.monthlyEstimate.displayPrice}

**Breakdown:**
${classification.monthlyEstimate.breakdown.map(item => 
  `- ${item.component}: $${item.monthlyCost}/month — ${item.note}`
).join('\n')}

${classification.monthlyEstimate.savingsVsEKS > 10 ? 
  `\n💰 **Savings**: AutoStack selected ${classification.recommendedService} instead of EKS, saving you $${Math.round(classification.monthlyEstimate.savingsVsEKS)}/month.\n` : 
  ''
}

### Files Added
${files.map(f => `- \`${f.path}\``).join('\n')}

### What happens next?
1. Review and merge this PR
2. AutoStack will automatically provision your AWS infrastructure
3. Your app will be deployed and accessible via HTTPS

---
*Generated by AutoStack — [autostack.io](https://autostack.io)*`,
      head: prBranch,
      base: branch
    })
  })

  if (!prRes.ok) {
    const prErr = await prRes.json()
    // If PR already exists, find and return the existing one
    if (prErr.errors?.some((e: any) => e.message?.includes('already exists'))) {
      const existingRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${prBranch}&state=open`, { headers })
      const existing = await existingRes.json()
      if (existing.length > 0) return existing[0].html_url
    }
    throw new Error(`Failed to create PR: ${prErr.message || JSON.stringify(prErr)}`)
  }

  const pr = await prRes.json()
  return pr.html_url
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const startTime = Date.now()

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const redis = createRedisClient()

    // Auth
    const authHeader = req.headers.get('Authorization')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader?.replace('Bearer ', '') || '')
    if (authError || !user) return errorResponse(401, 'Unauthorized')

    const body = await req.json()

    // Validation
    const validationError = validateOrRespond(body, {
      project_id: { type: 'uuid', required: true },
      installation_id: { type: 'string', required: true },
    }, CORS_HEADERS)
    if (validationError) return validationError

    const { project_id, installation_id } = body

    // Stage 1: Load project
    const { data: project, error: projectErr } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()

    if (projectErr || !project) return errorResponse(404, 'Project not found')
    if (project.org_id !== user.user_metadata?.org_id) {
      return errorResponse(403, 'Forbidden: Project belongs to another organization')
    }

    await supabaseClient.from('projects').update({ analysis_status: 'analyzing' }).eq('id', project_id)

    // GitHub — get installation token
    let token: string
    try {
      token = await getInstallationToken(installation_id, redis)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('404') || msg.includes('Not Found')) {
        return errorResponse(404, 'GitHub App is not installed on this repository. Please install at https://github.com/apps/autostack', 'GITHUB_APP_NOT_INSTALLED')
      }
      throw err
    }

    const repoPath = project.repo_url.replace(/\.git$/, '').split('github.com/')[1]
    if (!repoPath) return errorResponse(400, 'Invalid repo URL format')
    const [owner, repo] = repoPath.split('/')
    const branch = project.branch || 'main'

    // Stage 2: Fetch repository files IN PARALLEL (performance critical)
    console.log(`[DIE] Fetching files for ${owner}/${repo}...`)
    const fetchStart = Date.now()
    
    let files: Map<string, string>
    let fileCount: number
    let repoSize: number
    
    try {
      const result = await fetchRepositoryFiles(owner, repo, branch, token)
      files = result.files
      fileCount = result.fileCount
      repoSize = result.repoSize
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('GITHUB_APP_NOT_INSTALLED')) {
        return errorResponse(404, 'Repository not found or AutoStack GitHub App not installed. Install at https://github.com/apps/autostack', 'GITHUB_APP_NOT_INSTALLED')
      }
      throw err
    }

    const fetchDuration = Date.now() - fetchStart
    console.log(`[DIE] Fetched ${files.size} files in ${fetchDuration}ms`)

    // Stage 3: Classify application (intelligent analysis)
    console.log(`[DIE] Classifying application...`)
    const classifyStart = Date.now()
    const classification = await classifyApplication(files, repoSize, fileCount)
    const classifyDuration = Date.now() - classifyStart
    console.log(`[DIE] Classification complete in ${classifyDuration}ms: ${classification.framework} → ${classification.recommendedService}`)

    await supabaseClient.from('projects').update({ 
      analysis_status: 'planning', 
      stack: `${classification.language}/${classification.framework}` 
    }).eq('id', project_id)

    // Stage 4: Generate manifests
    const projectName = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const manifestFiles: { path: string; content: string }[] = []

    const hasExistingDockerfile = files.has('Dockerfile')
    if (!hasExistingDockerfile) {
      const dockerfile = generateDockerfile(classification)
      if (dockerfile) manifestFiles.push({ path: 'Dockerfile', content: dockerfile })
    }

    // Only generate K8s manifests if using EKS
    if (classification.recommendedService.includes('eks')) {
      manifestFiles.push(
        { path: 'k8s/deployment.yaml', content: generateK8sDeployment(projectName, classification) },
        { path: 'k8s/service.yaml', content: generateK8sService(projectName, classification) },
        { path: 'k8s/ingress.yaml', content: generateIngress(projectName) },
        { path: 'k8s/hpa.yaml', content: generateHPA(projectName) },
        { path: 'k8s/networkpolicy.yaml', content: generateNetworkPolicy(projectName) },
        { path: 'k8s/argocd-application.yaml', content: generateArgoApp(projectName, project.repo_url, branch) }
      )
    }

    // Stage 5: Open PR (if manifests were generated)
    let prUrl = ''
    if (manifestFiles.length > 0) {
      try {
        prUrl = await openManifestPR(owner, repo, branch, token, manifestFiles, classification)
      } catch (err) {
        const msg = (err as Error).message
        if (msg.includes('GITHUB_APP_NOT_INSTALLED')) {
          return errorResponse(404, msg, 'GITHUB_APP_NOT_INSTALLED')
        }
        console.error('[DIE] PR creation failed:', msg)
      }
    }

    // Stage 6: Generate infrastructure options (3 choices)
    console.log(`[DIE] Generating infrastructure options...`)
    let infrastructureOptions = null
    
    try {
      const optionsRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/optimize-cost`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          classification,
          org_budget_preference: null
        })
      })
      
      if (optionsRes.ok) {
        infrastructureOptions = await optionsRes.json()
      }
    } catch (err) {
      console.error('[DIE] Failed to generate infrastructure options:', err)
    }

    // Stage 7: Update project with analysis results
    await supabaseClient.from('projects').update({
      analysis_status: 'analyzed',
      stack: `${classification.language}/${classification.framework}`,
      estimated_monthly_cost: classification.monthlyEstimate.monthlyTypical,
      infra_plan_json: {
        classification,
        infrastructure_options: infrastructureOptions,
        manifests_generated: manifestFiles.length,
        has_existing_dockerfile: hasExistingDockerfile,
        analysis_duration_ms: Date.now() - startTime
      }
    }).eq('id', project_id)

    // Stage 8: Create deployment record
    const { data: deployment, error: deployErr } = await supabaseClient.from('deployments').insert({
      project_id,
      org_id: project.org_id,
      status: 'pending',
      stage: 'analyzed',
      pr_url: prUrl || null,
      commit_msg: `AutoStack: ${classification.framework} deployment setup`
    }).select().single()

    if (deployErr) throw deployErr

    const totalDuration = Date.now() - startTime
    console.log(`[DIE] Analysis complete for ${owner}/${repo} in ${totalDuration}ms. Stack: ${classification.framework}, Service: ${classification.recommendedService}, Cost: ${classification.monthlyEstimate.displayPrice}`)

    return jsonResponse({
      success: true,
      deployment_id: deployment.id,
      classification: {
        language: classification.language,
        framework: classification.framework,
        appType: classification.appType,
        tier: classification.tier,
        recommendedService: classification.recommendedService,
        buildCommand: classification.buildCommand,
        startCommand: classification.startCommand,
        port: classification.port,
        healthCheckPath: classification.healthCheckPath,
      },
      cost_estimate: {
        service: classification.monthlyEstimate.service,
        monthlyMin: classification.monthlyEstimate.monthlyMin,
        monthlyTypical: classification.monthlyEstimate.monthlyTypical,
        monthlyMax: classification.monthlyEstimate.monthlyMax,
        displayPrice: classification.monthlyEstimate.displayPrice,
        breakdown: classification.monthlyEstimate.breakdown,
        savingsVsEKS: classification.monthlyEstimate.savingsVsEKS,
      },
      infrastructure_options: infrastructureOptions,
      pr_url: prUrl,
      manifests_generated: manifestFiles.map(f => f.path),
      analysis_duration_ms: totalDuration,
      performance: {
        fetch_ms: fetchDuration,
        classify_ms: classifyDuration,
        total_ms: totalDuration
      }
    })

  } catch (error) {
    console.error('[DIE] Analysis error:', error)
    return errorResponse(400, (error as Error).message)
  }
})
