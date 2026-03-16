# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — COMPLETE PROJECT RECONSTRUCTION & PIVOT                     ║
# ║  The Real Vision: One-Click BYOC Deployment Platform                     ║
# ║  Version: PIVOT v1.0 — The Document That Corrects Everything             ║
# ║  For: Antigravity AI IDE / Cursor / Any Agentic Coding Tool              ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

---

# ⚠️ MANDATORY: READ THIS ENTIRE DOCUMENT BEFORE WRITING A SINGLE LINE OF CODE

This document supersedes ALL previous AutoStack documents including:
- AutoStack_Project_Overview.docx
- AutoStack_FullStack_Blueprint.md
- AutoStack_API_Workflow.docx
- AutoStack_Production_Completion_Prompt.md
- AutoStack_ULTIMATE_Prompt.md

Every previous document described the WRONG PRODUCT.
This document describes the CORRECT product and the EXACT changes to make.
Do not reference previous documents. They are wrong.

---

# PART 0 — THE REAL VISION (Read This 3 Times)

## The One-Line Product Statement

> **AutoStack: Paste a GitHub URL. Pick a cloud. Click deploy. Your production-grade
> Kubernetes infrastructure is live in 8 minutes — on YOUR AWS/GCP/Azure account,
> with AI cost optimization baked in from second one.**

## What This Means Concretely

A developer opens autostack.io.
They paste `https://github.com/their-company/their-api`.
They pick AWS, pick a region, pick a size (small / medium / large).
They click **Deploy**.

AutoStack's engine does this **automatically, in order, in real time**:

```
1. Clones the repo — detects language, framework, port, env vars, dependencies
2. Generates production Dockerfile optimized for the detected stack
3. Provisions AWS infrastructure in the user's own account via assumed IAM role:
     → VPC (2 public + 2 private subnets, proper CIDR design)
     → EKS cluster (managed node group, correct instance type for workload)
     → ECR repository for the app's container images
     → ALB (Application Load Balancer) with SSL termination
     → Route53 records (if user provides domain)
     → IAM roles and service accounts (IRSA for pod-level permissions)
     → Security groups with least-privilege rules
4. Builds and pushes the Docker image to ECR
5. Generates Kubernetes manifests (Deployment, Service, Ingress, HPA, PodDisruptionBudget)
6. Deploys via ArgoCD GitOps — commits manifests to user's repo in /deploy folder
7. Monitors rollout — waits for pods healthy, LB routing traffic
8. Returns LIVE URL to user

Total time: 6–12 minutes depending on cluster creation
```

The user **owns everything**. The infrastructure is in **their** AWS account.
AutoStack never touches their data. They pay AWS directly. No lock-in.
AutoStack charges for the intelligence layer, not the compute.

---

## Why This Beats Every Competitor

| Platform | Where infra runs | User owns it? | Real K8s? | Cost optimization? | Self-healing? |
|----------|-----------------|---------------|-----------|---------------------|---------------|
| **Railway** | Railway's cloud | ❌ | ❌ (abstracted) | ❌ | ❌ |
| **Render** | Render's cloud | ❌ | ❌ (abstracted) | ❌ | ❌ |
| **ToyStack** | ToyStack's cloud | ❌ | ✅ managed | ❌ | ❌ |
| **Heroku** | Salesforce's cloud | ❌ | ❌ | ❌ | ❌ |
| **Terraform** | Yours | ✅ | ✅ | ❌ (manual) | ❌ |
| **AWS CDK** | Yours | ✅ | ✅ | ❌ (manual) | ❌ |
| **AutoStack** | **YOUR cloud** | **✅** | **✅ real** | **✅ AI-driven** | **✅ AIRE** |

**The kill shot on ToyStack specifically:**
ToyStack runs on ToyStack's Kubernetes. You don't own the infra.
Enterprise customers cannot put their data on a $325K-funded Indian startup's servers.
SOC2, HIPAA, GDPR, FedRAMP — all require data to stay in their own VPC.
AutoStack is the answer: enterprise-grade deployment automation, YOUR cloud, YOUR VPC.

**The kill shot on Railway/Render:**
They abstract K8s away entirely. That works for indie devs but breaks at scale:
- You can't customize networking, security groups, VPC peering
- Your costs multiply 3-4x vs running your own EKS
- You can't get Enterprise compliance certifications
- You can't use Reserved Instances or Savings Plans

**The kill shot on Terraform/CDK:**
These require DevOps engineers to write infrastructure code.
A 5-person startup cannot afford a DevOps engineer.
AutoStack gives that startup production-grade K8s infrastructure with zero YAML.

---

# PART 1 — THE THREE ENGINES (REDEFINED)

The three engines still exist. Their PURPOSE changes completely.

## Engine 1: DIE — Deployment Intelligence Engine (THE STAR)
**Old purpose:** Analyze Git repo → generate manifests → open PR
**New purpose:** The entire deployment pipeline from repo URL to live URL

DIE now does:
```
STAGE 1 — REPO ANALYSIS (30 sec)
  Clone repo (shallow, latest commit)
  Detect: language, framework, package manager, entry point, port, env vars needed
  Generate: production-optimized Dockerfile, .dockerignore
  Validate: build passes, security scan (no leaked secrets, no critical CVEs)
  Output: RepoProfile { language, framework, port, buildCmd, startCmd, resources }

STAGE 2 — INFRASTRUCTURE PLANNING (10 sec)
  Based on RepoProfile + user's size selection:
  Generate: InfrastructurePlan { 
    nodeType, nodeCount, minReplicas, maxReplicas,
    cpu_request, cpu_limit, memory_request, memory_limit,
    estimatedMonthlyCost,
    resourceList: [VPC, EKS, ECR, ALB, Route53, IAM...]
  }
  Show cost estimate to user BEFORE provisioning
  User confirms → Stage 3 begins

STAGE 3 — INFRASTRUCTURE PROVISIONING (5–8 min)
  Using user's IAM role credentials (assumed role, cross-account):
  Terraform apply (or AWS SDK calls) to create:
    VPC + subnets + internet gateway + NAT gateway
    EKS cluster + managed node group
    ECR repository
    ALB + target groups + SSL certificate (ACM)
    IAM roles (cluster role, node role, pod execution role)
    Security groups
  Real-time progress events streamed to frontend

STAGE 4 — APPLICATION BUILD & DEPLOY (2–3 min)
  Build Docker image using Dockerfile from Stage 1
  Push to ECR
  Generate K8s manifests: Deployment, Service, Ingress, HPA, PDB, ConfigMap
  Commit manifests to /deploy/[environment]/ in user's repo
  ArgoCD syncs manifests to cluster
  Wait for rollout: all pods Running + ALB returning 200

STAGE 5 — LIVE ✅
  Return: { url, clusterArn, region, cost_estimate, deployment_id }
  Start COIE monitoring cycle
  Register cluster in AutoStack database
```

## Engine 2: COIE — Cost & Operational Intelligence Engine (THE OPTIMIZER)
**Old purpose:** Score cluster across 4 dimensions, open fix PRs
**New purpose:** Continuous cost optimization + operational health, with real $ savings

COIE now does:
```
Runs every 5 minutes per deployed environment

COST ANALYSIS:
  Compare actual CPU/memory usage vs. requested values
  Identify overprovisioned resources → generate "Save $X/month" recommendations
  Analyze reserved instance opportunities
  Detect idle environments (dev/staging) → suggest scale-to-zero
  Total potential monthly savings shown in dashboard

OPERATIONAL HEALTH:
  Security: misconfigs, exposed ports, missing network policies
  Reliability: missing health checks, no resource limits, single-replica workloads
  Performance: high p99 latency, memory pressure, CPU throttling

ONE-CLICK FIXES:
  Every finding has a "Fix" button
  "Fix" opens a PR to the user's repo with the exact change
  User merges PR → ArgoCD applies it → finding resolved
  "Apply All Fixes" applies all safe/medium changes at once
```

## Engine 3: AIRE — Autonomous Incident Response Engine (THE GUARDIAN)
**Old purpose:** Detect incidents via agent events → pattern match → RCA
**New purpose:** Keep deployed applications alive without human intervention

AIRE now does:
```
Monitors every deployed application 24/7

DETECTION TRIGGERS:
  Pod restarts > 3 in 10 minutes
  OOMKilled events
  Deployment rollout stalled > 5 minutes
  ALB target health checks failing
  Pod in CrashLoopBackOff
  Node NotReady

AUTO-DIAGNOSIS:
  Collect logs, events, metrics for affected workload
  Match against 10 known failure patterns
  Generate plain-English Root Cause Report

AUTO-REMEDIATION (when enabled):
  OOM: patch memory limit upward by 25%, open PR with permanent fix
  CrashLoop: rollback to last healthy deployment instantly
  Config error: suggest fix, wait for user approval
  Node failure: drain + reschedule automatically

INCIDENT REPORT in dashboard:
  What happened, when, which pod, which node
  Root cause (human-readable, no jargon)
  What AIRE did automatically
  What you should do permanently
```

---

# PART 2 — WHAT CHANGES IN THE CODEBASE

## 2.1 — THE BIG PICTURE OF WHAT TO KEEP, CHANGE, DELETE

```
KEEP (zero changes needed):
  ✅ src/lib/supabase.js
  ✅ src/lib/analytics.js  
  ✅ src/lib/errorTracker.js
  ✅ src/lib/redis.js
  ✅ src/lib/email.js
  ✅ src/hooks/useAuth.jsx (entire auth system)
  ✅ src/context/ToastContext.jsx
  ✅ src/components/ui/ (entire component library)
  ✅ src/pages/LoginPage.jsx
  ✅ src/pages/SignupPage.jsx
  ✅ src/pages/ForgotPasswordPage.jsx
  ✅ supabase/functions/auth-hook/ (with CORS fix)
  ✅ supabase/functions/invite-member/
  ✅ supabase/functions/agent-heartbeat/
  ✅ supabase/functions/agent-metrics/
  ✅ supabase/migrations/001_initial_schema.sql (with additions)

DELETE (these are wrong product):
  ❌ Any reference to "cluster connection" as user-initiated (user no longer brings their own cluster)
  ❌ The onboarding step 2 "install the agent" flow (agent is installed BY AUTOSTACK now)
  ❌ Any "connect cluster" form that asks user for cluster name/provider/region (replaced by "deploy project")
  ❌ src/data/data.js fake data arrays (replace with real DB or remove)

MAJOR MODIFICATION (same file, different purpose):
  🔄 src/pages/OnboardingPage.jsx (3 steps change completely — see Part 3)
  🔄 src/components/Dashboard.jsx (tab names + sidebar text change)
  🔄 src/components/tabs/OverviewTab.jsx (same data, new framing)
  🔄 src/components/tabs/ProjectsTab.jsx → renamed to DeploymentsTab (see Part 3)
  🔄 src/components/tabs/InfrastructureTab.jsx (show AutoStack-provisioned infra, not user's pre-existing)
  🔄 src/components/tabs/LogsTab.jsx (same concept, now real logs from AIRE)
  🔄 supabase/functions/connect-cluster/ → becomes deploy-project/ (full rewrite)
  🔄 supabase/functions/coie-cycle/ (add cost analysis)
  🔄 supabase/functions/aire-detect/ (add auto-remediation)
  🔄 supabase/migrations/ (new tables + modified tables)

NEW (doesn't exist yet):
  ✨ supabase/functions/die-analyze/ (the full deployment pipeline)
  ✨ supabase/functions/infra-provision/ (AWS SDK infrastructure creation)
  ✨ supabase/functions/aws-assume-role/ (IAM role validation + assumption)
  ✨ supabase/functions/send-notification/ (from Phase 3 plan — still needed)
  ✨ src/components/deploy/ (the new Deploy flow modals)
  ✨ src/components/tabs/CostTab.jsx (new tab for cost intelligence)
  ✨ src/pages/DeployPage.jsx (the hero deploy experience)
```

---

# PART 3 — FRONTEND: COMPLETE SPECIFICATION

## 3.1 — Landing Page Changes

The landing page message changes completely. Every text string changes.

### Hero Section — REPLACE ENTIRELY

```
OLD (WRONG):
  Headline: "Intelligent Kubernetes Operations" or similar
  Subtext: anything about "Day 2 operations", "connecting clusters", "scoring"
  CTA: "Connect your cluster"

NEW (CORRECT):
  Eyebrow: "BYOC — Bring Your Own Cloud"  [small caps, blue, letter-spaced]
  Headline: "Deploy anything to AWS in 8 minutes."  [Syne 800 64px]
  Subline: "Paste a GitHub URL. AutoStack provisions your VPC, EKS cluster,
            load balancer, and CI/CD pipeline — in your AWS account. You own
            everything. We charge nothing for compute."
  Subtext: "Production-grade Kubernetes on your cloud. Zero YAML. Zero DevOps hire."

  Primary CTA: "Deploy your first project →" (blue, large)
  Secondary: "Watch 2-minute demo" (ghost, play icon)

  Below CTAs — 3 proof stats in a row:
    "8 min" / average deploy time
    "Your cloud" / not ours
    "$0 markup" / on compute

  Terminal animation (keep the existing typewriter component but change the text):
    Typewriter simulates:
    Line 1: $ autostack deploy github.com/acme/api-service --env production
    Line 2: ✓ Detected: Node.js 20 + Express + Postgres
    Line 3: ✓ Generating Dockerfile...
    Line 4: ✓ Planning infrastructure: EKS (3× t3.medium), ALB, RDS...
    Line 5: ✓ Estimated monthly cost: $127/mo (your AWS bill)
    Line 6: ⟳ Provisioning VPC us-east-1... (progress bar)
    Line 7: ⟳ Creating EKS cluster... 2m 34s
    Line 8: ⟳ Building & pushing image to ECR...
    Line 9: ✓ Deployed! → https://api-service.acme.com
    Line 10: ✓ AIRE monitoring active. COIE cost analysis running.
```

### Features Section — REPLACE ALL 6 CARDS

```
Card 1: "Zero YAML, Ever"
  Icon: FileX (lucide)
  "AutoStack generates your Dockerfile, K8s manifests, Ingress, HPA, and ArgoCD
   application. You never touch infrastructure code unless you want to."

Card 2: "Your Cloud Account"
  Icon: Cloud (lucide) with lock
  "Infrastructure lives in your AWS, GCP, or Azure account. Your VPC.
   Your IAM. Your data never leaves your cloud boundary. Enterprise
   compliance ready from day one."

Card 3: "AI Cost Optimizer"
  Icon: TrendingDown (lucide)
  "AutoStack analyzes your real usage every 5 minutes. Finds overprovisioned
   resources, idle environments, and right-sizing opportunities.
   Average customer saves 34% on cloud spend in 30 days."

Card 4: "Deploy in 8 Minutes"
  Icon: Zap (lucide)
  "Paste a GitHub URL. AutoStack detects your stack, sizes your infra,
   provisions your cluster, builds your image, deploys — all in under
   10 minutes. Start Monday. Ship Friday. Not the other way around."

Card 5: "Self-Healing Apps"
  Icon: RefreshCw (lucide)
  "AIRE monitors every pod, every node, every rollout. When something breaks,
   it diagnoses the cause in seconds and either fixes it automatically
   or tells you exactly what to do."

Card 6: "GitOps by Default"
  Icon: GitBranch (lucide)
  "Every infrastructure change is a PR. Every deploy is a commit. Complete
   audit trail. Rollback is one merge away. Your team stays in control."
```

### Pricing Section — REPLACE

```
FREE tier:
  1 environment (up to 3 nodes)
  1 GitHub repo connected
  COIE cost analysis
  Community support
  CTA: "Start for free"

PRO — $49/environment/month:
  Unlimited environments
  AIRE auto-healing (manual approval)
  Custom domains + SSL
  Email alerts
  CTA: "Start Pro"

TEAM — $199/org/month:
  Everything in Pro
  AIRE auto-remediation (no approval needed)
  Multi-cloud (AWS + GCP + Azure)
  Compliance reports (SOC2 ready export)
  Slack + PagerDuty alerts
  Priority support
  CTA: "Start Team"

ENTERPRISE — Custom:
  On-premise Control Plane option
  Custom VPN/PrivateLink setup
  Dedicated support engineer
  SLA guarantees
  CTA: "Talk to us"
```

---

## 3.2 — Onboarding Flow (3 Steps — Complete Rewrite)

File: `src/pages/OnboardingPage.jsx`

### Step 1 — "Connect Your Cloud"

```
VISUAL:
  Icon: Cloud icon 48px inside gradient circle (blue → purple)
  Title: "Connect your cloud account" Inter Bold 28px
  Subtitle: "AutoStack will deploy infrastructure into your account.
             You pay AWS directly. We never see your data."
  
FORM (card: bg #0d1117 border #334366 rounded-xl p-32 w-[540px]):
  
  Provider selector — 3 large cards side by side:
    [AWS (EKS)]      [Google Cloud (GKE)]    [Azure (AKS)]
    ← selected: blue border glow
    Beta badge on GCP and Azure
  
  Below (AWS selected — most common path, build this first):
    
    "Your AWS Account ID" — text input
    placeholder: "123456789012"
    helper: "12-digit number from AWS Console → top right corner"
    
    "Preferred Region" — select dropdown
    Options: US East (N. Virginia) / US West (Oregon) / EU West (Ireland) /
             Asia Pacific (Singapore) / Asia Pacific (Mumbai) / ... (top 8)
    
    "IAM Role ARN" — text input
    placeholder: "arn:aws:iam::123456789012:role/AutoStackRole"
    helper: "Create this role in 2 minutes →" [link opens a modal with CloudFormation
             one-click stack creation URL that creates the exact IAM role AutoStack needs]
    
    [IAM Role Setup Helper] button — ghost variant, opens modal:
      Modal shows:
        1. Click this button → "Launch CloudFormation Stack" (opens AWS console with
           pre-filled template URL that creates AutoStackRole with exact permissions)
        2. Wait 60 seconds for stack to complete
        3. Copy the Role ARN from CloudFormation Outputs
        4. Paste it above

"Verify & Continue →" blue button
  Loading: "Testing IAM permissions..."
  On success: green checkmark + "IAM role verified — 23 permissions confirmed"
  On failure: red inline error with specific message:
    "Role not found" → "Check your Account ID and Role ARN format"
    "Missing permissions" → "Your role is missing: eks:CreateCluster, ec2:CreateVpc [list]"
    "Network error" → "Cannot reach AWS. Check your role's trust policy."

WHAT HAPPENS ON VERIFY:
  POST /functions/v1/aws-assume-role
  Body: { account_id, region, role_arn }
  Backend: calls AWS STS AssumeRole with the provided ARN
  If successful: returns { success: true, account_id, region, verified_at }
  Store in DB: cloud_credentials table
  Store in Supabase session metadata
  Move to Step 2
```

### Step 2 — "Deploy Your First Project"

```
VISUAL:
  Icon: Rocket icon 48px inside gradient circle (green)
  Title: "Deploy your first project" Inter Bold 28px
  Subtitle: "Paste any public or private GitHub repository URL"

FORM (same card style):
  
  "Repository URL" — large text input, full width
  placeholder: "https://github.com/your-org/your-app"
  helper: "Public or private repos. Private requires GitHub App authorization."
  
  GitHub App auth (shown only for private repos, detected after URL entry):
    If URL typed and is private → show inline:
    "This is a private repo. Authorize GitHub App →" [blue link]
    Clicking it opens GitHub OAuth → comes back → blue checkmark "GitHub connected"
  
  Environment name — text input
  placeholder: "production"
  default: "production"
  
  Size selector — 3 cards:
    SMALL:   "$27–45/mo*   2 vCPU   4GB RAM   2 nodes"
    MEDIUM:  "$95–140/mo*  4 vCPU   16GB RAM  3 nodes"
    LARGE:   "$280–420/mo* 8 vCPU   32GB RAM  5 nodes"
    Selected: blue border glow
    "*Estimated AWS cost paid directly to AWS"
  
  "Add environment variables" — collapsible section
  [+ Add Variable] button → key:value pairs
  
"Analyze & Deploy →" green large button
  
  On click → this button changes to a progress view (INLINE, no modal):
  
  PROGRESS VIEW (replaces the button area):
  ┌──────────────────────────────────────────────────────────┐
  │ ⟳  Stage 1: Analyzing repository...                     │
  │ ✓  Detected Node.js 20, Express 4.18, PostgreSQL        │
  │ ✓  Generating Dockerfile...                              │
  │ ⟳  Stage 2: Planning infrastructure...                  │
  └──────────────────────────────────────────────────────────┘
  
  After Stage 2 completes → show COST PREVIEW MODAL:
  ┌─────────────────────────────────────────────────┐
  │ 📋 Infrastructure Plan                          │
  │ ─────────────────────────────────────────────   │
  │ EKS Cluster (2 × t3.medium nodes)   ~$127/mo   │
  │ Application Load Balancer            ~$22/mo    │
  │ NAT Gateway                          ~$35/mo    │
  │ ECR (image storage)                  ~$2/mo     │
  │ Route53 (DNS)                        ~$1/mo     │
  │ ─────────────────────────────────────────────   │
  │ Total estimate:                      ~$187/mo   │
  │ Paid directly to AWS in your account            │
  │                                                 │
  │ [Cancel]   [Confirm & Provision →]              │
  └─────────────────────────────────────────────────┘
  
  On "Confirm & Provision" → STAGE 3 begins, real-time:
  ┌──────────────────────────────────────────────────────────┐
  │ ✓  Repository analyzed                                   │
  │ ✓  Infrastructure planned ($187/mo)                      │
  │ ⟳  Provisioning VPC (us-east-1)...          1m 12s ↗   │
  │ ⟳  Creating EKS cluster...                  waiting...  │
  │ ·  Building Docker image                     (pending)   │
  │ ·  Deploying to Kubernetes                   (pending)   │
  └──────────────────────────────────────────────────────────┘
  
  Status updates via Supabase Realtime on the deployments table.
  Each stage row transitions: pending (gray dot) → running (blue spinner) → done (green check) → failed (red X)
  
  ETA counter: "Estimated time remaining: 6m 30s" (counts down)
```

### Step 3 — "It's Live!"

```
VISUAL:
  Canvas confetti fires on mount
  
  Big green checkmark animation (scale 0 → 1.2 → 1.0, 600ms)
  
  "Your app is live!" Syne 800 36px center
  
  Live URL card:
  ┌──────────────────────────────────────────────────────────┐
  │ 🌐  https://your-app-production.autostack.app            │
  │     [Copy] [Open →]                                      │
  └──────────────────────────────────────────────────────────┘
  
  Infrastructure summary:
  ┌──────────────────────────────────────────────────────────┐
  │ ✓ EKS Cluster     us-east-1        3 nodes ready        │
  │ ✓ Application LB  Active           SSL/TLS enabled       │
  │ ✓ ECR Repository  your-app-prod    image pushed          │
  │ ✓ AIRE            Monitoring       3 replicas healthy    │
  │ ✓ COIE            Running          Next cycle in 5 min   │
  └──────────────────────────────────────────────────────────┘
  
  Cost summary:
  "Your estimated AWS bill: ~$187/month"
  "AutoStack will check for savings opportunities in 5 minutes."
  
  CTA: "Open Dashboard →" large blue button
  
  Small text below: "Your infrastructure is in your AWS account.
  You can manage it independently at any time."
```

---

## 3.3 — Dashboard Layout Changes

### Sidebar Changes

```
OLD sidebar text:
  "CLUSTERS" section header
  Cluster badge: [cluster name] [health score]
  
NEW sidebar text:
  "ENVIRONMENTS" section header
  Environment badge: [env name] [status dot] [deployed app name]
  
  Sub-items under each environment:
    [cluster-name] — "prod-eks-us-east-1" — small gray text
    
  "New Environment" button at bottom of sidebar (replaces "Connect Cluster")
```

### Sidebar Activity Feed — Change Labels

```
Feed events change from operational K8s language to deployment language:

OLD                                    NEW
───────────────────────────────────────────────────────
"CrashLoopBackOff detected"        →  "⚠️ Pod restart loop — AIRE investigating"
"COIE cycle completed"             →  "💰 Cost check: $23 in savings found"
"New finding: MISSING_LIMITS"      →  "🔍 COIE: Add resource limits to save $12/mo"
"Score updated: 87/100"            →  "✓ Health check passed — all good"
"PR #48 opened"                    →  "📬 Fix PR opened: resize memory limits"
```

### Tab Bar Changes

```
OLD TABS                              NEW TABS
─────────────────────────────────────────────────────────
Overview          (keep, rename label: "Overview")
Projects          → Deployments
Pipelines         (keep, no change)
Infrastructure    (keep, content changes)
Monitoring        (keep, no change)
Logs              (keep, no change)
Settings          (keep, no change)

ADD NEW TAB:
+ Cost            (new tab, between Monitoring and Logs)
```

---

## 3.4 — Dashboard Tab: Deployments (replaces Projects)

File: `src/components/tabs/DeploymentsTab.jsx` (replaces `ProjectsTab.jsx`)

```
PURPOSE: Shows all deployed applications per environment.
DATA SOURCE: `deployments` table + `projects` table joined.

LAYOUT:
  Top bar: [Filter: all / running / failed / deploying] [+ New Deployment button]
  
  Table columns:
    App Name         → project.name
    Environment      → project.environment (badge: production=blue, staging=amber, dev=gray)
    Status           → deployment.status (dot + label: live / deploying / failed / rolled back)
    URL              → deployment.live_url (clickable, opens in new tab)
    Last Deploy      → deployment.completed_at (relative: "2 hours ago")
    Cost/mo          → project.estimated_monthly_cost (from COIE)
    Actions          → [Redeploy] [Rollback] [Logs] [···]
  
  Row click → expands to show:
    Latest deployment details
    COIE findings count for this app
    AIRE incident count (last 30 days)
    Link to dedicated deployment detail page

EMPTY STATE:
  Icon: Rocket (48px, muted)
  Title: "No deployments yet"
  Subtitle: "Deploy your first project to get started"
  CTA: "New Deployment →" button
  (clicking opens the full Deploy flow modal)

NEW DEPLOYMENT MODAL:
  This is the same as Onboarding Step 2 + Step 3, but as a modal (not full page)
  User can re-use existing AWS credentials (pre-selected from org settings)
  Or add new cloud credentials for a different account
```

---

## 3.5 — Dashboard Tab: Overview (MODIFIED)

The data model is the same. Only the FRAMING and LABELS change.

```
SCORE CARDS (same 4 cards, new labels):

Card 1: OLD "Security Score"    → NEW "Security Score" (same, keep)
Card 2: OLD "Reliability Score" → NEW "Reliability Score" (keep)
Card 3: OLD "Cost Score"        → NEW "Cost Score" (keep)
Card 4: OLD "Performance Score" → NEW "Performance Score" (keep)

Below scores, add "Cost Snapshot" row:
  "Current estimated AWS spend: $187/mo across 3 environments"
  "COIE found $43/mo in savings opportunities →" [link to Cost tab]

Activity Feed:
  Change empty state text:
  "No recent activity" → "No deployments yet. Deploy your first app to start tracking."
  
  Change feed item icons:
  deployment success → green Rocket icon
  AIRE incident       → amber AlertTriangle icon
  COIE finding        → blue DollarSign icon
  PR opened           → purple GitPullRequest icon
```

---

## 3.6 — NEW TAB: Cost (CostTab.jsx)

This is a NEW TAB. Build it.

```
FILE: src/components/tabs/CostTab.jsx

LAYOUT:
  
  Section 1 — Cost Summary Header
  ┌──────────────────────────────────────────────────────────────────┐
  │ This month's estimated AWS spend across all environments         │
  │                                                                  │
  │ $187.40   ← Recharts number (count-up animation on load)        │
  │ ↓ $43.20 in savings identified by COIE                          │
  │ [Apply All Safe Fixes] button                                    │
  └──────────────────────────────────────────────────────────────────┘
  
  Section 2 — Cost by Environment (Recharts BarChart)
  Bar chart: x-axis = environment name, y-axis = $/month
  Tooltip shows breakdown: compute / network / storage
  
  Section 3 — Savings Opportunities (Table)
  Each row is a COIE cost finding:
  
  Columns:
    Severity (badge: critical/high/medium/low)
    Description
    Affected Resource
    Potential Saving
    Action
  
  Example rows:
    [HIGH]  CPU overprovisioned 60%      api-service    $18/mo    [Fix: Right-size CPU]
    [MED]   Staging idle 80% of time     staging-api    $12/mo    [Fix: Enable scale-to-zero]
    [MED]   3 replicas in dev env        dev-frontend   $8/mo     [Fix: Reduce to 1 replica]
    [LOW]   t3.medium → t3.small viable  worker-app     $5/mo     [Fix: Downsize node]
  
  [Fix] button → opens PR to the project's repo with the exact change
  [Apply All Safe Fixes] → applies all LOW and MEDIUM fixes at once (still as PRs)
  
  Section 4 — Cost History (Recharts AreaChart)
  30-day cost trend line
  Highlight any day where COIE applied an optimization (cost should drop)
  
DATA:
  findings table WHERE dimension = 'cost'
  cluster_metrics aggregated with estimated AWS pricing
  projects.estimated_monthly_cost (computed by COIE)
```

---

## 3.7 — Dashboard Tab: Infrastructure (MODIFIED)

Content changes from "show user's existing infra" to "show AutoStack-provisioned infra"

```
LAYOUT:
  
  Header: "Your Cloud Infrastructure" (not "Your Cluster")
  
  Environment selector (if multiple envs): tabs for production / staging / development
  
  Infrastructure Cards Grid (4 per row):
  
    VPC Card:
      Icon: Network
      Title: "VPC"
      Value: "vpc-0abc123..." (truncated)
      Sub: "us-east-1 · 2 AZs"
      Status dot: green (healthy)
    
    EKS Cluster Card:
      Icon: Server
      Title: "EKS Cluster"
      Value: "prod-eks-us-east-1"
      Sub: "v1.29 · 3 nodes"
      Progress bar: CPU 42% | Memory 38%
    
    Load Balancer Card:
      Icon: Globe
      Title: "Load Balancer"
      Value: "ALB - Active"
      Sub: "SSL/TLS · 443"
      Status: green
    
    ECR Card:
      Icon: Package
      Title: "Container Registry"
      Value: "your-app-prod"
      Sub: "12 images · 2.3 GB"
      Status: green
    
    RDS / Database Card (if detected):
      Icon: Database
      Title: "RDS PostgreSQL"
      Value: "db.t3.medium"
      Sub: "15.2 GB used / 20 GB"
      Progress bar: storage utilization
    
    ElastiCache Card (if detected):
      Icon: Zap
      Title: "ElastiCache Redis"
      Value: "cache.t3.micro"
      Sub: "145 MB / 512 MB"
  
  Node List (table below):
    Node Name | Status | Instance Type | CPU | Memory | Pods | Age
    (real data from cluster_metrics via agent)
  
  At bottom: "Open in AWS Console →" button (deep link to EKS console for this cluster)
```

---

## 3.8 — Deploy Flow Component (NEW)

This is the core product flow. Accessible from:
- Onboarding step 2
- DeploymentsTab "New Deployment" button
- Dashboard sidebar "New Deployment" button

```
FILE: src/components/deploy/DeployModal.jsx

This is a large modal (or full-page overlay) — same visual language as onboarding
but skips the cloud setup step if credentials already exist.

STEP A: Repository Input
  Repo URL input
  Branch selector (defaults to main, shows all branches once GitHub App connected)
  Private repo → GitHub App auth inline

STEP B: Configuration
  Environment name (production / staging / development / preview-[branch])
  Size (Small / Medium / Large) with cost estimates
  Region (pre-filled from org default)
  Environment variables section (expandable)
  
  Advanced section (collapsed by default):
    Custom domain (optional)
    Database (Supabase-managed or provision RDS): toggle
    Redis cache: toggle
    Enable autoscaling: toggle (min/max replicas)

STEP C: Review & Deploy
  Summary card of all selections
  Cost estimate
  "What AutoStack will create" list (VPC, EKS, ALB, ECR...)
  [Deploy Now] large green button

STEP D: Live Progress
  Real-time stage progress (same as onboarding step 2 progress view)
  Stage 1: Analyzing → Stage 2: Planning → Stage 3: Provisioning → Stage 4: Deploying

STEP E: Done
  Same as onboarding step 3 but as a modal
  URL, infrastructure summary, cost
  [Open Deployment →] button (goes to deployment detail page)
  [Deploy Another] (resets modal to step A)
```

---

# PART 4 — BACKEND: COMPLETE SPECIFICATION

## 4.1 — New Edge Functions

### `aws-assume-role/index.ts` (NEW)

```typescript
// PURPOSE: Validate an IAM role ARN by attempting to assume it and
//          verifying the resulting session has all required permissions.
// CALLED BY: Onboarding Step 1, Settings cloud credentials validation

// REQUIRED IAM PERMISSIONS AutoStack needs:
const REQUIRED_PERMISSIONS = [
  "eks:CreateCluster",        "eks:DescribeCluster",       "eks:DeleteCluster",
  "eks:CreateNodegroup",      "eks:DescribeNodegroup",     "eks:DeleteNodegroup",
  "eks:UpdateNodegroupConfig","eks:CreateAddon",           "eks:DescribeAddon",
  "ec2:CreateVpc",            "ec2:DescribeVpcs",          "ec2:DeleteVpc",
  "ec2:CreateSubnet",         "ec2:DescribeSubnets",       "ec2:DeleteSubnet",
  "ec2:CreateInternetGateway","ec2:AttachInternetGateway",
  "ec2:AllocateAddress",      "ec2:CreateNatGateway",
  "ec2:CreateRouteTable",     "ec2:CreateRoute",
  "ec2:CreateSecurityGroup",  "ec2:AuthorizeSecurityGroupIngress",
  "ecr:CreateRepository",     "ecr:GetAuthorizationToken",
  "ecr:BatchCheckLayerAvailability","ecr:PutImage",
  "elasticloadbalancing:CreateLoadBalancer",
  "elasticloadbalancing:CreateTargetGroup",
  "iam:CreateRole",           "iam:AttachRolePolicy",      "iam:PassRole",
  "route53:ChangeResourceRecordSets",
  "acm:RequestCertificate",   "acm:DescribeCertificate",
  "sts:AssumeRole"
]

// REQUEST: POST { account_id, region, role_arn }
// RESPONSE:
//   200: { success: true, verified_at, account_id, region, permissions_ok: true }
//   400: { success: false, error: "INVALID_ARN", missing_permissions: [...] }
//   403: { success: false, error: "CANNOT_ASSUME_ROLE", detail: "..." }

// IMPLEMENTATION NOTES:
// 1. OPTIONS handler first (CORS)
// 2. Auth check (valid JWT required)
// 3. Parse + validate ARN format: arn:aws:iam::[12 digits]:role/[name]
// 4. Call AWS STS AssumeRole with ExternalId = org_id (prevents confused deputy attack)
// 5. With resulting credentials, call IAM SimulatePrincipalPolicy
// 6. Check all REQUIRED_PERMISSIONS are allowed
// 7. Save to cloud_credentials table with status = 'verified'
// 8. Return result
```

### `die-analyze/index.ts` (NEW — The Core Engine)

```typescript
// PURPOSE: The entire deployment pipeline from GitHub URL to live URL.
//          This is the most complex and important Edge Function.
// CALLED BY: Frontend Deploy flow, after user confirms infrastructure plan
// LONG-RUNNING: Uses Supabase Realtime to broadcast stage updates as they happen

// INPUT: POST { 
//   project_id,        // UUID of project record already created
//   repo_url,          // full GitHub URL
//   branch,            // default "main"
//   environment,       // "production" | "staging" | "development"
//   size,              // "small" | "medium" | "large"
//   region,            // AWS region string
//   env_vars,          // array of { key, value } for environment variables
//   cloud_credential_id // UUID from cloud_credentials table
// }

// STAGE DEFINITIONS (broadcast each via Supabase Realtime):
// Event: UPDATE on projects table (analysis_status field + stage_name field)
// Frontend subscribes to this update and shows progress

// STAGE 1: REPO ANALYSIS
// Shallow clone the repo (depth=1, latest commit only)
// Run language detection:
//   - Look for: package.json (Node.js), requirements.txt/pyproject.toml (Python),
//     go.mod (Go), pom.xml/build.gradle (Java), Gemfile (Ruby), composer.json (PHP),
//     Cargo.toml (Rust), mix.exs (Elixir)
// Detect framework from dependencies:
//   - Node: next.js, express, fastify, nest.js, remix
//   - Python: django, flask, fastapi, uvicorn
//   - Go: gin, echo, fiber
// Detect port: look for PORT env var usage, EXPOSE in existing Dockerfile,
//              common defaults per framework (Next.js=3000, Django=8000, etc.)
// Detect if Dockerfile already exists (use it), else generate one
// Run secret scanner (look for .env files, hardcoded keys matching: sk-*, eyJ*, re_*, etc.)
// If secrets found: FAIL with helpful message listing files + lines

// DOCKERFILE GENERATION (if none exists):
// Use optimized multi-stage builds per language:
// 
// Node.js example:
// FROM node:20-alpine AS deps
// WORKDIR /app
// COPY package*.json ./
// RUN npm ci --only=production
// 
// FROM node:20-alpine AS builder
// WORKDIR /app
// COPY --from=deps /app/node_modules ./node_modules
// COPY . .
// RUN npm run build
// 
// FROM node:20-alpine AS runner
// WORKDIR /app
// ENV NODE_ENV production
// COPY --from=builder /app/dist ./dist
// COPY --from=builder /app/node_modules ./node_modules
// EXPOSE [detected_port]
// CMD ["node", "dist/index.js"]   ← (adjusted per detected entry point)

// STAGE 2: INFRASTRUCTURE PLANNING
// Based on size selection:
// SMALL:  node_instance="t3.medium",  node_count=2, cpu_request="250m",  memory_request="256Mi"
// MEDIUM: node_instance="t3.large",   node_count=3, cpu_request="500m",  memory_request="512Mi"
// LARGE:  node_instance="m5.xlarge",  node_count=5, cpu_request="1000m", memory_request="1Gi"
//
// Calculate estimated cost (use AWS pricing API or hardcoded current prices):
// EKS control plane: $73/mo (flat)
// Node cost: instanceHourlyPrice * 24 * 30 * nodeCount
// ALB: $22.27/mo (base) + data processing
// NAT Gateway: $35/mo
// ECR: $0.10/GB/mo (estimate 1GB = $0.10/mo)
// Total: sum
//
// Broadcast InfrastructurePlan to frontend via Realtime (updates projects table)
// Frontend shows cost preview modal, waits for user confirmation

// STAGE 3: INFRASTRUCTURE PROVISIONING
// Get AWS credentials by assuming the user's IAM role (from cloud_credentials)
// Use ExternalId = org_id for cross-account role assumption (security)
//
// Provisioning order (dependencies matter — create in this order):
// 1. VPC (CIDR: 10.0.0.0/16)
// 2. Subnets (2 public + 2 private, across 2 AZs)
// 3. Internet Gateway + attachment
// 4. Elastic IPs (2) + NAT Gateways (1 per AZ for HA, or 1 for cost in dev)
// 5. Route tables (public → IGW, private → NGW)
// 6. Security Groups (cluster SG, node SG, ALB SG with least-privilege)
// 7. IAM roles (EKS cluster role, node instance role, pod execution role)
// 8. EKS Cluster (takes 10-15 min — this is the long step)
//    Poll every 30s for CREATING → ACTIVE status
//    Broadcast progress updates to frontend
// 9. EKS Node Group (takes 3-5 min)
// 10. Configure kubeconfig (generate admin kubeconfig for cluster access)
// 11. Install EKS addons: vpc-cni, coredns, kube-proxy, aws-load-balancer-controller
// 12. ECR Repository
// 13. ACM Certificate (if custom domain provided)
// 14. Route53 record (if domain provided)
//
// Update projects table with: cluster_arn, vpc_id, provisioning_status
// Broadcast stage updates via Realtime

// STAGE 4: BUILD + DEPLOY
// 1. Build Docker image:
//    - Clone repo again (fresh, full clone)
//    - Run: docker build -t [ecr_repo_url]:latest .
//    - Note: in Deno/Edge Function context, use AWS CodeBuild job instead of local docker
//    - Create CodeBuild project → start build → poll until SUCCEEDED/FAILED
//    - Image gets pushed directly to ECR by CodeBuild
// 2. Generate Kubernetes manifests:
//    - deployment.yaml: correct image tag, resource requests/limits, env vars from env_vars input
//    - service.yaml: ClusterIP type, correct port
//    - ingress.yaml: AWS ALB ingress, SSL, host (subdomain.autostack.app or custom domain)
//    - hpa.yaml: minReplicas=2, maxReplicas=10, targetCPUUtilizationPercentage=70
//    - pdb.yaml: minAvailable=1 (keeps 1 pod up during rolling updates)
// 3. Create /deploy/[environment]/ folder in user's repo, commit all manifests
//    (Use GitHub API with the GitHub App installation token)
//    Commit message: "chore(autostack): deploy [environment] infrastructure"
// 4. Install ArgoCD into the cluster (argocd namespace)
// 5. Create ArgoCD Application pointing to /deploy/[environment]/ in user's repo
// 6. ArgoCD syncs and deploys
// 7. Poll deployment rollout: wait for all pods Running + Ready
// 8. Verify ALB health: HTTP GET to the live URL, expect 200
// 9. Update projects table: status='live', live_url, argocd_app_name
// 10. Trigger first COIE cycle for this environment
// 11. Register for AIRE monitoring

// ERROR HANDLING (absolutely critical — infra provisioning has many failure modes):
// Every AWS API call must be in try/catch
// On failure: broadcast error to frontend via Realtime
// Partially provisioned infra: tag all created resources with autostack:project_id = [id]
//   This allows cleanup — if Stage 3 fails at step 8, we can delete everything tagged
// Store rollback_data in projects table: list of all created AWS resource IDs
//   This enables "Delete Environment" to clean up ALL created resources
```

### `infra-teardown/index.ts` (NEW)

```typescript
// PURPOSE: Delete ALL AWS resources created for a deployment/environment
// CALLED BY: "Delete Environment" in Settings or DeploymentsTab
// CRITICAL: User owns the infra — we must be able to clean it up completely

// TEARDOWN ORDER (reverse of creation):
// 1. Delete ArgoCD Application (remove K8s workload)
// 2. Delete EKS Node Group (drains nodes first)
// 3. Delete EKS Cluster
// 4. Delete ALB (must be done before VPC)
// 5. Delete NAT Gateways + release Elastic IPs
// 6. Delete subnets, route tables, Internet Gateway
// 7. Delete Security Groups
// 8. Delete IAM roles and policies (AutoStack-created ones only)
// 9. Delete ECR Repository (with all images)
// 10. Delete Route53 records (if any)
// 11. Delete ACM certificate (if any)
// 12. Delete VPC
// 13. Delete CodeBuild projects
//
// Each step: tag-based lookup (find all resources tagged autostack:project_id = [id])
// Ensures cleanup even if project_id was passed but some resources have different names
// Return: { deleted_resources: [...], failed: [...] }
// Update projects table: status = 'deleted'
```

### `deploy-redeploy/index.ts` (NEW)

```typescript
// PURPOSE: Trigger a new deployment on an existing environment
//          Called when user pushes new code or clicks "Redeploy" button
// CALLED BY: Frontend Redeploy button, GitHub push webhook

// FLOW (faster than initial deploy — infra already exists):
// 1. Clone latest commit from repo
// 2. Build new Docker image → push to ECR with new tag (commit SHA)
// 3. Update Kubernetes Deployment image tag in /deploy/[environment]/deployment.yaml
// 4. Commit the change to user's repo
// 5. ArgoCD detects commit → syncs → rolling update begins
// 6. Monitor rollout: old pods drain, new pods come up
// 7. On success: update deployments table
// 8. On failure: auto-rollback (update image tag back to previous commit SHA)

// TIME: ~2-3 minutes (no infra provisioning needed)
```

---

## 4.2 — Modified Edge Functions

### `coie-cycle/index.ts` — ADD Cost Analysis

```typescript
// ADD to existing COIE implementation:

// COST ANALYSIS MODULE (runs after existing 4D scoring):
async function runCostAnalysis(supabase, cluster_id) {
  const metrics = await getAggregatedMetrics(supabase, cluster_id, '7d')
  const findings = []
  
  // Check 1: CPU overprovisioned
  for (const pod of metrics.pods) {
    const cpuUtilization = pod.cpu_used_millicores / pod.cpu_limit_millicores
    if (cpuUtilization < 0.30) {  // using less than 30% of what's allocated
      const overageMillicores = pod.cpu_limit_millicores - (pod.cpu_used_millicores * 1.3)
      const savingPerMonth = (overageMillicores / 1000) * 0.048 * 24 * 30  // t3.medium CPU cost/core/hr
      findings.push({
        dimension: 'cost',
        severity: cpuUtilization < 0.15 ? 'high' : 'medium',
        check_name: 'CPU_OVERPROVISIONED',
        title: `${pod.name}: CPU allocation 70%+ idle`,
        affected_resource: `pod/${pod.name}`,
        namespace: pod.namespace,
        remediation: `Reduce CPU limit from ${pod.cpu_limit_millicores}m to ${Math.ceil(pod.cpu_used_millicores * 1.3)}m`,
        projected_saving: savingPerMonth
      })
    }
  }
  
  // Check 2: Memory overprovisioned
  for (const pod of metrics.pods) {
    const memUtilization = pod.memory_used_bytes / pod.memory_limit_bytes
    if (memUtilization < 0.40) {
      const savingMB = (pod.memory_limit_bytes - pod.memory_used_bytes * 1.5) / 1024 / 1024
      const savingPerMonth = (savingMB / 1024) * 0.006 * 24 * 30  // GB-hour pricing
      findings.push({ /* ... */ projected_saving: savingPerMonth })
    }
  }
  
  // Check 3: Idle staging/dev environments (usage < 10% between midnight and 8am)
  // Check 4: Single-node clusters (should have 2+ for HA)
  // Check 5: t3.medium candidates that could go to t3.small
  // Check 6: Orphaned ECR images (>30 days old, not deployed)
  
  // Aggregate total potential savings
  const totalSavings = findings.reduce((sum, f) => sum + (f.projected_saving || 0), 0)
  
  // Update project: estimated_monthly_cost, potential_savings
  await supabase.from('projects')
    .update({ potential_savings: totalSavings })
    .eq('cluster_id', cluster_id)
  
  return findings
}
```

### `aire-detect/index.ts` — ADD Auto-Remediation

```typescript
// ADD to existing AIRE implementation:

// REMEDIATION ACTIONS per pattern:
const REMEDIATION_ACTIONS = {
  OOM_KILL: {
    auto: true,  // apply automatically if playbook enabled
    action: async (incident, supabase, awsCreds) => {
      // Increase memory limit by 25%
      const currentLimit = await getMemoryLimit(incident.affected_resource)
      const newLimit = Math.ceil(currentLimit * 1.25)
      
      // Immediate: patch the K8s resource via kubectl
      await patchK8sDeployment(incident, { memory_limit: newLimit })
      
      // Permanent: open PR to update deployment.yaml
      await openFixPR(incident, {
        file: 'deploy/production/deployment.yaml',
        change: `memory: "${newLimit}Mi"`,
        title: `fix: increase memory limit for ${incident.affected_resource}`,
        body: `AIRE detected OOMKill event. Increasing memory limit from ${currentLimit}Mi 
               to ${newLimit}Mi based on peak usage analysis.
               
               **Root cause:** ${incident.root_cause}
               **Evidence:** Pod killed with exit code 137 (OOMKilled) at ${incident.detected_at}`
      })
    }
  },
  
  CRASH_LOOP: {
    auto: false,  // requires user approval (could be app bug)
    action: async (incident, supabase, awsCreds) => {
      // Recommend rollback to last healthy deployment
      const lastHealthy = await getLastHealthyDeployment(incident)
      await supabase.from('incidents').update({
        immediate_action: `Rollback to deployment ${lastHealthy.commit_sha} (deployed ${lastHealthy.completed_at})`,
        permanent_fix: 'Fix the application crash. See logs for the exact error.',
        remediation_applied: null  // user must click approve
      }).eq('id', incident.id)
    }
  },
  
  // ... 8 more patterns
}

// In the main AIRE handler, after diagnosis:
if (matchedPattern && REMEDIATION_ACTIONS[matchedPattern]) {
  const action = REMEDIATION_ACTIONS[matchedPattern]
  
  // Check if playbook is enabled for this cluster
  const playbook = await getPlaybookForPattern(supabase, matchedPattern, cluster_id)
  
  if (playbook?.enabled && action.auto) {
    // Auto-remediate
    const awsCreds = await getAWSCreds(supabase, cluster_id)
    await action.action(incident, supabase, awsCreds)
    await supabase.from('incidents').update({
      remediation_applied: `Auto-remediated: ${REMEDIATION_ACTIONS[matchedPattern].description}`,
      status: 'resolved'
    }).eq('id', incident.id)
  }
}
```

---

# PART 5 — DATABASE SCHEMA CHANGES

## 5.1 — Tables to ADD

```sql
-- ==============================================================
-- CLOUD CREDENTIALS (per-org, stores IAM role ARN)
-- ==============================================================
CREATE TABLE IF NOT EXISTS cloud_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'aws',  -- aws | gcp | azure
  account_id        TEXT NOT NULL,                -- AWS account ID
  region            TEXT NOT NULL,
  role_arn          TEXT NOT NULL,                -- The IAM role AutoStack assumes
  external_id       TEXT,                         -- = org_id (prevents confused deputy)
  status            TEXT DEFAULT 'pending',       -- pending | verified | error
  last_verified_at  TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cloud_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cloud_creds_org_isolation" ON cloud_credentials
  USING (org_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid);
CREATE INDEX idx_cloud_credentials_org ON cloud_credentials(org_id);

-- ==============================================================
-- MODIFY: projects table — ADD new columns
-- ==============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS live_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cloud_credential_id UUID REFERENCES cloud_credentials(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cluster_arn TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS vpc_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ecr_repo_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS alb_dns_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_monthly_cost DECIMAL(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS potential_savings DECIMAL(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'pending';
  -- Values: pending | analyzing | planning | provisioning | building | deploying | live | failed | deleted
ALTER TABLE projects ADD COLUMN IF NOT EXISTS die_stage TEXT;
  -- Current active DIE stage name (for real-time progress display)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS die_stage_index INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS die_total_stages INTEGER DEFAULT 5;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rollback_data JSONB DEFAULT '{}';
  -- { vpc_id, cluster_arn, ecr_arn, alb_arn, ... all created resource ARNs for teardown }
ALTER TABLE projects ADD COLUMN IF NOT EXISTS detected_language TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS detected_framework TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS detected_port INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS dockerfile_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS infra_plan JSONB DEFAULT '{}';
  -- The InfrastructurePlan computed in Stage 2 (node type, count, cost estimate, resource list)

-- ==============================================================
-- MODIFY: deployments table — ADD live URL and rollback target
-- ==============================================================
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS live_url TEXT;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS image_sha TEXT;  -- Docker image SHA256
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS previous_image_sha TEXT;  -- For rollback

-- ==============================================================
-- INFRASTRUCTURE EVENTS (time-series log of AWS provisioning events)
-- ==============================================================
CREATE TABLE IF NOT EXISTS infrastructure_events (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- started | completed | failed | progress
  message     TEXT,
  resource_id TEXT,  -- AWS resource ID if applicable
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_infra_events_project_time ON infrastructure_events(project_id, created_at DESC);
ALTER TABLE infrastructure_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "infra_events_org" ON infrastructure_events
  USING (project_id IN (
    SELECT id FROM projects WHERE org_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid
  ));
```

---

## 5.2 — Modify Existing Functions

### `auth-hook/index.ts` — ADD CORS + GitHub OAuth handling

```typescript
// CRITICAL FIX 1: Add OPTIONS handler at the very top
if (req.method === 'OPTIONS') {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    }
  })
}

// CRITICAL FIX 2: Handle both email signup AND GitHub OAuth
// Both fire the same hook but have different user.app_metadata.provider values
// The org creation logic should be IDENTICAL regardless of provider
// The only difference: GitHub users have user.user_metadata.full_name + user.user_metadata.avatar_url

// CRITICAL FIX 3: updateUserById MUST be called with org_id
// This is the lynchpin of the entire RLS system
await supabase.auth.admin.updateUserById(user.id, {
  user_metadata: {
    org_id: org.id,
    org_slug: org.slug,
    role: 'owner',
    full_name: user.user_metadata?.full_name || user.email.split('@')[0]
  }
})

// CRITICAL FIX 4: Try/catch with non-200 return on failure
// If this fails, Supabase Auth Hook will see the error and can be debugged
// DO NOT return 200 on failure
try {
  // ... org creation logic
  return new Response(JSON.stringify({ success: true }), { status: 200 })
} catch (error) {
  console.error('auth-hook failed:', error)
  // This causes the signup to fail with a clear error (better than silent failure)
  return new Response(JSON.stringify({ error: error.message }), { status: 500 })
}
```

### ALL Edge Functions — Add CORS Handler

Every single Edge Function must have this at the very top (before any logic):

```typescript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Hub-Signature-256',
}

Deno.serve(async (req) => {
  // CORS preflight — MUST be the first thing
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }
  
  // ... rest of function logic
  // All responses must include: headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
})
```

### `github-webhook/index.ts` — ADD HMAC Verification

```typescript
// ADD: verify X-Hub-Signature-256 before processing any payload

async function verifyGitHubSignature(req: Request, body: string): Promise<boolean> {
  const signature = req.headers.get('X-Hub-Signature-256')
  if (!signature) return false
  
  const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET')!
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = 'sha256=' + Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  
  // Constant-time comparison (prevents timing attacks)
  if (signature.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

// In main handler, BEFORE processing:
const bodyText = await req.text()
const isValid = await verifyGitHubSignature(req, bodyText)
if (!isValid) {
  return new Response(JSON.stringify({ error: 'Invalid signature' }), {
    status: 401,
    headers: CORS_HEADERS
  })
}
const body = JSON.parse(bodyText)
```

---

# PART 6 — DATA HOOKS: FRONTEND CHANGES

## 6.1 — New Hooks to Create

```javascript
// src/hooks/useDeployments.js
// Replaces useProjects in DeploymentsTab
// Returns: projects joined with latest deployment status + live_url + estimated_cost
export function useDeployments(clusterId) {
  const [deployments, setDeployments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    // Initial fetch
    supabase
      .from('projects')
      .select(`
        *,
        deployments(
          id, status, live_url, commit_sha, started_at, completed_at,
          image_tag
          ORDER BY started_at DESC LIMIT 1
        )
      `)
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setError(error)
        else setDeployments(data || [])
        setLoading(false)
      })
    
    // Realtime: watch for project status changes (most important for DIE pipeline progress)
    const channel = supabase
      .channel(`deployments:${clusterId}`)
      .on('postgres_changes', {
        event: '*',  // INSERT and UPDATE
        schema: 'public',
        table: 'projects',
        filter: `cluster_id=eq.${clusterId}`
      }, (payload) => {
        setDeployments(prev => {
          const idx = prev.findIndex(d => d.id === payload.new.id)
          if (idx === -1) return [payload.new, ...prev]
          const updated = [...prev]
          updated[idx] = { ...updated[idx], ...payload.new }
          return updated
        })
      })
      .subscribe()
    
    return () => supabase.removeChannel(channel)  // ← ALWAYS cleanup
  }, [clusterId])
  
  return { deployments, loading, error }
}

// src/hooks/useDeployProgress.js
// For the live deploy progress modal/onboarding step
// Subscribes to infrastructure_events for a project
export function useDeployProgress(projectId) {
  const [events, setEvents] = useState([])
  const [stage, setStage] = useState(null)
  const [status, setStatus] = useState('pending')
  
  useEffect(() => {
    if (!projectId) return
    
    const channel = supabase
      .channel(`deploy:${projectId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'infrastructure_events',
        filter: `project_id=eq.${projectId}`
      }, (payload) => {
        setEvents(prev => [...prev, payload.new])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'projects',
        filter: `id=eq.${projectId}`
      }, (payload) => {
        setStage(payload.new.die_stage)
        setStatus(payload.new.provisioning_status)
      })
      .subscribe()
    
    return () => supabase.removeChannel(channel)
  }, [projectId])
  
  return { events, stage, status }
}

// src/hooks/useCostAnalysis.js
// For the Cost tab
export function useCostAnalysis(clusterId) {
  // Fetches findings WHERE dimension = 'cost'
  // Aggregates projected_saving for total
  // Returns: { findings, totalSavings, loading, error }
}

// src/hooks/useCloudCredentials.js
// For Settings and Deploy flow
export function useCloudCredentials() {
  // Fetches cloud_credentials for org
  // Returns: { credentials, loading, error, verifyCredential, addCredential }
}
```

---

# PART 7 — NON-NEGOTIABLE RULES (FULL LIST)

All rules from `File2_NextPlan_v2.md` Part 1 carry forward completely unchanged.
In addition, these new rules apply:

```
R1 — NEVER provision AWS infrastructure without first verifying IAM role permissions
     (call aws-assume-role first, check all REQUIRED_PERMISSIONS, only then provision)

R2 — NEVER start Stage 3 (provisioning) without showing the user the cost estimate
     and receiving explicit confirmation. If the user doesn't click "Confirm", do nothing.

R3 — NEVER provision infrastructure without tagging EVERY resource with:
     autostack:org_id = [org_id]
     autostack:project_id = [project_id]
     autostack:environment = [environment]
     autostack:managed = "true"
     Without tags, infra-teardown cannot reliably clean up.

R4 — NEVER fail mid-provisioning without broadcasting the error via Supabase Realtime
     so the user sees exactly what failed. "Something went wrong" is not acceptable.
     The error message must include: which AWS service failed, what error code, what to check.

R5 — NEVER delete cloud credentials without first checking if any active projects
     are using that credential. Block the deletion with a clear error listing those projects.

R6 — NEVER store AWS access keys or secret keys in the database.
     AutoStack uses assumed roles only. The temporary credentials from STS are held
     in memory during the Edge Function execution and discarded after.

R7 — Every cost estimate shown to the user must include a clear disclaimer:
     "Estimated cost. Your actual AWS bill may differ based on traffic and usage."

R8 — The InfrastructurePlan object must be stored in projects.infra_plan BEFORE
     provisioning starts. If provisioning fails, we know what was planned.
     If the user refreshes mid-deploy, they see the plan, not a blank state.

R9 — ALWAYS show the user their rollback options:
     For running deployments: [Rollback to previous] button is ALWAYS visible.
     Never let the user be stuck with a broken deployment and no escape.

R10 — The DIE engine must be idempotent.
      If called twice for the same project in the same state, it must detect this
      and not create duplicate infrastructure. Check: does a VPC with this project_id tag
      already exist? If yes, skip VPC creation and continue.
```

---

# PART 8 — IMPLEMENTATION ORDER (PHASES)

Work through these phases in exact order. Do not mix.

```
PHASE 1 — CRITICAL FIXES (1–2 hours)
  Do these BEFORE anything else. Without these, nothing works from the browser.

  Fix 1.1: Add OPTIONS handler to ALL edge functions (auth-hook, connect-cluster,
           coie-cycle, aire-detect, agent-heartbeat, agent-metrics, github-webhook,
           invite-member, send-notification)
           Estimated: 30 min

  Fix 1.2: Verify auth-hook sets user_metadata.org_id — test with real signup.
           Check Supabase Dashboard → Authentication → Hooks — confirm auth-hook is registered.
           If not registered: register it as an Auth Hook on auth.users INSERT.
           Estimated: 30 min

  Fix 1.3: Add HMAC verification to github-webhook.
           Estimated: 15 min

  Fix 1.4: Fix the 4 backend wiring gaps from DIAGNOSTIC_REPORT.md:
           - SettingsTab team members from org_members table
           - Sentry setUser() after login
           - PostHog identify() after login + add 5 track() calls
           - Remove console.log from email.js
           Estimated: 45 min

  VERIFY Phase 1:
    - Open DevTools Network tab → login → no CORS errors
    - Sign up with new email → check Supabase → user has org_id in user_metadata
    - Send fake GitHub webhook without signature → confirm 401 response
    - PostHog dashboard → see "signup" event tracked

PHASE 2 — DATABASE + AUTH PIVOT (2–3 hours)
  
  Fix 2.1: Add new migration file: 002_pivot_schema.sql
    - Add cloud_credentials table
    - Add new columns to projects table
    - Add infrastructure_events table
    - Update RLS policies
    Estimated: 1 hour

  Fix 2.2: Add aws-assume-role edge function
    Estimated: 1 hour
  
  VERIFY Phase 2:
    - Run migration → confirm new tables exist
    - POST to aws-assume-role with valid IAM role → confirm 200 + verified_at
    - POST with invalid ARN → confirm 403 with clear error message

PHASE 3 — ONBOARDING PIVOT (3–4 hours)

  Build 3.1: Rebuild OnboardingPage.jsx (3 new steps as specified in Part 3.2)
    - Step 1: Cloud connection form + IAM verification
    - Step 2: Deploy form + real-time progress with Supabase Realtime
    - Step 3: Live! with confetti + summary
    Estimated: 3 hours
  
  Fix 3.2: AuthGuard — add cluster check → redirect to onboarding if no environments
    Estimated: 30 min

  VERIFY Phase 3:
    - New user → onboarding loads
    - Enter valid IAM role → verified successfully
    - Mock deployment shows progress (fake Realtime events via Supabase SQL)
    - Step 3 shows confetti + summary

PHASE 4 — DASHBOARD PIVOT (4–5 hours)

  Build 4.1: Rename ProjectsTab → DeploymentsTab (or create new file)
    - New table layout (with live_url, status, cost columns)
    - New empty state ("Deploy your first app →")
    - DeployModal component
    Estimated: 2 hours
  
  Build 4.2: New CostTab.jsx
    - Cost summary header
    - Bar chart by environment
    - Savings opportunities table
    - Cost history line chart
    Estimated: 2 hours

  Build 4.3: Update sidebar labels (Clusters → Environments, etc.)
    Update activity feed event labels
    Estimated: 30 min

  VERIFY Phase 4:
    - DeploymentsTab shows empty state correctly
    - DeployModal opens and has all steps
    - CostTab renders with mock data
    - Sidebar shows updated labels

PHASE 5 — DIE ENGINE (6–8 hours — the hardest phase)

  Build 5.1: die-analyze edge function (Stages 1 + 2 only first)
    Stage 1: Repo analysis (clone, language detect, Dockerfile gen)
    Stage 2: Infrastructure planning (calculate cost estimate)
    Broadcast via Supabase Realtime to frontend
    Estimated: 3 hours

  Build 5.2: die-analyze edge function (Stage 3 — Infrastructure provisioning)
    AWS SDK VPC/EKS/ECR creation
    Full tagging discipline
    Error broadcast on failure
    Estimated: 3 hours

  Build 5.3: die-analyze edge function (Stage 4 — Build + Deploy)
    CodeBuild integration
    K8s manifest generation
    ArgoCD install + app creation
    Rollout monitoring
    Estimated: 3 hours

  Build 5.4: deploy-redeploy edge function
    Estimated: 1 hour

  Build 5.5: infra-teardown edge function
    Estimated: 2 hours

  VERIFY Phase 5:
    - Full deploy flow with a real public Node.js repo (use a simple Express hello-world)
    - Confirm all 5 stages complete
    - Confirm live URL returns 200
    - Confirm all AWS resources are tagged
    - Confirm teardown deletes all created resources (no orphans)

PHASE 6 — COIE + AIRE UPGRADES (3–4 hours)

  Build 6.1: Add cost analysis module to coie-cycle
    Estimated: 2 hours

  Build 6.2: Add auto-remediation to aire-detect (OOM and CrashLoop patterns first)
    Estimated: 2 hours

  Build 6.3: Wire send-notification (from PROGRESS.md Phase 3)
    Estimated: 2 hours

  VERIFY Phase 6:
    - Manually trigger a COIE cycle → cost findings appear in CostTab
    - Simulate OOM event in DB → AIRE diagnoses + fixes it
    - Confirm notification email received

PHASE 7 — PRODUCTION HARDENING

  7.1: GitHub App integration (install on org → private repos work)
  7.2: pg_cron configuration for automatic COIE cycles
  7.3: Custom domain flow (Route53 + ACM)
  7.4: ui/index.jsx split into individual files (performance)
  7.5: Landing page text updates (all strings from Part 3.1)
  7.6: Sentry ErrorBoundary audit + sentryVitePlugin
  7.7: PostHog session recording + funnel setup
  7.8: Full end-to-end test: signup → connect AWS → deploy → COIE → AIRE → teardown
```

---

# PART 9 — PRODUCT IDENTITY: STRINGS AND MESSAGING

## Every piece of copy in the app must use this language

```
PRODUCT NAME: AutoStack
TAGLINE: "Deploy to your cloud. Not ours."
SECONDARY: "Production Kubernetes. Zero YAML. 8 minutes."

KEY DIFFERENTIATOR PHRASES (use these, not variations):
  "Your AWS account" (not "a cloud account", not "the cloud")
  "You own the infrastructure" (not "we manage" or "we host")
  "Zero YAML, ever" (not "no configuration needed" — YAML specifically)
  "8 minutes to production" (not "quick" or "fast" — be specific)
  "Pay AWS directly" (emphasize no markup, no AutoStack compute charges)

CONCEPTS TO AVOID IN COPY:
  ❌ "Connect your cluster" (user doesn't HAVE a cluster, we create it)
  ❌ "Import your infrastructure" (we build it from scratch)
  ❌ "Monitoring platform" (we're a deployment platform)
  ❌ "Day 2 operations" (too jargony, users don't know this phrase)
  ❌ "Cluster health score" in hero position (secondary, not lead value prop)

CONCEPTS TO EMPHASIZE:
  ✅ Speed (8 minutes)
  ✅ Ownership (your cloud, your data)
  ✅ Simplicity (paste URL → click deploy)
  ✅ Cost savings (AI optimizer finds $X/month)
  ✅ Self-healing (AIRE keeps it running)
  ✅ Enterprise-ready (compliance, VPC, IAM, SOC2-ready)
```

---

# PART 10 — WHAT NOT TO DO (ANTI-PATTERNS)

```
❌ DO NOT make the "Connect your cluster" flow prominent anymore.
   Users who already have K8s clusters can still connect them (keep the existing flow
   buried in Settings > Environments > "Import existing cluster") but this is NOT
   the primary use case and should NOT be on the home page or onboarding.

❌ DO NOT let the DIE engine fail silently.
   Every provisioning failure must broadcast the exact error via Realtime.
   Users must never stare at a spinner that will never complete.

❌ DO NOT try to run Docker builds inside a Deno Edge Function.
   Use AWS CodeBuild. The Edge Function creates the CodeBuild project and job,
   then polls its status. The actual build runs in AWS's managed compute.

❌ DO NOT store temporary AWS credentials.
   Assume role → use credentials in memory during the edge function invocation →
   let them expire. Never INSERT AWS access keys into any database table.

❌ DO NOT call LLM APIs (OpenAI, etc.) in real time during the user's deploy flow.
   This adds cost, latency, and failure modes. AIRE pattern matching works with
   keyword + semantic matching against the pre-seeded incident_patterns table.
   LLM integration is Phase 8+ and should be cached heavily.

❌ DO NOT bill users per deployment or per API call.
   Pricing is flat monthly per environment (see Part 3.1 Pricing Section).
   Complexity in usage-based billing kills conversion. Keep it simple.

❌ DO NOT show the ArgoCD URL or the internal K8s cluster URL to users.
   They see the live URL (via ALB). Technical details are in the Infrastructure tab,
   not the primary deployment view.

❌ DO NOT skip the cost estimate modal before provisioning.
   Users must see the estimated AWS bill before resources are created.
   A surprise $200 AWS bill will cause immediate churn and chargebacks.
```

---

# PART 11 — SUCCESS CRITERIA

This project is done when ALL of the following are true:

```
PRODUCT:
  ✅ A new user can sign up, connect AWS, deploy a public GitHub repo to EKS,
     and have a live URL in under 12 minutes — with NO documentation needed.
  ✅ COIE identifies at least 1 cost-saving opportunity after first deployment
  ✅ AIRE detects a manually-triggered pod crash and shows root cause within 60 seconds
  ✅ "Delete Environment" removes ALL created AWS resources with zero orphans

TECHNICAL:
  ✅ No CORS errors in browser DevTools on any API call
  ✅ All 9 edge functions have OPTIONS handlers
  ✅ auth-hook sets org_id in user_metadata — verified via real signup test
  ✅ GitHub webhook rejects unsigned payloads with 401
  ✅ All AWS resources tagged with autostack: prefix
  ✅ No SERVICE_ROLE_KEY anywhere in /src/
  ✅ No hardcoded credentials anywhere
  ✅ Every realtime subscription cleans up on component unmount
  ✅ Every DB query has .limit()
  ✅ Every Redis set has TTL

PRODUCT IDENTITY:
  ✅ Landing page says "Your cloud. Not ours." (or equivalent)
  ✅ Onboarding leads with cloud credential connection, not "install agent" YAML
  ✅ Dashboard tabs use "Deployments" not "Projects" and "Environments" not "Clusters"
  ✅ Cost tab exists and shows real COIE cost findings
  ✅ Deploy flow shows cost estimate BEFORE provisioning (non-negotiable)
```

---

# APPENDIX — COMPETITIVE CONTEXT (USE FOR POSITIONING)

## Why AutoStack wins over each competitor

```
vs. RAILWAY / RENDER:
  They run on their infra. Enterprise cannot use them.
  "$500k ARR → moving to Railway" → then enterprise compliance audit → scramble to migrate.
  AutoStack: deploy to your own AWS from day 1. No migration ever needed.
  Price: at $500/mo of workloads, Railway costs $800-1200/mo. AutoStack: $200/mo + $500 AWS.
  You save 30-50% at scale AND own the infra. No-brainer.

vs. TOYSTACK:
  Toystack is Railway for India. Their Kubernetes, their data center.
  Still can't pass enterprise compliance.
  AutoStack is the enterprise upgrade: same simplicity, YOUR cloud.
  Toystack's $325K pre-seed funding vs. AutoStack's direct enterprise value proposition.

vs. TERRAFORM + DevOps ENGINEER:
  A mid-level DevOps engineer costs $8,000-15,000/month (India) or $15,000-25,000/month (US).
  AutoStack Pro: $199/month. That's 40-60x cheaper for the same infrastructure.
  And AutoStack never misses a security patch, never forgets to check resource limits,
  never takes sick days.

vs. AWS COPILOT / EKS ANYWHERE / AWS CDK:
  These are developer tools, not products. They require learning, setup, maintenance.
  AutoStack is a product: paste URL, get app. No AWS expertise required.
  AWS Copilot still requires understanding of CloudFormation and ECS. Not zero-YAML.

vs. HELM + ARGOCD + TERRAFORM (DIY):
  A team doing this from scratch: 2-3 weeks of DevOps work.
  Ongoing maintenance: 5-10 hours/week minimum.
  AutoStack: 8 minutes.
  The DIY approach is the right answer for a 50-person DevOps team. 
  AutoStack is for the other 95% of companies.
```

---
*AutoStack PIVOT v1.0 — This document replaces all previous AutoStack documentation.*
*Vision: Deploy to YOUR cloud. Not ours.*
*Status: This document is the single source of truth.*
