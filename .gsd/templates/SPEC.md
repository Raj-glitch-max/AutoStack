# SPEC.md — AutoStack

**Status: FINALIZED**
**Last Updated: 2026-03-16**
**Version: 2.0 (One-Click Deploy — User's Own Cloud)**

---

## Product Vision

AutoStack is a one-click deployment platform that provisions real cloud infrastructure on the user's own AWS account.

**The one-line promise:**
User pastes a GitHub URL → connects their AWS account → clicks Deploy → gets a live HTTPS URL in 13–22 minutes. Everything runs on THEIR AWS. AutoStack provides the intelligence layer.

**What makes AutoStack different from Railway/Render/Fly.io:**
Those platforms run your app on THEIR infrastructure. AutoStack runs it on YOURS.
Enterprise customers blocked from those platforms (SOC2, HIPAA, GDPR) can use AutoStack.

---

## Core User Flow (Must Work End-to-End)

```
1. User visits autostack.io
2. Signs up with email or GitHub OAuth
3. Receives welcome email in actual inbox
4. Lands on /onboarding
5. Step 1: Connects AWS account via IAM Role (CloudFormation or manual)
6. Step 2: Pastes GitHub repo URL + selects size
7. Clicks "Deploy"
8. Watches real progress: VPC → EKS → Build → Deploy
9. Gets live HTTPS URL that returns HTTP 200
10. Dashboard shows real metrics, real COIE scores, real AIRE incidents
```

**If step 9 produces null or a fake URL: the product does not exist.**

---

## The Three Engines

### DIE — Deployment Intelligence Engine
- Analyzes any Git repository (no YAML required from user)
- Detects language/framework from source files
- Generates production-grade Dockerfile + K8s manifests
- Opens a PR in the user's repo with everything generated
- Provisions real AWS infrastructure (VPC, EKS, ALB, ECR)
- Returns a live HTTPS URL

### COIE — Continuous Operational Intelligence Engine
- Runs every 5 minutes via pg_cron
- Scores cluster across 4 dimensions: Security, Reliability, Cost, Performance
- Reads REAL workload inventory from agent (not hardcoded data)
- Opens PRs with exact YAML fixes for discovered issues
- Shows projected monthly savings in dollars

### AIRE — Autonomous Incident Response Engine
- Triggered automatically when agent detects K8s Warning events
- Tier 1: Pattern matching (10 known patterns — OOM_KILL, APP_CRASH, etc.)
- Tier 2: OpenAI embeddings semantic search (confidence < 0.65 fallback)
- Writes root cause + immediate action + permanent fix to incidents table
- Sends email notification within 60 seconds of detection

---

## Tech Stack (FINAL — Do Not Change)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 | Already built |
| Backend | Supabase Edge Functions (Deno/TypeScript) | 23+ functions |
| Database | Supabase PostgreSQL 15 + pgvector | 16+ tables, RLS |
| Auth | Supabase Auth (email + GitHub OAuth) | auth-hook critical |
| Realtime | Supabase Realtime CDC | useData.js hooks |
| Cache/Queue | Upstash Redis | Rate limiting, quotas |
| Email | Resend | 3000 emails/month free |
| Analytics | PostHog | 1M events/month free |
| Errors | Sentry | tracesSampleRate: 0.1 |
| Cloud | AWS (EKS + VPC + ALB + ECR + CodeBuild) | User's own account |
| Agent | Go binary (client-go) | Helm chart deploy |
| Hosting | Vercel | Frontend |

---

## What Is NOT in Scope for v1.0

- GCP / Azure support (Phase 12 — post-launch)
- Multi-region deployments (Phase 13 — post-launch)
- Terraform provider (Phase 18 — post-launch)
- SSO / SAML (Phase 17 — post-launch)
- CLI tool (Phase 16 — post-launch)
- Marketplace templates (Phase 23 — post-launch)

**v1.0 = AWS only. Single region. EKS + ALB + ECR. Real URL. Stripe billing.**

---

## Success Criteria for v1.0

- [ ] Fresh user signup → welcome email in inbox within 60 seconds
- [ ] AWS IAM role connection via STS actually works (check CloudTrail)
- [ ] die-analyze opens a REAL PR with all 7 files (pr_url NOT null)
- [ ] infra-provision creates REAL VPC + EKS in user's AWS account
- [ ] Live URL returns HTTP 200
- [ ] COIE scores update in dashboard within 5 minutes
- [ ] AIRE diagnoses a test OOM incident within 10 seconds
- [ ] All 4 score cards show real values (not 0, not null)
- [ ] Realtime: manually changing DB value updates UI without page refresh
- [ ] Go agent binary compiles: `go build ./cmd/agent` succeeds
- [ ] npm run build: zero errors, no chunk over 500KB

---

## Known Gaps (Honest — Do Not Pretend These Are Done)

| Gap | Severity | Status |
|-----|----------|--------|
| Go agent binary does not exist as real deployable | P0 | Not built |
| pr_url is null after die-analyze | P0 | Broken |
| infra-provision tested with mocked AWS calls | P0 | Needs real test |
| GitHub App throws 404s on sub-repos | P1 | Intermittent |
| Log persistence — logs disappear when tab closes | P1 | Not implemented |
| Agent token rotation — manual only | P1 | Not implemented |
| COIE reads hardcoded data, not real inventory | P1 | Needs fix |
| AIRE uses includes() only, no confidence scoring | P1 | Needs upgrade |
