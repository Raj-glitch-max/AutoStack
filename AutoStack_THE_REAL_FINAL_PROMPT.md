# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║   AUTOSTACK — THE REAL FINAL PROMPT                                         ║
# ║   One-Click Deployment on the User's Own AWS. Nothing Mocked. Nothing Fake. ║
# ║   Read every word. Build exactly this. Verify everything runs.              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

---

# ⚠️ THE PROBLEM — READ THIS BEFORE TOUCHING ANY CODE

You have been building AutoStack for weeks. Here is the brutal honest truth about
where it stands RIGHT NOW, based on the actual audit results:

**What the diagnostic report claimed:** 100% production ready, all H1-H7 tests passed.
**What actually happened:** The tests ran simulations. H3 "Provisioning" passed because
a DB row was created. H4 "Cluster Connect" passed because a string was returned.
H7 "Billing" passed because a test webhook signature was verified.
None of these are the real product working.

**The real situation:**
- The Go agent binary does not exist as a real deployable binary
- DIE engine leaves `pr_url = null` — it never actually opens a PR
- COIE applies static deductions to hardcoded data, not real K8s API responses
- AIRE matches keywords, it does not use LLM reasoning
- GitHub App throws 404s on sub-repositories
- infra-provision was tested with mocked AWS calls
- The Helm chart repo `charts.autostack.io` does not exist

**The product vision (ONE LINE):**
User pastes a GitHub URL, connects their AWS account, clicks Deploy →
AutoStack provisions real infrastructure on THEIR AWS account and returns a live HTTPS URL.

That promise must be completely real by the end of this prompt.
Not simulated. Not a DB row. A real URL that returns HTTP 200.

---

# PART 0 — BEFORE YOU WRITE A SINGLE LINE OF CODE

## 0.1 — Ask yourself these questions. Answer them honestly in a `PRE_BUILD_AUDIT.md` file.

For each item, answer: **REAL** (tested, produces real output) or **MOCKED** (simulated, fake data, placeholder).

```
1. Does infra-provision actually call AWS APIs and create a VPC?
   Answer: REAL / MOCKED

2. Does die-analyze actually fetch files from a GitHub repo via API?
   Answer: REAL / MOCKED

3. Does the Go agent binary compile and run `go build ./cmd/agent`?
   Answer: REAL / MOCKED (does the binary even exist at all?)

4. Does COIE read data from the K8s API or from a hardcoded object?
   Answer: REAL / MOCKED

5. Does AIRE call an LLM API or match strings with `includes()`?
   Answer: REAL / MOCKED

6. Does auth-hook set `user_metadata.org_id` and is it registered as a Supabase Auth Hook in the dashboard?
   Answer: REAL / MOCKED

7. Is there a real GitHub App installed with a real private key stored in Edge Function secrets?
   Answer: REAL / MOCKED

8. Does a real user hitting /signup get a welcome email in their actual inbox?
   Answer: REAL / MOCKED

9. Do the Realtime subscriptions in useData.js update the UI when you manually UPDATE a row in Supabase dashboard?
   Answer: REAL / MOCKED

10. Does `npm run build` complete with zero errors right now?
    Answer: REAL / MOCKED
```

If answers 1, 2, 6, 8, 10 are not all REAL — do not proceed to implementation.
Fix them first. Everything else depends on these five.

## 0.2 — Verify credentials exist in Supabase Edge Function Secrets

Run this check and confirm every secret exists:
```
RESEND_API_KEY           — if missing: Resend emails never send
GITHUB_APP_PRIVATE_KEY   — if missing: GitHub API calls all 401
GITHUB_APP_ID            — if missing: GitHub App JWT cannot be generated
GITHUB_WEBHOOK_SECRET    — if missing: webhooks not verified (security hole)
UPSTASH_REDIS_REST_URL   — if missing: rate limiting broken
UPSTASH_REDIS_REST_TOKEN — if missing: rate limiting broken
OPENAI_API_KEY           — if missing: AIRE semantic matching never runs
STRIPE_SECRET_KEY        — if missing: billing broken
STRIPE_WEBHOOK_SECRET    — if missing: webhook verification fails
NOTIFICATION_SECRET      — if missing: send-notification unauthenticated
```

For any missing secret: STOP. Get the value. Add it. Then continue.

---

# PART 1 — THE COMPLETE USER JOURNEY (EVERY SCREEN, EVERY BUTTON, EVERY API CALL)

This section defines what EVERY interaction does from the user's perspective,
and what MUST happen in the backend for it to be real.
This is not a UI spec. This is an implementation contract.

---

## SCREEN 1 — LANDING PAGE (`/`)

### What the user sees
The landing page explains the product in 8 seconds:
"Paste your GitHub URL. Connect your AWS. Click Deploy. Your app is live in 12 minutes."

### What every interactive element does

**"Get Started Free" button (primary CTA in hero):**
- Action: Navigate to `/signup`
- Backend: nothing
- What makes it real: it routes correctly

**"Open Dashboard" button (navbar):**
- Action: If session exists → `/dashboard`. If no session → `/login`
- Backend: `supabase.auth.getSession()` check
- What makes it real: no flash, no delay, no wrong redirect

**"Sign in" link (navbar):**
- Action: Navigate to `/login`

**Pricing — "Get started free" (Free tier):**
- Action: Navigate to `/signup?plan=free`

**Pricing — "Start Pro trial" (Pro tier):**
- Action: Navigate to `/signup?plan=pro`
- After signup: Stripe checkout flow begins

**Pricing — "Contact sales" (Team tier):**
- Action: Opens Calendly link or contact form

**Terminal animation in hero:**
- This must play a real typewriter animation showing a REAL deploy session
- The text must match the ACTUAL autostack CLI flow
- It must NOT show K8s cluster stuff — it must show the ONE-CLICK deploy flow:
  ```
  $ autostack deploy github.com/user/my-app
  ✓ Detected: Node.js 20 (Express)
  ✓ AWS account connected (ap-south-1)
  ⟳ Provisioning VPC + EKS...
  ✓ Infrastructure ready (11m 43s)
  ✓ Docker image built: 1.2GB → 89MB
  ✓ Deployed to EKS
  ✓ Live URL: https://my-app.autostack.app
  ```

---

## SCREEN 2 — SIGNUP PAGE (`/signup`)

### What the user sees
Clean form. Logo at top. Fields: Full name, Work email, Password, Organization name.
GitHub OAuth option. Terms checkbox. Submit button.

### What every element does

**"Create account" button:**

1. Client validates: all fields filled, email format valid, password ≥ 8 chars + 1 number + 1 uppercase + 1 special char, terms checked
2. If validation fails: inline red error below the failing field. Focus the first failing field.
3. If validation passes: button shows loading spinner + "Creating account..."
4. Call: `supabase.auth.signUp({ email, password, options: { data: { full_name, organization_name } } })`
5. Supabase sends confirmation email via Resend (configured in Supabase SMTP settings)
6. The `auth-hook` Edge Function fires AUTOMATICALLY (registered as Supabase Auth Hook):
   - Creates a row in `organizations` with the user's org name
   - Creates a row in `org_members` with `role = 'owner'`
   - Sets `user_metadata.org_id` on the user via `supabase.auth.admin.updateUserById()`
   - THIS IS THE MOST CRITICAL STEP — if org_id is not in user_metadata, ALL RLS policies return 0 rows
   - Calls send-notification with `type: 'welcome'` → welcome email via Resend
7. App shows: "Check your email" state — replace form with envelope icon + user's email + "Resend email" button

**"Continue with GitHub" button:**
1. Call: `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: APP_URL + '/auth/callback' } })`
2. User completes GitHub OAuth
3. Returns to `/auth/callback`
4. `auth-hook` must fire for GitHub OAuth users too — verify this explicitly
5. If new user (no org in DB): redirect to `/onboarding`
6. If returning user (org exists): redirect to `/dashboard`

**VERIFICATION TEST FOR SIGNUP (run this, do not skip):**
1. Open private browser window
2. Sign up with new email: `test+{timestamp}@gmail.com`
3. Check Supabase Auth → Users → confirm user exists
4. Check Supabase → Table Editor → organizations → confirm ONE row created with the org name
5. Check Supabase → Table Editor → org_members → confirm ONE row with `role: owner`
6. Check the user's `raw_user_meta_data` column → confirm `org_id` key exists and is NOT null
7. Check Resend dashboard → confirm welcome email was logged
8. If step 4, 5, or 6 fails: STOP. Fix `auth-hook`. Do not continue.

---

## SCREEN 3 — LOGIN PAGE (`/login`)

### What every element does

**"Sign in" button:**
1. Validate: email format, password non-empty
2. Call: `supabase.auth.signInWithPassword({ email, password })`
3. On success:
   - Call `posthog.identify(user.id, { email, org_id, plan })`
   - Call `Sentry.setUser({ id: user.id, email })`
   - If user has no environments: redirect to `/onboarding`
   - If user has environments: redirect to `/dashboard`
4. On error: map Supabase error codes to friendly messages:
   - `invalid_credentials` → "Email or password is incorrect"
   - `email_not_confirmed` → "Please confirm your email first"
   - `too_many_requests` → "Too many attempts. Wait 5 minutes."
   - All others → "Something went wrong. Try again." + log to Sentry

**"Forgot password?" link:**
Navigate to `/forgot-password`

**"Continue with GitHub":**
Same OAuth flow as signup.

---

## SCREEN 4 — ONBOARDING (`/onboarding`)

This is the CRITICAL flow that makes AutoStack real or fake.
A user who completes onboarding must have REAL infrastructure deployed.

### STEP 1: "Connect Your AWS Account"

**What the user sees:**
Page title: "Connect your AWS account"
Subtitle: "AutoStack deploys to YOUR AWS — you own the infrastructure, we just run it."

A card showing:
1. A "Trust Policy" section showing the exact JSON for the CloudFormation/IAM setup
2. Two options: "Use CloudFormation (recommended)" or "Create manually"

**CloudFormation option (preferred):**
- Button: "Launch CloudFormation Stack →"
- This opens a new tab to the AWS CloudFormation console with a pre-built template URL
- The template creates the `AutoStackDeploymentRole` IAM role with the correct trust policy
- After clicking, the user sees a "Waiting for role..." state with a polling indicator
- The app polls every 5 seconds: `GET /functions/v1/aws-verify-role?role_arn=[arn]`

**Manual option:**
Shows expandable instructions with the exact IAM policy JSON to copy-paste.
Fields to fill in: AWS Account ID, Role ARN, External ID (pre-generated, shown on screen).

**"Verify & Connect" button:**
1. Call `aws-assume-role` Edge Function with: `{ role_arn, external_id, account_id }`
2. Edge function does:
   - STS AssumeRole with the provided ARN and ExternalId
   - If success: store encrypted credentials in Supabase Vault (`cloud_credentials` table)
   - Returns: `{ verified: true, account_id, available_regions: [...] }`
3. On success: green checkmark animation + "AWS account connected" + proceed to Step 2
4. On failure: red inline error with exact AWS error message + "Try again" button

**What makes this REAL:**
The `aws-assume-role` Edge Function must:
- Import `@aws-sdk/client-sts` (Node.js AWS SDK v3)
- Call `sts.assumeRole({ RoleArn, RoleSessionName: 'autostack-verify', ExternalId })`
- This is a REAL STS call — it either works or gives a real AWS error
- If you get `AccessDenied`: the trust policy is wrong → show specific instructions to fix it
- Store the `AccessKeyId`, `SecretAccessKey`, `SessionToken` in Supabase Vault encrypted
- These expire in 1 hour — add a refresh mechanism

### STEP 2: "Deploy Your First App"

**What the user sees:**
Title: "Deploy your first application"
Two inputs:
1. GitHub repository URL (text input with GitHub icon)
2. Application size selector: Hobby / Standard / Production (card toggle)
   - Hobby: t3.medium, 1 node, ~$45/month
   - Standard: t3.large, 2 nodes, ~$120/month
   - Production: t3.xlarge, 3 nodes, ~$290/month

"Estimated cost" shows dynamically as size is selected.

**"Deploy →" button:**
This is THE button. This must trigger the entire pipeline.

What happens when clicked:
1. Button: loading state, "Analyzing repository..."
2. Call `die-analyze` Edge Function with `{ repo_url, size, region, org_id }`
3. Progress updates stream back via Supabase Realtime (the function updates `deployments.stage` column)
4. The onboarding page shows a live progress stepper:

```
[✓] Analyzing repository (Node.js 20 detected)
[⟳] Generating Kubernetes manifests...
[ ] Provisioning AWS infrastructure
[ ] Building Docker image
[ ] Deploying to cluster
[ ] Setting up HTTPS
```

**Progress stepper rules:**
- Each step is green checkmark when done, spinning when active, gray when pending
- Each step shows a time elapsed counter
- If any step fails: red X + exact error message + "Retry" button
- User can see exactly where it failed — not a generic "something went wrong"

**What the `die-analyze` Edge Function MUST actually do:**

Stage 1: Repo Analysis (MUST BE REAL — no hardcoding)
- Authenticate as the GitHub App using RS256 JWT generated from the private key
- Fetch the repo tree: `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=false`
- Fetch up to 15 config files via Contents API
- Run the language detection decision tree (see Part 2 for complete spec)
- If GitHub 404: it means the App is not installed on this repo — return specific error: "AutoStack needs GitHub App access to this repository. Please install the AutoStack GitHub App."

Stage 2: Infrastructure Planning
- Calculate resource requirements based on detected stack + size selection
- Generate Dockerfile (multi-stage, non-root user, HEALTHCHECK)
- Generate K8s manifests: Deployment, Service, Ingress, HPA, NetworkPolicy
- Compute cost estimate breakdown

Stage 3: Real AWS Provisioning
- Assume the org's IAM role
- Create VPC, subnets, IGW, NAT, route tables
- Create EKS cluster (this takes 10-13 minutes — stream progress via Realtime)
- Create node group
- Install required addons (coredns, kube-proxy, vpc-cni, aws-load-balancer-controller)
- Create ECR repository

Stage 4: Docker Build + Push
- Trigger AWS CodeBuild build
- Wait for completion
- Push image to ECR

Stage 5: Deploy
- Create K8s namespace
- Apply manifests
- Wait for ArgoCD sync (or direct kubectl apply)
- Wait for ALB to become active
- Return live_url

### STEP 3: "It's Live!"

What the user sees:
- Green checkmark animation
- Canvas confetti (canvas-confetti library)
- Large display of the live URL: `https://my-app.autostack.app`
- Button: "Open app →" (opens URL in new tab)
- Button: "Go to dashboard →"

**The URL must be real.** Not a placeholder. Not `null`. A URL that returns HTTP 200.

---

## SCREEN 5 — DASHBOARD SHELL

The dashboard has a persistent sidebar and a sticky top bar.
Every element in these is interactive and connected to real data.

### Sidebar

**Organization switcher (top of sidebar):**
- Shows current org name + logo initial avatar
- Clicking it: opens a dropdown of all orgs the user belongs to
- On switch: reload all data for the selected org
- API: `GET /functions/v1/orgs` → returns user's org list

**Environment selector (below org switcher):**
- Dropdown of all provisioned environments for the org
- Each entry: environment name + status dot (green=healthy, amber=warning, red=incident)
- "Add environment" option at bottom → opens quick-add flow
- Currently active environment determines what ALL tabs show
- API: `SELECT * FROM environments WHERE org_id = auth.org_id() ORDER BY created_at DESC`
- Realtime: subscribe to environments table for status changes

**Navigation items:**

`Overview` — The health dashboard. Shows aggregate scores, recent activity, throughput chart.

`Deployments` — List of all deployments for this environment. Create new deployment.

`Pipelines` — GitHub Actions runs synced via webhook. Real-time status.

`Infrastructure` — AWS resources provisioned by AutoStack for this environment.

`Monitoring` — CPU, memory, requests, latency from cluster_metrics table.

`Logs` — Real-time log streaming from the environment.

`Cost` — COIE cost findings. Savings opportunities. Projected vs actual spend.

`Incidents` — AIRE-detected incidents with RCA and remediation status.

`Settings` — Cloud credentials, GitHub integration, team, notifications, billing.

**Each nav item:**
- Active state: blue tinted background + blue text + right chevron
- Hover state: surface-2 background
- Clicking a nav item: updates URL to `/dashboard/[tab]`, no full page reload
- The active tab is controlled by URL — browser back/forward works correctly

**Cluster health score (sidebar bottom card):**
- Green dot (if score > 75), amber (50-75), red (<50)
- Score number from `environments.health_score` column
- Updates via Realtime subscription on the environments table
- On score change: number does count-up animation from old value to new value

**User section (sidebar very bottom):**
- User avatar (initial letter in colored circle)
- Name + email
- "Logout" on hover
- Clicking → `supabase.auth.signOut()` → redirect to `/`

### Top Bar

**Breadcrumb (left):**
- Format: `AutoStack / [org-name] / [environment-name] / [tab-name]`
- All are clickable links

**Search bar (center):**
- Placeholder: "Search or jump to... (⌘K)"
- Clicking OR pressing ⌘K/Ctrl+K: opens Command Palette modal
- The Command Palette is NOT decorative — every item navigates or triggers a real action

**Command Palette items that MUST work:**
- "New deployment" → opens new deployment modal
- "New environment" → opens environment creation flow
- "Go to Overview" → navigates to Overview tab
- "Go to Incidents" → navigates to Incidents tab
- "Go to Cost" → navigates to Cost tab
- "View logs" → navigates to Logs tab
- "Settings" → navigates to Settings tab
- "Invite team member" → opens invite modal

**Notification bell (top bar right):**
- Red dot shows count of unread notifications
- Clicking: dropdown of recent notifications (last 5)
- Each notification: icon + message + time ago + click to navigate to relevant item
- "Mark all read" button
- Data source: `notifications` table (if exists) OR last 5 audit_log entries

---

## SCREEN 6 — OVERVIEW TAB

### What every element shows and where data comes from

**Health Score Cards (4 cards: Security / Reliability / Cost / Performance):**
- Numbers come from `environments.score_security`, `score_reliability`, `score_cost`, `score_performance`
- If these are null: show skeleton, not 0
- On component mount: trigger count-up animation from 0 to actual value
- Delta badge (e.g. "+3"): compare to previous row in `cluster_scores` table
- Click on any score card: navigate to the relevant tab (Security → Incidents tab, Cost → Cost tab)
- Loading state: show 4 SkeletonScoreCard components
- Empty state (no environment provisioned): show "No data yet" + "Provision your first environment →"

**Realtime updates:**
- Subscribe to `environments` table UPDATE events for this environment_id
- When score changes: toast notification + card number animates to new value

**Throughput chart (Recharts AreaChart):**
- Data: `SELECT sampled_at, requests FROM cluster_metrics WHERE environment_id = ? AND sampled_at > NOW() - INTERVAL '24h' ORDER BY sampled_at`
- Time range selector (1h/6h/24h/7d): changes the query interval
- Loading: show SkeletonChart
- Empty (no metrics yet): show empty state "Metrics will appear once your environment is active"
- Chart colors: accent blue line, gradient fill 0.3→0 opacity

**Activity feed (right side):**
- Data: unified query joining recent: incidents + deployments + findings + pipelines
- `SELECT * FROM activity_feed WHERE environment_id = ? ORDER BY created_at DESC LIMIT 8`
  (This requires a VIEW or function combining the tables)
- Each event: colored dot + message + time ago
- "Live" badge pulses when realtime subscription is active
- Realtime: subscribe to each source table and append new events

---

## SCREEN 7 — DEPLOYMENTS TAB

### "New Deployment" button
Opens a modal:

**Fields:**
- Repository URL (text input) — validated: must be `https://github.com/...`
- Branch (text input, default: "main")
- Environment type (select: production / staging / development)
- Application size (card select: Hobby / Standard / Production)

**"Deploy" button in modal:**
1. Creates a `deployments` row with `status = 'queued'`
2. Calls `die-analyze` Edge Function
3. Modal transitions to progress view (same stepper as onboarding Step 2)
4. On success: modal shows "Deployed!" + live URL + "View deployment" button

### Deployments table columns
- **Name**: monospace repo name + branch tag
- **Stack**: detected language/framework (Node.js, Python Flask, Go, etc.)
- **Environment**: color-coded tag (prod=amber, staging=blue, dev=green)
- **Status**: StatusDot + label (deploying/healthy/failed/stopped)
- **Last Deploy**: relative time ago (e.g., "2 hours ago")
- **Live URL**: clickable link with external link icon
- **Actions**: three-dot menu → Redeploy, Rollback, View logs, Delete

### Redeploy button (in three-dot menu)
1. Shows confirmation: "Redeploy [app-name] from [branch]?"
2. Confirm → calls `deploy-redeploy` Edge Function
3. Row status updates to "deploying" via Realtime
4. Toast: "Redeployment started"

### Rollback button (in three-dot menu)
1. Opens "Select version to roll back to" modal
2. Shows last 5 deployment versions with commit SHA and timestamp
3. Confirm → calls `deploy-rollback` Edge Function with selected deployment_id
4. Performs `kubectl rollout undo deployment/[name] --to-revision=[n]`

### Row click → Deployment detail page
Shows:
- Full deployment timeline (all stages with timestamps)
- Live logs for this deployment
- Resource usage (CPU/memory since this deployment)
- The PR that was opened (if DIE generated one)
- Rollback option

---

## SCREEN 8 — PIPELINES TAB

### What shows here
GitHub Actions runs for all connected repositories.
Data comes from the `pipelines` table, populated by the `github-webhook` Edge Function.

**If GitHub App is not installed:**
Show empty state: "Connect GitHub to see pipeline runs →" button → goes to Settings → Integrations → GitHub

**Pipeline card shows:**
- Status dot (animated pulse if running)
- Repository name + branch + commit SHA (monospace)
- Status tag: queued / running / success / failed / cancelled
- Duration (if complete)
- "X minutes ago"
- Stage bars: 8 colored bars showing each stage's status

**Stage bars:**
- Source data: `pipelines.stages` JSONB column
- Each stage: name in tooltip on hover
- Colors: success=green, running=blue (animated), failed=red, pending=gray

**Realtime updates:**
Subscribe to `pipelines` table INSERT + UPDATE for this environment.
When a pipeline run starts (via GitHub push), it appears immediately.

---

## SCREEN 9 — INFRASTRUCTURE TAB

### What shows here
AWS resources that AutoStack provisioned for this environment.
Source: `infra_resources` table (or `cloud_resources` — verify actual table name).

**Resource cards show:**
- Resource type: EKS Cluster / VPC / ALB / ECR / NAT Gateway / etc.
- Status tag: active / provisioning / deleting / error
- Region (monospace)
- For compute: node count, CPU%, memory% progress bars
- For storage: size used / total
- AWS console link (opens resource directly in AWS console)

**"View in AWS Console" button per card:**
- Generates a deep link to the specific resource in AWS console
- Format: `https://console.aws.amazon.com/eks/home?region=[region]#/clusters/[name]`

**Empty state (environment being provisioned):**
- Show skeleton cards matching the expected resource count
- Progress bar showing provisioning percentage
- "Infrastructure is being created — this takes about 12 minutes"

**Teardown button (dangerous — only for owners):**
- Red "Destroy Environment" button in top-right
- Requires typing the environment name to confirm
- Calls `infra-teardown` Edge Function
- Progress stepper showing each resource being deleted
- When complete: environment status changes to 'deleted', redirect to dashboard

---

## SCREEN 10 — MONITORING TAB

### What shows here
Time-series metrics from `cluster_metrics` table.

**Four stat cards (at top):**
- Avg CPU %, Avg Memory %, Requests/min, p99 Latency ms
- Compare to previous 24h — show delta badge (green if improved, red if degraded)
- Data: aggregate query over `cluster_metrics` for the last 24h

**Four charts (2x2 grid):**
Each chart is a Recharts AreaChart:
- CPU Usage % over time (blue)
- Memory Usage % over time (purple)
- Requests per minute (green)
- p99 Latency (amber)

**Time range selector:**
Buttons: 1h / 6h / 24h / 7d
Clicking changes the query's time window.
The chart re-renders with new data — NOT by fetching everything and filtering client-side.
Each range change must issue a new Supabase query with the appropriate interval.

**Loading state:** 4 SkeletonChart components
**Empty state:** "No metrics yet. Metrics appear within 60 seconds of your first deployment."

---

## SCREEN 11 — LOGS TAB

### What shows here
Real-time and historical log output from the environment.

**Live mode (default):**
- Subscribe to Supabase Realtime Broadcast channel: `logs:{environment_id}`
- The `agent-metrics` Edge Function broadcasts new log lines here
- Auto-scroll to bottom unless user has scrolled up (detect scroll position)
- Max 1000 lines in DOM — remove oldest when adding new
- Green "LIVE" badge pulses when subscription is active

**Historical mode:**
- Fetch log files from Supabase Storage: `logs/{environment_id}/{date}/{hour}/`
- Parse `.jsonl` files and display
- Time range picker: select date + hour range

**Each log line shows:**
- Timestamp (monospace, muted) — format: `HH:MM:SS.mmm`
- Level badge: ERROR (red), WARN (amber), INFO (blue), DEBUG (gray)
- Service tag: `[api-gateway]` (purple, monospace)
- Message text (primary text)
- Row highlight on hover

**Filter bar:**
- All / Error / Warn / Info / Debug toggle buttons
- Namespace dropdown (filters by K8s namespace)
- Text search (filters displayed lines client-side)

**"Download logs" button:**
Downloads the currently displayed log lines as a `.jsonl` file.

**Empty state:**
"No logs yet. Deploy an application to start seeing logs here."

---

## SCREEN 12 — COST TAB

### What shows here
This is AutoStack's killer feature — showing users where they're wasting money.

**Top banner card:**
- Green card: "AutoStack found $[X] in monthly savings opportunities"
- Shows the sum of all `projected_saving` fields from open cost findings

**Cost breakdown chart:**
- Bar chart by service type: EKS / RDS / NAT / ALB / ECR / Other
- Data from `org_usage` table or AWS Cost Explorer API (if integrated)
- Projected (AutoStack-recommended) vs Actual (current) side by side

**Savings opportunities table:**
Each row is a `findings` row where `dimension = 'cost'`:
- Resource name (monospace)
- Issue description (human-readable)
- Current monthly cost
- Projected monthly cost after fix
- Savings amount (green, bold)
- "Apply fix" button → opens the linked PR if exists, or generates one

**"Apply fix" button:**
- If `findings.pr_url` exists: open GitHub PR in new tab
- If not: call `generate-fix-pr` Edge Function → creates PR → update button to "View PR"

**Right-sizing recommendations card:**
Lists over-provisioned resources with exact recommendation:
"api-gateway is using 23% CPU but requesting 500m — right-size to 200m to save $12/month"

---

## SCREEN 13 — INCIDENTS TAB

### What shows here
AIRE-detected incidents with root cause analysis.

**Active incidents section:**
Incidents where `status` is `detected`, `investigating`, or `diagnosed`.
Each shows:
- Severity badge (critical=red, high=orange, medium=amber, low=blue)
- Incident title (human-readable)
- Affected resource (monospace)
- Time detected (relative)
- Status + animated status dot

**Clicking an incident → incident detail panel (side panel or modal):**
Shows:
- Root cause (from `incidents.root_cause`)
- Immediate action (from `incidents.immediate_action`)
- Permanent fix (from `incidents.permanent_fix`)
- Confidence: "AIRE matched pattern OOM_KILL with 94% confidence"
- Timeline of events (from `incidents.timeline` JSONB)
- Log excerpts that triggered the detection
- "Apply remediation" button (if auto-remediation is possible)
- "Mark resolved" button

**"Apply remediation" button:**
If `incidents.remediation_type = 'restart'`:
  → Calls an Edge Function that does `kubectl rollout restart deployment/[name]`
  → Shows "Restarting pod..." with a spinner
  → On completion: incident status updates to 'resolved'

If `incidents.remediation_type = 'patch_manifest'`:
  → Links to the PR opened by AIRE
  → "View PR →" button

**Resolved incidents section (collapsed by default):**
Shows incidents from the last 7 days where `status = 'resolved'`
Each shows: title + resolution time (how long from detected to resolved) + what resolved it

**Empty state (no incidents):**
Green card: "All clear — AIRE is monitoring your cluster and hasn't detected any incidents."

---

## SCREEN 14 — SETTINGS TAB

### Sub-sections:

**Cloud Credentials:**
Shows connected AWS account:
- Account ID (monospace)
- Role ARN (monospace)
- Region
- Last verified timestamp
- "Re-verify" button → re-runs aws-assume-role check
- "Rotate token" button → generates new agent token + shows helm upgrade command
- "Disconnect" button (red, requires confirmation) → deletes credentials + marks environment as orphaned

**Integrations:**
Cards for: GitHub / Slack / PagerDuty / Datadog / Jira / Custom Webhook

GitHub card (the most important):
- If connected: shows installation info (org/user name, repo count), "Reconfigure" button
- If NOT connected: "Connect GitHub App" button
  → Initiates GitHub App installation flow
  → After OAuth callback: card shows green "Connected" status
  → THIS MUST WORK. GitHub integration is required for DIE engine.

Slack card:
- Clicking "Connect": shows a webhook URL input field
- After entering webhook URL: sends a test message "AutoStack connected ✓"
- Stores in `integrations` table with `status = 'connected'`

**Notifications:**
Two sections: "Alert triggers" and "Delivery channels"

Alert triggers (toggles):
- Deployment events (default: ON)
- AIRE incidents (default: ON)
- COIE score changes (default: OFF)
- Cost savings found (default: OFF)
- Weekly digest (default: ON)

Delivery channels (toggles with configuration):
- Email: shows user's email, toggle ON/OFF
- Slack: shows workspace name (if connected), toggle ON/OFF
- PagerDuty: shows service key input if ON

"Save preferences" button:
- Updates `notification_prefs` table
- Shows "Saved ✓" for 2 seconds

**Team & Access:**
Member list showing: avatar initial + name + email + role badge
Role options: Owner / Admin / Developer / Viewer

"Invite member" button:
- Opens modal: email input + role selector
- Submit → calls `invite-member` Edge Function
  → Inserts into `invitations` table
  → Sends invite email via Resend (template: `invite_member`)
  → Shows "Invitation sent to [email]"

Pending invitations section:
- Shows sent invitations with expiry time
- "Revoke" button per invitation

**Billing:**
Shows current plan + usage:
- Plan name + price
- Environments: X / Y used
- Team members: X / Y used
- "Upgrade plan" button (if on free tier)
- "Manage billing" button → Stripe Customer Portal

---

# PART 2 — WHAT MUST BE REAL (NOT MOCKED)

These 8 items are what separate a real product from a demo.
Each one has a VERIFICATION TEST. Run it. If it fails, fix it before continuing.

---

## REAL THING 1 — AWS PROVISIONING

The `infra-provision` Edge Function must create REAL AWS resources.

**What it must do:**
```typescript
// Import the real AWS SDK — NOT a mock
import { EKSClient, CreateClusterCommand } from "npm:@aws-sdk/client-eks@3"
import { EC2Client, CreateVpcCommand, ... } from "npm:@aws-sdk/client-ec2@3"
import { STSClient, AssumeRoleCommand } from "npm:@aws-sdk/client-sts@3"

// 1. Assume the org's IAM role using stored credentials from Vault
const stsClient = new STSClient({ region: 'us-east-1' })
const assumed = await stsClient.send(new AssumeRoleCommand({
  RoleArn: org.role_arn,
  RoleSessionName: `autostack-${deployment.id}`,
  ExternalId: org.external_id
}))

// 2. Create clients with the assumed role credentials
const credentials = {
  accessKeyId: assumed.Credentials.AccessKeyId,
  secretAccessKey: assumed.Credentials.SecretAccessKey,
  sessionToken: assumed.Credentials.SessionToken
}

// 3. Create VPC — REAL API CALL
const ec2 = new EC2Client({ region, credentials })
const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: '10.0.0.0/16' }))

// 4. Create subnets, IGW, NAT, route tables... (real calls)
// 5. Create EKS cluster — REAL API CALL (takes 10-13 minutes)
// 6. All resources tagged with: { Key: 'autostack:deployment', Value: deployment_id }
//    — tags are MANDATORY for teardown to find and delete them
```

**Provisioning order with timing:**
```
VPC creation:           ~5 seconds
Subnets (3):            ~8 seconds each
IGW + attach:           ~5 seconds
NAT Gateway:            ~90 seconds (uses Elastic IP)
Route tables:           ~10 seconds
Security groups:        ~5 seconds
EKS cluster:            ~10-13 minutes (long poll required)
Node group:             ~3-5 minutes
EKS addons:             ~2 minutes
ECR repository:         ~5 seconds
ALB setup:              ~2-3 minutes
Total:                  ~18-22 minutes
```

**Progress broadcasting:**
Every step must UPDATE the `environments.provisioning_status` and `environments.provisioning_stage` columns.
The frontend subscribes via Realtime and shows real-time progress.
Never let the user see a spinner for 20 minutes with no information.

**VERIFICATION TEST:**
1. Trigger infra-provision with a test org's IAM role
2. Open AWS console → EC2 → check: VPC with tag `autostack:deployment=[id]` was created
3. Open AWS console → EKS → cluster with matching name exists
4. Check: all resources have the `autostack:deployment` tag (CRITICAL for teardown)
5. `environments.provisioning_status` should be `'active'` when complete
6. `environments.live_url` should be populated with a real ALB DNS name

---

## REAL THING 2 — DIE ENGINE REPO ANALYSIS + PR GENERATION

The `die-analyze` Edge Function must fetch REAL files from GitHub and open a REAL PR.

**Language detection (complete decision tree — implement all of these):**

```typescript
function detectStack(files: Map<string, string>): StackDetection {
  // files: Map of filename → file content (fetched from GitHub API)

  if (files.has('Dockerfile')) {
    const expose = files.get('Dockerfile')!.match(/^EXPOSE (\d+)/m)
    return { language: 'Docker', framework: 'Custom', port: parseInt(expose?.[1] || '8080') }
  }

  if (files.has('package.json')) {
    const pkg = JSON.parse(files.get('package.json')!)
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps['next']) return { language: 'Node.js', framework: 'Next.js', port: 3000 }
    if (deps['@nestjs/core']) return { language: 'Node.js', framework: 'NestJS', port: 3000 }
    if (deps['express']) return { language: 'Node.js', framework: 'Express', port: 3000 }
    if (deps['fastify']) return { language: 'Node.js', framework: 'Fastify', port: 3000 }
    if (deps['hono']) return { language: 'Node.js', framework: 'Hono', port: 8787 }
    if (deps['react-scripts'] || deps['vite']) return { language: 'Node.js', framework: 'React SPA', port: 3000, appType: 'static-site' }
    return { language: 'Node.js', framework: 'Node.js', port: 3000 }
  }

  if (files.has('requirements.txt') || files.has('pyproject.toml')) {
    const content = (files.get('requirements.txt') || files.get('pyproject.toml') || '').toLowerCase()
    if (content.includes('django')) return { language: 'Python', framework: 'Django', port: 8000 }
    if (content.includes('fastapi')) return { language: 'Python', framework: 'FastAPI', port: 8000 }
    if (content.includes('flask')) return { language: 'Python', framework: 'Flask', port: 5000 }
    if (content.includes('celery') && !content.includes('django') && !content.includes('flask'))
      return { language: 'Python', framework: 'Celery', port: 0, appType: 'worker' }
    return { language: 'Python', framework: 'Python', port: 8000 }
  }

  if (files.has('go.mod')) return { language: 'Go', framework: 'Go', port: 8080 }
  if (files.has('pom.xml') || files.has('build.gradle'))
    return { language: 'Java', framework: 'Spring Boot', port: 8080 }
  if (files.has('Gemfile')) return { language: 'Ruby', framework: 'Rails', port: 3000 }
  if (files.has('Cargo.toml')) return { language: 'Rust', framework: 'Rust', port: 8080 }
  if (files.has('composer.json')) return { language: 'PHP', framework: 'Laravel', port: 8000 }

  return { language: 'Unknown', framework: 'Unknown', port: 8080 }
}
```

**Manifest generation:**
Generate these files as real strings with all placeholders substituted:
1. `autostack/Dockerfile` — multi-stage, non-root, HEALTHCHECK
2. `autostack/k8s/deployment.yaml` — 2 replicas, full securityContext, readiness/liveness probes, resource limits
3. `autostack/k8s/service.yaml` — ClusterIP type
4. `autostack/k8s/ingress.yaml` — cert-manager TLS annotation
5. `autostack/k8s/hpa.yaml` — min 2, max 10, CPU 70% / memory 80%
6. `autostack/k8s/networkpolicy.yaml` — deny all + allow ingress from nginx namespace
7. `autostack/argocd/application.yaml` — GitOps manifest

**GitHub PR creation (MUST BE REAL — `pr_url` CANNOT be null):**
```typescript
// 1. Get base branch SHA
const refRes = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
  { headers: { Authorization: `Bearer ${installationToken}` } }
)
const { object: { sha } } = await refRes.json()

// 2. Create branch
await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${installationToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'refs/heads/autostack/initial-setup', sha })
})

// 3. Create each file
for (const [path, content] of Object.entries(manifests)) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${installationToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Add ${path}`,
        content: btoa(unescape(encodeURIComponent(content))),  // base64 encode with unicode support
        branch: 'autostack/initial-setup'
      })
    }
  )
  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Failed to create ${path}: ${err.message}`)
  }
}

// 4. Open PR
const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${installationToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: '🚀 AutoStack: Production-ready Kubernetes manifests',
    body: generatePRBody(detection),
    head: 'autostack/initial-setup',
    base: branch
  })
})
const pr = await prRes.json()

// 5. CRITICAL: store the PR URL — this must NEVER be null
await supabase.from('deployments').update({
  pr_url: pr.html_url,
  pr_number: pr.number,
  analysis_status: 'complete',
  stack: `${detection.framework} (${detection.language})`
}).eq('id', deployment_id)
```

**GitHub 404 fix:**
The 404s happen because the GitHub App is not installed on the specific repo.
Detection: if GitHub API returns 404, check if it's an "App not installed" error.
Response to user: "AutoStack needs access to this repository. Install the GitHub App →"
Link: `https://github.com/apps/[your-app-name]/installations/new`
After installation: user can click "Retry" to re-run die-analyze.

**VERIFICATION TEST:**
1. Create a test GitHub repo with a `package.json` containing `{ "dependencies": { "express": "^4.18" } }`
2. Trigger die-analyze on this repo
3. Verify: files exist in GitHub at `autostack/k8s/deployment.yaml` (check via GitHub UI)
4. Verify: a PR exists in the repo with title containing "AutoStack"
5. Verify: `deployments.pr_url` is NOT null in the database
6. If step 3, 4, or 5 fails: the DIE engine is broken. Fix it before continuing.

---

## REAL THING 3 — COIE WITH REAL INVENTORY DATA

COIE must run checks against REAL workload data, not hardcoded objects.

**Data source:** Redis key `inventory:{environment_id}` populated by the agent
**Fallback (if agent not connected):** fetch workload inventory from K8s API directly using the org's IAM role → kubeconfig

**The check array (implement ALL of these — not hardcoded values):**

```typescript
const SECURITY_CHECKS = [
  {
    id: 'PRIVILEGED_CONTAINERS',
    severity: 'critical',
    maxDeduction: 25,
    evaluate: (workloads) => {
      const affected = workloads.filter(w =>
        w.containers.some(c => c.securityContext?.privileged === true)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name) }
    }
  },
  {
    id: 'MISSING_RESOURCE_LIMITS',
    severity: 'high',
    maxDeduction: 30,
    evaluate: (workloads) => {
      const affected = workloads.filter(w =>
        w.containers.some(c => !c.resources?.limits?.cpu || !c.resources?.limits?.memory)
      )
      return {
        failed: affected.length > 0,
        affectedResources: affected.map(w => w.name),
        // Deduction scales with count: 10 points per workload, max 30
        deduction: Math.min(affected.length * 10, 30)
      }
    }
  },
  // ... all 6 security checks, 6 reliability checks, 4 cost checks, 4 performance checks
]
```

**After evaluation — MUST write to DB:**
```typescript
// 1. Update the environment score columns
await supabase.from('environments').update({
  score_security: securityScore,
  score_reliability: reliabilityScore,
  score_cost: costScore,
  score_performance: performanceScore,
  health_score: weightedAverage,
  score_updated_at: new Date().toISOString()
}).eq('id', environment_id)

// 2. Insert time-series record
await supabase.from('cluster_scores').insert({
  environment_id,
  health_score: weightedAverage,
  score_security: securityScore,
  score_reliability: reliabilityScore,
  score_cost: costScore,
  score_performance: performanceScore
})

// 3. Insert/update findings for each failed check
for (const failure of failures) {
  // Check deduplication first
  const { data: existing } = await supabase.from('findings')
    .select('id')
    .eq('environment_id', environment_id)
    .eq('check_name', failure.checkId)
    .eq('affected_resource', failure.resource)
    .eq('status', 'open')
    .single()

  if (existing) {
    await supabase.from('findings').update({ last_seen_at: new Date().toISOString() }).eq('id', existing.id)
  } else {
    await supabase.from('findings').insert({ ... })
  }
}
```

**VERIFICATION TEST:**
1. Manually insert a workload into Redis key `inventory:{environment_id}` with `resources.limits` missing
2. Trigger `coie-cycle` manually
3. Check `environments` table: scores updated
4. Check `cluster_scores` table: new row with timestamp
5. Check `findings` table: row with `check_name = 'MISSING_RESOURCE_LIMITS'`
6. Open dashboard: Overview tab scores should show the new values (Realtime update)

---

## REAL THING 4 — AIRE WITH REAL DIAGNOSIS

AIRE must produce real RCA using pattern matching AND LLM fallback.

**Trigger mechanism:**
Supabase Database Webhook on `incidents` table INSERT → fires `aire-detect`
This means: whenever ANY component creates an incident row, AIRE auto-diagnoses it.

**Tier 1: Pattern matching (fast, no LLM):**
```typescript
const PATTERNS = [
  {
    id: 'OOM_KILL',
    evaluate: (incident) => {
      const text = `${incident.summary} ${incident.log_excerpts?.join(' ')}`.toLowerCase()
      const keywords = ['oomkilled', 'exit code 137', 'out of memory', 'memory limit']
      const matched = keywords.filter(k => text.includes(k)).length
      return { confidence: matched / keywords.length * 0.95 }
    },
    root_cause: 'Container was killed by the Linux OOM killer because it exceeded its memory limit of {memory_limit}.',
    immediate_action: 'Manually restart the pod. Monitor memory usage for the next 30 minutes.',
    permanent_fix: 'Increase the memory limit in the Deployment manifest. Also investigate if there is a memory leak.',
    remediation_type: 'patch_manifest'
  },
  // ... 9 more patterns
]
```

**Tier 2: OpenAI semantic search (when confidence < 0.65):**
```typescript
// Generate embedding of incident summary
const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: incident.summary.slice(0, 512) })
})
const { data } = await embeddingRes.json()
const embedding = data[0].embedding

// pgvector similarity search
const { data: patterns } = await supabase.rpc('match_incident_patterns', {
  query_embedding: embedding,
  match_threshold: 0.75,
  match_count: 1
})
```

**AFTER DIAGNOSIS — MUST update the incident row:**
```typescript
await supabase.from('incidents').update({
  matched_pattern: bestMatch.id,
  pattern_confidence: bestMatch.confidence,
  root_cause: interpolateTemplate(bestMatch.root_cause, incident),
  immediate_action: bestMatch.immediate_action,
  permanent_fix: bestMatch.permanent_fix,
  remediation_type: bestMatch.remediation_type,
  status: 'diagnosed',
  diagnosed_at: new Date().toISOString()
}).eq('id', incident.id)
```

**VERIFICATION TEST:**
1. Insert a test incident:
```sql
INSERT INTO incidents (environment_id, trigger_type, summary, log_excerpts, severity)
VALUES (
  '[your-env-id]',
  'pod_restart',
  'Pod api-gateway killed: OOMKilled exit code 137',
  '["OOMKilled: container exceeded memory limit 512Mi", "Killed process 1 (node): Out of memory"]',
  'high'
);
```
2. Wait 10 seconds
3. Query: `SELECT matched_pattern, pattern_confidence, root_cause, status FROM incidents ORDER BY detected_at DESC LIMIT 1`
4. Verify: `matched_pattern = 'OOM_KILL'`, `confidence > 0.85`, `root_cause` is populated, `status = 'diagnosed'`
5. If ANY field is null: AIRE is broken. Fix it before continuing.

---

## REAL THING 5 — AUTH HOOK MUST SET ORG_ID IN JWT

This is the single most critical thing in the entire system.
Without `user_metadata.org_id` set correctly, ALL RLS policies return 0 rows,
and every user sees an empty dashboard.

**The complete `auth-hook` function:**

```typescript
// supabase/functions/auth-hook/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const { user, event } = await req.json()

    // Handle both 'SIGNED_UP' (email) and 'USER_CREATED' (OAuth)
    if (event !== 'SIGNED_UP' && event !== 'USER_CREATED') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // Service role bypasses RLS
    )

    // Check: does this user already have an org? (handles re-registration edge cases)
    const { data: existingMember } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (existingMember) {
      // User already has org — just ensure user_metadata is set
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, org_id: existingMember.org_id }
      })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    // Create organization
    const orgName = user.user_metadata?.organization_name
      || user.user_metadata?.full_name?.split(' ')[0] + "'s Org"
      || user.email.split('@')[1].split('.')[0]

    const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 50) + '-' + Date.now().toString(36)

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName, slug: orgSlug, plan: 'free' })
      .select()
      .single()

    if (orgError) throw new Error(`Failed to create org: ${orgError.message}`)

    // Create org_member
    await supabase.from('org_members').insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner'
    })

    // Create notification_prefs
    await supabase.from('notification_prefs').insert({ user_id: user.id })

    // CRITICAL: Set org_id in user_metadata
    // This is what ALL RLS policies check: (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        org_id: org.id,
        role: 'owner',
        plan: 'free'
      }
    })

    if (updateError) throw new Error(`Failed to update user metadata: ${updateError.message}`)

    // Send welcome email (non-blocking)
    fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/send-notification', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + Deno.env.get('NOTIFICATION_SECRET'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'welcome',
        recipient_email: user.email,
        recipient_name: user.user_metadata?.full_name || user.email.split('@')[0],
        payload: { org_name: orgName }
      })
    }).catch(err => console.error('Welcome email failed:', err))

    return new Response(JSON.stringify({ ok: true, org_id: org.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('auth-hook error:', err)
    // IMPORTANT: Return 200 even on error — if we return 500, the signup itself fails
    // Log the error so we can debug, but don't block the user from signing up
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: corsHeaders
    })
  }
})
```

**Registering as an Auth Hook in Supabase Dashboard:**
Go to: Supabase Dashboard → Authentication → Hooks
Under "Auth hook - after user creation": set to `supabase/functions/auth-hook`
WITHOUT THIS REGISTRATION, THE FUNCTION NEVER FIRES.

---

## REAL THING 6 — REALTIME SUBSCRIPTIONS THAT ACTUALLY UPDATE THE UI

**Every Supabase realtime subscription MUST follow this exact pattern:**

```javascript
// In useData.js — EVERY hook looks like this
export function useEnvironment(environmentId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!environmentId) { setLoading(false); return }

    let isMounted = true

    // 1. Initial data fetch
    supabase
      .from('environments')
      .select('*')
      .eq('id', environmentId)
      .single()
      .then(({ data, error }) => {
        if (!isMounted) return
        if (error) setError(error.message)
        else setData(data)
        setLoading(false)
      })

    // 2. Realtime subscription
    const channel = supabase
      .channel(`env:${environmentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'environments',
        filter: `id=eq.${environmentId}`
      }, (payload) => {
        if (!isMounted) return
        setData(payload.new)
      })
      .subscribe()

    // 3. CRITICAL: Cleanup — this must ALWAYS be here
    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [environmentId])

  return { data, loading, error }
}
```

**VERIFICATION TEST for Realtime:**
1. Open the dashboard Overview tab
2. Open Supabase Dashboard → Table Editor → environments
3. Find the row for the test environment
4. Manually change `health_score` from 87 to 50
5. Verify: the score card in the dashboard updates to 50 WITHOUT a page refresh
6. If the card doesn't update: realtime is broken. Debug the subscription.

---

## REAL THING 7 — EMAILS ACTUALLY ARRIVE IN INBOXES

**VERIFICATION TEST for Resend:**
1. In Supabase Dashboard → Authentication → SMTP Settings:
   - Host: `smtp.resend.com`
   - Port: 465
   - User: `resend`
   - Password: [RESEND_API_KEY]
   - Sender email: `noreply@yourdomain.com` (must be a verified Resend domain)
2. Click "Send test email"
3. Verify: the test email arrives in your inbox within 60 seconds
4. If it doesn't arrive: SMTP is misconfigured. Fix it before proceeding.

**Emails that MUST work by the time you're done:**
- Welcome email (sent by auth-hook on signup) — verify in Resend dashboard logs
- Email confirmation (sent by Supabase Auth) — verify by completing the signup flow
- Password reset (sent by Supabase Auth) — verify by clicking "Forgot password"
- Invite member email — verify by inviting a test email address
- Incident notification — verify by inserting a test incident and checking inbox

---

## REAL THING 8 — THE GO AGENT (MINIMUM VIABLE VERSION)

The Go agent is the ONLY way to get real data into the system.
Without it: COIE runs on simulated data, AIRE has no events to analyze, monitoring charts show nothing.

**Minimum viable agent (MVP scope — implement these 4 things only):**

1. Registration: POST to `agent-register` with the token from the Helm values
2. Heartbeat: POST to `agent-heartbeat` every 30 seconds with pod count, node count
3. Event streaming: Watch K8s Warning events, POST to `agent-metrics` for each one
4. Metrics: Collect node+pod CPU/memory from metrics-server every 60 seconds, POST batch

**The registration flow:**
```go
// cmd/agent/main.go
func main() {
    cfg := config.Load()

    // Step 1: Register (first run only)
    if cfg.EnvironmentID == "" {
        envID, err := registration.Register(cfg.ControlPlaneURL, cfg.AgentToken)
        if err != nil {
            log.Fatal("Registration failed:", err)
        }
        // Save environment ID to ConfigMap for persistence
        cfg.EnvironmentID = envID
    }

    // Step 2: Start heartbeat goroutine
    go heartbeat.Run(cfg)

    // Step 3: Start event watcher goroutine
    go collector.WatchEvents(cfg, k8sClient)

    // Step 4: Start metrics collection loop
    go collector.CollectMetrics(cfg, metricsClient)

    // Block forever
    select {}
}
```

**Agent binary must be real:**
```bash
# This command must succeed:
cd agent && go build -o bin/autostack-agent ./cmd/agent
# The binary must exist at: agent/bin/autostack-agent
```

**Helm chart:**
The chart MUST point to a real image in a real registry (GitHub Container Registry or Docker Hub).
Build and push the agent image:
```bash
docker build -t ghcr.io/[your-username]/autostack-agent:latest agent/
docker push ghcr.io/[your-username]/autostack-agent:latest
```

Update `helm/autostack-agent/values.yaml`:
```yaml
image:
  repository: ghcr.io/[your-username]/autostack-agent
  tag: "latest"
```

Update the helm command in `connect-cluster` Edge Function to use the real chart URL.

---

# PART 3 — EVERY COMPONENT'S LOADING / EMPTY / ERROR STATE

Every component that fetches data must handle exactly three states.
This is not negotiable. A missing loading state = blank screen for the user.

**Template pattern (apply to EVERY data-fetching component):**

```jsx
function ExampleTab({ environmentId }) {
  const { data, loading, error, refetch } = useExampleData(environmentId)

  // LOADING STATE — always show skeletons, never blank
  if (loading) return (
    <div className="grid grid-cols-2 gap-4">
      <SkeletonCard height="120px" />
      <SkeletonCard height="120px" />
    </div>
  )

  // ERROR STATE — always show error with retry
  if (error) return (
    <div className="flex flex-col items-center py-16 gap-4">
      <AlertTriangle className="w-10 h-10 text-red-400" />
      <p className="text-sm text-muted">Failed to load: {friendlyError(error)}</p>
      <button onClick={refetch} className="btn-secondary">Try again</button>
    </div>
  )

  // EMPTY STATE — always actionable
  if (!data || data.length === 0) return (
    <EmptyState
      icon={Server}
      title="No deployments yet"
      description="Deploy your first application to get started"
      action={{ label: "Deploy an app", onClick: openDeployModal }}
    />
  )

  // SUCCESS STATE — the actual content
  return <div>... real content ...</div>
}
```

**Apply this pattern to every tab. Verify each one shows the correct state by:**
1. Loading: disconnect network, verify skeleton shows
2. Empty: use a test org with no data, verify empty state shows
3. Error: temporarily break the Supabase URL, verify error + retry button shows

---

# PART 4 — THE PRODUCTION CHECKLIST

Before marking ANY phase complete, run ALL of these tests.
Not "I believe it works." Run the test. Get the result. Write it down.

## P0 — CRITICAL (the app doesn't work without these)

```
□ auth-hook is registered as Auth Hook in Supabase Dashboard (Auth → Hooks)
□ After signup: user_metadata.org_id is NOT null (check in Supabase Auth → Users → user JSON)
□ After signup: organizations table has 1 new row
□ After signup: org_members table has 1 new row with role='owner'
□ Welcome email arrives in inbox within 60 seconds
□ npm run build produces zero errors
□ Login → dashboard redirect works with no flash
□ GitHub App is installed with a real private key in Supabase secrets
□ aws-assume-role makes a REAL STS call (check AWS CloudTrail for the AssumeRole event)
□ die-analyze opens a REAL PR in the test GitHub repo (pr_url is NOT null in DB)
□ AIRE: inserting a test incident → matched_pattern is NOT null within 10 seconds
□ Realtime: manually updating environments.health_score → UI updates without page refresh
```

## P1 — IMPORTANT (key features broken)

```
□ All 4 dashboard score cards show real values (not 0 or null)
□ Time range selector in Monitoring tab changes the chart data
□ Logs tab shows real log lines (not placeholder text)
□ Incidents tab shows real AIRE diagnoses (not empty)
□ Cost tab shows real savings opportunities (not 0)
□ GitHub webhook creates pipeline rows when code is pushed
□ infra-provision all resources tagged with autostack:deployment tag
□ infra-teardown deletes ALL tagged resources (verify in AWS console)
□ Invite member email arrives with working accept link
□ Notification preferences actually control what emails are sent
□ Rate limiting returns 429 after exceeding limit (test with rapid requests)
□ COIE cron runs every 5 minutes (check pg_cron jobs table)
□ Weekly digest cron is scheduled (check pg_cron jobs table)
□ Agent binary compiles: `go build ./cmd/agent` succeeds
□ Helm chart renders without errors: `helm template . --set agent.token=test`
```

## P2 — POLISH (UX quality)

```
□ All forms validate inline on blur (not just on submit)
□ All buttons show loading state when their action is in progress
□ All empty states have actionable CTA buttons (not just text)
□ ⌘K command palette all navigation items work (not just visually present)
□ Browser back/forward works between dashboard tabs
□ Logout clears all local state and redirects to /
□ Mobile view (375px): landing page is readable
□ No bare console.log in production code (grep -r "console.log" src/)
□ No hardcoded localhost URLs outside of .env files
□ .env.local is in .gitignore (verify: git status shows it as ignored)
```

---

# PART 5 — RULES THAT MUST NEVER BE BROKEN

These apply to every line of code written from this point forward.
Any output that violates these rules is rejected and must be redone.

## ABSOLUTE PROHIBITIONS

**NEVER leave `pr_url = null` after die-analyze runs.**
If the PR creation fails, throw the actual error to the user. Do not silently swallow it.
The feature either works or it doesn't. It cannot pretend to work.

**NEVER run COIE scoring against hardcoded data.**
If the real inventory is not available, log "inventory not available" and skip the cycle.
A false score is worse than no score.

**NEVER let a diagnostic report say "100% passing" when tests ran simulations.**
If you cannot test with real AWS resources: say "not tested — requires real AWS account."
Simulations are acceptable for development but must be labeled as simulations.

**NEVER call a function "deployed" if it returns 404.**
A deployed function returns 200 on OPTIONS preflight. 404 means not deployed.

**NEVER use `includes()` as the only method for incident diagnosis.**
Keyword matching as Tier 1 is acceptable. But `includes('OOMKilled')` MUST be supplemented
by at least severity scoring. The confidence number must be meaningful.

**NEVER let infra-teardown leave orphaned AWS resources.**
Every resource created by AutoStack MUST have the tag `autostack:deployment = [deployment_id]`.
Teardown MUST scan by tag as the final step to catch anything missed.

**NEVER ship a feature where a button click triggers nothing visible.**
Every user action must produce feedback within 100ms: loading state, spinner, toast, or navigation.
A button that appears to do nothing is worse than a disabled button.

**NEVER store secrets in database columns.**
All credentials (AWS keys, GitHub tokens, API keys) go through Supabase Vault.
The `cloud_credentials` table stores Vault secret IDs, not the credentials themselves.

## ALWAYS DO THESE

**Always write the agent token to a K8s ConfigMap after registration.**
The pod will restart. If the token is only in memory, re-registration fails.

**Always tag every AWS resource created with:**
```json
{
  "autostack:deployment": "[deployment_id]",
  "autostack:org": "[org_id]",
  "autostack:environment": "[environment_name]"
}
```

**Always broadcast provisioning progress via Realtime.**
Update `environments.provisioning_stage` at every major step.
Users watching the onboarding screen see real progress, not a spinner.

**Always check the Redis quota before sending ANY email:**
```typescript
const count = await redis.incr(`email:quota:${new Date().toISOString().split('T')[0]}`)
if (count === 1) await redis.expire(`email:quota:${todayKey}`, 86400)
if (count > 90) { /* log to Sentry, skip email, return gracefully */ return }
```

**Always add Redis TTL to every set() call:**
```typescript
await redis.set('key', value, { ex: 3600 })  // MANDATORY
// NEVER: await redis.set('key', value)  — this costs money over time
```

**Always unsubscribe Realtime channels on component unmount:**
```javascript
return () => supabase.removeChannel(channel)  // in every useEffect cleanup
```

---

# PART 6 — THE FINAL STATE THIS MUST REACH

When this prompt is complete, the following must be true:

A fresh user visits `autostack.io`.
They click "Get Started Free."
They complete signup — they receive a welcome email in their real inbox.
They connect their real AWS account — AutoStack verifies the IAM role via STS.
They paste their real GitHub repository URL.
They click "Deploy."
They watch real progress: "Provisioning VPC... Creating EKS cluster..."
13-22 minutes later: they receive a real HTTPS URL.
They open that URL in their browser.
The app they deployed returns HTTP 200.

THAT IS THE PRODUCT.
Everything else — the COIE scores, the AIRE incidents, the cost analysis,
the pipeline monitoring — all of it exists to make THAT experience better over time.

If the URL is not real, the product does not exist.
Nothing else matters until the URL is real.
