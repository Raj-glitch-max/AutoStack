# 🎨 AutoStack Complete User Experience & Backend Flow

## 📱 FRONTEND USER JOURNEY

### 1. LANDING PAGE
**URL:** `/`  
**Purpose:** Marketing and first impression

**Elements:**
- Hero section with value proposition
- "Get Started" CTA button
- Feature highlights
- Pricing preview
- Customer testimonials
- Footer with links

**User Actions:**
- Click "Get Started" → Redirects to `/onboarding`
- Click "Sign In" → Clerk authentication modal
- Browse features → Scroll through landing page

---

### 2. ONBOARDING FLOW (3 Steps)
**URL:** `/onboarding`  
**Purpose:** Connect cloud, deploy first app

#### STEP 1: Connect Your Cloud ☁️

**UI Elements:**
- Step indicator (1 of 3)
- Cloud provider tabs: AWS | GCP | Azure
- AWS form fields:
  - Account ID (12 digits)
  - Preferred Region (dropdown)
  - IAM Role ARN (text input)
- "Create role in 2 minutes" helper link
- "Verify & Continue" button

**User Input:**
```
Account ID: 367749063363
Region: us-east-1
Role ARN: arn:aws:iam::367749063363:role/AutoStackDeploymentRole
```

**Backend Call:**
```javascript
POST /functions/v1/aws-assume-role
Body: {
  account_id: "367749063363",
  region: "us-east-1",
  role_arn: "arn:aws:iam::367749063363:role/AutoStackDeploymentRole",
  display_name: "My AWS Account"
}
```

**Backend Logic:**
1. Validate account ID format (12 digits)
2. Validate role ARN format
3. Try to assume the IAM role using AWS STS
4. If successful, save to `cloud_credentials` table
5. Return success with credential_id

**Success Response:**
```json
{
  "success": true,
  "verified": true,
  "credential_id": "uuid-here",
  "account_id": "367749063363",
  "region": "us-east-1",
  "message": "AWS IAM role verified successfully"
}
```

**Error Handling:**
- Invalid account ID → "Account ID must be 12 digits"
- Invalid role ARN → "Invalid IAM role ARN format"
- Access denied → "Cannot assume role. Check trust policy"
- Network error → "Failed to reach verification service"

---

#### STEP 2: Deploy Your First Project 🚀

**UI Elements:**
- Step indicator (2 of 3)
- Repository URL input
- Infrastructure size selector (3 cards):
  - **Small** - $211/mo - 2 nodes, 2 vCPU, 4GB RAM
  - **Medium** - $334/mo - 3 nodes, 4 vCPU, 8GB RAM  
  - **Large** - $559/mo - 4 nodes, 8 vCPU, 16GB RAM
- "Analyze & Deploy" button

**User Input:**
```
Repository: https://github.com/user/my-app
Size: small
```

**Backend Calls (Sequential):**

**Call 1: Get GitHub Installation**
```javascript
GET /rest/v1/integrations?select=installation_id&limit=1
```

**Call 2: Create Project**
```javascript
POST /rest/v1/projects
Body: {
  name: "my-app",
  repo_url: "https://github.com/user/my-app",
  cloud_credential_id: "credential-uuid",
  org_id: "org-uuid",
  environment: "production",
  provisioning_status: "pending"
}
```

**Call 3: Trigger DIE Analysis**
```javascript
POST /functions/v1/die-analyze
Body: {
  project_id: "project-uuid",
  installation_id: "github-install-id",
  size: "small"
}
```

**Backend Logic (DIE Engine):**
1. **Fetch Repository Files** - Get file tree from GitHub
2. **Detect Framework** - Analyze package.json, requirements.txt, etc.
3. **Generate Dockerfile** - If not present, create one
4. **Generate K8s Manifests** - Deployment, Service, Ingress, HPA
5. **Calculate Costs** - Based on size and detected stack
6. **Create GitHub PR** - With all generated files
7. **Return Analysis** - Framework, cost, PR URL

**DIE Response:**
```json
{
  "success": true,
  "stack": "Node.js/Express",
  "estimated_cost": 211,
  "pr_url": "https://github.com/user/my-app/pull/1",
  "manifests_generated": [
    "k8s/deployment.yaml",
    "k8s/service.yaml",
    "Dockerfile"
  ]
}
```

**Deployment Progress UI:**
Shows 4 stages with status (pending/running/done):
1. Analyzing repository... (1-2 min)
2. Planning infrastructure... (30 sec)
3. Provisioning VPC & EKS... (5-8 min)
4. Building Docker image... (2-3 min)

**Terminal Window:**
Shows real-time logs:
```
[2026-03-16 14:02:11] STAGE 1: Repository analysis started...
[2026-03-16 14:02:14] DETECTED: Node.js 20 + Express
[2026-03-16 14:02:16] STAGE 2: Planning infrastructure for small profile...
[2026-03-16 14:02:18] VPC created: vpc-0a2b3c4d5e (us-east-1)
[2026-03-16 14:02:20] Provisioning EKS Cluster (Control Plane)...
```

**Polling Logic:**
Frontend polls `/rest/v1/projects?id=project-uuid` every 4 seconds to check:
- `die_stage` - Current deployment stage
- `provisioning_status` - pending/provisioning/live/failed
- `live_url` - Final deployment URL

---

#### STEP 3: It's Live! 🎉

**UI Elements:**
- Success animation (confetti)
- Live URL with external link icon
- Infrastructure health status:
  - EKS Cluster: Healthy (3 nodes)
  - Load Balancer: Active
  - AIRE Engine: Monitoring Active
- Infrastructure Score: 98/100 (animated counter)
- Progress bar showing score
- "Open Dashboard" button

**User Actions:**
- Click live URL → Opens deployed app in new tab
- Click "Open Dashboard" → Navigate to `/dashboard`

---

### 3. MAIN DASHBOARD
**URL:** `/dashboard/:tab`  
**Purpose:** Manage all infrastructure and deployments

#### SIDEBAR (220px fixed)

**Org Switcher:**
- Organization logo/name
- Dropdown to switch orgs
- Click logo → Back to landing page

**Cluster Badge:**
- Active cluster name
- Health score (98%)
- Provider (AWS) and region (us-east-1)
- Status dot (green = healthy, amber = warning)

**Navigation Menu:**
1. 🏠 Environments
2. 🚀 Deployments
3. 💰 Cloud Cost
4. 🗺️ Infra Map
5. 📊 Observability
6. 📄 Global Logs
7. 🚨 Incidents
8. ⚙️ Settings

**Bottom Section:**
- User avatar (Clerk UserButton)
- Logout option

---

#### TAB 1: ENVIRONMENTS 🏠
**Purpose:** View and manage all deployed environments

**UI Elements:**
- Search bar
- Filter by status (All/Live/Stopped)
- Environment cards showing:
  - Name and status
  - Provider and region
  - Health score
  - Cost per month
  - Last deployed time
  - Quick actions (View, Stop, Delete)

**Backend:**
```javascript
GET /rest/v1/clusters?org_id=eq.{org_id}
```

---

#### TAB 2: DEPLOYMENTS 🚀
**Purpose:** Deploy new apps and view deployment history

**UI Elements:**
- "New Deployment" button
- Deployment form:
  - Repository URL
  - Branch selection
  - Environment (production/staging/dev)
  - Size profile (small/medium/large)
  - Advanced options (env vars, secrets)
- Deployment history table:
  - Timestamp
  - Repository
  - Status (success/failed/in-progress)
  - Duration
  - Deployed by
  - Actions (View logs, Rollback)

**Backend:**
```javascript
POST /functions/v1/die-analyze
GET /rest/v1/deployments?org_id=eq.{org_id}
```

---

#### TAB 3: CLOUD COST 💰
**Purpose:** Track and optimize cloud spending

**UI Elements:**
- Current month cost (large number)
- Cost trend chart (last 30 days)
- Cost breakdown by service:
  - EKS Control Plane: $73
  - Worker Nodes: $138
  - Load Balancer: $23
  - NAT Gateway: $33
  - Storage: $9
- Cost anomaly alerts
- Optimization recommendations
- Budget alerts setup

**Backend:**
```javascript
GET /rest/v1/projects?select=estimated_monthly_cost
GET /functions/v1/cost-anomaly-check
```

---

#### TAB 4: INFRA MAP 🗺️
**Purpose:** Visual representation of infrastructure

**UI Elements:**
- Interactive diagram showing:
  - VPC with subnets
  - EKS cluster with nodes
  - Load balancer
  - NAT gateway
  - Pods and services
- Click any component → Show details
- Real-time status indicators

**Backend:**
```javascript
GET /rest/v1/clusters?id=eq.{cluster_id}
GET /rest/v1/projects?cluster_id=eq.{cluster_id}
```

---

#### TAB 5: OBSERVABILITY 📊
**Purpose:** Monitor application performance

**UI Elements:**
- Metrics dashboard:
  - CPU usage
  - Memory usage
  - Request rate
  - Error rate
  - Response time
- Time range selector (1h/6h/24h/7d/30d)
- Alert rules configuration
- Integration with Datadog/New Relic

**Backend:**
```javascript
GET /rest/v1/metrics?cluster_id=eq.{cluster_id}
```

---

#### TAB 6: GLOBAL LOGS 📄
**Purpose:** Search and view all logs

**UI Elements:**
- Search bar with filters
- Log level filter (info/warn/error)
- Time range selector
- Log stream (real-time)
- Export logs button

**Backend:**
```javascript
GET /rest/v1/debug_logs?org_id=eq.{org_id}
```

---

#### TAB 7: INCIDENTS 🚨
**Purpose:** View and manage incidents

**UI Elements:**
- Active incidents count
- Incident list:
  - Severity (critical/high/medium/low)
  - Title and description
  - Affected service
  - Time detected
  - Status (open/investigating/resolved)
  - Assigned to
- AIRE recommendations
- Incident timeline

**Backend:**
```javascript
GET /rest/v1/incidents?org_id=eq.{org_id}
GET /functions/v1/aire-detect
```

---

#### TAB 8: SETTINGS ⚙️
**Purpose:** Configure platform settings

**Sections:**
1. **General** - Org name, logo, timezone
2. **Cloud Credentials** - Manage AWS/GCP/Azure accounts
3. **Integrations** - GitHub, Slack, PagerDuty
4. **Team** - Invite members, manage roles
5. **Billing** - Subscription, payment method
6. **Security** - SSO, 2FA, audit logs
7. **Compliance** - SOC2, GDPR settings

---

## 🔧 BACKEND ARCHITECTURE

### Edge Functions (29+)

**Authentication & Auth:**
- `auth-hook` - Creates org on signup
- `cli-auth-start/poll/approve` - CLI authentication

**AWS Integration:**
- `aws-assume-role` - Verify IAM role
- `aws-assume-role-v2` - Simplified version

**Deployment Engine:**
- `die-analyze` - Detect framework, generate manifests
- `infra-provision` - Provision EKS cluster
- `infra-teardown` - Destroy infrastructure
- `build-and-deploy` - Build Docker, deploy to K8s
- `deploy-preview` - Create preview environment
- `deploy-redeploy` - Redeploy existing app

**GitHub Integration:**
- `github-webhook` - Handle push/PR events
- `github-callback` - OAuth callback
- `github-app-callback` - GitHub App installation

**Monitoring & Incidents:**
- `aire-detect` - AI incident detection
- `coie-cycle` - Cost optimization
- `coie-fix` - Apply cost optimizations

**Cost Management:**
- `cost-anomaly-check` - Detect cost spikes

**Database:**
- `provision-database` - Create RDS/managed DB

**Notifications:**
- `send-notification` - Slack/email/PagerDuty

**Billing:**
- `stripe-webhook` - Handle Stripe events
- `stripe-checkout` - Create checkout session

**Marketplace:**
- `api-databases` - Managed database API
- `api-domains` - Custom domain API
- `api-environments` - Environment API

---

## 🎯 PROFESSIONAL OPTIONS TO ADD

### 1. DEPLOYMENT OPTIONS
**Current:** Only 3 sizes (small/medium/large)

**Professional Options:**
- **Micro** ($89/mo) - 1 × t3.small - Dev/testing
- **Small** ($211/mo) - 2 × t3.medium - Small apps
- **Medium** ($334/mo) - 3 × t3.large - Production
- **Large** ($559/mo) - 4 × t3.xlarge - High traffic
- **X-Large** ($1,089/mo) - 6 × t3.2xlarge - Enterprise
- **Custom** - User specifies exact instance types

**Advanced Options:**
- Multi-region deployment
- Auto-scaling rules (min/max nodes)
- Spot instances for cost savings
- Reserved instances for predictable workloads
- GPU instances for ML workloads

### 2. ENVIRONMENT TYPES
**Current:** Only "production"

**Professional Options:**
- **Production** - Full resources, monitoring
- **Staging** - 50% of production resources
- **Development** - Minimal resources, auto-sleep
- **Preview** - Ephemeral, per-PR environments
- **Testing** - For automated tests

### 3. DEPLOYMENT STRATEGIES
**Current:** Basic deployment

**Professional Options:**
- **Rolling Update** - Zero downtime (default)
- **Blue-Green** - Switch traffic instantly
- **Canary** - Gradual rollout (10%/50%/100%)
- **A/B Testing** - Split traffic for testing

### 4. MONITORING & ALERTS
**Current:** Basic health checks

**Professional Options:**
- **Custom Metrics** - Define your own
- **Alert Rules** - CPU > 80%, Memory > 90%
- **Notification Channels** - Slack, PagerDuty, Email
- **SLA Monitoring** - Track uptime, response time
- **Error Tracking** - Sentry integration

### 5. COST OPTIMIZATION
**Current:** Static pricing

**Professional Options:**
- **Cost Alerts** - Alert when > budget
- **Savings Recommendations** - Use spot instances
- **Resource Right-Sizing** - Downsize underutilized
- **Scheduled Scaling** - Scale down at night
- **Reserved Instance Planner** - Save 30-60%

### 6. SECURITY & COMPLIANCE
**Current:** Basic RLS

**Professional Options:**
- **SSO Integration** - Okta, Auth0, Azure AD
- **RBAC** - Fine-grained permissions
- **Audit Logs** - Track all actions
- **Secrets Management** - Vault integration
- **Network Policies** - Restrict pod communication
- **SOC2 Automation** - Compliance checks

### 7. ADVANCED FEATURES
**Professional Options:**
- **GitOps** - Argo CD integration
- **Service Mesh** - Istio for traffic management
- **Observability** - Distributed tracing
- **Backup & DR** - Automated backups, disaster recovery
- **Multi-Cloud** - Deploy to AWS + GCP
- **Edge Locations** - CDN integration

---

See `USER_EXPERIENCE_BACKEND_LOGIC.md` for complete backend flow details.
