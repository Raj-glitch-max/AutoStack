import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getInstallationToken } from '../_shared/github.ts'
import { CORS_HEADERS, corsResponse, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { createRedisClient, RedisClient } from '../_shared/redis.ts'
import { validateOrRespond } from '../_shared/validator.ts'

// ---------------------------------------------------------------------------
// Framework Detection Tree — reads file contents, not just filenames
// ---------------------------------------------------------------------------

interface StackDetection {
  language: string
  framework: string
  type: 'web-service' | 'api' | 'worker' | 'static'
  port: number
  buildCmd: string
  startCmd: string
}

async function fetchFileContent(owner: string, repo: string, path: string, token: string, branch: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'AutoStack-App', 'Accept': 'application/vnd.github.raw' }
  })
  if (!res.ok) return null
  return await res.text()
}

async function detectStack(owner: string, repo: string, filenames: string[], token: string, branch: string): Promise<StackDetection> {
  // Node.js ecosystem — parse package.json to detect framework
  if (filenames.includes('package.json')) {
    const raw = await fetchFileContent(owner, repo, 'package.json', token, branch)
    if (raw) {
      try {
        const pkg = JSON.parse(raw)
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

        if (allDeps['next'])      return { language: 'Node.js', framework: 'Next.js', type: 'web-service', port: 3000, buildCmd: 'npm run build', startCmd: 'npm start' }
        if (allDeps['nuxt'])      return { language: 'Node.js', framework: 'Nuxt.js', type: 'web-service', port: 3000, buildCmd: 'npm run build', startCmd: 'npm start' }
        if (allDeps['@nestjs/core']) return { language: 'Node.js', framework: 'NestJS', type: 'api', port: 3000, buildCmd: 'npm run build', startCmd: 'node dist/main' }
        if (allDeps['fastify'])   return { language: 'Node.js', framework: 'Fastify', type: 'api', port: 3000, buildCmd: 'npm run build', startCmd: 'npm start' }
        if (allDeps['express'])   return { language: 'Node.js', framework: 'Express', type: 'api', port: 3000, buildCmd: '', startCmd: 'npm start' }
        if (allDeps['koa'])       return { language: 'Node.js', framework: 'Koa', type: 'api', port: 3000, buildCmd: '', startCmd: 'npm start' }
        if (allDeps['react'] || allDeps['vue'] || allDeps['@angular/core']) {
          return { language: 'Node.js', framework: allDeps['react'] ? 'React SPA' : allDeps['vue'] ? 'Vue SPA' : 'Angular SPA', type: 'static', port: 80, buildCmd: 'npm run build', startCmd: 'nginx -g "daemon off;"' }
        }

        return { language: 'Node.js', framework: 'Node.js', type: 'web-service', port: 3000, buildCmd: '', startCmd: 'npm start' }
      } catch { /* parse error, fall through */ }
    }
  }

  // Python ecosystem
  if (filenames.includes('requirements.txt') || filenames.includes('pyproject.toml') || filenames.includes('Pipfile')) {
    const reqs = await fetchFileContent(owner, repo, 'requirements.txt', token, branch) || ''

    if (reqs.includes('django'))     return { language: 'Python', framework: 'Django', type: 'web-service', port: 8000, buildCmd: 'pip install -r requirements.txt', startCmd: 'gunicorn app.wsgi:application' }
    if (reqs.includes('fastapi'))    return { language: 'Python', framework: 'FastAPI', type: 'api', port: 8000, buildCmd: 'pip install -r requirements.txt', startCmd: 'uvicorn main:app --host 0.0.0.0 --port 8000' }
    if (reqs.includes('flask'))      return { language: 'Python', framework: 'Flask', type: 'api', port: 5000, buildCmd: 'pip install -r requirements.txt', startCmd: 'gunicorn app:app' }

    return { language: 'Python', framework: 'Python', type: 'web-service', port: 8000, buildCmd: 'pip install -r requirements.txt', startCmd: 'python app.py' }
  }

  // Go
  if (filenames.includes('go.mod'))  return { language: 'Go', framework: 'Go', type: 'api', port: 8080, buildCmd: 'go build -o main .', startCmd: './main' }

  // Java
  if (filenames.includes('pom.xml')) return { language: 'Java', framework: 'Spring Boot', type: 'web-service', port: 8080, buildCmd: 'mvn -B package', startCmd: 'java -jar target/*.jar' }
  if (filenames.includes('build.gradle')) return { language: 'Java', framework: 'Spring Boot (Gradle)', type: 'web-service', port: 8080, buildCmd: './gradlew build', startCmd: 'java -jar build/libs/*.jar' }

  // Rust
  if (filenames.includes('Cargo.toml')) return { language: 'Rust', framework: 'Rust', type: 'api', port: 8080, buildCmd: 'cargo build --release', startCmd: './target/release/app' }

  // Docker-only
  if (filenames.includes('Dockerfile')) return { language: 'Docker', framework: 'Custom', type: 'web-service', port: 8080, buildCmd: '', startCmd: '' }

  return { language: 'Unknown', framework: 'Unknown', type: 'web-service', port: 8080, buildCmd: '', startCmd: '' }
}

// ---------------------------------------------------------------------------
// Manifest Generation — 7 K8s/Docker files
// ---------------------------------------------------------------------------

function generateDockerfile(stack: StackDetection): string | null {
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

function generateK8sDeployment(projectName: string, stack: StackDetection): string {
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
            - containerPort: ${stack.port}
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /
              port: ${stack.port}
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: ${stack.port}
            initialDelaySeconds: 5
            periodSeconds: 5
          securityContext:
            runAsNonRoot: true
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false`
}

function generateK8sService(projectName: string, stack: StackDetection): string {
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
      targetPort: ${stack.port}
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
  stack: StackDetection
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
      message: `chore(autostack): add Kubernetes manifests for ${stack.framework} deployment\n\nGenerated by AutoStack DIE Engine.\nStack: ${stack.language}/${stack.framework}\n\n[autostack-skip]`,
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
      title: `[AutoStack] Add Kubernetes infrastructure for ${stack.framework}`,
      body: `## 🚀 AutoStack Infrastructure Setup

This PR was generated by the **AutoStack Deep Infrastructure Engine (DIE)**.

### Detected Stack
- **Language**: ${stack.language}
- **Framework**: ${stack.framework}
- **Type**: ${stack.type}
- **Port**: ${stack.port}

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
// Cost Calculator
// ---------------------------------------------------------------------------

function calculateCost(size: string, stack: StackDetection) {
  const config: Record<string, { base: number; vcpu: string; ram: string; nodes: number }> = {
    'small':  { base: 127, vcpu: '2', ram: '4GB',  nodes: 2 },
    'medium': { base: 285, vcpu: '4', ram: '16GB', nodes: 3 },
    'large':  { base: 640, vcpu: '8', ram: '32GB', nodes: 5 }
  }

  const selected = config[size] || config.small
  const clusterCost = selected.base
  const albCost = 22
  const natCost = 35
  const ecrCost = 2

  return {
    total: clusterCost + albCost + natCost + ecrCost,
    resources: [
      { name: `EKS Cluster (${selected.nodes} × t3.${selected.base === 127 ? 'medium' : 'large'})`, cost: clusterCost },
      { name: 'Application Load Balancer', cost: albCost },
      { name: 'NAT Gateway', cost: natCost },
      { name: 'ECR / Image Storage', cost: ecrCost }
    ],
    specs: { vcpu: selected.vcpu, ram: selected.ram, nodes: selected.nodes }
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

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
      size: { type: 'string', enum: ['small', 'medium', 'large'], default: 'small' }
    }, CORS_HEADERS)
    if (validationError) return validationError

    const { project_id, installation_id, size } = body

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

    // GitHub — get installation token and fetch tree
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

    // Fetch tree first level
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=0`, {
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'AutoStack-App' }
    })

    if (!treeRes.ok) {
      if (treeRes.status === 404) {
        return errorResponse(404, 'Repository not found or AutoStack GitHub App not installed. Install at https://github.com/apps/autostack', 'GITHUB_APP_NOT_INSTALLED')
      }
      throw new Error(`GitHub API error: ${treeRes.statusText}`)
    }

    const treeData = await treeRes.json()
    const filenames: string[] = (treeData.tree || []).map((f: any) => f.path)

    // Stage 2: Detect stack (reads file contents)
    const stack = await detectStack(owner, repo, filenames, token, branch)
    const hasExistingDockerfile = filenames.includes('Dockerfile')

    await supabaseClient.from('projects').update({ analysis_status: 'planning', stack: `${stack.language}/${stack.framework}` }).eq('id', project_id)

    // Stage 3: Generate manifests
    const projectName = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const manifestFiles: { path: string; content: string }[] = []

    if (!hasExistingDockerfile) {
      const dockerfile = generateDockerfile(stack)
      if (dockerfile) manifestFiles.push({ path: 'Dockerfile', content: dockerfile })
    }

    manifestFiles.push(
      { path: 'k8s/deployment.yaml', content: generateK8sDeployment(projectName, stack) },
      { path: 'k8s/service.yaml', content: generateK8sService(projectName, stack) },
      { path: 'k8s/ingress.yaml', content: generateIngress(projectName) },
      { path: 'k8s/hpa.yaml', content: generateHPA(projectName) },
      { path: 'k8s/networkpolicy.yaml', content: generateNetworkPolicy(projectName) },
      { path: 'k8s/argocd-application.yaml', content: generateArgoApp(projectName, project.repo_url, branch) }
    )

    // Stage 4: Open PR (real GitHub API)
    let prUrl: string
    try {
      prUrl = await openManifestPR(owner, repo, branch, token, manifestFiles, stack)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('GITHUB_APP_NOT_INSTALLED')) {
        return errorResponse(404, msg, 'GITHUB_APP_NOT_INSTALLED')
      }
      console.error('[DIE] PR creation failed:', msg)
      prUrl = '' // Will be flagged in the response
    }

    // Stage 5: Cost estimation
    const costPlan = calculateCost(size, stack)

    // Update project with full analysis results
    await supabaseClient.from('projects').update({
      analysis_status: 'analyzed',
      stack: `${stack.language}/${stack.framework}`,
      estimated_monthly_cost: costPlan.total,
      infra_plan_json: {
        size,
        stack,
        resources: costPlan.resources,
        manifests_generated: manifestFiles.length,
        has_existing_dockerfile: hasExistingDockerfile
      }
    }).eq('id', project_id)

    // Stage 6: Create deployment record with pr_url
    const { data: deployment, error: deployErr } = await supabaseClient.from('deployments').insert({
      project_id,
      org_id: project.org_id,
      status: 'in_progress',
      stage: 'planning',
      pr_url: prUrl || null,
      commit_msg: `AutoStack: ${stack.framework} deployment setup`
    }).select().single()

    if (deployErr) throw deployErr

    // Stage 7: Trigger infra-provision asynchronously
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/infra-provision`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deployment_id: deployment.id,
        project_id: project.id,
        plan: costPlan
      })
    }).catch(err => console.error('[DIE] Async infra trigger failed:', err))

    console.log(`[DIE] Analysis complete for ${owner}/${repo}. Stack: ${stack.framework}. PR: ${prUrl}`)

    return jsonResponse({
      success: true,
      deployment_id: deployment.id,
      stack: `${stack.language}/${stack.framework}`,
      estimated_cost: costPlan.total,
      pr_url: prUrl,
      manifests_generated: manifestFiles.map(f => f.path),
      infra_plan_json: { size, stack, resources: costPlan.resources }
    })

  } catch (error) {
    console.error('[DIE] Analysis error:', error)
    return errorResponse(400, (error as Error).message)
  }
})
