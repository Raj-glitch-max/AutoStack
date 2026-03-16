# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — PHASES 16–20 EXECUTION PLAN                                 ║
# ║  CLI · SSO · Terraform Provider · Integrations · SOC2                    ║
# ║  Prerequisite: Phases 1–15 complete. System health: 100% green.          ║
# ║  For: Antigravity AI IDE                                                  ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

---

# PREAMBLE — WHAT CHANGES NOW

You have a complete product. Users can deploy, environments run, billing works,
multi-cloud is live, on-prem ships to enterprise, databases provision automatically.

Phases 16–20 are NOT about building more infrastructure.
They are about making AutoStack the obvious choice over every competitor.

After Phase 15 you win on: "your cloud, not ours."
After Phase 20 you win on every dimension:

  Phase 16 — CLI:           Developers deploy from terminal. No browser required.
  Phase 17 — SSO:           Enterprise IT can mandate AutoStack via their IdP.
  Phase 18 — Terraform:     Infra teams manage AutoStack as code. No ClickOps.
  Phase 19 — Integrations:  AutoStack fits into existing toolchain (PD, Datadog, Jira).
  Phase 20 — SOC2:          Security teams can approve AutoStack without a questionnaire.

Each phase is independently shippable. No hard dependencies between them.
Recommended ship order: 16 → 17 → 19 → 18 → 20 (fastest to revenue impact).

---

# ADDENDUM RULES FOR PHASES 16–20

All previous rules (A through O) still apply without exception.
These extend them for new contexts.

---

## RULE GROUP P — CLI STANDARDS

### P1 — CLI Is a First-Class Client, Not a Thin Wrapper
The CLI does not call the dashboard's frontend API.
It calls the same Edge Functions the frontend calls — directly, using a stored JWT.
Every operation available in the dashboard must be available in the CLI.
Every CLI command must have a `--json` flag for machine-readable output.

### P2 — CLI Credentials Are Stored Securely Per OS
```
macOS:   Keychain (via go-keyring or similar)
Linux:   Secret Service API (libsecret) or fallback to ~/.config/autostack/credentials (0600 permissions)
Windows: Windows Credential Manager
NEVER:   plaintext in ~/.autostack/config or environment variables unless user explicitly exports them
```

### P3 — CLI Is Idempotent
Running the same CLI command twice must not double-provision, double-deploy, or
create duplicate records. Every write command checks existing state before acting.
```bash
autostack deploy --env production  # second call on same repo = reuses existing env
```

### P4 — CLI Output Follows POSIX Exit Code Convention
```
Exit 0:  success
Exit 1:  operational failure (e.g., deploy failed, auth invalid)
Exit 2:  usage error (e.g., missing required flag, invalid argument)
Exit 3:  rate limited (specific code so scripts can implement backoff)
```
Never exit 0 on failure. Never exit non-zero on success.
Scripts that pipe to `jq` depend on this. Silent wrong behavior is worse than visible errors.

### P5 — CLI Progress Output Goes to stderr, JSON to stdout
Long-running commands (deploy, provision) stream progress to stderr.
Final machine-readable result goes to stdout.
This allows: `autostack deploy 2>/dev/null | jq .live_url`

---

## RULE GROUP Q — SSO STANDARDS

### Q1 — SSO Is SAML 2.0 + OIDC (Both, Not Either/Or)
Enterprise customers use different IdPs:
- Okta, Azure AD, ADFS → SAML 2.0
- Google Workspace, Auth0, Cognito → OIDC

Supporting only one eliminates half the enterprise market. Build both.
Use GoTrue (Supabase Auth's open-source backing) which supports both.

### Q2 — JIT Provisioning: Users Are Created on First SSO Login
Just-In-Time provisioning: when a user from an SSO-enabled org logs in for the first time,
their account is automatically created and assigned the default role.
No manual invitation required. No pre-seeding of user lists.
The admin sets the default role (viewer / developer) in SSO settings.

### Q3 — SSO Does Not Break Existing Email/Password Auth
Existing users who signed up with email/password before SSO was configured
must still be able to log in. SSO is additive, not a replacement.
Exception: "SSO Enforced" mode (enterprise setting) can block email/password login.
Default: SSO is optional, email/password always works.

### Q4 — IdP-Initiated Login Is Supported
Some enterprise setups launch AutoStack from the IdP portal (Okta tile, GSuite app).
This sends a SAML assertion to AutoStack without AutoStack initiating the flow.
AutoStack must handle this flow (unsolicited SAML Response).

---

## RULE GROUP R — TERRAFORM PROVIDER STANDARDS

### R1 — Terraform Provider Is Read/Write, Not Import-Only
Users can CREATE environments via Terraform, not just import existing ones.
`terraform apply` → AutoStack provisions infrastructure.
`terraform destroy` → AutoStack tears down infrastructure.
This is the same as the dashboard deploy flow, triggered via API.

### R2 — Terraform State Must Match AutoStack State
When a user creates an environment via Terraform and then makes changes via the dashboard,
`terraform plan` must show those changes as drift.
The provider fetches live state from AutoStack API on every plan.

### R3 — Sensitive Outputs Are Marked sensitive = true
Terraform output values like `live_url` are fine to show.
Output values like connection strings (if exposed) must be `sensitive = true`.
Never output database passwords. Use Vault instead and have the app fetch them.

---

## RULE GROUP S — INTEGRATIONS STANDARDS

### S1 — Integrations Are Modular: Adding One Does Not Affect Others
Each integration (Datadog, PagerDuty, Jira, Slack) is a separate module.
A bug in the PagerDuty integration cannot crash the Datadog integration.
Each integration has its own Edge Function, its own config schema in `integrations.config`,
its own enable/disable toggle, and its own error state.

### S2 — Integration Failures Are Non-Blocking
When AutoStack tries to post to Slack and Slack returns 429 or 500,
the primary operation (COIE finding saved, incident diagnosed) must SUCCEED.
Notifications are best-effort. The platform is not best-effort.
Pattern: wrap all integration calls in `try-catch`, log to Sentry, never throw.

### S3 — Webhooks Out Are Signed
When AutoStack sends a webhook to a user's endpoint (e.g., custom webhook integration),
sign the payload with HMAC-SHA256 using a per-integration secret.
Include the signature in `X-AutoStack-Signature: sha256=[hex]`.
This allows the user's endpoint to verify the payload came from AutoStack.

---

## RULE GROUP T — SOC2 STANDARDS

### T1 — SOC2 Is About Evidence, Not Just Implementation
SOC2 Type II requires evidence that controls were in place consistently over time (6 months minimum).
It is not enough to implement controls — you must LOG that controls are working.
Every security check that AutoStack performs must produce a log entry in `audit_log`.

### T2 — Penetration Test Before Submitting for SOC2
Hire a third-party pen tester before starting the SOC2 audit.
Fix all critical and high findings. Medium findings must have accepted risk documentation.
The pen test report becomes evidence for the SOC2 auditor.

### T3 — Data Retention Policy Is Explicit and Enforced
SOC2 requires a documented data retention policy AND automated enforcement.
Logs: 90 days. Audit events: 1 year. User data after cancellation: 30 days.
Every pg_cron cleanup job must have a comment referencing the retention policy section.

---

# ══════════════════════════════════════════════════════════════════
# PHASE 16 — AUTOSTACK CLI
# Branch: feature/phase16-cli
# Goal: `npm install -g autostack-cli` → developers deploy from terminal.
#       Full feature parity with dashboard. Machine-readable JSON output.
#       Works in CI/CD pipelines without modification.
# ══════════════════════════════════════════════════════════════════

## TASK 16.1 — CLI Architecture & Authentication

### Repository: `github.com/autostack/autostack-cli`
Language: TypeScript (Node.js) — not Go. Reason: npm distribution is simpler,
engineers already have Node.js, and the CLI calls HTTP APIs (no K8s SDK needed).

### Directory structure
```
autostack-cli/
├── src/
│   ├── commands/
│   │   ├── auth/
│   │   │   ├── login.ts          ← autostack auth login
│   │   │   ├── logout.ts         ← autostack auth logout
│   │   │   └── whoami.ts         ← autostack auth whoami
│   │   ├── deploy/
│   │   │   ├── index.ts          ← autostack deploy [options]
│   │   │   ├── redeploy.ts       ← autostack redeploy [env]
│   │   │   └── rollback.ts       ← autostack rollback [env]
│   │   ├── env/
│   │   │   ├── list.ts           ← autostack env list
│   │   │   ├── create.ts         ← autostack env create
│   │   │   ├── delete.ts         ← autostack env delete
│   │   │   └── status.ts         ← autostack env status [env-name]
│   │   ├── logs/
│   │   │   └── index.ts          ← autostack logs [env] [--follow]
│   │   ├── vars/
│   │   │   ├── list.ts           ← autostack vars list [env]
│   │   │   ├── set.ts            ← autostack vars set KEY=value [env]
│   │   │   └── delete.ts         ← autostack vars delete KEY [env]
│   │   ├── cost/
│   │   │   └── index.ts          ← autostack cost [env]
│   │   └── incidents/
│   │       └── index.ts          ← autostack incidents [env]
│   ├── lib/
│   │   ├── api.ts                ← typed API client (wraps fetch to Edge Functions)
│   │   ├── auth.ts               ← credential storage (keychain per OS)
│   │   ├── config.ts             ← reads autostack.json from project root
│   │   ├── output.ts             ← table/JSON/spinner output utilities (RULE P5)
│   │   ├── progress.ts           ← live deploy progress (Realtime subscription)
│   │   └── errors.ts             ← typed error handling (RULE P4)
│   └── index.ts                  ← entry point, command registration
├── package.json
├── tsconfig.json
└── README.md
```

### CLI login flow (device code flow — works in headless environments)
```typescript
// src/commands/auth/login.ts
// No browser auto-open in CI. Use device code flow.

// Step 1: CLI requests a device code from AutoStack API
// POST /functions/v1/cli-auth-start
// Response: { device_code, user_code, verification_uri, expires_in, interval }

// Step 2: CLI prints to terminal:
// ╔══════════════════════════════════════════╗
// ║  Open: https://autostack.io/cli-auth     ║
// ║  Enter code: XKCD-9847                  ║
// ╚══════════════════════════════════════════╝
// Waiting for authentication...

// Step 3: CLI polls /functions/v1/cli-auth-poll every `interval` seconds
// Until: { status: 'authorized', access_token, refresh_token } OR timeout

// Step 4: Store tokens securely (RULE P2)
// On success: display "✓ Logged in as raj@example.com (AutoStack Pro)"

// Step 5: All subsequent API calls use the stored access_token
// Auto-refresh when access_token expires using refresh_token
```

### `autostack.json` project config file
```json
{
  "project": "my-api",
  "environments": {
    "production": {
      "provider": "aws",
      "region": "us-east-1",
      "size": "medium",
      "branch": "main"
    },
    "staging": {
      "provider": "aws",
      "region": "us-east-1",
      "size": "small",
      "branch": "develop"
    }
  }
}
```

### Edge Functions needed for CLI
```typescript
// supabase/functions/cli-auth-start/index.ts
// POST — no auth required (generates device code)
// Stores device_code + user_code in Redis with 15-min TTL
// Returns: { device_code, user_code, verification_uri, expires_in, interval }

// supabase/functions/cli-auth-poll/index.ts
// POST { device_code }
// Checks Redis: has this device_code been authorized via the web UI?
// Returns: { status: 'pending' | 'authorized' | 'expired', access_token?, refresh_token? }

// supabase/functions/cli-auth-approve/index.ts
// POST — REQUIRES web browser auth (user is logged in to dashboard)
// { user_code } — user enters this on the web UI
// Marks the device as authorized in Redis, stores the user's tokens
```

### Complete command specifications

```bash
# AUTH
autostack auth login            # device code flow, stores credentials securely
autostack auth logout           # clears stored credentials
autostack auth whoami           # prints: "raj@example.com (Pro) · org: MyCompany"

# DEPLOY (long-running — streams progress to stderr, final JSON to stdout)
autostack deploy                # reads autostack.json, deploys all envs
autostack deploy --env prod     # deploys specific environment
autostack deploy --repo https://github.com/org/repo --env prod --size medium --provider aws --region us-east-1
autostack deploy --json         # progress to stderr, final {live_url, cost, ...} to stdout
autostack deploy --dry-run      # shows infra plan + cost estimate, does NOT provision

autostack redeploy              # triggers redeploy of current commit
autostack redeploy --env prod   # specific environment
autostack rollback              # rolls back to previous deployment
autostack rollback --to sha:abc123  # rolls back to specific commit SHA

# ENVIRONMENTS
autostack env list              # table of all envs: name, status, URL, cost, last deploy
autostack env list --json       # machine-readable
autostack env status prod       # detailed status for one environment
autostack env delete prod       # with confirmation prompt: "Type 'prod' to confirm deletion"
autostack env delete prod --yes # skip confirmation (for CI scripts)

# LOGS (RULE P5 — streaming, Ctrl+C to stop)
autostack logs prod             # last 100 lines
autostack logs prod --follow    # live stream (tails Supabase Realtime)
autostack logs prod --pod api-xx-yy  # specific pod
autostack logs prod --since 1h  # logs from last 1 hour
autostack logs prod --level error  # filter by level

# ENV VARS (environment variables for deployed apps)
autostack vars list prod        # table of keys (values masked for secrets)
autostack vars set DATABASE_URL=postgres://... --env prod  # secret auto-detected
autostack vars set NODE_ENV=production --env prod --not-secret  # force non-secret
autostack vars delete DATABASE_URL --env prod
autostack vars import .env.production --env prod  # import from .env file

# COST
autostack cost                  # current month cost across all environments
autostack cost prod             # cost for specific environment
autostack cost --savings        # list of COIE savings opportunities

# INCIDENTS
autostack incidents             # active incidents across all environments
autostack incidents prod        # incidents for specific environment
autostack incidents --resolved  # include resolved incidents

# DATABASES
autostack db list               # list all managed databases
autostack db create --engine postgres --size small --env prod
autostack db connect prod       # opens psql with DATABASE_URL (never prints password)
autostack db rotate-password prod  # rotates DB password, restarts pods
```

### Output formatting utility
```typescript
// src/lib/output.ts

import Table from 'cli-table3'  // npm package for terminal tables
import chalk from 'chalk'        // terminal colors

// RULE P5: all progress to stderr, data to stdout
export const progress = {
  start: (msg: string) => process.stderr.write(`⟳  ${msg}\n`),
  step:  (msg: string) => process.stderr.write(`   ${chalk.gray(msg)}\n`),
  done:  (msg: string) => process.stderr.write(`${chalk.green('✓')}  ${msg}\n`),
  error: (msg: string) => process.stderr.write(`${chalk.red('✗')}  ${msg}\n`),
  warn:  (msg: string) => process.stderr.write(`${chalk.yellow('⚠')}  ${msg}\n`),
}

// Terminal table for human output
export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({ head: headers.map(h => chalk.bold(h)) })
  rows.forEach(row => table.push(row))
  console.log(table.toString())
}

// JSON output for --json flag (RULE P1)
export function printJSON(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

// Status badge
export function statusBadge(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    live:         chalk.green,
    deploying:    chalk.blue,
    failed:       chalk.red,
    provisioning: chalk.yellow,
    deleted:      chalk.gray,
  }
  return (colors[status] || chalk.white)(status)
}
```

### CI/CD usage examples (in docs)
```yaml
# .github/workflows/deploy.yml
- name: Deploy to production
  run: |
    npx autostack-cli deploy --env production --json > deploy-result.json
    cat deploy-result.json | jq .live_url

# With environment variables (no stored credentials needed in CI)
env:
  AUTOSTACK_TOKEN: ${{ secrets.AUTOSTACK_TOKEN }}  # personal access token
```

### VERIFY Task 16.1
```
□ npm install -g autostack-cli → installs without errors on macOS, Linux, Windows
□ autostack auth login → shows device code, browser auth works, token stored securely
□ autostack auth whoami → shows correct email and plan
□ Stored credentials: NOT plaintext in ~/.autostack/config (use keychain or 0600 file)
□ autostack deploy --env production (with valid autostack.json) → full deploy, live URL printed
□ autostack deploy → Exit 0 on success, Exit 1 on failure
□ autostack deploy --json 2>/dev/null | jq .live_url → outputs just the URL
□ autostack logs prod --follow → streams real logs, Ctrl+C exits cleanly (no zombie process)
□ autostack vars set SECRET_KEY=abc123 → marked as secret, stored in Vault
□ autostack vars list prod → SECRET_KEY shows "••••••••" not the value
□ autostack env delete prod (without --yes) → prompts for confirmation, deletion blocked if wrong name typed
□ CI mode: AUTOSTACK_TOKEN env var works as auth (no keychain needed)
□ autostack --version → prints version, Exit 0
□ autostack deploy --dry-run → shows infra plan, DOES NOT create any AWS resources
□ RULE P4: autostack env status nonexistent-env → Exit 1 (not 0)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #13] — CLI COMPLETENESS
## Open audit tool. Complete Section 13: "CLI & Developer Experience"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 17 — ENTERPRISE SSO: SAML 2.0 + OIDC
# Branch: feature/phase17-sso
# Goal: Enterprise IT mandates AutoStack through their IdP.
#       Users log in via Okta, Azure AD, Google Workspace — zero password.
#       JIT provisioning creates accounts automatically on first login.
# ══════════════════════════════════════════════════════════════════

## TASK 17.1 — SAML 2.0 Integration

### How SAML works with AutoStack
```
Identity Provider (IdP): Okta / Azure AD / ADFS / OneLogin
Service Provider (SP):   AutoStack

Flow:
  1. User clicks "Sign in with SSO" on AutoStack login page
  2. AutoStack redirects to IdP (SP-initiated) with SAML AuthnRequest
  3. User authenticates at IdP (their company login)
  4. IdP redirects back to AutoStack with SAML Response (signed XML)
  5. AutoStack validates signature, extracts user attributes
  6. AutoStack creates user account if first login (JIT provisioning — RULE Q2)
  7. AutoStack creates Supabase session, user is logged in

IdP-initiated flow (RULE Q4):
  1. User opens Okta → clicks AutoStack tile
  2. Okta sends SAML Response directly to AutoStack (no AuthnRequest)
  3. AutoStack handles unsolicited SAML Response
  4. Rest is same as steps 5-7 above
```

### New DB tables
```sql
-- supabase/migrations/008_sso.sql

CREATE TABLE IF NOT EXISTS sso_configurations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  protocol        TEXT        NOT NULL,
    -- 'saml' | 'oidc'
  status          TEXT        NOT NULL DEFAULT 'inactive',
    -- inactive | active | error
  enforced        BOOLEAN     DEFAULT FALSE,
    -- When true: email/password login blocked for this org (RULE Q3)
  default_role    TEXT        NOT NULL DEFAULT 'developer',
    -- Role assigned to new users on JIT provisioning
  allowed_domains TEXT[],
    -- Email domains that auto-join this org (e.g., ['mycompany.com'])

  -- SAML-specific
  idp_entity_id   TEXT,       -- IdP's entityID from their metadata XML
  idp_sso_url     TEXT,       -- IdP's SingleSignOnService URL
  idp_certificate TEXT,       -- IdP's X.509 signing certificate (PEM)
  sp_entity_id    TEXT,       -- AutoStack's entityID for this org
  sp_acs_url      TEXT,       -- AutoStack's Assertion Consumer Service URL

  -- OIDC-specific
  oidc_client_id      TEXT,
  oidc_client_secret_vault_id UUID,  -- stored in Vault (RULE O1 equivalent)
  oidc_discovery_url  TEXT,   -- e.g., https://accounts.google.com/.well-known/openid-configuration
  oidc_scopes         TEXT[], -- ['openid', 'email', 'profile']

  -- Attribute mapping (IdP attribute name → AutoStack field)
  attribute_map   JSONB DEFAULT '{
    "email":       "email",
    "firstName":   "first_name",
    "lastName":    "last_name",
    "groups":      "groups"
  }',

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sso_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sso_config_admin_only" ON sso_configurations
  FOR ALL USING (
    org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid
    AND (auth.jwt()->'user_metadata'->>'role')::text IN ('owner', 'admin')
  );
```

### Edge Function: `saml-callback/index.ts`
```typescript
// Handles POST from IdP after authentication (the ACS URL)
// URL: POST /functions/v1/saml-callback?org_id=[org_id]

// STEP 1 — Parse SAML Response (base64-decoded XML)
// STEP 2 — Validate signature:
//   Load IdP certificate from sso_configurations for this org
//   Verify XML signature against the certificate
//   Check assertion is not expired (check NotOnOrAfter)
//   Check InResponseTo matches our AuthnRequest ID (prevents replay — RULE K1 equivalent)
//   Check Destination matches our ACS URL

// STEP 3 — Extract user attributes from assertion:
//   NameID → email (usually)
//   AttributeStatement → map using sso_configurations.attribute_map

// STEP 4 — JIT Provisioning (RULE Q2):
//   Look up user by email in auth.users
//   If not found AND email domain in sso_configurations.allowed_domains:
//     Create user via supabase.auth.admin.createUser()
//     Add to org_members with sso_configurations.default_role
//     Set user_metadata: { org_id, role, sso_provider: 'saml' }
//   If found: update user's sso_provider metadata

// STEP 5 — Create Supabase session:
//   supabase.auth.admin.generateLink({ type: 'magiclink', email }) → exchange for session
//   OR: create a custom JWT signed with Supabase JWT secret
//   Redirect to dashboard with session established

// SECURITY CHECKS (all must pass before any user creation):
// - Valid XML signature ← CRITICAL: without this, anyone can forge SAML assertions
// - Assertion not expired
// - Issuer matches idp_entity_id in DB
// - ACS URL in Destination matches our URL
// - One-time use (store assertion ID in Redis for 24h, reject duplicates)
```

### Edge Function: `oidc-callback/index.ts`
```typescript
// Handles OAuth2 callback for OIDC providers (Google, Auth0, etc.)
// URL: GET /functions/v1/oidc-callback?code=[code]&state=[state]

// STEP 1 — Validate CSRF state (same pattern as GitHub OAuth from Phase 6)
// STEP 2 — Exchange code for tokens at discovery_url token endpoint
// STEP 3 — Fetch user info from userinfo endpoint
// STEP 4 — Validate id_token: signature, iss, aud, exp
// STEP 5 — JIT provisioning (same as SAML above)
// STEP 6 — Create Supabase session

// Note: OIDC is significantly simpler than SAML.
// If a customer has a choice, recommend OIDC.
```

### Frontend: SSO settings UI

```jsx
// src/components/settings/SSOSettings.jsx
// Tab in Settings → Security → SSO

// SECTION 1: Protocol selector
// [SAML 2.0] [OpenID Connect]  ← toggle

// SECTION 2: SAML configuration form
// IdP Metadata URL: [input] [Import from URL]
//   OR
// Manual fields:
//   Entity ID: [input]
//   SSO URL: [input]
//   X.509 Certificate: [textarea]
//
// SP Metadata section (read-only, for user to paste into their IdP):
// ┌──────────────────────────────────────────────────────────┐
// │ Your AutoStack SP Metadata                               │
// │ Entity ID: https://autostack.io/saml/[org_id]           │
// │ ACS URL:   https://autostack.io/saml/[org_id]/callback  │
// │ [Copy Entity ID]  [Copy ACS URL]  [Download SP Metadata] │
// └──────────────────────────────────────────────────────────┘

// SECTION 3: Attribute mapping
// [email]       maps to: [email        ▼]
// [firstName]   maps to: [first_name   ▼]
// [groups]      maps to: [groups       ▼]

// SECTION 4: Options
// Default role for new users: [Developer ▼]
// Allowed email domains: [input, comma-separated]
// Enforce SSO (block email/password): [toggle] ← requires confirmation modal

// SECTION 5: Test button
// "Test SSO Connection" → opens a new browser tab that initiates SAML flow
// If successful: green banner "SSO working ✓ Logged in as test@mycompany.com"
// If failed: red banner with specific error (signature invalid / attribute missing / etc.)
```

### VERIFY Task 17.1
```
□ SAML: Configure with Okta test IdP → "Test SSO Connection" → green success
□ SAML: Missing or invalid certificate → clear error (not "Internal Server Error")
□ JIT provisioning: new user logs in via SAML → org_members row created with default_role
□ Existing user logs in via SAML → existing account linked (no duplicate created)
□ Email domain filter: user from company.com can JIT provision, user from gmail.com cannot
□ SAML replay: submitting the same SAML Response twice → second rejected (assertion ID deduplicated)
□ SAML forgery: submit SAML with tampered NameID but valid structure → rejected (signature invalid)
□ OIDC: Configure with Google Workspace → login redirects to Google → back to AutoStack logged in
□ SSO Enforced mode: existing email/password login → rejected with "SSO required for your organization"
□ SSO Enforced mode: SSO login still works
□ RULE Q3: SSO Enforced toggle requires typing org name to confirm (not just clicking)
□ IdP-initiated (Okta tile click): unsolicited SAML Response handled → user logged in
□ SP metadata downloads as valid XML, importable into Okta/Azure AD
□ Attribute mapping: custom attribute name in IdP → correct field in AutoStack user profile
□ audit_log: 'user.sso_login' recorded for every SSO authentication
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #14] — SSO & IDENTITY
## Open audit tool. Complete Section 14: "SSO & Enterprise Identity"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 18 — TERRAFORM PROVIDER
# Branch: feature/phase18-terraform
# Goal: `terraform apply` provisions AutoStack environments.
#       Infrastructure teams manage AutoStack as code.
#       Full import of existing environments.
# ══════════════════════════════════════════════════════════════════

## TASK 18.1 — Terraform Provider Architecture

### Repository: `github.com/autostack/terraform-provider-autostack`
Language: Go (Terraform providers must be Go — Terraform Plugin SDK requirement)

### Resources to implement
```hcl
# All resources the provider exposes:

# 1. Cloud credential (IAM role connection)
resource "autostack_cloud_credential" "aws_prod" {
  display_name = "AWS Production"
  provider     = "aws"
  account_id   = "123456789012"
  region       = "us-east-1"
  role_arn     = "arn:aws:iam::123456789012:role/AutoStackRole"
}

# 2. Environment (full deployment)
resource "autostack_environment" "production" {
  name                = "production"
  repo_url            = "https://github.com/myorg/my-api"
  branch              = "main"
  environment         = "production"
  size                = "medium"
  cloud_credential_id = autostack_cloud_credential.aws_prod.id

  env_vars = {
    NODE_ENV = "production"
    PORT     = "3000"
  }

  # Secret env vars — reference from Terraform secrets store
  secret_env_vars = {
    DATABASE_URL = var.database_url  # marked as sensitive in TF, stored in Vault in AutoStack
  }
}

# 3. Managed database
resource "autostack_database" "postgres" {
  environment_id = autostack_environment.production.id
  engine         = "postgres"
  engine_version = "16"
  size           = "small"
  name           = "app"
}

# 4. Custom domain
resource "autostack_domain" "production" {
  environment_id = autostack_environment.production.id
  domain         = "api.mycompany.com"
}

# 5. Team member
resource "autostack_team_member" "engineer" {
  email = "john@mycompany.com"
  role  = "developer"
}

# Data sources (read existing state)
data "autostack_environment" "existing" {
  name = "production"
}

data "autostack_environments" "all" {}
```

### Provider authentication
```hcl
# Provider configuration
terraform {
  required_providers {
    autostack = {
      source  = "autostack/autostack"
      version = "~> 1.0"
    }
  }
}

provider "autostack" {
  # Option 1: API token (recommended for CI)
  api_token = var.autostack_token

  # Option 2: reads from environment variable
  # export AUTOSTACK_TOKEN=...

  # Option 3: reads from stored CLI credentials (~/.config/autostack)
  # (no config needed — auto-detected)

  api_url = "https://api.autostack.io"  # optional, defaults to production
}
```

### REST API endpoints needed (new, for Terraform)
```typescript
// These are new Edge Functions specifically for Terraform's CRUD operations

// supabase/functions/api-environments/index.ts
// GET    /api/v1/environments        → list all environments
// POST   /api/v1/environments        → create environment (triggers full DIE pipeline)
// GET    /api/v1/environments/:id    → get environment by ID
// PUT    /api/v1/environments/:id    → update environment (size, env vars, branch)
// DELETE /api/v1/environments/:id    → delete environment (triggers teardown)

// supabase/functions/api-credentials/index.ts
// GET    /api/v1/credentials         → list cloud credentials
// POST   /api/v1/credentials         → add + validate credential
// DELETE /api/v1/credentials/:id     → delete credential (blocked if in use)

// supabase/functions/api-databases/index.ts
// GET    /api/v1/databases           → list managed databases
// POST   /api/v1/databases           → provision database
// DELETE /api/v1/databases/:id       → deprovision database

// supabase/functions/api-domains/index.ts
// GET    /api/v1/domains             → list custom domains
// POST   /api/v1/domains             → add domain + start ACM validation
// DELETE /api/v1/domains/:id         → remove domain

// Authentication for all API endpoints:
// Bearer token (personal access token OR service account token)
// Generated in: Settings → API Keys → "Create API Key"
```

### Go provider implementation (key resource — autostack_environment)
```go
// internal/resources/environment.go

// Schema definition
func (r *EnvironmentResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
    resp.Schema = schema.Schema{
        Attributes: map[string]schema.Attribute{
            "id":                   schema.StringAttribute{Computed: true},
            "name":                 schema.StringAttribute{Required: true},
            "repo_url":             schema.StringAttribute{Required: true},
            "branch":               schema.StringAttribute{Optional: true, Default: stringdefault.StaticString("main")},
            "environment":          schema.StringAttribute{Required: true, Validators: []validator.String{
                stringvalidator.OneOf("production", "staging", "development"),
            }},
            "size":                 schema.StringAttribute{Required: true, Validators: []validator.String{
                stringvalidator.OneOf("small", "medium", "large"),
            }},
            "cloud_credential_id":  schema.StringAttribute{Required: true},
            "live_url":             schema.StringAttribute{Computed: true},
            "status":               schema.StringAttribute{Computed: true},
            "estimated_monthly_cost": schema.Float64Attribute{Computed: true},
            "env_vars":             schema.MapAttribute{Optional: true, ElementType: types.StringType},
            "secret_env_vars":      schema.MapAttribute{Optional: true, Sensitive: true, ElementType: types.StringType},  // RULE R3
        },
    }
}

// Create — triggers full DIE pipeline, waits for 'live' status
func (r *EnvironmentResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
    var plan EnvironmentResourceModel
    diags := req.Plan.Get(ctx, &plan)
    resp.Diagnostics.Append(diags...)
    if resp.Diagnostics.HasError() { return }

    // POST to API
    created, err := r.client.CreateEnvironment(ctx, CreateEnvironmentRequest{
        Name:               plan.Name.ValueString(),
        RepoURL:            plan.RepoURL.ValueString(),
        Branch:             plan.Branch.ValueString(),
        Environment:        plan.Environment.ValueString(),
        Size:               plan.Size.ValueString(),
        CloudCredentialID:  plan.CloudCredentialID.ValueString(),
        EnvVars:            plan.EnvVars,
        SecretEnvVars:      plan.SecretEnvVars,
    })
    if err != nil {
        resp.Diagnostics.AddError("Failed to create environment", err.Error())
        return
    }

    // RULE R2: wait for 'live' status (not just 'provisioning')
    // Terraform Create must not return until the resource is fully ready
    liveEnv, err := r.client.WaitForStatus(ctx, created.ID, "live", 20*time.Minute)
    if err != nil {
        resp.Diagnostics.AddError("Environment did not reach 'live' status", err.Error())
        return
    }

    // Set computed values
    plan.ID = types.StringValue(liveEnv.ID)
    plan.LiveURL = types.StringValue(liveEnv.LiveURL)
    plan.Status = types.StringValue(liveEnv.Status)
    plan.EstimatedMonthlyCost = types.Float64Value(liveEnv.EstimatedMonthlyCost)

    diags = resp.State.Set(ctx, plan)
    resp.Diagnostics.Append(diags...)
}

// Read — RULE R2: always fetch live state from API
func (r *EnvironmentResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
    var state EnvironmentResourceModel
    req.State.Get(ctx, &state)

    env, err := r.client.GetEnvironment(ctx, state.ID.ValueString())
    if err != nil {
        if isNotFound(err) {
            resp.State.RemoveResource(ctx)  // resource deleted outside Terraform
            return
        }
        resp.Diagnostics.AddError("Failed to read environment", err.Error())
        return
    }

    // Update state with current live values (detects drift)
    state.LiveURL = types.StringValue(env.LiveURL)
    state.Status = types.StringValue(env.Status)
    state.EstimatedMonthlyCost = types.Float64Value(env.EstimatedMonthlyCost)
    resp.State.Set(ctx, state)
}

// Delete — triggers infra-teardown, waits for 'deleted' status
func (r *EnvironmentResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
    var state EnvironmentResourceModel
    req.State.Get(ctx, &state)

    err := r.client.DeleteEnvironment(ctx, state.ID.ValueString())
    if err != nil && !isNotFound(err) {
        resp.Diagnostics.AddError("Failed to delete environment", err.Error())
        return
    }

    // Wait for all AWS resources to be cleaned up
    err = r.client.WaitForStatus(ctx, state.ID.ValueString(), "deleted", 20*time.Minute)
    // Note: 404 after deletion is expected and fine
}
```

### VERIFY Task 18.1
```
□ go build ./... → zero errors in provider repo
□ terraform init → downloads provider from registry (or local dev override)
□ terraform plan → shows "will create: autostack_environment.production"
□ terraform apply → full deployment, live_url in state after completion
□ curl $(terraform output -raw live_url) → HTTP 200
□ terraform plan (second run, no changes) → "No changes. Infrastructure is up-to-date."
□ Drift detection: manually change environment size in dashboard
    terraform plan → shows "~ update: size will change from 'small' to 'medium'"
□ terraform destroy → infra-teardown runs, all AWS resources deleted
□ secret_env_vars: sensitive = true → NOT shown in terraform plan output (masked)
□ terraform import autostack_environment.existing [id] → imports existing environment into state
□ API key auth: AUTOSTACK_TOKEN env var → provider authenticated
□ terraform validate → all resource schemas valid
□ Invalid size value in HCL → terraform validate error (not runtime error)
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE 19 — INTEGRATIONS MARKETPLACE
# Branch: feature/phase19-integrations
# Goal: AutoStack fits into every team's existing toolchain.
#       Incidents in PagerDuty. Costs in Datadog. Failures in Jira.
#       Custom webhooks for everything else.
# ══════════════════════════════════════════════════════════════════

## TASK 19.1 — Integration Framework

### Architecture: Each integration is a module in send-notification
```typescript
// All integrations run through send-notification, not separate functions.
// This ensures: quota guards, cooldowns, and non-blocking behavior (RULE S2) apply to all.

// supabase/functions/send-notification/integrations/
//   slack.ts          ← existing (upgrade)
//   pagerduty.ts      ← new
//   datadog.ts        ← new
//   jira.ts           ← new
//   opsgenie.ts       ← new
//   webhook.ts        ← new (custom webhook)

// Each integration module exports:
interface IntegrationModule {
  name: string
  send(config: IntegrationConfig, event: NotificationEvent): Promise<void>
  test(config: IntegrationConfig): Promise<{ success: boolean; error?: string }>
  configSchema: ValidationSchema  // for frontend form validation
}
```

---

## TASK 19.2 — PagerDuty Integration

### What AutoStack sends to PagerDuty
```typescript
// AIRE incidents → PagerDuty incidents (severity mapped)
// COIE critical findings → PagerDuty alerts
// Deployment failures → PagerDuty info alerts
// Agent disconnected → PagerDuty warning

// PagerDuty Events API v2 payload:
interface PagerDutyEvent {
  routing_key: string        // Integration key from PagerDuty (stored in integrations.config)
  event_action: 'trigger' | 'acknowledge' | 'resolve'
  dedup_key: string          // Unique ID: `autostack-incident-${incident_id}` — prevents duplicate pages
  payload: {
    summary: string          // "OOMKill in api-deployment: Pod restarted 3 times in 10 minutes"
    severity: 'critical' | 'error' | 'warning' | 'info'
    source: string           // "AutoStack AIRE"
    timestamp: string        // ISO 8601
    component: string        // affected pod name
    group: string            // cluster/environment name
    class: string            // incident pattern: "oom_kill" | "crash_loop" | etc.
    custom_details: {
      root_cause: string
      immediate_action: string
      dashboard_url: string  // deep link to AutoStack incident
      cluster: string
      namespace: string
    }
  }
  links: [{ href: string; text: string }]  // link to AutoStack dashboard
  images: []
}

// Severity mapping:
// AIRE incident severity='critical' → PagerDuty 'critical' (wakes people up)
// AIRE incident severity='high'     → PagerDuty 'error'
// COIE finding severity='critical'  → PagerDuty 'warning' (cost alert, not emergency)
// Deploy failure                    → PagerDuty 'error'

// Auto-resolve: when incident.status = 'resolved' in AutoStack,
// send event_action='resolve' to PagerDuty with the same dedup_key
// This closes the PagerDuty incident automatically
```

### Setup flow in dashboard
```jsx
// Settings → Integrations → PagerDuty → Connect

// Step 1: User creates a "Service" in PagerDuty with "Events API v2" integration
//         Copies the "Integration Key" (routing key)
// Step 2: Pastes in AutoStack:
//   [Integration Key] [input field]
// Step 3: AutoStack sends a test event:
//   "Test Alert" button → sends a test PagerDuty incident
//   If PagerDuty received it: green "Integration working ✓"
//   If not: error message with hint (invalid key format, wrong service, etc.)
// Step 4: Alert rules (which events trigger PagerDuty):
//   ✅ Critical incidents (auto-checked, can't disable)
//   ✅ High severity incidents
//   ☐ Medium incidents
//   ☐ Deployment failures
//   ☐ COIE critical findings
```

### VERIFY Task 19.2
```
□ Configure PagerDuty with test service → test event fires → alert appears in PagerDuty
□ AIRE detects incident (severity='critical') → PagerDuty incident created within 30 seconds
□ AutoStack resolves incident → PagerDuty incident auto-closed
□ Same incident created twice → dedup_key prevents duplicate PagerDuty incidents
□ PagerDuty integration failure (wrong key) → AIRE incident still saved to DB (RULE S2)
□ Dashboard: PagerDuty incident link appears in incident detail view
□ audit_log: 'integration.pagerduty.triggered' recorded for each PD alert sent
```

---

## TASK 19.3 — Datadog Integration: Metrics Export

### What AutoStack exports to Datadog
```typescript
// AutoStack pushes cluster metrics to Datadog every 60 seconds
// Uses Datadog Metrics API (not agent — no Datadog agent installation required)

// Metrics exported:
const AUTOSTACK_DATADOG_METRICS = [
  // Cluster-level
  'autostack.cluster.health_score',     // 0-100
  'autostack.cluster.cpu_pct',          // 0-100
  'autostack.cluster.memory_pct',       // 0-100
  'autostack.cluster.node_count',       // integer
  'autostack.cluster.pod_count',        // integer

  // Cost
  'autostack.cost.estimated_monthly',   // USD
  'autostack.cost.potential_savings',   // USD

  // Deployments
  'autostack.deployments.count',        // deployments in last 24h
  'autostack.deployments.success_rate', // 0-100%
  'autostack.deployments.avg_duration', // seconds

  // AIRE
  'autostack.incidents.active_count',   // integer
  'autostack.incidents.resolved_today', // integer

  // COIE
  'autostack.findings.open_critical',   // integer
  'autostack.findings.open_high',       // integer
]

// All metrics tagged with:
// environment:[env-name]
// cluster:[cluster-id]
// provider:[aws|gcp|azure]
// region:[region]
// autostack:true

// Edge Function: supabase/functions/datadog-export/index.ts
// Called by pg_cron every 60 seconds for all orgs with Datadog integration enabled
// POST to https://api.datadoghq.com/api/v2/series (or EU endpoint if needed)

// Datadog APM integration (future Phase 19b):
// When Datadog Agent is already running in cluster:
// AutoStack injects DD_AGENT_HOST env var into deployments automatically
```

### Datadog dashboard template (JSON export)
```json
// Available at: https://autostack.io/integrations/datadog-dashboard.json
// User imports this JSON into their Datadog account
// Pre-built dashboard with:
// - Cluster health score time series
// - CPU/Memory by environment
// - Deployment frequency (DORA metric)
// - Active incidents count
// - Cost trend
// - Savings opportunities value
```

### VERIFY Task 19.3
```
□ Configure Datadog with API key + App key → test connection → green
□ Metrics appear in Datadog within 90 seconds of connecting
□ All 14 metrics present in Datadog: autostack.cluster.* tags visible
□ Metrics have correct tags: environment, cluster, provider
□ Datadog integration failure (bad API key) → cluster metrics still saved to AutoStack DB (RULE S2)
□ EU Datadog site: https://api.datadoghq.eu/api/v2/series used (not US endpoint)
□ pg_cron job registered: SELECT * FROM cron.job WHERE jobname='datadog-export'
□ Import dashboard JSON into Datadog → all widgets render with real data
```

---

## TASK 19.4 — Jira Integration: Auto-Create Issues

### What AutoStack creates in Jira
```typescript
// COIE critical findings → Jira tickets (optional, configurable)
// AIRE incidents → Jira bug tickets
// Deployment failures → Jira incidents

// Jira issue creation uses Jira Cloud REST API v3
interface JiraIssue {
  fields: {
    project: { key: string }    // e.g., 'OPS' — configured by user
    issuetype: { name: string } // 'Bug' for incidents, 'Task' for findings
    summary: string
    description: {
      type: 'doc', version: 1,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: string }]
      }]
    }
    priority: { name: 'Critical' | 'High' | 'Medium' | 'Low' }
    labels: ['autostack', 'auto-created']
    // Custom field for AutoStack incident ID (configured during setup)
    [customFieldId: string]: string  // e.g., customfield_10001 = incident.id
  }
}

// Auth: Jira uses API token + email (Basic auth)
// Stored in: integrations.config.api_token_vault_id (Vault) + integrations.config.email (plaintext)

// Bidirectional sync (optional — configure in settings):
// When Jira issue is closed → AutoStack marks finding as 'resolved'
// Requires Jira webhook pointing to autostack.io/functions/v1/jira-webhook
// jira-webhook validates the signature (Jira supports webhook secrets)

// Deduplication: store jira_issue_key in findings/incidents table
// Don't create a new Jira issue if one already exists for this finding
```

### VERIFY Task 19.4
```
□ Configure Jira with API token → test connection → project list loads
□ COIE critical finding → Jira ticket created in configured project within 60 seconds
□ AIRE incident → Jira bug created with incident details
□ Duplicate finding → no duplicate Jira ticket (dedup_key check)
□ Jira issue closed → finding.status = 'resolved' (if bidirectional sync enabled)
□ Jira API token stored in Vault (not in integrations.config directly)
□ Integration failure (Jira down) → finding still saved to AutoStack DB (RULE S2)
□ Custom field mapping: AutoStack incident ID visible as custom field in Jira ticket
```

---

## TASK 19.5 — Custom Webhook Integration

### What it does
Any event AutoStack generates can be forwarded to a user-defined HTTPS endpoint.
This enables: custom Slack bots, internal ticketing systems, ChatOps tools,
custom dashboards, anything the user wants to build.

```typescript
// Config stored in integrations.config:
{
  url: "https://hooks.mycompany.com/autostack",  // user's endpoint
  secret: "[random 32-char string]",              // stored in Vault
  events: [
    "deployment.live",
    "deployment.failed",
    "incident.detected",
    "incident.resolved",
    "finding.opened",
    "cost.savings_found"
  ],
  headers: {  // optional additional headers user wants sent
    "X-Source": "autostack",
    "X-Environment": "production"
  }
}

// Payload sent to user's endpoint:
interface WebhookPayload {
  id: string              // unique event ID (for idempotency on their side)
  event: string           // e.g., "incident.detected"
  created_at: string      // ISO 8601
  org_id: string          // the org this event belongs to
  data: Record<string, unknown>  // event-specific data
}

// Signature (RULE S3):
// X-AutoStack-Signature: sha256=[HMAC-SHA256 of JSON body using secret from Vault]
// X-AutoStack-Delivery: [unique event ID]  ← same as payload.id

// Delivery guarantees:
// At-least-once delivery (retry 3 times on non-200 response)
// Retry schedule: immediate, 5 min, 30 min
// After 3 failures: mark webhook as 'failing', notify user in dashboard
// Store last 50 delivery attempts: status, response code, duration

// Delivery log in dashboard:
// [timestamp] [event] [status] [response_code] [duration_ms]
// 2026-03-14 12:34  incident.detected  ✓ 200  43ms
// 2026-03-14 12:31  deployment.live    ✓ 200  67ms
// 2026-03-14 11:55  finding.opened     ✗ 500  timeout
```

### VERIFY Task 19.5
```
□ Configure webhook pointing to webhook.site or pipedream URL
□ Trigger a deployment → webhook received within 5 seconds
□ Verify X-AutoStack-Signature header matches HMAC of body
□ Simulate endpoint returning 500 → webhook retried after 5 minutes
□ After 3 failures → webhook marked 'failing', dashboard warning shown
□ Delivery log shows last 50 attempts with status and response codes
□ Event filter: configure only 'incident.*' events → deployment events NOT sent
□ Webhook secret stored in Vault (not in integrations.config JSON)
□ RULE S3: user can verify signature using shared secret in their endpoint
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #15] — INTEGRATIONS
## Open audit tool. Complete Section 15: "Integrations & Webhooks"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 20 — SOC2 TYPE II: CONTROLS, EVIDENCE, CERTIFICATION
# Branch: feature/phase20-soc2
# Goal: Security teams approve AutoStack without a 40-question questionnaire.
#       AutoStack passes SOC2 Type II audit (AICPA TSC criteria).
# ══════════════════════════════════════════════════════════════════

## TASK 20.1 — SOC2 Controls Implementation Gap Analysis

### SOC2 Trust Service Criteria (TSC) — what AutoStack must demonstrate

```
CC1 — Control Environment
  CC1.1: Management philosophy and operating style
    ✅ Already have: audit_log, rate limiting, input validation
    ❌ Need: formal security policy document, employee security training records

CC2 — Communication and Information
  CC2.1: Information for internal use
    ✅ Already have: audit_log for all key actions
    ❌ Need: incident response runbook, documented change management process

CC3 — Risk Assessment
  CC3.1: Risk identification and analysis
    ❌ Need: formal risk register (document every known risk + mitigations)
    ❌ Need: annual risk assessment process

CC4 — Monitoring Activities
  CC4.1: Ongoing monitoring of controls
    ✅ Already have: Sentry, PostHog, database monitoring
    ❌ Need: automated control testing evidence (prove rate limits work monthly)

CC5 — Control Activities — THIS IS THE BIGGEST SECTION
  CC5.1: Policies and procedures exist
    ✅ Already have: all the technical controls from Phases 1-19
    ❌ Need: written policies for each control

CC6 — Logical and Physical Access Controls
  CC6.1: Logical access security measures
    ✅ Already have: RLS, auth, MFA (Supabase has TOTP MFA)
    ❌ Need: MFA enforcement for admin accounts, access review process

  CC6.2: Prior to issuing system credentials
    ✅ Already have: email verification on signup
    ❌ Need: documented provisioning/deprovisioning process

CC7 — System Operations
  CC7.1: Vulnerability management
    ✅ Already have: dependencies in package.json
    ❌ Need: automated dependency scanning (Snyk or GitHub Dependabot), evidence of remediation

  CC7.4: Incident response
    ✅ Already have: AIRE, monitoring, alerting
    ❌ Need: formal incident response plan with severity definitions and escalation paths

CC8 — Change Management
  CC8.1: Changes are authorized
    ✅ Already have: PR-based deployments, ArgoCD GitOps
    ❌ Need: formal change management policy, evidence that all changes go through PRs

CC9 — Risk Mitigation
  CC9.1: Risk of fraud
    ✅ Already have: Stripe fraud protection, plan limits
    ❌ Need: documented fraud monitoring process
```

---

## TASK 20.2 — Technical Controls Required for SOC2

### MFA Enforcement for Admin Accounts
```sql
-- Migration: 009_mfa_enforcement.sql

-- Track MFA status per user
CREATE TABLE IF NOT EXISTS user_mfa_config (
  user_id     UUID  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  totp_enabled BOOLEAN DEFAULT FALSE,
  backup_codes_generated BOOLEAN DEFAULT FALSE,
  last_verified_at TIMESTAMPTZ,
  enforced    BOOLEAN DEFAULT FALSE  -- org-level enforcement
);

-- Org-level MFA enforcement
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS require_mfa BOOLEAN DEFAULT FALSE;
```

```typescript
// MFA enforcement in auth middleware:
// If org.require_mfa = true AND user has no TOTP enabled:
// Return 403: "Your organization requires MFA. Enable it in Settings → Security → MFA"
// NOT: silently let them in
// NOT: redirect after the fact

// Supabase has built-in TOTP MFA — use it:
// supabase.auth.mfa.enroll() → get QR code
// supabase.auth.mfa.challenge() → get challenge ID
// supabase.auth.mfa.verify() → submit TOTP code

// Audit log MFA events:
// 'user.mfa_enabled', 'user.mfa_disabled', 'user.mfa_challenge_passed', 'user.mfa_challenge_failed'
```

### Automated Dependency Scanning
```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday 2am

jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: npm audit
        run: npm audit --audit-level=high  # fail on high/critical
      - name: Snyk scan
        uses: snyk/actions/node@master
        with:
          args: --severity-threshold=high
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  secrets-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # full history for secret scanning
      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        # Scans entire git history for leaked secrets
```

### Data Retention Enforcement (RULE T3)
```sql
-- supabase/migrations/009_soc2_controls.sql
-- Each cleanup job references the retention policy section

-- 90-day log retention (Policy: Data Retention Policy §3.1)
SELECT cron.schedule('cleanup-audit-logs-90d', '0 3 * * *', $$
  DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days';
$$);

-- 1-year audit event retention (Policy: §3.2 — regulatory requirement)
-- Note: audit_log has RLS and is append-only, but we still need this for compliance
-- In practice: 90-day purge applies to debug logs, 1-year to security events
-- Add a severity field to audit_log to distinguish these

-- 30-day data retention after cancellation (Policy: §3.3)
-- pg_cron: find orgs with subscriptions.status = 'canceled'
-- AND canceled_at < NOW() - INTERVAL '30 days'
-- AND NOT data_deletion_complete
-- Then: anonymize/delete org data, set data_deletion_complete = true
-- Send "Your data has been deleted" notification

-- SOC2 evidence: every cleanup run logged to compliance_log table
CREATE TABLE IF NOT EXISTS compliance_log (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id  TEXT  NOT NULL,  -- 'CC7.4-001', 'CC3.1-002' etc.
  check_type  TEXT  NOT NULL,  -- 'automated_test' | 'manual_review' | 'cron_cleanup'
  result      TEXT  NOT NULL,  -- 'passed' | 'failed' | 'n/a'
  details     JSONB DEFAULT '{}',
  checked_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Auditors read this table to see evidence of controls working over 6 months
```

### Penetration Test Requirements (RULE T2)
```markdown
# Penetration Test Scope (document for pen tester)

## In Scope
- All AutoStack Edge Functions (https://[project].supabase.co/functions/v1/*)
- Frontend application (https://autostack.io)
- Authentication flows (signup, login, SSO, CLI device code)
- Row Level Security bypass attempts
- Privilege escalation (developer → admin → owner)
- IAM role manipulation (can user A's org assume user B's IAM role?)
- Agent token attacks (can attacker register fake agents?)
- Stripe webhook manipulation (fake payment events)
- Rate limit bypass
- CORS bypass
- XSS in dashboard (user-controlled data rendered in UI)
- Open redirect vulnerabilities
- JWT attacks (algorithm confusion, none algorithm)

## Out of Scope
- AWS infrastructure underlying Supabase (not in our control)
- Physical security
- Social engineering
- DDoS attacks

## Deliverables
- CVSS-scored findings report
- Proof-of-concept for each finding
- Remediation recommendations
- Retest after fixes

## Timeline
- Initial test: 5 business days
- Report delivery: 3 days after test
- Fix window: 30 days for critical/high
- Retest: 3 business days after fixes
```

---

## TASK 20.3 — SOC2 Evidence Collection Dashboard

### Compliance Evidence Page
```jsx
// src/components/settings/ComplianceTab.jsx
// Available on: Team + Enterprise plans only

// SECTION 1: SOC2 Status
// ┌──────────────────────────────────────────────────────────────┐
// │ SOC2 Type II Readiness                                       │
// │                                                              │
// │ Controls passing: 47/52  ████████████████░░░  90%           │
// │ Last assessment:  2026-03-01                                 │
// │ Next audit:       2026-09-01 (estimated)                     │
// │                                                              │
// │ [Download SOC2 Report] [Export Evidence]                     │
// └──────────────────────────────────────────────────────────────┘

// SECTION 2: Control Matrix
// Table: Control ID | Description | Status | Last Verified | Evidence
// CC6.1  | MFA enforced for admins     | ✅ Pass | 2026-03-14 | [View]
// CC7.1  | Dependency scan passing     | ✅ Pass | 2026-03-14 | [View]
// CC8.1  | All deploys via PR          | ✅ Pass | 2026-03-14 | [View]
// CC6.2  | Access review complete      | ⚠️ Due  | 2026-01-14 | [Start]

// SECTION 3: Audit Log Export
// "Export audit log for date range" → downloads CSV/JSON
// Filter by: event type, actor, date range
// Required for auditors to review access patterns

// SECTION 4: Penetration Test Results
// Upload pen test report PDF (stored in Supabase Storage)
// Shows: test date, vendor, critical/high/medium finding counts
// Evidence of remediation (link to GitHub PRs that fixed findings)

// SECTION 5: Data Processing Agreement
// "Download DPA" (standard AutoStack DPA PDF)
// Required for GDPR compliance alongside SOC2
```

### Automated Control Testing (runs monthly via pg_cron)
```typescript
// supabase/functions/soc2-control-check/index.ts
// Runs monthly, tests all automated controls, logs to compliance_log

const AUTOMATED_CONTROLS = [
  {
    id: 'CC6.1-001',
    name: 'Rate limiting active on all Edge Functions',
    test: async (supabase) => {
      // Hit die-analyze 4 times → expect 429 on 4th
      // Returns: { passed: boolean, details: string }
    }
  },
  {
    id: 'CC6.1-002',
    name: 'RLS active on all user tables',
    test: async (supabase) => {
      // Query pg_tables for all tables with rowsecurity = false
      // Returns: { passed: boolean, offending_tables: string[] }
    }
  },
  {
    id: 'CC7.1-001',
    name: 'No critical npm vulnerabilities',
    test: async (supabase) => {
      // Check last GitHub Actions security scan result
      // Returns: { passed: boolean, vulnerabilities_count: number }
    }
  },
  {
    id: 'CC8.1-001',
    name: 'No direct commits to main (all changes via PR)',
    test: async (supabase) => {
      // Query GitHub API: commits to main without associated PR
      // Returns: { passed: boolean, direct_commits: string[] }
    }
  },
  {
    id: 'CC9.1-001',
    name: 'Stripe webhook idempotency keys active',
    test: async (supabase) => {
      // Check Redis: recent Stripe event IDs present with TTL
      // Returns: { passed: boolean }
    }
  }
]
// Each test logs result to compliance_log with control_id, result, details, timestamp
```

### VERIFY Task 20.3
```
□ ComplianceTab visible to Team/Enterprise plan users only
□ Control matrix shows all 52 controls with current status
□ Monthly control check pg_cron runs: SELECT * FROM cron.job WHERE jobname='soc2-control-check'
□ compliance_log has rows from automated checks
□ Audit log export: exports CSV with all events in date range
□ MFA enforcement: org.require_mfa = true → non-MFA user cannot access dashboard
□ Pen test: engage a security firm, get report, fix critical/high findings
□ Dep scan GitHub Action: push code with known vulnerable package → workflow fails
□ Data deletion: set subscription canceled_at = NOW() - 31 days → data deletion runs
□ DPA PDF downloadable from ComplianceTab
□ 'user.mfa_enabled', 'user.mfa_challenge_passed' in audit_log
□ Gitleaks: verify no secrets in git history (run locally: gitleaks detect --source .)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #16] — SOC2 READINESS
## Open audit tool. Complete Section 16: "SOC2 & Compliance"
## This is not a normal checkpoint. Get a third-party pen test
## before marking this section complete.
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# APPENDIX A — COMPLETE PROGRESS TRACKER (add to PROGRESS.md)
# ══════════════════════════════════════════════════════════════════

```markdown
## Phase 16: AutoStack CLI
- [ ] 16.1 — CLI architecture, auth (device code flow), credential storage
- [ ] Commands: auth (login/logout/whoami), deploy, redeploy, rollback
- [ ] Commands: env (list/status/delete), logs (--follow), vars (set/list/delete)
- [ ] Commands: cost, incidents, db (create/connect/rotate-password)
- [ ] CI/CD: AUTOSTACK_TOKEN env var, --json flag on all commands
- [ ] Edge Functions: cli-auth-start, cli-auth-poll, cli-auth-approve

## Phase 17: SSO
- [ ] 17.1 — SAML 2.0: assertion validation, CSRF, JIT provisioning
- [ ] 17.1 — OIDC: discovery endpoint, token exchange, JIT provisioning
- [ ] 17.1 — IdP-initiated flow (unsolicited SAML Response)
- [ ] 17.1 — SSO Enforced mode (blocks email/password)
- [ ] 17.1 — Attribute mapping UI
- [ ] DB: sso_configurations table

## Phase 18: Terraform Provider
- [ ] 18.1 — Go provider skeleton (plugin framework setup)
- [ ] 18.1 — Resources: autostack_environment, autostack_cloud_credential
- [ ] 18.1 — Resources: autostack_database, autostack_domain, autostack_team_member
- [ ] 18.1 — Data sources: autostack_environment, autostack_environments
- [ ] 18.1 — REST API endpoints: /api/v1/environments, /api/v1/credentials
- [ ] 18.1 — Import existing resources: terraform import
- [ ] 18.1 — Published to Terraform Registry

## Phase 19: Integrations
- [ ] 19.1 — Integration framework (modular, non-blocking)
- [ ] 19.2 — PagerDuty (Events API v2, severity mapping, auto-resolve)
- [ ] 19.3 — Datadog (metrics export, dashboard template)
- [ ] 19.4 — Jira (issue creation, bidirectional sync, dedup)
- [ ] 19.5 — Custom webhook (signing, retry, delivery log)

## Phase 20: SOC2
- [ ] 20.1 — Controls gap analysis (CC1-CC9 criteria)
- [ ] 20.2 — MFA enforcement (TOTP + org-level requirement)
- [ ] 20.2 — Automated dependency scanning (Snyk + Gitleaks in CI)
- [ ] 20.2 — Data retention enforcement (pg_cron + compliance_log)
- [ ] 20.2 — Penetration test (third-party, fix all critical/high)
- [ ] 20.3 — ComplianceTab UI (control matrix, audit export, DPA)
- [ ] 20.3 — Automated control testing (monthly pg_cron)
- [ ] Engage SOC2 auditor, collect 6 months of evidence, pass audit
```

---

# APPENDIX B — DEPENDENCY GRAPH (PHASES 16–20)

```
Phase 16 (CLI)          — Independent. Can ship any time. Ship FIRST.
                          Developers love CLI. Creates word-of-mouth.

Phase 17 (SSO)          — Independent. Ship SECOND.
                          Unlocks enterprise deals that are blocked on SSO.

Phase 19 (Integrations) — Independent. Ship THIRD.
                          Reduces friction with existing toolchains.
                          PagerDuty first (most requested by ops teams).

Phase 18 (Terraform)    — Depends on: Phase 16 REST API endpoints
                          (provider uses same API as CLI, built first)
                          Ship FOURTH.

Phase 20 (SOC2)         — Depends on: ALL PHASES complete and stable.
                          Needs 6 months of evidence AFTER controls are in place.
                          Start the process, don't wait to start until Phase 19 ships.
                          Ship LAST (but start the clock EARLY).
```

---

# APPENDIX C — WHAT COMES AFTER PHASE 20

This is the product horizon after Phase 20. Do not build these now.

```
AutoStack Marketplace
  Community-contributed Helm chart templates
  Pre-built tech stack bundles (MERN, Django+Postgres, Go+Redis, etc.)
  One-click "Deploy a Stripe-powered SaaS" style templates

AutoStack AI Chat (LLM-powered ops assistant)
  "Why is my pod crashing?" → AIRE feeds real logs + events to GPT-4
  "What's my highest AWS cost?" → COIE data + natural language
  Not: generic ChatGPT wrapper
  Yes: deep context from all AutoStack data

AutoStack DX (Developer Experience Portal)
  Internal developer portal for large engineering orgs
  Service catalog: every microservice, its owner, its runbook, its metrics
  Built on top of AutoStack's existing cluster + deployment data

AutoStack Compliance Suite (beyond SOC2)
  HIPAA BAA for healthcare customers
  FedRAMP authorization (US government)
  ISO 27001 certification
  These require dedicated compliance engineers — this is $1M+ in effort

Cost Anomaly Detection (ML-based)
  Learn baseline cost patterns per org
  Alert when cost spikes beyond 2σ from baseline
  Distinguish between "we got traffic" and "runaway resource leak"
```
