# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — PHASES 6–10 EXECUTION PLAN                                  ║
# ║  "The plan was Phase 1-5. This is the actual build."                     ║
# ║  10 Phases · Enterprise Grade · Zero Patches · Zero Shortcuts            ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

---

# PREAMBLE — HOW TO USE THIS DOCUMENT

This is not a high-level plan. This is a line-by-line execution contract.
Every task has:
  → What to build (exact files, exact function signatures, exact API contracts)
  → Why it must be built this way (architecture rationale)
  → [AUDIT CHECKPOINT #N] markers — at these markers, stop building and run the audit tool
  → VERIFY block — specific test commands to run before marking done

[AUDIT CHECKPOINT] markers appear RANDOMLY throughout this document.
When you hit one: stop. Open the audit tool artifact. Answer every question in that section
with brutal honesty. A partial answer or a guess is not acceptable.
If any answer is ❌ or ⚠️: fix it before continuing. Do not skip.

---

# ══════════════════════════════════════════════════════════════════
# PHASE 6 — GITHUB APP: PRIVATE REPOS, AUTO-REDEPLOY, PREVIEWS
# Branch: feature/phase6-github-app
# ══════════════════════════════════════════════════════════════════

## TASK 6.1 — GitHub App Setup & JWT Authentication Layer

### Files
```
supabase/functions/github-app-auth/
  index.ts              ← OAuth callback handler + CSRF validation
  jwt.ts                ← App JWT generation (RS256)
  tokens.ts             ← Installation token cache (Redis-backed)
  middleware.ts         ← Auth middleware used by ALL github-* functions
```

### Why a shared middleware
Every GitHub-related Edge Function needs to:
1. Authenticate the caller (user JWT or webhook signature)
2. Obtain a valid GitHub installation token for the requesting org
3. Check rate limits against GitHub API (5000 requests/hr per installation)

Without a shared module, this logic gets copy-pasted into 4 functions.
Copy-pasted security logic is how token leaks happen.

### JWT generation — exact spec
```typescript
// supabase/functions/github-app-auth/jwt.ts

import { crypto } from 'https://deno.land/std/crypto/mod.ts'

// RULE G1: JWT must expire within 10 minutes.
// Generate fresh every call. DO NOT cache the app-level JWT.
// Only cache the installation-level token (different thing).

export async function generateGitHubAppJWT(
  appId: string,
  privateKeyPem: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iat: now - 60,   // 60 seconds in the past (clock skew tolerance)
    exp: now + 540,  // 9 minutes from now (GitHub max is 10, stay safe)
    iss: appId
  }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const message = `${encode(header)}.${encode(payload)}`

  // Import RSA private key
  const keyData = pemToArrayBuffer(privateKeyPem)
  const key = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(message)
  )

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${message}.${sigBase64}`
}

// NEVER cache app JWT — generate fresh every time.
// It takes ~2ms. Not worth the security risk of a stale token.
```

### Installation token — exact spec with Redis cache
```typescript
// supabase/functions/github-app-auth/tokens.ts

import { Redis } from 'https://esm.sh/@upstash/redis'

// RULE G2: Installation tokens expire in 1 hour.
// Cache for 50 minutes (leave 10-min safety margin).
// Key per installation_id (not per org — one org can have multiple installations).

export async function getInstallationToken(
  redis: Redis,
  installationId: string,
  appJWT: string
): Promise<string> {
  const cacheKey = `github:install:token:${installationId}`

  // Check cache first — RULE A3 (never hit paid API without cache check)
  const cached = await redis.get<string>(cacheKey)
  if (cached) return cached

  // Fetch fresh installation token from GitHub
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJWT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AutoStack-Platform/1.0'
      }
    }
  )

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`GitHub token fetch failed (${response.status}): ${err.message}`)
  }

  const { token } = await response.json()

  // Cache with 50-minute TTL — RULE B5 (always set TTL)
  await redis.set(cacheKey, token, { ex: 3000 })

  return token
}

// NEVER store installation tokens in the database.
// They are ephemeral — only in Redis, only for 50 minutes.
```

### CSRF state for OAuth install flow
```typescript
// In github-app-install/index.ts

// BEFORE redirecting user to GitHub to install the app:
async function generateInstallState(redis: Redis, org_id: string): Promise<string> {
  // State = base64(org_id + timestamp) — unguessable, org-scoped
  const state = btoa(`${org_id}:${Date.now()}:${crypto.randomUUID()}`)

  // Store with 10-minute TTL — CSRF window
  await redis.set(`github:oauth:state:${org_id}`, state, { ex: 600 })
  return state
}

// On callback, BEFORE processing any data:
async function validateInstallState(
  redis: Redis,
  org_id: string,
  receivedState: string
): Promise<boolean> {
  const stored = await redis.get<string>(`github:oauth:state:${org_id}`)
  if (!stored) return false  // expired or never set

  // Delete immediately — one-time use
  await redis.del(`github:oauth:state:${org_id}`)

  // Constant-time comparison — prevent timing attacks
  if (stored.length !== receivedState.length) return false
  let mismatch = 0
  for (let i = 0; i < stored.length; i++) {
    mismatch |= stored.charCodeAt(i) ^ receivedState.charCodeAt(i)
  }
  return mismatch === 0
}
```

### What to store in integrations table after install
```typescript
// On successful OAuth callback:
await supabase.from('integrations').upsert({
  org_id: org_id,
  name: 'github',
  status: 'connected',
  config: {
    installation_id: installationId,  // used to get install tokens
    account_login: payload.account?.login,  // GitHub org/user name
    account_type: payload.account?.type,    // 'Organization' | 'User'
    app_id: GITHUB_APP_ID,
    permissions: payload.permissions,
    repositories_selected: payload.repository_selection, // 'all' | 'selected'
  },
  // DO NOT store tokens here — only in Redis
  connected_at: new Date().toISOString()
}, { onConflict: 'org_id,name' })
```

### VERIFY Task 6.1
```
□ GitHub App created in GitHub Developer settings with exact permissions specified
□ GITHUB_APP_ID set in Supabase function secrets (not in code)
□ GITHUB_APP_PRIVATE_KEY set in secrets (PEM format, full key including headers)
□ GITHUB_WEBHOOK_SECRET set in secrets
□ Navigate to GitHub App install URL → redirects to GitHub → back to /auth/github/callback
□ integrations table: name='github', status='connected', installation_id populated
□ Redis: confirm installation token cached with TTL:
    redis.ttl('github:install:token:[installationId]') → value between 2900-3000
□ CSRF: try submitting a callback with tampered state → rejected with 403
□ No tokens appear in integrations.config (only installation_id)
□ App JWT: confirm it expires in < 10 minutes (decode and check exp claim)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #1] — RUN BEFORE TASK 6.2
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Open the audit tool artifact now.
## Complete Section 1: "Auth & Security Foundation"
## Do not continue until every ❌ is resolved.
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## TASK 6.2 — GitHub Webhook: Complete Event Handler

### File
`supabase/functions/github-webhook/index.ts` — FULL REWRITE

This function is the most security-critical Edge Function.
It is publicly accessible. Anyone can POST to it.
The only thing standing between random internet traffic and your database is HMAC verification.

### Complete implementation with all event handlers
```typescript
// supabase/functions/github-webhook/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Redis } from 'https://esm.sh/@upstash/redis'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Signature-256, X-GitHub-Event, X-GitHub-Delivery',
}

// STEP 1 — HMAC verification. Must be the FIRST thing after CORS.
// Body must be read as text BEFORE any parsing for signature verification.
async function verifyHMAC(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get('X-Hub-Signature-256')
  if (!sig || !sig.startsWith('sha256=')) return false

  const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET')!
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = 'sha256=' + Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  if (sig.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// STEP 2 — Idempotency check: X-GitHub-Delivery is a unique UUID per webhook event.
// GitHub retries failed webhooks. Process each delivery exactly once.
async function isAlreadyProcessed(redis: Redis, deliveryId: string): Promise<boolean> {
  const key = `github:delivery:${deliveryId}`
  const existing = await redis.get(key)
  if (existing) return true
  await redis.set(key, '1', { ex: 3600 })  // RULE B5: TTL always set
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  // Read body AS TEXT first (required for HMAC)
  const bodyText = await req.text()

  // Verify signature BEFORE doing anything else
  const isValid = await verifyHMAC(req, bodyText)
  if (!isValid) {
    console.error('GitHub webhook: invalid HMAC signature')
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  const event = req.headers.get('X-GitHub-Event')
  const deliveryId = req.headers.get('X-GitHub-Delivery')
  const payload = JSON.parse(bodyText)

  const redis = new Redis({
    url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
    token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!
  })

  // Idempotency check — GitHub retries on non-200 responses
  if (deliveryId && await isAlreadyProcessed(redis, deliveryId)) {
    return new Response(JSON.stringify({ status: 'already_processed' }), { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Route to event handler
  try {
    switch (event) {
      case 'push':
        await handlePush(supabase, payload)
        break
      case 'pull_request':
        await handlePullRequest(supabase, payload)
        break
      case 'workflow_run':
        await handleWorkflowRun(supabase, payload)
        break
      case 'installation':
      case 'installation_repositories':
        await handleInstallation(supabase, payload)
        break
      default:
        // Unknown event — log and return 200 (don't retry)
        console.log(`Unhandled GitHub event: ${event}`)
    }

    return new Response(JSON.stringify({ status: 'ok', event }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    // Return 500 ONLY for unexpected errors — GitHub will retry
    // Return 200 for "expected failures" (e.g., project not found)
    console.error(`github-webhook handler error (${event}):`, err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})

// --- EVENT HANDLERS ---

async function handlePush(supabase: any, payload: any) {
  const repoUrl = payload.repository.clone_url
  const branch = payload.ref.replace('refs/heads/', '')
  const commitSha = payload.after
  const commitMsg = payload.head_commit?.message || ''
  const pusher = payload.pusher?.name || 'unknown'

  // Skip if the commit is from AutoStack itself (prevents infinite loops from manifest commits)
  if (commitMsg.includes('[autostack-skip]') || commitMsg.startsWith('chore(autostack):')) {
    return
  }

  // Find matching project (same repo URL + same branch)
  const { data: project } = await supabase
    .from('projects')
    .select('id, cluster_id, name, environment, provisioning_status, cloud_credential_id')
    .eq('repo_url', repoUrl)
    .eq('branch', branch)
    .eq('provisioning_status', 'live')  // only trigger for live environments
    .maybeSingle()

  if (!project) return  // no matching project, ignore

  // Create deployment record
  const { data: deployment } = await supabase
    .from('deployments')
    .insert({
      project_id: project.id,
      cluster_id: project.cluster_id,
      commit_sha: commitSha,
      commit_msg: commitMsg,
      branch: branch,
      status: 'running',
      triggered_by: 'github_push'
    })
    .select()
    .single()

  // Trigger redeploy asynchronously (don't await — webhook must return quickly)
  EdgeRuntime.waitUntil(
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/deploy-redeploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        project_id: project.id,
        deployment_id: deployment.id,
        commit_sha: commitSha,
        commit_msg: commitMsg,
        pusher: pusher
      })
    })
  )
}

async function handlePullRequest(supabase: any, payload: any) {
  const { action, pull_request, repository } = payload
  const prNumber = pull_request.number
  const prBranch = pull_request.head.ref
  const repoUrl = repository.clone_url

  if (action === 'opened' || action === 'synchronize') {
    // Find the staging project for this repo (to get the cluster/credentials)
    const { data: stagingProject } = await supabase
      .from('projects')
      .select('id, cluster_id, cloud_credential_id, name')
      .eq('repo_url', repoUrl)
      .eq('environment', 'staging')
      .eq('provisioning_status', 'live')
      .maybeSingle()

    if (!stagingProject) {
      console.log(`No staging environment for ${repoUrl} — skipping preview creation`)
      return
    }

    const previewEnvName = `pr-${prNumber}`

    // Check if preview already exists
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('repo_url', repoUrl)
      .eq('environment', previewEnvName)
      .maybeSingle()

    if (!existing) {
      // Create new preview environment
      const { data: preview } = await supabase
        .from('projects')
        .insert({
          org_id: stagingProject.org_id,
          cluster_id: stagingProject.cluster_id,
          cloud_credential_id: stagingProject.cloud_credential_id,
          name: `${stagingProject.name}-pr-${prNumber}`,
          repo_url: repoUrl,
          branch: prBranch,
          environment: previewEnvName,
          pr_number: prNumber,
          pr_branch: prBranch,
          pr_title: pull_request.title,
          auto_destroy_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          provisioning_status: 'pending'
        })
        .select()
        .single()

      // Trigger preview build (namespace-only, no new cluster)
      EdgeRuntime.waitUntil(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/deploy-preview`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ project_id: preview.id, commit_sha: pull_request.head.sha })
        })
      )
    } else {
      // Update existing preview with new commit
      EdgeRuntime.waitUntil(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/deploy-redeploy`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: existing.id, commit_sha: pull_request.head.sha })
        })
      )
    }
  }

  if (action === 'closed') {
    // Destroy preview
    const { data: preview } = await supabase
      .from('projects')
      .select('id')
      .eq('repo_url', repoUrl)
      .eq('environment', `pr-${prNumber}`)
      .maybeSingle()

    if (preview) {
      EdgeRuntime.waitUntil(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/infra-teardown`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: preview.id })
        })
      )
    }
  }
}

async function handleWorkflowRun(supabase: any, payload: any) {
  if (payload.action !== 'completed') return

  const run = payload.workflow_run
  await supabase.from('pipelines').upsert({
    github_run_id: String(run.id),
    cluster_id: null,  // looked up via project below
    branch: run.head_branch,
    commit_sha: run.head_sha,
    status: run.conclusion,  // 'success' | 'failure' | 'cancelled' | 'skipped'
    duration_ms: new Date(run.updated_at).getTime() - new Date(run.created_at).getTime(),
    started_at: run.created_at,
    completed_at: run.updated_at
  }, { onConflict: 'github_run_id' })
}
```

### VERIFY Task 6.2
```
□ Send fake POST to github-webhook without signature → 401
□ Send with tampered signature → 401
□ Send with valid signature for 'push' event to connected repo → deployment row created
□ Send same delivery ID twice → second response: { status: 'already_processed' }
□ Send 'pull_request' opened → preview project row created, provisioning_status='pending'
□ Send 'pull_request' closed → infra-teardown triggered for preview project
□ Commit message starting with 'chore(autostack):' → NO deployment triggered (loop prevention)
□ Repository not connected to AutoStack → event silently ignored (no 500 error)
□ delivery_id key in Redis expires after 1 hour:
    redis.ttl('github:delivery:[uuid]') → value between 3000-3600
```

---

## TASK 6.3 — `deploy-redeploy` Edge Function

### File
`supabase/functions/deploy-redeploy/index.ts`

### Why this is separate from `die-analyze`
`die-analyze` provisions infrastructure. That takes 12+ minutes.
Redeploying only needs to: build image → push to ECR → update manifest → ArgoCD sync.
That takes 2-3 minutes. Mixing them in one function creates confusion.

### Complete specification
```typescript
// INPUT: { project_id, deployment_id, commit_sha, commit_msg, pusher? }

// VALIDATION: project must be 'live'. credential must be 'verified'.
// If not: update deployment status to 'failed' immediately. Return 400.

// STAGE 1 — CodeBuild (build + push to ECR)
// Create/update CodeBuild project (idempotent — RULE B3)
// Start build with environment override: IMAGE_TAG = commit_sha[:8]
// Poll every 20 seconds for up to 15 minutes:
//   - SUCCEEDED: continue to Stage 2
//   - FAILED: get build logs, update deployment.status='failed', send notification, return
//   - timeout: stop build, mark failed

// On CodeBuild success:
//   - Update deployments: image_tag = `${ecr_repo_url}:${commit_sha[:8]}`
//   - Previous image_sha saved to previous_image_sha

// STAGE 2 — Update manifest in repo
// Use GitHub installation token to:
//   1. GET /repos/{owner}/{repo}/contents/deploy/{env}/deployment.yaml
//   2. Decode base64 content
//   3. Replace old image tag with new image tag (exact string replacement)
//   4. PUT with updated content + commit message: "chore(autostack): deploy {env} @ {sha[:8]} [autostack-skip]"
//      Note: [autostack-skip] prevents webhook infinite loop

// STAGE 3 — Wait for ArgoCD sync
// Poll ArgoCD Application status every 10 seconds for up to 10 minutes:
//   Synced = true AND Healthy = true → success
//   Degraded → check pod events, surface error
//   Timeout → surface "pods not healthy after 10 minutes"

// STAGE 4 — Verify live URL
// HTTP GET to project.live_url
// Expect: status < 500
// Any 2xx or 3xx = success
// 5xx = deployment failed (app crashed at startup)

// STAGE 5 — Update all records
// deployments: status='success', completed_at=now
// projects: last_deploy_at=now, deploy_count++
// Send notification: send-notification type='deployment_live'
// Trigger COIE cycle for this cluster

// ROLLBACK FUNCTION (separate POST /functions/v1/deploy-rollback):
// INPUT: { deployment_id }  ← the ID of the deployment to roll BACK TO
// Fetch that deployment's image_sha
// Run STAGE 2 + STAGE 3 + STAGE 4 above but with the old image
// Create new deployments row with triggered_by='rollback'
// Update projects.live_url if it changed (it shouldn't, same cluster)
```

### VERIFY Task 6.3
```
□ Push to main branch of connected repo → deploy-redeploy triggered via webhook
□ New deployment row: status transitions running → success within 3 minutes
□ Manifest commit uses [autostack-skip] — no second webhook triggered
□ live_url responds with non-500 after successful deploy
□ Failed build: deployment.status='failed', notification email received
□ Rollback: POST /deploy-rollback with old deployment_id
    → new deployment row with triggered_by='rollback'
    → app reverts to old image within 3 minutes
□ deployments.previous_image_sha populated correctly
□ deploy_count increments in projects table
□ CodeBuild project is reused (not recreated) on subsequent deploys (RULE B3 idempotency)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #2] — GITHUB + DEPLOYMENT PIPELINE
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Open audit tool. Complete Section 2: "GitHub Integration & Deploy Pipeline"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## TASK 6.4 — Preview Environments: Namespace-Only Deploy

### File
`supabase/functions/deploy-preview/index.ts`

### Architecture difference from full deploy
Full deploy → new VPC, new EKS cluster, new ALB. Takes 12 minutes.
Preview → new Kubernetes NAMESPACE on the staging cluster. Takes 2 minutes.
Same image build (CodeBuild), different target.

### Preview namespace strategy
```typescript
// Preview URL format: https://pr-{number}.{staging-cluster-id}.preview.autostack.app
// OR if user has custom domain: https://pr-{number}.staging.mycompany.com

// Kubernetes resources created in preview namespace:
// - Namespace (pr-{number})
// - Deployment (same as production but 1 replica, no HPA, no PDB)
// - Service (ClusterIP)
// - Ingress (ALB path-based routing: /pr-{number}/* → service, OR host-based)
// - ConfigMap (non-secret env vars only — NO secrets in preview by default)
// Note: Secret env vars from production are NOT copied to preview automatically.
//       User must explicitly mark which secrets to share with previews.

// Lifecycle:
// - Created: on PR open or push to PR branch
// - Updated: on new commits to PR branch (redeploy only, no namespace recreation)
// - Destroyed: on PR close/merge OR after 72 hours (pg_cron)
// - Status in DB: projects.auto_destroy_at = PR-open-time + 72h

// Preview status posted back to GitHub commit:
async function postDeploymentStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  state: 'pending' | 'success' | 'failure',
  targetUrl: string,
  description: string
) {
  await fetch(`https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      state,
      target_url: targetUrl,
      description: description.slice(0, 140),  // GitHub max 140 chars
      context: 'AutoStack / preview'
    })
  })
}
```

### VERIFY Task 6.4
```
□ Open a PR on connected repo → preview namespace created in staging cluster
□ Preview URL accessible within 3 minutes of PR open
□ GitHub commit shows green checkmark with AutoStack / preview status
□ Push new commit to PR branch → preview updates within 3 minutes
□ Close/merge PR → namespace deleted (kubectl get ns → pr-{number} gone)
□ Set auto_destroy_at = NOW() + 5 minutes → pg_cron destroys it
□ Secret env vars NOT visible in preview (ConfigMap, not Secret)
□ Preview project row: auto_destroy_at populated, pr_number populated
□ kubectl get pods -n pr-{number} → 1 replica (not 2+ like production)
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE 7 — GO AGENT: REAL METRICS, REAL INCIDENTS, REAL LOGS
# Branch: feature/phase7-go-agent
# ══════════════════════════════════════════════════════════════════

## TASK 7.1 — Agent Core: Config, Auth, Registration

### File: `cmd/agent/main.go`
```go
package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/autostack/agent/internal/client"
    "github.com/autostack/agent/internal/collector"
    "github.com/autostack/agent/internal/reporter"
    "github.com/autostack/agent/internal/config"
)

func main() {
    cfg := config.Load()  // reads from env vars injected by Helm

    // Graceful shutdown context
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Handle SIGTERM and SIGINT (Kubernetes pod graceful shutdown)
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
    go func() {
        <-sigCh
        log.Println("Received shutdown signal — draining buffer and stopping")
        cancel()
    }()

    // HTTP client for AutoStack API
    apiClient := client.New(cfg)

    // REGISTRATION FLOW (RULE H2):
    // 1. Use agent_token (from Helm values.yaml, one-time use)
    // 2. Receive JWT for subsequent calls
    // 3. Store JWT in memory — rotate when it expires (24h TTL)
    jwt, err := apiClient.Register(ctx, cfg.AgentToken, cfg.ClusterID)
    if err != nil {
        log.Fatalf("Agent registration failed: %v", err)
    }
    apiClient.SetJWT(jwt)

    // Start background JWT rotation goroutine
    go apiClient.RotateJWTLoop(ctx)

    // Start all collection goroutines
    metricsCollector := collector.NewMetrics(cfg)
    eventWatcher := collector.NewEventWatcher(cfg)
    logCollector := collector.NewLogs(cfg)

    metricsReporter := reporter.NewMetrics(apiClient)
    incidentReporter := reporter.NewIncidents(apiClient)
    heartbeatReporter := reporter.NewHeartbeat(apiClient)

    go metricsCollector.Start(ctx, metricsReporter.MetricsChan())
    go eventWatcher.Watch(ctx, incidentReporter.IncidentChan())
    go logCollector.Stream(ctx, metricsReporter.LogsChan())
    go metricsReporter.Start(ctx)
    go incidentReporter.Start(ctx)
    go heartbeatReporter.Start(ctx)

    // Block until shutdown
    <-ctx.Done()
    log.Println("Agent stopped")
}
```

### Config from environment (Helm-injected)
```go
// internal/config/config.go
package config

import (
    "os"
    "strconv"
    "time"
)

type Config struct {
    // Required — set by Helm on install
    AgentToken          string        // One-time registration token from connect-cluster
    ClusterID           string        // UUID of the cluster in AutoStack DB
    ControlPlaneURL     string        // https://[project].supabase.co/functions/v1

    // Optional — defaults to sensible values
    MetricsInterval     time.Duration // How often to collect metrics (default: 15s)
    MetricsBatchInterval time.Duration // How often to send batch (default: 60s)
    HeartbeatInterval   time.Duration // (default: 30s)
    LogBatchSize        int           // Max log lines per batch (default: 100)
    MaxBufferAge        time.Duration // Max time to buffer if API is down (default: 10min)

    // Kubernetes in-cluster config (auto-detected)
    KubeconfigPath      string        // empty = use in-cluster config
    Namespace           string        // Namespaces to watch (empty = all)
}

func Load() *Config {
    return &Config{
        AgentToken:           mustEnv("AUTOSTACK_AGENT_TOKEN"),
        ClusterID:            mustEnv("AUTOSTACK_CLUSTER_ID"),
        ControlPlaneURL:      mustEnv("AUTOSTACK_CONTROL_PLANE_URL"),
        MetricsInterval:      duration("AUTOSTACK_METRICS_INTERVAL", 15*time.Second),
        MetricsBatchInterval: duration("AUTOSTACK_BATCH_INTERVAL", 60*time.Second),
        HeartbeatInterval:    duration("AUTOSTACK_HEARTBEAT_INTERVAL", 30*time.Second),
        LogBatchSize:         integer("AUTOSTACK_LOG_BATCH_SIZE", 100),
        MaxBufferAge:         duration("AUTOSTACK_MAX_BUFFER_AGE", 10*time.Minute),
    }
}

func mustEnv(key string) string {
    v := os.Getenv(key)
    if v == "" {
        panic("Required environment variable not set: " + key)
    }
    return v
}
```

### Registration flow — token to JWT
```go
// internal/client/register.go

func (c *Client) Register(ctx context.Context, agentToken, clusterID string) (string, error) {
    // Call agent-register Edge Function with the one-time token
    resp, err := c.post(ctx, "/agent-register", map[string]string{
        "agent_token": agentToken,
        "cluster_id":  clusterID,
        "version":     Version,  // agent version string
    }, agentToken)  // use agent_token as Bearer for this one call
    if err != nil {
        return "", fmt.Errorf("registration API call failed: %w", err)
    }

    var result struct {
        JWT      string `json:"jwt"`
        ExpiresAt string `json:"expires_at"`
    }
    if err := json.Unmarshal(resp, &result); err != nil {
        return "", fmt.Errorf("registration response decode failed: %w", err)
    }

    // Mark token as used — invalidate it so it can't be reused
    // (the Edge Function does this, but confirm here)
    c.tokenExpiresAt, _ = time.Parse(time.RFC3339, result.ExpiresAt)
    return result.JWT, nil
}

// JWT rotation — runs 30 minutes before expiry
func (c *Client) RotateJWTLoop(ctx context.Context) {
    for {
        // Sleep until 30 minutes before expiry
        timeUntilRefresh := time.Until(c.tokenExpiresAt) - 30*time.Minute
        if timeUntilRefresh < 0 {
            timeUntilRefresh = 0
        }

        select {
        case <-time.After(timeUntilRefresh):
            newJWT, err := c.refreshJWT(ctx)
            if err != nil {
                log.Printf("JWT rotation failed: %v — will retry in 5 minutes", err)
                time.Sleep(5 * time.Minute)
                continue
            }
            c.SetJWT(newJWT)
            log.Println("JWT rotated successfully")
        case <-ctx.Done():
            return
        }
    }
}
```

### VERIFY Task 7.1
```
□ go build ./cmd/agent/ → compiles with zero warnings
□ Missing required env var → agent panics with clear message (not silent failure)
□ deploy to sandbox cluster: helm install autostack-agent helm/autostack-agent/ \
    --set agent.token=[token] --set agent.clusterID=[id]
□ kubectl logs -n autostack-system -l app=autostack-agent → "Registration successful"
□ clusters table: agent_status = 'connected' within 60 seconds of deploy
□ clusters.agent_version populated with correct version string
□ Kill agent pod → agent_status → 'disconnected' within 3 minutes (heartbeat timeout)
□ Restart agent pod → agent_status → 'connected' (re-registration works)
□ JWT rotation: check logs after 23.5 hours → "JWT rotated successfully"
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #3] — GO AGENT FOUNDATION
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Open audit tool. Complete Section 3: "Agent & Telemetry"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## TASK 7.2 — Agent Metrics Collector: CPU, Memory, Pods, Nodes

### File: `internal/collector/metrics.go`

The metrics collector uses the Kubernetes Metrics API (metrics.k8s.io).
This requires the metrics-server to be installed in the cluster.
AutoStack's infra provisioning step must install metrics-server as an EKS addon.

```go
package collector

import (
    "context"
    "time"

    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
    metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned"
)

type MetricsSample struct {
    CollectedAt      time.Time
    Pods             []PodMetric
    Nodes            []NodeMetric
    ClusterCPUPct    float64
    ClusterMemPct    float64
    TotalPodCount    int
    TotalNodeCount   int
}

type PodMetric struct {
    Name          string
    Namespace     string
    CPUMillicores int64    // actual usage from metrics-server
    MemoryBytes   int64    // actual usage
    // From pod spec (limits/requests for comparison)
    CPULimitMillicores    int64
    CPURequestMillicores  int64
    MemLimitBytes         int64
    MemRequestBytes       int64
    // From pod status
    RestartCount  int32
    Phase         string  // Running | Pending | Failed | Succeeded
    Ready         bool
}

func (c *MetricsCollector) collectOnce(ctx context.Context) (*MetricsSample, error) {
    sample := &MetricsSample{CollectedAt: time.Now()}

    // 1. Get pod metrics from metrics-server
    podMetrics, err := c.metricsClient.MetricsV1beta1().PodMetricses(corev1.NamespaceAll).List(ctx, metav1.ListOptions{})
    if err != nil {
        return nil, fmt.Errorf("metrics-server pod list failed: %w", err)
    }

    // 2. Get pod specs (for limits/requests)
    pods, err := c.k8sClient.CoreV1().Pods(corev1.NamespaceAll).List(ctx, metav1.ListOptions{})
    if err != nil {
        return nil, fmt.Errorf("pod list failed: %w", err)
    }

    // Build lookup map: pod name → pod spec
    podMap := make(map[string]*corev1.Pod)
    for i := range pods.Items {
        key := pods.Items[i].Namespace + "/" + pods.Items[i].Name
        podMap[key] = &pods.Items[i]
    }

    // 3. Combine metrics + specs
    var totalCPUUsed, totalCPUCapacity, totalMemUsed, totalMemCapacity int64

    for _, pm := range podMetrics.Items {
        key := pm.Namespace + "/" + pm.Name
        pod, exists := podMap[key]
        if !exists {
            continue  // pod terminated between list calls — skip
        }

        // Skip system namespaces (kube-system, autostack-system)
        if isSystemNamespace(pm.Namespace) {
            continue
        }

        var cpuUsed, memUsed int64
        for _, container := range pm.Containers {
            cpuUsed += container.Usage.Cpu().MilliValue()
            memUsed += container.Usage.Memory().Value()
        }

        var cpuLimit, cpuRequest, memLimit, memRequest int64
        for _, container := range pod.Spec.Containers {
            cpuLimit += container.Resources.Limits.Cpu().MilliValue()
            cpuRequest += container.Resources.Requests.Cpu().MilliValue()
            memLimit += container.Resources.Limits.Memory().Value()
            memRequest += container.Resources.Requests.Memory().Value()
        }

        restartCount := int32(0)
        ready := false
        for _, cs := range pod.Status.ContainerStatuses {
            restartCount += cs.RestartCount
            if cs.Ready {
                ready = true
            }
        }

        sample.Pods = append(sample.Pods, PodMetric{
            Name: pm.Name, Namespace: pm.Namespace,
            CPUMillicores: cpuUsed, MemoryBytes: memUsed,
            CPULimitMillicores: cpuLimit, CPURequestMillicores: cpuRequest,
            MemLimitBytes: memLimit, MemRequestBytes: memRequest,
            RestartCount: restartCount,
            Phase: string(pod.Status.Phase),
            Ready: ready,
        })

        totalCPUUsed += cpuUsed
        totalCPUCapacity += cpuLimit
        totalMemUsed += memUsed
        totalMemCapacity += memLimit
    }

    // 4. Cluster-level percentages
    if totalCPUCapacity > 0 {
        sample.ClusterCPUPct = float64(totalCPUUsed) / float64(totalCPUCapacity) * 100
    }
    if totalMemCapacity > 0 {
        sample.ClusterMemPct = float64(totalMemUsed) / float64(totalMemCapacity) * 100
    }
    sample.TotalPodCount = len(pods.Items)
    sample.TotalNodeCount = len(podMetrics.Items)  // rough approximation

    return sample, nil
}
```

### VERIFY Task 7.2
```
□ Deploy agent → cluster_metrics rows created within 90 seconds
□ cluster_metrics.cpu_pct matches kubectl top pods output (within 5% tolerance)
□ cluster_metrics.memory_pct matches kubectl top nodes output
□ MonitoringTab: charts show real data (not 0% or simulated values)
□ Pod metrics only include user namespaces (not kube-system, autostack-system)
□ Restart count correct: manually restart a pod → restart_count increments in next batch
□ metrics-server required: if metrics-server is down → agent logs warning, continues (doesn't crash)
```

---

## TASK 7.3 — Agent Event Watcher: Incident Detection

### File: `internal/collector/events.go`

```go
package collector

// Incident deduplication window: same pod + same reason within 5 minutes = same incident
type IncidentKey struct {
    Pod       string
    Namespace string
    Reason    string
}

type IncidentBuffer struct {
    mu     sync.Mutex
    recent map[IncidentKey]time.Time
}

func (b *IncidentBuffer) ShouldReport(key IncidentKey) bool {
    b.mu.Lock()
    defer b.mu.Unlock()

    last, exists := b.recent[key]
    if exists && time.Since(last) < 5*time.Minute {
        return false  // suppress duplicate within 5 minute window
    }

    b.recent[key] = time.Now()
    return true  // new incident, report it
}

// Event watcher main loop
func (w *EventWatcher) Watch(ctx context.Context, incidentCh chan<- IncidentBundle) {
    factory := informers.NewSharedInformerFactory(w.k8sClient, 0)
    eventInformer := factory.Core().V1().Events().Informer()

    eventInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            event, ok := obj.(*corev1.Event)
            if !ok {
                return
            }

            // Only process events with known incident reasons
            triggerConfig, isTrigger := INCIDENT_TRIGGERS[event.Reason]
            if !isTrigger {
                return
            }

            // Suppress system namespace events
            if isSystemNamespace(event.InvolvedObject.Namespace) {
                return
            }

            // Deduplicate
            key := IncidentKey{
                Pod:       event.InvolvedObject.Name,
                Namespace: event.InvolvedObject.Namespace,
                Reason:    event.Reason,
            }
            if !w.buffer.ShouldReport(key) {
                return
            }

            // Collect logs from the affected pod
            logs := w.collectPodLogs(ctx, event.InvolvedObject.Name, event.InvolvedObject.Namespace, 50)

            // Collect metrics snapshot for the affected pod
            metrics := w.getLastMetricSnapshot(event.InvolvedObject.Name, event.InvolvedObject.Namespace)

            bundle := IncidentBundle{
                ClusterID:        w.clusterID,
                TriggerType:      triggerConfig.Type,
                AffectedResource: event.InvolvedObject.Name,
                Namespace:        event.InvolvedObject.Namespace,
                Severity:         triggerConfig.Severity,
                Message:          event.Message,
                LogExcerpts:      logs,
                MetricsSnapshot:  metrics,
                DetectedAt:       time.Now(),
            }

            select {
            case incidentCh <- bundle:
            default:
                // Channel full — drop the incident (better than blocking)
                log.Printf("Incident channel full — dropping: %s/%s %s", bundle.Namespace, bundle.AffectedResource, bundle.TriggerType)
            }
        },
    })

    factory.Start(ctx.Done())
    factory.WaitForCacheSync(ctx.Done())
    <-ctx.Done()
}
```

### VERIFY Task 7.3
```
□ kubectl delete pod [pod-name] → incident row created in incidents table within 30 seconds
□ Same pod crashes twice within 5 minutes → only 1 incident created (deduplication)
□ Same pod crashes 6 minutes apart → 2 separate incidents (deduplication window expired)
□ OOMKill simulation: set pod memory limit to 10Mi → pod OOMKilled → incident with trigger_type='oom_kill'
□ incident.log_excerpts contains last 50 lines from pod logs (not empty)
□ incident.metrics_snapshot contains cpu_pct and memory_pct at time of incident
□ System namespace pod crash (kube-system) → NO incident created
□ AIRE Edge Function triggered by incident INSERT → incident diagnosed within 60 seconds
□ IncidentsTab shows real incident with populated root_cause, immediate_action
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #4] — COIE & AIRE INTELLIGENCE
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Open audit tool. Complete Section 4: "AI Intelligence Layer"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 8 — SECURITY HARDENING: VAULT, RATE LIMITS, VALIDATION
# Branch: feature/phase8-security
# ══════════════════════════════════════════════════════════════════

## TASK 8.1 — Environment Variable Vault Integration

### Migration: enable Supabase Vault
```sql
-- supabase/migrations/004_vault_and_secrets.sql

-- Enable Vault extension (already available in Supabase — just enable)
-- Do this in Dashboard: Database → Extensions → Enable 'supabase_vault'

-- Env vars storage: split table (non-secret) + vault (secret)
CREATE TABLE IF NOT EXISTS project_env_vars (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  value       TEXT,           -- plaintext value (for non-secret vars)
  vault_id    UUID,           -- vault secret ID (for secret vars, value is NULL)
  is_secret   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT env_unique_key UNIQUE (project_id, key)
);

ALTER TABLE project_env_vars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_vars_org" ON project_env_vars
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid
    )
  );
CREATE INDEX IF NOT EXISTS idx_env_vars_project ON project_env_vars(project_id);

-- VIEW that decrypts secrets for Edge Function use (service role only)
-- Frontend NEVER sees decrypted values — only 'is_secret' flag
CREATE VIEW project_env_vars_decrypted AS
SELECT
  ev.id, ev.project_id, ev.key, ev.is_secret,
  CASE
    WHEN ev.is_secret AND ev.vault_id IS NOT NULL
    THEN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ev.vault_id)
    ELSE ev.value
  END as value
FROM project_env_vars ev;
```

### Frontend env var input component
```jsx
// src/components/deploy/EnvVarEditor.jsx
// Shows list of key-value inputs
// Secret vars: value field shows "••••••••" after save
// User marks vars as secret by clicking a lock icon
// When secret=true: value stored in Vault (backend decides)

// CRITICAL: Frontend NEVER receives decrypted secret values.
// On load: fetch project_env_vars (NOT decrypted view)
//   → is_secret=true vars show masked value "••••••••" in UI
//   → User can replace secret value (sends new encrypted value to backend)
//   → User CANNOT read the current secret value through the UI (by design)

// UX:
// [KEY INPUT]  [VALUE INPUT]  [lock icon] [delete button]
// If lock icon clicked: var is marked as secret
// Lock icon shows locked (red) when is_secret=true
// "Add variable" button adds new row
// "Save all" commits changes to backend
```

### VERIFY Task 8.1
```
□ Add DATABASE_URL=postgres://... → stored in Vault (vault_id populated, value=NULL)
□ Add NODE_ENV=production → stored as plaintext (is_secret=false, value='production')
□ Direct DB query: SELECT value FROM project_env_vars WHERE key='DATABASE_URL'
    → returns NULL (not the connection string)
□ K8s Secret created in cluster with DATABASE_URL (service can connect to DB)
□ K8s ConfigMap created with NODE_ENV (non-secret vars)
□ Deployment uses envFrom: [secretRef, configMapRef] — not individual env entries
□ Frontend: after save, DATABASE_URL shows "••••••••" — no plaintext visible
□ Frontend: "Edit" on a secret var clears the field (user must re-enter, cannot read)
```

---

## TASK 8.2 — Rate Limiting: Distributed Sliding Window

### Shared utility
```typescript
// supabase/functions/_shared/rate-limiter.ts
// RULE B5: All Redis keys have TTL

const LIMITS = {
  'aws-assume-role':    { window: 60,   max: 5,    by: 'user_id'   },
  'die-analyze':        { window: 3600, max: 3,    by: 'org_id'    },
  'infra-provision':    { window: 3600, max: 3,    by: 'org_id'    },
  'deploy-redeploy':    { window: 3600, max: 50,   by: 'org_id'    },
  'infra-teardown':     { window: 3600, max: 10,   by: 'org_id'    },
  'send-notification':  { window: 3600, max: 50,   by: 'org_id'    },
  'github-webhook':     { window: 60,   max: 500,  by: 'ip'        },
  'agent-metrics':      { window: 60,   max: 120,  by: 'cluster_id'},
  'agent-heartbeat':    { window: 60,   max: 10,   by: 'cluster_id'},
}

export async function rateLimitCheck(
  redis: Redis,
  endpoint: string,
  identifier: string
): Promise<{ pass: boolean; remaining: number; resetIn: number }> {
  const config = LIMITS[endpoint as keyof typeof LIMITS]
  if (!config) return { pass: true, remaining: 999, resetIn: 0 }

  const now = Math.floor(Date.now() / 1000)
  const key = `rl:${endpoint}:${identifier}`

  // Atomic sliding window using Redis sorted set
  const [, , countResult] = await redis.pipeline()
    .zremrangebyscore(key, 0, now - config.window)          // remove expired
    .zadd(key, { score: now, member: `${now}:${Math.random()}` })  // add current
    .zcard(key)                                              // count in window
    .exec() as [unknown, unknown, number]

  // Always set TTL (RULE B5) — even on existing keys
  await redis.expire(key, config.window + 1)

  const count = countResult || 0
  return {
    pass: count <= config.max,
    remaining: Math.max(0, config.max - count),
    resetIn: config.window
  }
}

// Standard response for rate-limited requests:
export function rateLimitResponse(endpoint: string, resetIn: number, corsHeaders: Record<string,string>) {
  return new Response(
    JSON.stringify({ error: `Rate limit exceeded. Retry after ${resetIn} seconds.` }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(resetIn),
        'X-RateLimit-Limit': String(LIMITS[endpoint as keyof typeof LIMITS]?.max || 0),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + resetIn)
      }
    }
  )
}
```

### VERIFY Task 8.2
```
□ Hit die-analyze 4 times in 1 hour → 4th request returns 429 with Retry-After header
□ Response headers: Retry-After, X-RateLimit-Remaining, X-RateLimit-Reset all present
□ Rate limit keys have TTL: redis.ttl('rl:die-analyze:[org_id]') → positive value
□ Different orgs have independent counters (org A's limit doesn't affect org B)
□ github-webhook: 501 requests in 60 seconds from same IP → 501st = 429
□ After window resets: requests succeed again
□ Agent metrics: > 120 requests in 60 seconds → 121st = 429
    (agent never sends this fast — RULE H3 — but verify the limit works)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #5] — SECURITY POSTURE
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Open audit tool. Complete Section 5: "Security & Data Integrity"
## This section has no partial credit. Every item is ✅ or ❌.
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## TASK 8.3 — Input Validation: Shared Validator Applied Everywhere

### All inputs that must be validated (complete list)

```typescript
// die-analyze input schema:
const DIE_ANALYZE_SCHEMA = {
  project_id:     { type: 'uuid',   required: true },
  credential_id:  { type: 'uuid',   required: true },
  repo_url:       { type: 'url',    required: true, maxLength: 500,
                    // Additional: must be github.com or gitlab.com or bitbucket.org
                    pattern: /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\// },
  branch:         { type: 'string', required: false, maxLength: 100,
                    pattern: /^[a-zA-Z0-9._\-/]+$/ },
  environment:    { type: 'string', required: true,
                    enum: ['production', 'staging', 'development'] },
  size:           { type: 'string', required: true, enum: ['small', 'medium', 'large'] },
}

// aws-assume-role input schema:
const AWS_ASSUME_ROLE_SCHEMA = {
  account_id:     { type: 'string', required: true, pattern: /^\d{12}$/ },
  region:         { type: 'string', required: true,
                    enum: ['us-east-1','us-east-2','us-west-1','us-west-2',
                           'eu-west-1','eu-west-2','eu-central-1',
                           'ap-southeast-1','ap-southeast-2','ap-northeast-1',
                           'ap-south-1','ca-central-1','sa-east-1'] },
  role_arn:       { type: 'string', required: true,
                    pattern: /^arn:aws:iam::\d{12}:role\/[\w+=,.@\-/]+$/ },
  display_name:   { type: 'string', required: false, maxLength: 100 },
}

// project env vars:
const ENV_VAR_SCHEMA = {
  key:    { type: 'string', required: true, maxLength: 255,
            pattern: /^[A-Z][A-Z0-9_]*$/,  // POSIX env var format
            message: 'Key must be uppercase letters, numbers, and underscores' },
  value:  { type: 'string', required: false, maxLength: 65535 },
            // Empty string is valid (some apps need blank env vars)
}
```

### VERIFY Task 8.3
```
□ POST die-analyze with repo_url='https://evil.com/malicious' → 400 "repo_url must be github.com/gitlab.com/bitbucket.org"
□ POST aws-assume-role with region='us-east-99' → 400 with valid regions list
□ POST with env var key='lowercase_key' → 400 "Key must be uppercase..."
□ POST with env var key='VALID_KEY' (255 chars long) → 400 "Key must be at most 255 chars"
□ POST with valid env var key 'VALID' → succeeds
□ All validation errors return { error: string, fields: Record<string, string> }
□ No validation error exposes internal server details or stack traces
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE 9 — PERFORMANCE: BUNDLE, QUERIES, CACHING
# Branch: feature/phase9-performance
# ══════════════════════════════════════════════════════════════════

## TASK 9.1 — Bundle Splitting: ui/index.jsx → Individual Files

### Migration approach (safe, no big bang)

```bash
# Step 1: Create the component inventory
grep "export" src/components/ui/index.jsx | grep -E "^export (const|function|class|default)" > component_list.txt

# Step 2: For each component in the list:
# - Create src/components/ui/[ComponentName].jsx
# - Copy the component code from index.jsx
# - Ensure it imports only what it needs (no circular deps)
# - Export as default

# Step 3: Update src/components/ui/index.js (NEW BARREL FILE)
# This is now JUST re-exports — no component code:
# export { default as Button }       from './Button'
# export { default as Card }         from './Card'
# ... all components

# Step 4: Run build and check sizes
npm run build 2>&1 | grep "\.js"
```

### Target bundle sizes after split

```
BEFORE SPLIT:             AFTER SPLIT:
index-*.js    ~440KB  →   index-*.js    < 80KB  (just main app logic)
ui-charts-*.js ~355KB →   [unchanged]
error-*.js    ~450KB  →   [deferred — loads only on dashboard]
vendor-*.js    ~48KB  →   [unchanged]
Tab chunks:    1-9KB  →   Tab chunks: bigger but that's fine — component code per tab
```

### Verify that lazy() actually works now
```jsx
// BEFORE split: these lazy imports were useless
// (all code was in one module, couldn't split within it)
const OverviewTab = React.lazy(() => import('./tabs/OverviewTab'))
const CostTab     = React.lazy(() => import('./tabs/CostTab'))

// AFTER split: these actually load only when the tab is visited
// AND they bring in only the UI components they use (from individual files)
// OverviewTab uses: Card, Badge, ProgressBar, Skeleton, EmptyState
// Those 5 component files load with OverviewTab. NOT the other 40+ components.
```

### VERIFY Task 9.1
```
□ npm run build → zero errors
□ Build output: index-*.js < 100KB (compare exact numbers before/after)
□ Chrome DevTools → Sources → no single file > 200KB (excluding vendor chunks)
□ Navigate to landing page → DevTools Network → CostTab.jsx NOT loaded
□ Click "Cost" tab → CostTab chunk loads (lazy import fires)
□ Component inventory: count exports in old file vs. count files in new structure
    → numbers must match (no component lost in migration)
□ Every dashboard tab: visual regression check (no missing components)
□ Lighthouse Performance score on landing page > 85 (run 3 times, take average)
```

---

## TASK 9.2 — TanStack Query: Cache-First Data Loading

### Installation and setup
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### QueryClient configuration
```javascript
// src/lib/queryClient.js
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 seconds
      // Tab switches within 30s window use cache — no DB call
      staleTime: 30 * 1000,

      // Keep cached data for 5 minutes after component unmounts
      // Coming back to a tab within 5 minutes uses cache instantly
      gcTime: 5 * 60 * 1000,

      // Retry failed requests with exponential backoff
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),

      // Refetch when window regains focus (user returns to browser tab)
      refetchOnWindowFocus: true,

      // Don't refetch on every component remount
      refetchOnMount: false,
    },
    mutations: {
      retry: 0,  // Don't retry mutations (user action — they'll retry manually)
    },
  },
})

// Development: enable React Query Devtools
// Production: excluded via tree-shaking when imported conditionally
```

### Hook migration pattern
```javascript
// BEFORE (custom hook, no caching):
export function useDeployments(clusterId) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    supabase.from('projects').select('*').eq('cluster_id', clusterId)
      .then(({ data, error }) => {
        setData(data || [])
        setError(error)
        setLoading(false)
      })
    // (realtime subscription here)
  }, [clusterId])
}

// AFTER (TanStack Query with caching):
export function useDeployments(clusterId) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['deployments', clusterId],  // cache key — same key = same cache
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`*, deployments(id, status, live_url, commit_sha, started_at ORDER BY started_at DESC LIMIT 1)`)
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return data || []
    },
    enabled: !!clusterId,
  })

  // Realtime: invalidate cache instead of managing state manually
  useEffect(() => {
    if (!clusterId) return
    const channel = supabase.channel(`deployments:${clusterId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects',
          filter: `cluster_id=eq.${clusterId}` },
        () => queryClient.invalidateQueries({ queryKey: ['deployments', clusterId] })
      )
      .subscribe()

    return () => supabase.removeChannel(channel)  // RULE D4 — always cleanup
  }, [clusterId, queryClient])

  return { deployments: query.data ?? [], loading: query.isLoading, error: query.error, refetch: query.refetch }
}
```

### Query keys strategy (prevents stale cache bugs)
```javascript
// CONSISTENT key structure — every hook must follow this
const QUERY_KEYS = {
  // List queries
  deployments:   (clusterId) => ['deployments', clusterId],
  findings:      (clusterId) => ['findings', clusterId],
  incidents:     (clusterId) => ['incidents', clusterId],
  metrics:       (clusterId, range) => ['metrics', clusterId, range],
  costFindings:  (clusterId) => ['findings', clusterId, 'cost'],

  // Single item queries
  cluster:       (clusterId) => ['cluster', clusterId],
  project:       (projectId) => ['project', projectId],
  deployment:    (deploymentId) => ['deployment', deploymentId],

  // Settings queries (no cluster dependency)
  credentials:   (orgId) => ['credentials', orgId],
  integrations:  (orgId) => ['integrations', orgId],
  team:          (orgId) => ['team', orgId],
}
```

### VERIFY Task 9.2
```
□ Chrome DevTools Network: switch between tabs rapidly (5 times in 5 seconds)
    → No new Supabase API calls on second+ visit to same tab (cache hit)
□ Wait 31 seconds → switch tab → SINGLE new API call (stale → refetch)
□ TanStack Query Devtools (dev mode): all queries visible with their cache state
□ Error retry: mock a Supabase error → query retries 2 times with exponential backoff
□ Window focus: minimize browser → wait 10 seconds → restore → queries refresh
□ Realtime invalidation: INSERT a row manually in DB → relevant query refetches
    → new row appears without page refresh
□ Memory check: open tab → close tab → cache cleared after 5 minutes
    (verify via Query Devtools: query moves from 'active' to 'inactive' to gone)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #6] — PERFORMANCE & DATA LAYER
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Open audit tool. Complete Section 6: "Performance & Caching"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## TASK 9.3 — Database: Index Audit + Slow Query Prevention

### Migration: 003_performance_indexes.sql (complete)
```sql
-- Every table that appears in a WHERE clause gets an index.
-- No exceptions. Every time-series table gets a composite (id, time DESC) index.

-- Validate: run EXPLAIN ANALYZE on each query listed below after migration.
-- Expected: "Index Scan" or "Index Only Scan". Never "Seq Scan" on > 1000 rows.

-- projects (most queried table)
CREATE INDEX IF NOT EXISTS idx_projects_cluster_status
  ON projects(cluster_id, provisioning_status);
CREATE INDEX IF NOT EXISTS idx_projects_org
  ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_repo_branch
  ON projects(repo_url, branch);  -- used by github-webhook to find matching project

-- deployments (time-series)
CREATE INDEX IF NOT EXISTS idx_deployments_project_time
  ON deployments(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_cluster_time
  ON deployments(cluster_id, started_at DESC);

-- cluster_metrics (high volume, time-series)
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_time
  ON cluster_metrics(cluster_id, sampled_at DESC);

-- cluster_scores (time-series for MonitoringTab charts)
CREATE INDEX IF NOT EXISTS idx_cluster_scores_time
  ON cluster_scores(cluster_id, evaluated_at DESC);

-- findings (filtered by dimension and status)
CREATE INDEX IF NOT EXISTS idx_findings_cluster_dimension_status
  ON findings(cluster_id, dimension, status);
CREATE INDEX IF NOT EXISTS idx_findings_cluster_severity
  ON findings(cluster_id, severity) WHERE status = 'open';

-- incidents (filtered by status)
CREATE INDEX IF NOT EXISTS idx_incidents_cluster_status_time
  ON incidents(cluster_id, status, detected_at DESC);

-- infrastructure_events (used for live deploy progress)
CREATE INDEX IF NOT EXISTS idx_infra_events_project_time
  ON infrastructure_events(project_id, created_at ASC);

-- pod_logs (time-series, high volume)
CREATE INDEX IF NOT EXISTS idx_pod_logs_project_time
  ON pod_logs(project_id, logged_at DESC);

-- pipelines
CREATE INDEX IF NOT EXISTS idx_pipelines_cluster_time
  ON pipelines(cluster_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipelines_github_run
  ON pipelines(github_run_id);  -- used by github-webhook upsert

-- audit_log (org-scoped, time-ordered)
CREATE INDEX IF NOT EXISTS idx_audit_log_org_time
  ON audit_log(org_id, created_at DESC);

-- cloud_credentials
CREATE INDEX IF NOT EXISTS idx_cloud_credentials_org
  ON cloud_credentials(org_id);

-- project_env_vars
CREATE INDEX IF NOT EXISTS idx_env_vars_project
  ON project_env_vars(project_id);
```

### VERIFY Task 9.3
```
□ Run migration: supabase db push → zero errors
□ For each index: SELECT indexname FROM pg_indexes WHERE tablename = '[table]'
    → all 20+ indexes listed above appear
□ EXPLAIN ANALYZE for top 5 dashboard queries (run from Supabase SQL editor):
    1. SELECT * FROM projects WHERE cluster_id = '[uuid]' ORDER BY created_at DESC LIMIT 50
       → "Index Scan using idx_projects_cluster_status"
    2. SELECT * FROM cluster_metrics WHERE cluster_id = '[uuid]' AND sampled_at > NOW()-INTERVAL '24h' LIMIT 100
       → "Index Scan using idx_cluster_metrics_time"
    3. SELECT * FROM findings WHERE cluster_id='[uuid]' AND status='open' ORDER BY severity LIMIT 50
       → "Index Scan using idx_findings_cluster_severity"
    4. SELECT * FROM incidents WHERE cluster_id='[uuid]' ORDER BY detected_at DESC LIMIT 20
       → "Index Scan using idx_incidents_cluster_status_time"
    5. SELECT * FROM infrastructure_events WHERE project_id='[uuid]' ORDER BY created_at ASC LIMIT 200
       → "Index Scan using idx_infra_events_project_time"
□ No Seq Scan on any table with > 1000 rows
□ Run: SELECT schemaname, tablename, seq_scan, idx_scan FROM pg_stat_user_tables
        WHERE seq_scan > idx_scan AND n_live_tup > 1000
    → result should be EMPTY (all high-traffic tables use index scans)
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE 10 — LAUNCH READINESS: END-TO-END VERIFICATION
# Branch: feature/phase10-launch
# ══════════════════════════════════════════════════════════════════

## TASK 10.1 — Custom Domain + SSL: Complete Implementation

### Edge Function: `add-custom-domain/index.ts`
```typescript
// INPUT: { project_id, domain }
// Example: domain = "api.mycompany.com"

// VALIDATION:
// - domain is a valid hostname (no protocol, no path, no port)
// - domain is not an autostack.app subdomain (those are reserved)
// - pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

// FLOW:
// 1. Check if domain already claimed by another org (uniqueness check in domains table)
// 2. Request ACM certificate (DNS validation method)
// 3. Return: { cname_name, cname_value } — user adds this CNAME to their DNS
// 4. Start polling ACM every 30 seconds (background, via pg_cron trigger)
// 5. When ACM issued: add HTTPS listener to ALB, update ingress
// 6. Update project.live_url to https://[custom_domain]

// NEW TABLE needed:
// custom_domains: id, project_id, domain, acm_arn, status, dns_cname_name, dns_cname_value, created_at
```

### VERIFY Task 10.1
```
□ POST add-custom-domain with domain='autostack.app' → 400 "Reserved domain"
□ POST with domain='api.mycompany.com' → 200, DNS instructions returned
□ dns_cname_name and dns_cname_value populated in custom_domains table
□ ACM certificate status tracked: pending_validation → issued
□ After DNS validation: HTTPS listener on ALB, custom domain serves traffic
□ HTTP → HTTPS redirect working (ALB redirects port 80 to 443)
□ project.live_url updated to https://[custom_domain]
□ Teardown: DELETE project → ACM certificate deleted (no orphans)
```

---

## TASK 10.2 — Plan Enforcement: Non-Bypassable Limits

### Enforce in every resource-creating Edge Function
```typescript
// supabase/functions/_shared/plan-guard.ts

export const PLAN_LIMITS = {
  free: {
    max_live_environments:  1,
    max_nodes_total:        3,   // t3.medium × 2 nodes = 2 vCPU, 4GB
    max_deployments_per_day: 5,
    features: new Set(['coie_read', 'aire_detect', 'basic_logs'])
  },
  pro: {
    max_live_environments:  10,
    max_nodes_total:        50,
    max_deployments_per_day: -1,  // unlimited
    features: new Set(['coie_read', 'coie_fix', 'aire_detect', 'aire_remediate',
                       'custom_domain', 'preview_environments', 'full_logs'])
  },
  team: {
    max_live_environments:  50,
    max_nodes_total:        200,
    max_deployments_per_day: -1,
    features: new Set(['everything', 'compliance_export', 'slack_alerts',
                       'audit_log_api', 'sso'])
  },
  enterprise: {
    max_live_environments:  -1,  // unlimited
    max_nodes_total:        -1,
    max_deployments_per_day: -1,
    features: new Set(['everything', 'on_premise', 'sla', 'custom_msa'])
  }
}

export class PlanLimitError extends Error {
  upgradeUrl: string
  currentPlan: string
  requiredPlan: string

  constructor(message: string, currentPlan: string, requiredPlan: string) {
    super(message)
    this.upgradeUrl = 'https://autostack.io/pricing'
    this.currentPlan = currentPlan
    this.requiredPlan = requiredPlan
  }
}

export async function assertCanDeploy(supabase: any, org_id: string): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', org_id)
    .single()

  const { data: usage } = await supabase
    .from('plan_usage')
    .select('live_environments, total_nodes')
    .eq('org_id', org_id)
    .single()

  const limits = PLAN_LIMITS[org.plan as keyof typeof PLAN_LIMITS]

  if (limits.max_live_environments !== -1 && usage.live_environments >= limits.max_live_environments) {
    throw new PlanLimitError(
      `${capitalize(org.plan)} plan allows ${limits.max_live_environments} live environment${limits.max_live_environments === 1 ? '' : 's'}. ` +
      `You currently have ${usage.live_environments}. Upgrade to Pro for up to 10 environments.`,
      org.plan,
      'pro'
    )
  }
}

// Return plan limit errors in a structured format the frontend can use to show upgrade modal:
// { error: "string", code: "PLAN_LIMIT_EXCEEDED", upgrade_url: "...", current_plan: "free", required_plan: "pro" }
```

### VERIFY Task 10.2
```
□ Free org with 1 live environment: attempt 2nd deploy → 400 with upgrade URL
□ Free org with 0 live environments: deploy → succeeds
□ Error response format: { error, code, upgrade_url, current_plan, required_plan }
□ Frontend: plan limit error → upgrade modal shown (not a raw error message)
□ Upgrade org.plan to 'pro' in DB → second deployment succeeds
□ plan_usage.live_environments increments on deploy, decrements on teardown
□ Trigger in DB keeps plan_usage current (don't need to recalculate on each check)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #7] — LAUNCH READINESS FINAL
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Open audit tool. Complete Section 7: "End-to-End & Launch"
## This is the go/no-go checkpoint. All items must be ✅.
## Any ❌ at this checkpoint = do not ship. Fix first.
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## TASK 10.3 — Final E2E Smoke Test (Run Before Every Deploy to Main)

### Test script (run this manually before every merge to main)
```bash
#!/bin/bash
# autostack-smoke-test.sh
# Run against staging environment before merging to main

set -e  # Exit on first failure

echo "=== AutoStack Smoke Test ==="

# 1. Signup
echo "[1/10] Testing signup..."
SIGNUP=$(curl -s -X POST https://[staging].supabase.co/functions/v1/auth-hook \
  -H "Content-Type: application/json" \
  -d '{"user": {"id": "test-uuid", "email": "smoke+test@autostack.io"}}')
echo "Signup: $SIGNUP"

# 2. IAM verification
echo "[2/10] Testing IAM verification..."
IAM=$(curl -s -X POST https://[staging].supabase.co/functions/v1/aws-assume-role \
  -H "Authorization: Bearer [test-jwt]" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "[sandbox-account-id]", "region": "us-east-1", "role_arn": "[sandbox-role-arn]"}')
echo "IAM: $(echo $IAM | jq .permissions_ok)"

# ... (steps 3-10: die-analyze, cost modal, provision, build, deploy, live check)

echo "=== All smoke tests passed ==="
```

### VERIFY Task 10.3
```
□ Smoke test script runs end-to-end without manual intervention
□ New user signup → org created with org_id in user_metadata
□ IAM verification → permissions_ok: true
□ Repo analysis → language detected correctly
□ Cost estimate → returned with itemized breakdown
□ Provisioning → EKS cluster ACTIVE within 15 minutes
□ Build → CodeBuild SUCCEEDED
□ Deploy → ArgoCD Synced + Healthy
□ Live URL → HTTP 200 response
□ All AWS resources tagged with autostack:project_id
□ COIE runs within 5 minutes → findings inserted
□ AIRE detects manually-triggered pod crash within 60 seconds
□ Teardown → all AWS resources deleted (0 orphans)
□ Total time for happy path: under 15 minutes
```

---

# APPENDIX — COMPLETE PROGRESS TRACKER (add to PROGRESS.md)

```markdown
## Pre-Phase Patch (do first, blocks everything)
- [ ] CORS on all 9 Edge Functions
- [ ] HMAC on github-webhook
- [ ] auth-hook registered in Supabase Dashboard
- [ ] auth.org_id() function exists in DB

## Phase 6: GitHub App
- [ ] 6.1 — App JWT + installation token + CSRF state
- [ ] 6.2 — github-webhook full rewrite (all event handlers + idempotency)
- [ ] 6.3 — deploy-redeploy + rollback
- [ ] 6.4 — deploy-preview (namespace-isolated)

## Phase 7: Go Agent
- [ ] 7.1 — Core: config, auth, registration, JWT rotation
- [ ] 7.2 — Metrics collector (real CPU/memory from metrics-server)
- [ ] 7.3 — Event watcher (incident detection + deduplication)

## Phase 8: Security
- [ ] 8.1 — Supabase Vault for secret env vars
- [ ] 8.2 — Rate limiting (sliding window, all functions)
- [ ] 8.3 — Input validation (shared schema, all functions)

## Phase 9: Performance
- [ ] 9.1 — ui/index.jsx split into individual files
- [ ] 9.2 — TanStack Query (cache-first, all hooks migrated)
- [ ] 9.3 — Index audit (003_performance_indexes.sql, all Seq Scans eliminated)

## Phase 10: Launch
- [ ] 10.1 — Custom domain + SSL (ACM + ALB listener)
- [ ] 10.2 — Plan enforcement (non-bypassable at Edge Function layer)
- [ ] 10.3 — Smoke test suite (runs before every main merge)
```
