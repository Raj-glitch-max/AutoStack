# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — PHASES 21–25 EXECUTION PLAN                                 ║
# ║  Closing 8% · GitHub Actions · AI Ops · Marketplace · FinOps · DX Portal║
# ║  Prerequisite: Phases 1–20 complete. Status: 92% production-ready.       ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

---

# PREAMBLE — CLOSE THE 8% FIRST

Before Phase 21 begins, the 2 P0 blockers and critical P1 items must be closed.
Nothing in Phase 21-25 is worth building on a foundation with known gaps.

## The Remaining 8% — Exact Items

### P0 Blocker 1: External Penetration Test
```
Status:     Not started
Owner:      You (external vendor required)
Timeline:   Book now — lead time is 2-4 weeks for reputable firms
Cost:       $3,000–$8,000 USD for a web app + API pen test

Recommended vendors (proven with SaaS companies):
  - Cobalt.io (on-demand pen tests, fast turnaround, SOC2 workflow)
  - Synack (crowdsourced, broad coverage)
  - Bishop Fox (thorough, good for complex multi-cloud APIs)

Minimum scope for AutoStack:
  - All 29+ Edge Functions via HTTPS
  - Authentication flows (SAML, OIDC, device code, JWT)
  - RLS bypass attempts (can org A read org B's data?)
  - IAM role confusion attacks (confused deputy, cross-account)
  - Agent spoofing (can attacker inject fake metrics?)
  - Stripe webhook manipulation (fake payment events)
  - Rate limit bypass (Upstash Redis sliding window)
  - XSS in dashboard (user-controlled content rendered)
  - JWT attacks (alg=none, RS256→HS256 confusion)
  - CORS policy bypass

What to do with findings:
  Critical (CVSS 9.0+): Fix within 48 hours, push to main immediately via hotfix/*
  High (7.0-8.9):       Fix within 7 days
  Medium (4.0-6.9):     Fix within 30 days
  Low (0.1-3.9):        Document accepted risk, fix in next sprint

After fixes: schedule retest (most vendors include one free retest).
```

### P0 Blocker 2: Terraform Registry Publication
```
Status:     Provider built but not published
Steps:
  1. Create a GPG key pair for signing releases:
     gpg --full-generate-key (RSA 4096, no expiry)
     
  2. Add public key to Terraform Registry:
     registry.terraform.io → Sign in → Provider publishing → Add GPG key
     
  3. Set up GitHub Actions release workflow:
     # .github/workflows/release.yml
     uses: goreleaser/goreleaser-action@v5
     with:
       args: release --clean
     # GoReleaser builds binaries for all platforms + signs with GPG
     
  4. Tag a release:
     git tag v1.0.0
     git push origin v1.0.0
     # GitHub Actions builds + signs + publishes to registry automatically
     
  5. Verify on registry:
     registry.terraform.io/providers/autostack/autostack
     
  6. Test end-to-end:
     terraform init  # should download from registry, not local override
```

### P1 Items: The Testing and Verification Backlog
```
These 18 items are not features — they are verification gaps.
For each: run the actual test, confirm it passes, mark done.

AUTH/SECURITY (highest priority):
  □ SAML replay attack: submit same SAML assertion twice → second rejected (Redis dedup)
  □ SAML forgery: tamper NameID, keep valid structure → rejected (signature invalid)
  □ JWT alg=none attack: submit JWT with alg=none → rejected (strict algorithm check)
  □ RLS bypass: user from org A calls API with org B's cluster_id → 0 rows returned

DEPLOYMENT PIPELINE:
  □ Rollback: POST /deploy-rollback with old deployment_id → previous image serving
  □ Infinite loop prevention: commit with "chore(autostack):" → no webhook triggered
  □ CodeBuild reuse: deploy twice to same project → same CodeBuild project ID used

AGENT:
  □ Cluster ID spoofing: agent sends metrics with different cluster_id in body → rejected
  □ Agent disconnect: kill agent pod → cluster.agent_status = 'disconnected' within 3 min

BILLING:
  □ Stripe idempotency: replay checkout.session.completed → single subscription created
  □ Trial expiry: set trial_ends_at = NOW()-1min → pg_cron run → plan downgraded to free
  □ Past due enforcement: status='past_due' → new deployments blocked after 3 days

DATABASE:
  □ RDS public access: confirm publicly_accessible = false in AWS console for all RDS instances
  □ Password never in DB: SELECT value FROM project_env_vars WHERE key='DATABASE_URL' → NULL

CLI:
  □ Exit codes: deploy failure → exit 1 (not 0)
  □ JSON mode: autostack deploy --json 2>/dev/null | jq .live_url → outputs just URL
  □ Credential security: cat ~/.config/autostack/credentials → NOT present or 0600 permissions

INTEGRATIONS:
  □ Non-blocking: shut down PagerDuty test service → incident still saved in AutoStack DB
```

### SOC2 Evidence Collection: Start the Clock
```
SOC2 Type II requires 6 CONSECUTIVE months of evidence.
The clock starts when the first automated control test runs.
Start NOW even if Phase 21-25 are not done — the 6 months run in parallel.

Month 1 (now): Enable all automated control checks, compliance_log starts filling
Month 2-5:     Normal operations, controls running, evidence accumulating
Month 6:       Engage SOC2 auditor (AICPA-accredited CPA firm)
Month 7-8:     Audit in progress, provide evidence on request
Month 9:       SOC2 Type II report issued ← marketing can announce this

Recommended auditors:
  - Vanta (automated evidence collection + audit coordination, fastest)
  - Drata (similar to Vanta, good for startups)
  - A-LIGN (traditional CPA firm, well-known in enterprise)
  - Prescient Assurance (cloud-native, good for AWS/GCP environments)

Cost: $15,000–$40,000 USD for Type II audit
Vanta/Drata automation tool: ~$10,000/year (reduces audit cost and prep time)
```

---

# ADDENDUM RULES FOR PHASES 21–25

All previous rules (A through T) apply without exception.

---

## RULE GROUP U — AI/LLM INTEGRATION STANDARDS

### U1 — Every LLM Call Is Cached
LLM API calls are expensive and slow. Never call an LLM for the same input twice.
Cache key = SHA256 of the prompt. Cache TTL = 24 hours minimum.
Cache backend = Upstash Redis (already in stack). RULE B5: TTL always set.

```typescript
async function cachedLLMCall(redis: Redis, prompt: string, callFn: () => Promise<string>): Promise<string> {
  const key = `llm:cache:${sha256(prompt)}`
  const cached = await redis.get<string>(key)
  if (cached) return cached
  const result = await callFn()
  await redis.set(key, result, { ex: 86400 })  // 24h TTL — RULE B5
  return result
}
```

### U2 — LLM Calls Are Rate-Limited Per Org
No org should be able to trigger unbounded LLM calls (AIRE diagnosis loops,
rapid re-analysis, etc.). Apply the existing rate limiter (RULE 8.2) to all
LLM-backed operations with conservative limits.

```typescript
'ai-diagnose':   { window: 3600, max: 20,  by: 'org_id' },  // 20 AI diagnoses per hour
'ai-chat':       { window: 60,   max: 10,  by: 'user_id' },  // 10 chat messages per minute
'ai-explain':    { window: 60,   max: 5,   by: 'user_id' },  // 5 explanations per minute
```

### U3 — User Data Sent to LLM Is Minimized
When sending context to an LLM (logs, metrics, incident data):
- Strip PII from log lines before sending (emails, IPs, tokens matching known patterns)
- Never send raw database connection strings or API keys to LLM
- Include only what is necessary for the question being asked
- Log what was sent in audit_log for SOC2 compliance

### U4 — LLM Responses Are Validated Before Display
An LLM can hallucinate. Never display raw LLM output without validation:
- RCA text: must be < 2000 chars, must not contain raw code blocks with credentials
- Cost recommendations: must have numeric values that match real cluster metrics
- Commands: must be validated against a whitelist of known-safe kubectl commands
If validation fails: show fallback text, log failure to Sentry.

### U5 — LLM Integration Has a Kill Switch
Every LLM-backed feature has a feature flag: `ai_features_enabled` per org.
If the LLM API is down or costs spike unexpectedly: flip the flag globally.
The platform must degrade gracefully — all non-LLM features continue working.

---

## RULE GROUP V — MARKETPLACE STANDARDS

### V1 — Templates Are Versioned and Immutable
A template version once published cannot be modified. Only new versions can be added.
This prevents breaking changes for users who depend on a specific template version.
Version format: `template-slug@v1.2.3`

### V2 — Community Templates Are Sandboxed
Community-submitted templates run through automated security scanning before publication:
- Dockerfile scanning (no USER root, no secret args, no curl | sh patterns)
- K8s manifest scanning (no privileged: true, no hostNetwork: true)
- Variable injection scanning (no template variable that could cause code injection)
Template maintainers cannot push to production automatically — requires AutoStack review.

### V3 — Template Analytics Are Opt-In
Template usage analytics (how many deploys, success rate) are opt-in for users.
Community template authors see aggregated stats, never individual org data.

---

## RULE GROUP W — FINOPS STANDARDS

### W1 — Cost Anomaly Thresholds Are Per-Environment, Not Global
A staging environment spending $50 vs $20 baseline is different from
production spending $500 vs $200 baseline. Both are 2.5× spike but
the latter deserves higher urgency. Thresholds scale with environment type.

### W2 — Cost Recommendations Are Actionable, Not Informational
Every cost recommendation must have a button that implements it.
"Your cluster is overprovisioned by 60%" with no action button is not a recommendation,
it is an observation. The button must either: open a PR, trigger a resize, or open the Terraform diff.

### W3 — Historical Cost Data Is Retained for 13 Months
Users need to compare month-over-month AND year-over-year.
13 months of cost data enables both comparisons.
This data is lightweight (one row per org per day per environment) — storage cost is negligible.

---

# ══════════════════════════════════════════════════════════════════
# PHASE 21 — GITHUB ACTIONS INTEGRATION
# Branch: feature/phase21-github-actions
# Goal: AutoStack works natively inside GitHub Actions workflows.
#       Deploy on push without CLI install. Status on every commit.
#       One-click environment promotion (staging → production).
# ══════════════════════════════════════════════════════════════════

## TASK 21.1 — Official GitHub Actions

### Repository: `github.com/autostack/actions`
Three actions. Each is a separate JavaScript action (Node.js 20).

```
actions/
├── deploy/
│   ├── action.yml       ← autostack/actions/deploy@v1
│   ├── src/
│   │   └── index.ts     ← main action logic
│   └── dist/
│       └── index.js     ← compiled (checked into repo — GitHub requirement)
├── rollback/
│   ├── action.yml       ← autostack/actions/rollback@v1
│   └── src/index.ts
└── preview/
    ├── action.yml       ← autostack/actions/preview@v1
    └── src/index.ts
```

### Action 1: `autostack/actions/deploy@v1`

```yaml
# action.yml
name: 'AutoStack Deploy'
description: 'Deploy your application to your cloud via AutoStack'
branding:
  icon: 'upload-cloud'
  color: 'blue'

inputs:
  token:
    description: 'AutoStack API token (use secrets.AUTOSTACK_TOKEN)'
    required: true
  environment:
    description: 'Target environment name (production, staging, etc.)'
    required: true
  wait:
    description: 'Wait for deployment to complete before returning (true/false)'
    required: false
    default: 'true'
  timeout:
    description: 'Maximum wait time in minutes (default: 15)'
    required: false
    default: '15'

outputs:
  live_url:
    description: 'The live URL of the deployed application'
  deployment_id:
    description: 'The AutoStack deployment ID (for rollback)'
  duration_seconds:
    description: 'Time taken for the deployment in seconds'
  estimated_monthly_cost:
    description: 'Estimated monthly AWS cost for this environment'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

```typescript
// deploy/src/index.ts
import * as core from '@actions/core'
import * as github from '@actions/github'

async function run() {
  const token = core.getInput('token', { required: true })
  const environment = core.getInput('environment', { required: true })
  const wait = core.getInput('wait') !== 'false'
  const timeoutMinutes = parseInt(core.getInput('timeout') || '15')

  const apiBase = process.env.AUTOSTACK_API_URL || 'https://api.autostack.io'
  const startTime = Date.now()

  // Get context from GitHub Actions environment
  const context = github.context
  const commitSha = context.sha
  const repoUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}`
  const branch = context.ref.replace('refs/heads/', '')

  core.info(`🚀 AutoStack: deploying ${repoUrl} (${branch}@${commitSha.slice(0,7)}) → ${environment}`)

  // POST to AutoStack API: trigger redeploy
  const response = await fetch(`${apiBase}/functions/v1/deploy-redeploy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      environment,
      commit_sha: commitSha,
      commit_msg: process.env.GITHUB_COMMIT_MESSAGE || context.eventName,
      triggered_by: 'github_actions',
      repo_url: repoUrl,
      branch
    })
  })

  if (!response.ok) {
    const err = await response.json()
    core.setFailed(`AutoStack deploy failed: ${err.error || response.statusText}`)
    return
  }

  const { deployment_id, project_id } = await response.json()
  core.info(`📋 Deployment ID: ${deployment_id}`)

  if (!wait) {
    core.setOutput('deployment_id', deployment_id)
    core.info('⚡ Returning immediately (wait: false)')
    return
  }

  // Poll for completion
  core.info('⏳ Waiting for deployment to complete...')
  const timeoutMs = timeoutMinutes * 60 * 1000
  const pollInterval = 15000  // 15 seconds
  let elapsed = 0

  while (elapsed < timeoutMs) {
    await new Promise(r => setTimeout(r, pollInterval))
    elapsed += pollInterval

    const statusResp = await fetch(`${apiBase}/functions/v1/api-environments/${project_id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!statusResp.ok) continue

    const env = await statusResp.json()

    // Print progress to GitHub Actions log
    core.info(`   ${env.die_stage || env.provisioning_status} (${Math.round(elapsed/1000)}s elapsed)`)

    if (env.provisioning_status === 'live') {
      const duration = Math.round((Date.now() - startTime) / 1000)
      core.info(`✅ Deployment complete in ${duration}s`)
      core.info(`🌐 Live URL: ${env.live_url}`)
      core.info(`💰 Est. cost: $${env.estimated_monthly_cost}/mo`)

      // Set outputs for use in subsequent steps
      core.setOutput('live_url', env.live_url)
      core.setOutput('deployment_id', deployment_id)
      core.setOutput('duration_seconds', String(duration))
      core.setOutput('estimated_monthly_cost', String(env.estimated_monthly_cost))

      // Post status to GitHub commit
      await postCommitStatus(token, context, 'success', env.live_url)
      return
    }

    if (env.provisioning_status === 'failed') {
      await postCommitStatus(token, context, 'failure', '')
      core.setFailed(`Deployment failed at stage: ${env.die_stage}`)
      return
    }
  }

  core.setFailed(`Deployment timed out after ${timeoutMinutes} minutes`)
}

async function postCommitStatus(
  token: string,
  context: typeof github.context,
  state: 'success' | 'failure' | 'pending',
  targetUrl: string
) {
  const octokit = github.getOctokit(
    process.env.GITHUB_TOKEN || token  // use GITHUB_TOKEN if available
  )
  await octokit.rest.repos.createCommitStatus({
    owner: context.repo.owner,
    repo: context.repo.repo,
    sha: context.sha,
    state,
    target_url: targetUrl,
    description: state === 'success' ? 'AutoStack deployment live' : 'AutoStack deployment failed',
    context: 'AutoStack / deploy'
  })
}

run().catch(err => core.setFailed(err.message))
```

### Action 2: `autostack/actions/rollback@v1`
```yaml
# action.yml — inputs:
# token, environment, to (optional commit SHA to roll back to)
# Calls POST /functions/v1/deploy-rollback
# Sets output: rolled_back_to (commit SHA of previous deployment)
# Use case: in a workflow, if a smoke test step fails, rollback automatically
```

### Action 3: `autostack/actions/preview@v1`
```yaml
# action.yml — triggers on pull_request events
# Creates a preview environment for the PR
# Posts a comment on the PR with the preview URL
# Automatically destroys the preview when PR closes

# PR comment format:
# 🚀 AutoStack Preview
# [env-name] | us-east-1
# ✅ Live: https://pr-47.my-app-staging.preview.autostack.app
# ⚡ Deployed in 2m 34s
# 💰 Estimated cost: ~$0/mo (namespace-isolated, no extra infra)
```

### Complete GitHub Actions workflow examples

```yaml
# Example 1: deploy on push to main
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: autostack/actions/deploy@v1
        id: deploy
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          environment: production
          timeout: '20'

      - name: Run smoke tests
        run: curl -f ${{ steps.deploy.outputs.live_url }}/health

      - name: Rollback if smoke tests fail
        if: failure()
        uses: autostack/actions/rollback@v1
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          environment: production

# Example 2: PR preview environments
# .github/workflows/preview.yml
name: Preview
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: autostack/actions/preview@v1
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          staging_environment: staging
          # Automatically creates pr-{number} namespace
          # Posts comment with URL
          # Destroys on PR close

# Example 3: multi-environment promotion pipeline
# .github/workflows/promote.yml
name: Promote
on:
  workflow_dispatch:
    inputs:
      target:
        type: choice
        options: [staging, production]

jobs:
  promote:
    runs-on: ubuntu-latest
    environment: ${{ inputs.target }}  # GitHub Environment for approvals
    steps:
      - uses: autostack/actions/deploy@v1
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          environment: ${{ inputs.target }}
```

### VERIFY Task 21.1
```
□ actions/deploy published to GitHub Marketplace
□ actions/rollback published to GitHub Marketplace
□ actions/preview published to GitHub Marketplace
□ Push to main → deploy action runs → live_url in workflow output
□ Commit status: green checkmark on GitHub commit after successful deploy
□ Smoke test fails → rollback action triggers → previous version serving
□ PR opened → preview comment posted with URL within 3 minutes
□ PR closed → preview namespace deleted, comment updated "Preview cleaned up"
□ timeout: '5' with a slow deploy → action exits with failure after 5 minutes
□ Invalid AUTOSTACK_TOKEN → action fails with clear error (not generic 401)
□ wait: 'false' → action returns immediately with deployment_id
□ multi-environment: workflow_dispatch → manual approval gate for production
□ All 3 action.yml files pass: actionlint validation
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #17] — DEVELOPER TOOLCHAIN
## Open audit tool. Complete Section 17: "GitHub Actions & CLI v2"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 22 — AUTOSTACK AI OPS
# Branch: feature/phase22-ai-ops
# Goal: Developers ask AutoStack questions in plain English.
#       "Why is my pod crashing?" gets a real answer, not a dashboard.
#       AIRE upgrades from keyword matching to semantic LLM diagnosis.
# ══════════════════════════════════════════════════════════════════

## TASK 22.1 — AI Chat Interface

### What it is
A chat UI embedded in the dashboard. Users ask natural-language questions
about their infrastructure. AutoStack answers using real data from its own DB.

This is NOT a generic ChatGPT wrapper. The LLM is a reasoning engine.
AutoStack provides all the context (metrics, logs, incidents, costs).
The LLM turns structured data into human-readable analysis.

### Architecture
```
User types: "Why is my API service using so much memory?"

AutoStack:
  1. Intent detection (local, no LLM): classify question type
     → type: 'resource_analysis', entity: 'api-service', metric: 'memory'
  
  2. Data fetch (from AutoStack's own DB — no LLM yet):
     → Last 24h cluster_metrics for api-service pods
     → Last 5 incidents for api-service
     → Current memory limit vs. actual usage
     → Recent deployments that might have changed memory usage
  
  3. Context assembly (build the LLM prompt — RULE U3):
     → Strip PII from log lines
     → Format metrics as tables
     → Include relevant AIRE findings
     → Limit to 4000 tokens of context
  
  4. LLM call (RULE U1 — cached, RULE U2 — rate limited):
     → Model: claude-3-5-sonnet (via Anthropic API) or gpt-4o
     → System prompt: "You are an expert Kubernetes engineer..."
     → User context: the assembled data
     → User question: "Why is my API service using so much memory?"
  
  5. Response validation (RULE U4):
     → Check response length < 2000 chars
     → Validate any kubectl commands against whitelist
     → Strip any credential-like patterns from response
  
  6. Stream response to user character by character
```

### New Edge Function: `ai-chat/index.ts`
```typescript
// INPUT: { message: string, environment_id?: string, conversation_id?: string }
// OUTPUT: Server-Sent Events stream (not JSON — streaming response)

// INTENT CLASSIFICATION (local, fast, no LLM):
const INTENT_PATTERNS = {
  memory_analysis:  /memory|ram|oom|killed|allocation/i,
  cpu_analysis:     /cpu|processor|throttl|slow/i,
  cost_analysis:    /cost|expensive|spending|bill|saving/i,
  incident_query:   /crash|fail|down|error|broken|incident/i,
  deployment_query: /deploy|release|rollout|version|update/i,
  log_query:        /log|output|print|console/i,
  general_help:     /.*/  // fallback
}

// DATA FETCH based on intent (before LLM call):
async function fetchRelevantContext(
  supabase: any,
  org_id: string,
  intent: string,
  environment_id?: string
): Promise<ContextBundle> {
  const context: ContextBundle = {}

  if (intent === 'memory_analysis' || intent === 'cpu_analysis') {
    // Last 24h metrics (most recent 100 rows per cluster — RULE B2)
    context.metrics = await supabase
      .from('cluster_metrics')
      .select('sampled_at, cpu_pct, memory_pct, pod_count')
      .eq('cluster_id', environment_id)
      .gte('sampled_at', new Date(Date.now() - 86400000).toISOString())
      .order('sampled_at', { ascending: false })
      .limit(100)
  }

  if (intent === 'incident_query') {
    context.incidents = await supabase
      .from('incidents')
      .select('trigger_type, severity, root_cause, detected_at, status')
      .eq('cluster_id', environment_id)
      .order('detected_at', { ascending: false })
      .limit(10)
  }

  if (intent === 'cost_analysis') {
    context.findings = await supabase
      .from('findings')
      .select('check_name, title, projected_saving, severity')
      .eq('cluster_id', environment_id)
      .eq('dimension', 'cost')
      .eq('status', 'open')
      .limit(20)

    context.project = await supabase
      .from('projects')
      .select('estimated_monthly_cost, potential_savings')
      .eq('id', environment_id)
      .single()
  }

  // Always include: cluster status, recent deployments
  context.cluster = await supabase
    .from('clusters')
    .select('name, provider, region, agent_status, health_score, node_count')
    .eq('id', environment_id)
    .single()

  context.recent_deployments = await supabase
    .from('deployments')
    .select('commit_sha, commit_msg, status, started_at, completed_at')
    .eq('cluster_id', environment_id)
    .order('started_at', { ascending: false })
    .limit(5)

  return context
}

// BUILD LLM PROMPT:
function buildSystemPrompt(): string {
  return `You are AutoStack's AI operations assistant. You are an expert Kubernetes
engineer and cloud architect. You have access to real-time data about the user's
Kubernetes infrastructure.

Your job is to:
1. Answer the user's question directly and concisely
2. Cite specific data points from the context provided
3. Give actionable next steps (not just observations)
4. Use kubectl commands when helpful (only safe read-only commands)
5. If something looks like a bug, say so clearly

Rules:
- Never mention raw credentials, connection strings, or tokens
- Keep responses under 400 words unless the question requires more
- Always acknowledge uncertainty if data is insufficient
- If you recommend a fix, mention that AutoStack's AIRE may have already opened a PR for it`
}

// STREAMING RESPONSE:
// Use Anthropic or OpenAI streaming API
// Server-Sent Events format:
// data: {"type": "text", "text": "The memory spike started at..."}\n\n
// data: {"type": "action", "action": "view_metrics", "label": "View memory chart"}\n\n
// data: {"type": "done"}\n\n
```

### AI Chat UI component

```jsx
// src/components/AIChat.jsx
// Persistent chat panel — slides in from right side of dashboard
// Toggle with: Cmd+K already taken, use Cmd+Shift+A or dedicated button

// LAYOUT:
// ┌────────────────────────────────────────┐
// │ AutoStack AI                    [X]    │
// ├────────────────────────────────────────┤
// │                                        │
// │  [messages thread]                     │
// │                                        │
// │  AI: Your API service memory has been  │
// │  trending up 15% over the last 4 hours.│
// │  The spike correlates with the 2:30 PM │
// │  deployment (commit abc1234). Three    │
// │  pods have exceeded their 512Mi limit  │
// │  twice in the last hour.               │
// │                                        │
// │  Recommended: AIRE has opened PR #47   │
// │  to increase memory limit to 640Mi.    │
// │                                        │
// │  [View PR #47] [View memory chart]     │
// │                                        │
// ├────────────────────────────────────────┤
// │ [Ask anything about your infrastructure]│
// │                              [Send →]  │
// └────────────────────────────────────────┘

// Suggested quick questions (shown when no conversation):
// "Why is my app slow right now?"
// "What's my highest AWS cost?"
// "What changed in the last deployment?"
// "Are there any incidents active?"
// "How do I reduce my bill by 20%?"
```

### VERIFY Task 22.1
```
□ "Why is my pod crashing?" → AI responds with actual incident data from DB (not generic answer)
□ "What's my AWS cost?" → AI responds with real cost from projects.estimated_monthly_cost
□ LLM response caching: ask same question twice → second response < 100ms (cache hit)
□ RULE U2: 11th AI chat message in 60 seconds → rate limited with friendly message
□ RULE U3: log lines with email addresses → PII stripped before sending to LLM
□ RULE U4: LLM response > 2000 chars → truncated, user sees "Full analysis available below"
□ RULE U5: set ai_features_enabled=false for org → chat widget shows "AI features disabled"
□ Action buttons in AI responses work: "View PR #47" → opens correct PR URL
□ Streaming: response appears character by character (not all at once)
□ Context switches: switch to different environment → next question has correct cluster context
```

---

## TASK 22.2 — Upgraded AIRE: LLM-Powered Semantic Diagnosis

### Current AIRE vs. upgraded AIRE
```
CURRENT AIRE (Phase 5):
  - Keyword matching: "OOM" in logs → OOM_KILL pattern
  - 10 hardcoded patterns in incident_patterns table
  - Works for known patterns, fails on novel failures
  - RCA is template-based (fill in the blanks)

UPGRADED AIRE (Phase 22):
  - Tier 1: keyword matching (free, fast, < 10ms)
  - Tier 2: semantic embedding match (pgvector, medium cost)
  - Tier 3: LLM diagnosis for unmatched incidents (expensive, rate-limited)
  - RCA is LLM-generated (specific to THIS incident's actual logs)
```

### Tier 3: LLM Diagnosis
```typescript
// In aire-detect/index.ts — only reached if Tier 1 AND Tier 2 both fail to match

async function llmDiagnosis(
  incident: Incident,
  context: IncidentContext
): Promise<LLMDiagnosis> {
  // RULE U1: check cache first
  const cacheKey = `llm:diagnosis:${sha256(JSON.stringify({
    trigger_type: incident.trigger_type,
    log_pattern: context.log_excerpts.slice(0, 3).join('|')
  }))}`
  const cached = await redis.get<LLMDiagnosis>(cacheKey)
  if (cached) return cached

  // RULE U2: rate limit LLM calls per org
  const { pass } = await rateLimitCheck(redis, 'ai-diagnose', incident.org_id)
  if (!pass) {
    return { root_cause: 'Diagnosis rate limit reached. AIRE will retry in 1 hour.', confidence: 0 }
  }

  // RULE U3: strip PII from logs before sending
  const cleanLogs = context.log_excerpts.map(line =>
    line
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [TOKEN]')
  )

  const prompt = `You are diagnosing a Kubernetes incident. Analyze this incident and provide a root cause analysis.

Incident type: ${incident.trigger_type}
Pod: ${incident.affected_resource}
Namespace: ${incident.namespace}
Severity: ${incident.severity}

Recent log lines (last 20):
${cleanLogs.slice(0, 20).join('\n')}

Current resource usage at incident time:
CPU: ${context.metrics_snapshot?.cpu_pct}%
Memory: ${context.metrics_snapshot?.memory_pct}%

Recent changes (deployments in last 24h):
${context.recent_deployments?.map(d => `- ${d.commit_sha.slice(0,7)}: ${d.commit_msg}`).join('\n') || 'None'}

Respond with ONLY a JSON object (no other text):
{
  "root_cause": "1-2 sentence root cause explanation",
  "immediate_action": "What to do right now to stop the bleeding",
  "permanent_fix": "What to change to prevent recurrence",
  "confidence": 0.0-1.0,
  "pattern_type": "one of: oom_kill|crash_loop|config_error|image_error|resource_exhaustion|network_error|unknown"
}`

  // Call LLM API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await response.json()
  const rawText = data.content[0].text

  // RULE U4: validate response
  let diagnosis: LLMDiagnosis
  try {
    diagnosis = JSON.parse(rawText)
    if (!diagnosis.root_cause || typeof diagnosis.confidence !== 'number') {
      throw new Error('Missing required fields')
    }
  } catch {
    diagnosis = {
      root_cause: 'AI diagnosis failed to parse. See raw logs for manual investigation.',
      immediate_action: 'Check kubectl logs for the affected pod',
      permanent_fix: 'Monitor for recurrence',
      confidence: 0.3,
      pattern_type: 'unknown'
    }
  }

  // Cache result — RULE U1
  await redis.set(cacheKey, JSON.stringify(diagnosis), { ex: 86400 })

  return diagnosis
}
```

### VERIFY Task 22.2
```
□ Novel failure (not in incident_patterns) → Tier 3 LLM diagnosis runs → root_cause populated
□ Known OOM failure → Tier 1 keyword match → LLM NOT called (check Redis: no llm:diagnosis: key)
□ PII stripping: log with email → diagnosis sent to LLM has [EMAIL] not real address
□ Cache: simulate same incident twice → second LLM call skipped (Redis hit)
□ Rate limit: 21st AI diagnosis in 1 hour → graceful fallback message (not error)
□ LLM API down (wrong API key): incident still diagnosed via Tier 1 fallback (RULE U5)
□ Confidence < 0.5: AIRE shows "Low confidence diagnosis — manual review recommended"
□ Pattern_type populated in incidents.matched_pattern
□ AI-generated RCA appears in IncidentsTab within 60 seconds of incident detection
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #18] — AI OPERATIONS
## Open audit tool. Complete Section 18: "AI & LLM Integration"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 23 — AUTOSTACK MARKETPLACE
# Branch: feature/phase23-marketplace
# Goal: One-click deployment of full application stacks.
#       Community templates. Verified AutoStack templates.
#       "Deploy a production-ready Next.js + Postgres + Redis" in 12 minutes.
# ══════════════════════════════════════════════════════════════════

## TASK 23.1 — Template System Architecture

### What a template is
A template is a pre-configured deployment bundle:
- One or more applications (from GitHub repos or pre-built images)
- Optional managed databases (RDS, ElastiCache)
- Environment variables (with default values and descriptions)
- Size recommendation for the stack
- Estimated cost range
- One-click deploy button

### Template spec format
```yaml
# template.yaml (stored in a GitHub repo or AutoStack's template registry)

name: "Next.js + Postgres + Redis"
slug: "nextjs-postgres-redis"
version: "1.2.0"
category: "fullstack"
tags: ["nextjs", "postgres", "redis", "typescript"]
author:
  name: "AutoStack"
  verified: true  # AutoStack-verified template (community templates: false)
description: |
  Production-ready Next.js 14 application with Postgres database and Redis cache.
  Includes: App Router, Prisma ORM, NextAuth, rate limiting, image optimization.
estimated_cost:
  min: 45  # USD/month (smallest viable config)
  max: 220 # USD/month (recommended production config)
estimated_deploy_time: 14  # minutes

components:
  - name: "Web App"
    type: "application"
    source:
      type: "github_template"
      repo: "autostack/template-nextjs-prisma"
      # User's app code goes here — they fork this template
    port: 3000
    size_recommendation: "small"  # for dev, "medium" for production

  - name: "Postgres Database"
    type: "managed_database"
    engine: "postgres"
    version: "16"
    size_map:
      development: "micro"
      staging: "small"
      production: "small"  # user can upgrade

  - name: "Redis Cache"
    type: "managed_database"
    engine: "redis"
    size_map:
      development: "micro"
      production: "small"

variables:
  - key: "NEXTAUTH_SECRET"
    description: "Random secret for NextAuth session encryption"
    secret: true
    default: ""  # AutoStack generates a random one if empty
    required: true

  - key: "NEXTAUTH_URL"
    description: "Your app's public URL (filled automatically by AutoStack)"
    secret: false
    auto_fill: "live_url"  # AutoStack fills this from the deployed URL

  - key: "NEXT_PUBLIC_POSTHOG_KEY"
    description: "PostHog analytics key (optional)"
    secret: false
    required: false
    default: ""

post_deploy_instructions: |
  1. Run database migrations: autostack run --env production "npx prisma db push"
  2. Your app is live at: {live_url}
  3. Admin dashboard: {live_url}/admin (first signup becomes admin)
```

### Template Registry DB tables
```sql
-- supabase/migrations/010_marketplace.sql

CREATE TABLE IF NOT EXISTS templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  version         TEXT        NOT NULL,
  category        TEXT,       -- fullstack | backend | frontend | data | ai | tooling
  tags            TEXT[],
  author_name     TEXT,
  author_org_id   UUID        REFERENCES organizations(id),
  verified        BOOLEAN     DEFAULT FALSE,
  featured        BOOLEAN     DEFAULT FALSE,
  spec            JSONB       NOT NULL,   -- the full template.yaml parsed as JSON
  readme_markdown TEXT,                   -- rendered in marketplace detail page
  icon_url        TEXT,
  screenshot_urls TEXT[],
  deploy_count    INTEGER     DEFAULT 0,
  star_count      INTEGER     DEFAULT 0,
  avg_deploy_time_minutes DECIMAL(5,1),
  cost_min        INTEGER,    -- USD/month
  cost_max        INTEGER,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_deployments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID        NOT NULL REFERENCES templates(id),
  org_id          UUID        NOT NULL REFERENCES organizations(id),
  project_id      UUID        REFERENCES projects(id),
  status          TEXT,       -- deploying | live | failed
  deployed_at     TIMESTAMPTZ DEFAULT NOW()
);
-- For template popularity stats (aggregated, not per-org)

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_templates_featured ON templates(featured, deploy_count DESC) WHERE published_at IS NOT NULL;
```

### Marketplace UI

```jsx
// src/pages/MarketplacePage.jsx (accessible from sidebar: "Marketplace")

// LAYOUT:
// Header: "Template Marketplace" + "Submit a template" link
//
// Search bar: "Search templates..." [input]
// Filter row: [All] [Fullstack] [Backend] [Frontend] [AI/ML] [Data] [Tooling]
//             Sort: [Most Popular] [Newest] [Lowest Cost]
//
// Featured section (3 cards, horizontal scroll):
//   Each card: icon, name, "by AutoStack ✓", deploy count, cost range, [Deploy] button
//
// Grid: 3 columns, all templates
//   Template card:
//   ┌────────────────────────────────────┐
//   │ [icon]  Next.js + Postgres + Redis │
//   │         by AutoStack ✓             │
//   │                                    │
//   │ Production-ready fullstack with    │
//   │ Prisma, NextAuth, and Redis cache. │
//   │                                    │
//   │ [nextjs] [postgres] [redis]        │
//   │ 847 deploys · $45–$220/mo          │
//   │                          [Deploy→] │
//   └────────────────────────────────────┘
//
// Template detail page: /marketplace/[slug]
//   Full description, README, architecture diagram, screenshots
//   Variable inputs before deploy (prefilled with defaults)
//   Cost estimate (adjustable by environment type)
//   [Deploy to my cloud] button → goes through normal onboarding/deploy flow

// Template deployment flow:
// 1. User clicks "Deploy" on template
// 2. Variable configuration form (pre-filled defaults)
// 3. Environment selection (production/staging)
// 4. Cloud credential selection (or connect new one)
// 5. Size selection (with template's recommendation highlighted)
// 6. Cost confirm modal
// 7. Standard DIE pipeline runs → live URL
// 8. Post-deploy instructions shown
```

### VERIFY Task 23.1
```
□ Marketplace page loads with 5+ templates (seed data)
□ Filter by category "fullstack" → shows only fullstack templates
□ Search "nextjs" → shows Next.js template
□ Click "Deploy" on a template → variable configuration form appears with defaults
□ Deploy template end-to-end: "Next.js + Postgres + Redis" → live URL within 20 minutes
□ Template deploys: managed database provisioned AND application connected to it
□ template_deployments row created → deploy_count increments for that template
□ RULE V2: community template with `privileged: true` in spec → rejected by scanner
□ RULE V1: publish template v1.0.0, then try to modify it → rejected (immutable)
□ Publish v1.0.1 instead → both versions visible, latest highlighted
□ post_deploy_instructions rendered with actual live_url substituted
□ auto_fill variable (NEXTAUTH_URL): automatically filled with deployed live_url
□ AutoStack generates NEXTAUTH_SECRET automatically when left empty
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE 24 — FINOPS: ADVANCED COST INTELLIGENCE
# Branch: feature/phase24-finops
# Goal: AutoStack is the single pane of glass for cloud spend.
#       ML-based anomaly detection. RI/Savings Plan recommendations.
#       Team-level cost allocation. Budget alerts.
# ══════════════════════════════════════════════════════════════════

## TASK 24.1 — Cost Anomaly Detection

### Architecture
```
Input: 13 months of cost history per org per environment
Model: Z-score anomaly detection (simple, explainable, no ML black box)
Alert: when cost deviates > 2σ from rolling 30-day baseline
```

```typescript
// supabase/functions/cost-anomaly-check/index.ts
// Called by pg_cron every hour

interface CostDataPoint {
  date: string       // YYYY-MM-DD
  amount: number     // USD
  environment: string
}

function detectAnomaly(
  history: CostDataPoint[],  // 30-day rolling history
  current: CostDataPoint     // today's cost so far, projected
): AnomalyResult {
  // Calculate baseline from last 30 days
  const amounts = history.map(h => h.amount)
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const stdDev = Math.sqrt(
    amounts.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / amounts.length
  )

  // Z-score of current vs baseline
  const zScore = (current.amount - mean) / stdDev

  // Thresholds:
  // |z| > 2.0: warning (unusual, might be expected growth)
  // |z| > 3.0: critical (definitely anomalous)
  const isAnomaly = Math.abs(zScore) > 2.0
  const isCritical = Math.abs(zScore) > 3.0

  if (!isAnomaly) return { anomaly: false }

  return {
    anomaly: true,
    critical: isCritical,
    current_amount: current.amount,
    expected_amount: mean,
    deviation_pct: Math.round((current.amount - mean) / mean * 100),
    z_score: Math.round(zScore * 100) / 100,
    direction: current.amount > mean ? 'spike' : 'drop',
    // Spike > 20%: "your production environment cost spiked 34% ($89 vs $66 baseline)"
    // Drop > 20%: "staging cost dropped 45% — is it still running?"
  }
}
```

### Reserved Instance Recommendation Engine
```typescript
// supabase/functions/ri-recommendations/index.ts
// Analyzes 3 months of instance usage to recommend RIs

// Rule: if an instance type has been running > 80% of hours
// in the last 3 months, recommend a 1-year RI for it.
// Estimated savings: ~40% vs. on-demand for most instance types.

interface RIRecommendation {
  instance_type: string          // t3.medium
  region: string                 // us-east-1
  usage_hours_last_90d: number   // 2100 (out of 2160 max)
  utilization_pct: number        // 97%
  current_monthly_cost: number   // $43.20
  ri_monthly_cost: number        // $25.92 (1-year standard RI)
  monthly_savings: number        // $17.28
  annual_savings: number         // $207.36
  payback_period_months: number  // immediate (no upfront RI option)
  confidence: 'high' | 'medium' // high = > 90% utilization
}
```

### Budget Alerts
```sql
-- supabase/migrations/011_finops.sql

CREATE TABLE IF NOT EXISTS cost_budgets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment_id  UUID        REFERENCES projects(id),  -- NULL = org-wide budget
  name            TEXT        NOT NULL,
  budget_usd      DECIMAL(10,2) NOT NULL,
  period          TEXT        NOT NULL DEFAULT 'monthly',  -- monthly | quarterly | annual
  alert_at_pct    INTEGER[]   DEFAULT '{80, 100}',  -- alert when 80% and 100% reached
  status          TEXT        DEFAULT 'active',
  current_spend   DECIMAL(10,2) DEFAULT 0,
  last_alert_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Budget alert tracking (prevent spam — one alert per threshold crossing per period)
CREATE TABLE IF NOT EXISTS budget_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id       UUID        NOT NULL REFERENCES cost_budgets(id),
  threshold_pct   INTEGER     NOT NULL,
  period_key      TEXT        NOT NULL,  -- 'YYYY-MM' for monthly budgets
  alerted_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(budget_id, threshold_pct, period_key)
);
```

### FinOps Dashboard additions to CostTab
```jsx
// Enhanced CostTab sections:

// Section 1: Budget Overview (NEW)
// ┌────────────────────────────────────────────────────────────┐
// │ Monthly Budget: $500                                       │
// │                                                            │
// │ Production:  $187/$300  ████████████░░░░  63%  ✅ On track│
// │ Staging:     $45/$100   ████░░░░░░░░░░░░  45%  ✅ On track│
// │ Total:       $232/$500  ████████░░░░░░░░  46%  ✅ On track│
// │                                                [Edit Budget]│
// └────────────────────────────────────────────────────────────┘

// Section 2: Anomaly Alerts (NEW)
// If anomaly detected: amber banner
// "⚠️ Cost spike detected in production: $89 vs $66 expected (+34%)"
// "This spike started 3 hours ago and correlates with a deploy at 2:30 PM"
// [View details] [Dismiss]

// Section 3: Reserved Instance Recommendations (NEW)
// "💡 RI Opportunity: Save $207/year"
// Table: instance type, current monthly, RI monthly, annual savings
// [Start RI purchase in AWS Console →] (deep link to AWS RI console)

// Section 4: Cost Breakdown by Team (NEW — Team/Enterprise plans)
// Cost allocated by: environment owner, team tag, project
// Recharts stacked bar chart: each team's share of total cost
```

### VERIFY Task 24.1
```
□ pg_cron: cost-anomaly-check runs hourly: SELECT * FROM cron.job WHERE jobname='cost-anomaly-check'
□ Spike simulation: set estimated_monthly_cost to 3× baseline → anomaly alert triggered
□ Alert email received for cost spike within 15 minutes of detection
□ Duplicate prevention: same threshold not alerted twice in same billing period
□ Budget setup: create $500 budget → at 80% → alert email sent
□ Budget at 100%: dashboard shows red warning, deployment still allowed (budget is informational)
□ RI recommendations appear after 3 months of data (simulate with manual data insertion)
□ RI recommendations link opens correct AWS RI console URL (deep link)
□ Cost anomaly shows: current amount, expected amount, deviation %, direction
□ "Drop" anomaly: environment scaled to 0 → cost drops → alert: "staging may be inactive"
□ RULE W2: every anomaly/recommendation has an action button (not just text)
□ RULE W3: 13 months of org_usage data retained (verify pg_cron cleanup does not delete this)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #19] — FINOPS & MARKETPLACE
## Open audit tool. Complete Section 19: "FinOps & Marketplace"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 25 — DEVELOPER EXPERIENCE PORTAL (DX PORTAL)
# Branch: feature/phase25-dx-portal
# Goal: Large engineering orgs get an internal service catalog.
#       Every microservice: owner, runbook, metrics, deployment status.
#       Built 100% from AutoStack's existing data — no new data sources.
# ══════════════════════════════════════════════════════════════════

## TASK 25.1 — Service Catalog

### What it is
A searchable, filterable catalog of every service deployed via AutoStack.
Built for platform engineers to answer: "Who owns service X? Is it healthy?
What's the runbook? When was it last deployed? How much does it cost?"

### No new data required
Everything in the catalog comes from AutoStack's existing tables:
- Service name, URL, status → `projects` table
- Owner → `org_members` via deployment `triggered_by`
- Health → `clusters.health_score` + `incidents` count
- Last deploy → `deployments.completed_at`
- Cost → `projects.estimated_monthly_cost`
- Runbook → new field `projects.runbook_url`

```sql
-- supabase/migrations/012_dx_portal.sql

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS runbook_url     TEXT,
    -- Link to Confluence, Notion, GitHub Wiki, etc.
  ADD COLUMN IF NOT EXISTS team_owner      TEXT,
    -- Team name (free text): "Platform", "Backend", "Data"
  ADD COLUMN IF NOT EXISTS on_call_slack   TEXT,
    -- Slack channel for this service: "#backend-oncall"
  ADD COLUMN IF NOT EXISTS sla_target_uptime DECIMAL(5,2),
    -- Uptime SLA: 99.9, 99.95, 99.99
  ADD COLUMN IF NOT EXISTS service_tier    TEXT DEFAULT 'standard';
    -- 'critical' | 'standard' | 'internal' | 'deprecated'
```

### Service Catalog UI
```jsx
// src/pages/ServiceCatalogPage.jsx (sidebar: "Catalog")
// Available on: Team + Enterprise plans

// HEADER:
// "Service Catalog"  [Search services...]  [+ Register Service]

// FILTERS:
// Team: [All] [Platform] [Backend] [Frontend] [Data]
// Tier: [All] [Critical] [Standard] [Internal] [Deprecated]
// Health: [All] [Healthy] [Degraded] [Down]
// Provider: [All] [AWS] [GCP] [Azure]

// SERVICE TABLE (sortable columns):
// Service | Team | Status | Uptime 30d | Last Deploy | Cost/mo | Owner | Links
//
// my-api  | Backend | 🟢 Live | 99.97% | 2h ago | $187 | @raj | [Runbook][Logs][PD]
// auth-svc| Platform| 🟢 Live | 99.99% | 1d ago | $95  | @ana | [Runbook][Logs]
// worker  | Backend | 🟡 Degraded | 98.2% | 3d ago | $45 | @raj | [Runbook]

// SERVICE DETAIL PAGE: /catalog/[service-slug]
// Header: service name, team, tier badge, status dot
//
// CARDS ROW:
//   Uptime 30d: 99.97%     Current status: Live
//   Last deploy: 2h ago    Est. cost: $187/mo
//
// SECTION: Health Overview
//   COIE score: 82/100 (with 4D breakdown)
//   Open incidents: 0
//   Open findings: 3 (medium)
//
// SECTION: Recent Deployments (last 10)
//   Table: sha, message, deployer, time, duration, status
//
// SECTION: Runbook links (editable)
//   [Runbook URL] [On-call Slack] [SLA target]
//
// SECTION: Contact
//   Team: Backend
//   On-call: #backend-oncall
//   Current on-call (from PagerDuty integration if connected): @raj

// SECTION: Dependencies (Phase 25b — not in scope now)
//   Services this depends on: database, redis, auth-svc
//   Services that depend on this: api-gateway, mobile-bff
```

### Service Health Score for Catalog (computed field)
```typescript
// Computed on-demand from existing tables:
function computeServiceHealthScore(project: Project, incidents: Incident[], findings: Finding[]): number {
  let score = 100

  // Deductions:
  // Active critical incident: -40
  // Active high incident: -20
  // Open critical finding: -10
  // Open high finding: -5
  // Last deploy > 30 days ago: -5 (stale service risk)
  // Uptime < 99.9% in last 30 days: -15

  const activeIncidents = incidents.filter(i => i.status !== 'resolved')
  const criticalIncidents = activeIncidents.filter(i => i.severity === 'critical')
  const highIncidents = activeIncidents.filter(i => i.severity === 'high')
  const criticalFindings = findings.filter(f => f.severity === 'critical' && f.status === 'open')
  const highFindings = findings.filter(f => f.severity === 'high' && f.status === 'open')

  score -= criticalIncidents.length * 40
  score -= highIncidents.length * 20
  score -= criticalFindings.length * 10
  score -= highFindings.length * 5

  return Math.max(0, score)
}
```

### VERIFY Task 25.1
```
□ Service Catalog page loads with all projects listed
□ Search "api" → filters to services with "api" in name/team/tags
□ Filter by team "Backend" → shows only Backend team services
□ Filter by health "Degraded" → shows only services with active incidents
□ Service detail page: all 6 sections populated with real data
□ Runbook URL: editable inline → saves to projects.runbook_url → persists on reload
□ On-call Slack: clicking the link opens Slack deep link
□ Uptime 30d: calculated from incidents history (correct % shown)
□ COIE score shown on service detail: matches OverviewTab score
□ Recent deployments: last 10 shown with correct status badges
□ Team filter works: set team_owner on a project → appears in correct team filter
□ Service tier badge shows correct color: critical=red, standard=blue, deprecated=gray
□ Plan enforcement: Catalog page blocked for Free plan users (Team/Enterprise only)
```

---

# APPENDIX A — COMPLETE PROGRESS TRACKER (add to PROGRESS.md)

```markdown
## Pre-Phase 21: Close the 8%
- [ ] Book and complete external penetration test
- [ ] Fix all critical + high pen test findings
- [ ] Schedule retest after fixes
- [ ] Publish Terraform provider to registry.terraform.io
- [ ] Run all 18 P1 verification tests, confirm ✅
- [ ] Start SOC2 evidence clock (enable compliance_log automation)

## Phase 21: GitHub Actions
- [ ] 21.1 — autostack/actions/deploy@v1 (deploy + wait + rollback on failure)
- [ ] 21.1 — autostack/actions/rollback@v1
- [ ] 21.1 — autostack/actions/preview@v1 (PR comment + namespace deploy)
- [ ] 21.1 — Publish all 3 to GitHub Marketplace

## Phase 22: AI Ops
- [ ] 22.1 — AI Chat interface (streaming, context-aware, rate-limited)
- [ ] 22.1 — ai-chat Edge Function (intent detection, data fetch, LLM call, validation)
- [ ] 22.2 — AIRE Tier 3 LLM diagnosis (with caching, rate limiting, PII stripping)
- [ ] 22.2 — Kill switch: ai_features_enabled per org

## Phase 23: Marketplace
- [ ] 23.1 — Template spec format (template.yaml)
- [ ] 23.1 — Template registry DB tables + API
- [ ] 23.1 — Marketplace UI (browse, filter, search, detail page)
- [ ] 23.1 — Template deploy flow (variable config → standard DIE pipeline)
- [ ] 23.1 — Seed: 5 AutoStack-verified templates (Next.js, FastAPI, Django, Go, React)
- [ ] 23.1 — Community template submission + security scanning

## Phase 24: FinOps
- [ ] 24.1 — Cost anomaly detection (Z-score, hourly pg_cron)
- [ ] 24.1 — Budget alerts (threshold-based, dedup, email notifications)
- [ ] 24.1 — RI recommendations (3-month usage analysis)
- [ ] 24.1 — FinOps Dashboard additions (budget overview, anomaly alerts, RI table)

## Phase 25: DX Portal
- [ ] 25.1 — Service catalog (projects table enriched with team/runbook/oncall)
- [ ] 25.1 — Service catalog UI (browse, filter, search, detail page)
- [ ] 25.1 — Service health score (computed from incidents + findings)
- [ ] 25.1 — Runbook / on-call inline editing
```

---

# APPENDIX B — DEPENDENCY MAP (PHASES 21–25)

```
Phase 21 (GitHub Actions) — Independent. Ship FIRST.
  Requires: AUTOSTACK_TOKEN auth (Phase 16 CLI delivers this)
  Users: every engineering team with GitHub Actions CI/CD

Phase 22 (AI Ops)         — Depends on: all existing monitoring data (Phases 7, 9)
  Requires: ANTHROPIC_API_KEY or OPENAI_API_KEY in Supabase secrets
  Users: on-call engineers, platform teams asking "why"

Phase 23 (Marketplace)    — Independent. Ship SECOND after Phase 21.
  Requires: full DIE pipeline working (Phases 2-5)
  Users: new users reducing time-to-first-deploy

Phase 24 (FinOps)         — Depends on: 3 months of cost history (Phase 11 billing)
  Requires: org_usage data (Phase 11) + COIE findings (Phase 5)
  Users: engineering managers, CTOs, FinOps teams

Phase 25 (DX Portal)      — Depends on: multiple environments deployed (Phases 1-15)
  Requires: Team/Enterprise plan (Phase 11), multiple projects in DB
  Users: platform engineering teams with 5+ services

Recommended ship order: 21 → 23 → 22 → 24 → 25
  GitHub Actions: every team needs this, ship fast
  Marketplace: reduces new user friction, second most impactful
  AI Ops: differentiator, drives word-of-mouth
  FinOps: expands to CFO/CTO buyer, not just engineers
  DX Portal: enterprise feature, last
```

---

# APPENDIX C — THE COMPLETE AUTOSTACK FEATURE MAP (All 25 Phases)

```
LAYER 1: CORE PLATFORM (Phases 1–5)
  Database & IAM → DIE Engine → Onboarding → Dashboard → COIE/AIRE

LAYER 2: INTEGRATIONS (Phases 6–10)
  GitHub App → Go Agent → Security → Performance → Launch

LAYER 3: ENTERPRISE (Phases 11–15)
  Stripe → Multi-Cloud → Multi-Region → Databases → On-Prem

LAYER 4: DEVELOPER EXPERIENCE (Phases 16–20)
  CLI → SSO → Terraform → Integrations → SOC2

LAYER 5: ECOSYSTEM (Phases 21–25)
  GitHub Actions → AI Ops → Marketplace → FinOps → DX Portal

LAYER 6: HORIZON (Post-Phase 25, not in scope)
  Compliance Suite (HIPAA, FedRAMP) → AutoStack CLI v2 → API Gateway
  Cost Anomaly ML (beyond Z-score) → Service Mesh → GitOps dashboard
```
