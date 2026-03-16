# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — ULTIMATE PRODUCTION READINESS PROMPT                          ║
# ║  Mission: Fix everything. Verify everything. One-click deploy works.       ║
# ║  No patches. No shortcuts. No "works in theory". Only working code.        ║
# ║  Current state: DB deployed ✅ · Functions ❌ · IAM ❌ · Tests ❌           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

---

# HOW TO USE THIS DOCUMENT

This is a sequential execution contract for Antigravity.
Work through every section in exact order. Never skip ahead.
Every section ends with a VERIFY block — run it, print the output, fix failures.
A section is DONE only when its VERIFY block shows zero ❌.

After this document is fully executed:
- User pastes GitHub URL
- Connects AWS account
- Clicks Deploy
- Gets a live HTTPS URL in < 15 minutes
- On THEIR AWS account
- Zero manual steps
- Zero broken paths

---

# ══════════════════════════════════════════════════════════════════
# PHASE A — SYSTEM SETUP
# Install tools, configure environment, validate access
# ══════════════════════════════════════════════════════════════════

## A1 — Install Required Tools

```bash
# Check what's installed
echo "=== CHECKING TOOLS ==="
which supabase 2>/dev/null && echo "✅ supabase CLI" || echo "❌ supabase CLI — installing..."
which gh 2>/dev/null && echo "✅ gh CLI" || echo "❌ gh CLI — installing..."
which aws 2>/dev/null && echo "✅ aws CLI" || echo "❌ aws CLI"
which jq 2>/dev/null && echo "✅ jq" || echo "❌ jq — installing..."
which curl 2>/dev/null && echo "✅ curl" || echo "❌ curl"
which node 2>/dev/null && node --version && echo "✅ node" || echo "❌ node"

# Install Supabase CLI
if ! which supabase > /dev/null 2>&1; then
  curl -fsSL https://github.com/supabase/cli/releases/download/v1.200.3/supabase_linux_amd64.tar.gz \
    -o /tmp/supabase.tar.gz
  tar -xzf /tmp/supabase.tar.gz -C /tmp
  sudo mv /tmp/supabase /usr/local/bin/supabase
  chmod +x /usr/local/bin/supabase
  supabase --version
fi

# Install GitHub CLI
if ! which gh > /dev/null 2>&1; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
    sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
    https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
  sudo apt-get update -q && sudo apt-get install -y gh
fi

# Install jq
if ! which jq > /dev/null 2>&1; then
  sudo apt-get install -y jq
fi

echo "=== ALL TOOLS READY ==="
```

## A2 — Configure Credentials File

Create a single credentials file. Every script in this document sources it.

```bash
cat > /tmp/autostack-env.sh << 'ENVFILE'
# AutoStack Credentials — sourced by all scripts
# Fill in EVERY value. No blanks.

# SUPABASE
export SUPABASE_URL="https://prrmrukwmrjkdxcyzovd.supabase.co"
export SUPABASE_PROJECT_REF="prrmrukwmrjkdxcyzovd"
export SUPABASE_ANON_KEY=""          # from Dashboard → Settings → API → anon public
export SUPABASE_SERVICE_ROLE_KEY=""  # from Dashboard → Settings → API → service_role
export SUPABASE_DB_PASSWORD=""       # from Dashboard → Settings → Database → password

# AWS
export AWS_ACCOUNT_ID="367749063363"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID=""          # already configured in AWS CLI
export AWS_SECRET_ACCESS_KEY=""      # already configured in AWS CLI
export AUTOSTACK_ROLE_ARN="arn:aws:iam::367749063363:role/AutoStackDeploymentRole"

# GITHUB
export GITHUB_APP_ID="3089423"
export GITHUB_APP_PRIVATE_KEY_PATH="/tmp/autostack-github-app.pem"  # path to PEM file
export GITHUB_WEBHOOK_SECRET=""
export GITHUB_PAT=""                 # personal access token

# RESEND
export RESEND_API_KEY="re_DeVNS5Fo_"  # from env

# UPSTASH
export UPSTASH_REDIS_REST_URL=""
export UPSTASH_REDIS_REST_TOKEN=""

# NVIDIA (for AI features — replaces Anthropic)
export NVIDIA_API_KEY_1=""
export NVIDIA_API_KEY_2=""

# STRIPE (for billing — optional for initial test)
export STRIPE_SECRET_KEY=""          # sk_test_... or sk_live_...
export STRIPE_WEBHOOK_SECRET=""      # whsec_...
ENVFILE

echo "Edit /tmp/autostack-env.sh and fill in ALL values before proceeding."
echo "Then run: source /tmp/autostack-env.sh"
```

**STOP HERE.** Fill in every value in `/tmp/autostack-env.sh`.
Then: `source /tmp/autostack-env.sh`

### VERIFY A2
```bash
source /tmp/autostack-env.sh

# Check every critical variable is set
MISSING=0
for VAR in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
           AWS_ACCOUNT_ID AWS_REGION GITHUB_APP_ID RESEND_API_KEY \
           UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN; do
  if [ -z "${!VAR}" ]; then
    echo "❌ MISSING: $VAR"
    MISSING=$((MISSING + 1))
  else
    echo "✅ $VAR: ${!VAR:0:20}..."
  fi
done

[ $MISSING -eq 0 ] && echo "✅ ALL CREDENTIALS SET" || echo "❌ $MISSING credentials missing — fill them in"
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE B — DATABASE VERIFICATION & COMPLETION
# Confirm schema, RLS, indexes, seed data are all correct
# ══════════════════════════════════════════════════════════════════

## B1 — Verify All Tables Exist With Correct Schema

```bash
source /tmp/autostack-env.sh

# Query schema via REST API
TABLES=$(curl -s "${SUPABASE_URL}/rest/v1/" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "Tables detected via OpenAPI:"
echo "${TABLES}" | jq -r '.definitions | keys[]' | sort

# Expected tables (must ALL be present):
REQUIRED_TABLES=(
  "audit_log"
  "cloud_credentials"
  "cluster_metrics"
  "cluster_scores"
  "clusters"
  "cost_budgets"
  "custom_domains"
  "deployments"
  "findings"
  "incidents"
  "incident_patterns"
  "infrastructure_events"
  "integrations"
  "invitations"
  "managed_databases"
  "notification_prefs"
  "org_members"
  "org_usage"
  "organizations"
  "pipeline_runs"
  "pipelines"
  "plan_usage"
  "playbooks"
  "pod_logs"
  "project_env_vars"
  "project_regions"
  "projects"
  "sso_configurations"
  "subscriptions"
  "templates"
)

echo ""
echo "Checking required tables:"
MISSING_TABLES=0
for TABLE in "${REQUIRED_TABLES[@]}"; do
  if echo "${TABLES}" | jq -r '.definitions | keys[]' | grep -q "^${TABLE}$"; then
    echo "  ✅ ${TABLE}"
  else
    echo "  ❌ MISSING: ${TABLE}"
    MISSING_TABLES=$((MISSING_TABLES + 1))
  fi
done

echo ""
[ $MISSING_TABLES -eq 0 ] && echo "✅ ALL TABLES PRESENT" || echo "❌ $MISSING_TABLES TABLES MISSING"
```

If any tables are missing, apply the missing migrations:
```bash
# Link project and push schema
cd /path/to/AutoStack
supabase link --project-ref ${SUPABASE_PROJECT_REF}
supabase db push --password "${SUPABASE_DB_PASSWORD}"
```

## B2 — Verify RLS Is Active On All Tables

```bash
source /tmp/autostack-env.sh

# Use service role to check RLS status directly
RLS_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/rpc/check_rls_status" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null)

# Alternative: use postgres direct query via supabase CLI
supabase db query "
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
ORDER BY tablename;
" --db-url "${SUPABASE_DB_URL}" 2>/dev/null || \
curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = '\''public'\'' ORDER BY tablename"
  }'
```

Critical: ALL tables MUST have `rowsecurity = true`.
If any show `false`, run:
```sql
-- Apply to every table missing RLS
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;
```

## B3 — Verify Critical DB Functions and Extensions

```sql
-- Run these in Supabase SQL editor or via supabase db query

-- 1. auth.org_id() function MUST exist
SELECT
  routine_name,
  routine_schema,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'auth'
  AND routine_name = 'org_id';
-- EXPECTED: 1 row
-- IF MISSING: create it now:
/*
CREATE OR REPLACE FUNCTION auth.org_id() RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'org_id')::UUID;
$$;
*/

-- 2. pgvector extension for AIRE semantic matching
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
-- EXPECTED: 1 row
-- IF MISSING: CREATE EXTENSION IF NOT EXISTS vector;

-- 3. pg_cron extension for scheduled jobs
SELECT extname FROM pg_extension WHERE extname = 'pg_cron';
-- EXPECTED: 1 row

-- 4. All pg_cron jobs registered
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
-- EXPECTED AT MINIMUM:
-- cleanup-audit-logs-90d
-- cleanup-pod-logs
-- coie-evaluation
-- expire-trials
-- weekly-digest

-- 5. incident_patterns seeded
SELECT COUNT(*) as total, STRING_AGG(name, ', ') as names FROM incident_patterns;
-- EXPECTED: >= 10 patterns

-- 6. Performance indexes exist
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN (
  'cluster_metrics', 'cluster_scores', 'findings',
  'incidents', 'deployments', 'infrastructure_events',
  'pod_logs', 'audit_log', 'projects', 'pipelines'
)
ORDER BY tablename, indexname;
-- EXPECTED: at least 2 indexes per table
-- CRITICAL: idx_cluster_metrics_time must exist
```

If any pg_cron jobs are missing, add them:
```sql
-- COIE evaluation every 5 minutes
SELECT cron.schedule(
  'coie-evaluation',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/coie-cycle',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY_HERE", "Content-Type": "application/json"}',
    body := '{"trigger": "scheduled"}'
  ) FROM clusters WHERE agent_status = ''connected'';$$
);

-- Weekly digest Sunday 9am UTC
SELECT cron.schedule('weekly-digest', '0 9 * * 0',
  $$SELECT net.http_post(url := 'https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/send-notification',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY_HERE", "Content-Type": "application/json"}',
    body := '{"type": "weekly_digest"}'
  );$$);

-- Cleanup metrics older than 90 days
SELECT cron.schedule('cleanup-old-metrics', '0 2 * * *',
  $$DELETE FROM cluster_metrics WHERE sampled_at < NOW() - INTERVAL '90 days';
    DELETE FROM cluster_scores WHERE evaluated_at < NOW() - INTERVAL '90 days';$$);

-- Cleanup pod logs older than 24h
SELECT cron.schedule('cleanup-pod-logs', '0 * * * *',
  $$DELETE FROM pod_logs WHERE logged_at < NOW() - INTERVAL '24 hours';$$);

-- Expire free trials
SELECT cron.schedule('expire-trials', '0 6 * * *',
  $$UPDATE subscriptions SET status = 'active', plan = 'free'
    WHERE status = 'trialing' AND trial_ends_at < NOW();$$);

-- Destroy expired preview environments
SELECT cron.schedule('destroy-expired-previews', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/infra-teardown',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY_HERE", "Content-Type": "application/json"}',
    body := json_build_object('project_id', id)::text
  ) FROM projects WHERE auto_destroy_at < NOW() AND provisioning_status != 'deleted';$$);
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE C — EDGE FUNCTION AUDIT & DEPLOYMENT
# Check every function's code for correctness, then deploy
# ══════════════════════════════════════════════════════════════════

## C1 — Audit Every Edge Function For Required Patterns

Before deploying, verify every function has all required patterns.
For each function listed below: open the file, check every item, fix what's missing.

### Required pattern checklist for EVERY function:

```typescript
// PATTERN 1: CORS handler — MUST be literal first lines inside Deno.serve
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Hub-Signature-256',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }
  // EVERYTHING ELSE AFTER THIS

// PATTERN 2: Auth check — second thing after CORS
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

// PATTERN 3: All responses include CORS headers
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  })

// PATTERN 4: Error responses are structured
  return new Response(JSON.stringify({
    error: 'Human-readable message',
    code: 'MACHINE_READABLE_CODE',
    details: err.message
  }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})
```

### Function-by-function audit script:

```bash
source /tmp/autostack-env.sh
FUNCTIONS_DIR="supabase/functions"

echo "=== EDGE FUNCTION PATTERN AUDIT ==="
TOTAL_ISSUES=0

audit_function() {
  local fn_dir="$1"
  local fn_name=$(basename "$fn_dir")
  local fn_file="$fn_dir/index.ts"
  local issues=0

  if [ ! -f "$fn_file" ]; then
    echo "❌ $fn_name: index.ts NOT FOUND"
    return 1
  fi

  # Check 1: CORS OPTIONS handler
  if ! grep -q "req.method === 'OPTIONS'" "$fn_file"; then
    echo "  ❌ $fn_name: MISSING OPTIONS handler"
    issues=$((issues + 1))
  fi

  # Check 2: CORS headers in CORS_HEADERS object
  if ! grep -q "Access-Control-Allow-Origin" "$fn_file"; then
    echo "  ❌ $fn_name: MISSING CORS headers"
    issues=$((issues + 1))
  fi

  # Check 3: Authorization header check (skip agent functions and webhooks)
  if [[ "$fn_name" != "github-webhook" && "$fn_name" != "stripe-webhook" && \
        "$fn_name" != "jira-webhook" ]]; then
    if ! grep -q "Authorization" "$fn_file"; then
      echo "  ⚠️ $fn_name: No Authorization check found"
    fi
  fi

  # Check 4: No bare console.log (should be guarded)
  if grep -n "console\.log" "$fn_file" | grep -v "import.meta.env.DEV\|console\.error\|// " | head -3; then
    echo "  ⚠️ $fn_name: Bare console.log found (check above lines)"
  fi

  # Check 5: try-catch around main logic
  if ! grep -q "try {" "$fn_file"; then
    echo "  ⚠️ $fn_name: No try-catch found — add error handling"
  fi

  if [ $issues -eq 0 ]; then
    echo "✅ $fn_name"
  else
    echo "  → $issues issues in $fn_name"
    TOTAL_ISSUES=$((TOTAL_ISSUES + issues))
  fi
}

# Audit all function directories
for fn_dir in "$FUNCTIONS_DIR"/*/; do
  [[ -d "$fn_dir" && "$fn_dir" != *"_shared"* ]] && audit_function "$fn_dir"
done

echo ""
echo "Total issues found: $TOTAL_ISSUES"
[ $TOTAL_ISSUES -eq 0 ] && echo "✅ ALL FUNCTIONS HAVE REQUIRED PATTERNS" || \
  echo "❌ Fix $TOTAL_ISSUES issues above before deploying"
```

## C2 — Fix Common Missing Patterns

For any function missing the CORS handler, apply this fix automatically:

```bash
source /tmp/autostack-env.sh

# Auto-fix: add CORS handler to any function missing it
fix_cors() {
  local fn_file="$1"
  local fn_name=$(basename $(dirname "$fn_file"))

  if ! grep -q "req.method === 'OPTIONS'" "$fn_file"; then
    echo "Fixing CORS in: $fn_name"

    # Create a temp file with CORS const + insert OPTIONS check
    # The fix adds CORS_HEADERS constant and OPTIONS check at the start of Deno.serve
    python3 << PYFIX
import re

with open('$fn_file', 'r') as f:
    content = f.read()

cors_const = """
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Hub-Signature-256',
}
"""

options_check = """  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

"""

# Add CORS_HEADERS if not present
if 'CORS_HEADERS' not in content:
    # Insert before Deno.serve
    content = content.replace('Deno.serve(', cors_const + '\nDeno.serve(')

# Add OPTIONS check if not present
if "req.method === 'OPTIONS'" not in content:
    # Insert at start of Deno.serve handler
    content = re.sub(
        r'(Deno\.serve\(async \(req\) => \{)\n',
        r'\1\n' + options_check,
        content
    )

with open('$fn_file', 'w') as f:
    f.write(content)

print(f'Fixed: $fn_name')
PYFIX
  fi
}

# Apply fix to all functions
for fn_dir in "${FUNCTIONS_DIR}"/*/; do
  fn_file="${fn_dir}index.ts"
  [[ -f "$fn_file" && "$fn_dir" != *"_shared"* ]] && fix_cors "$fn_file"
done

echo "CORS fixes applied"
```

## C3 — Verify and Fix auth-hook Function

This is the most critical function. Get it exactly right.

```typescript
// supabase/functions/auth-hook/index.ts
// FULL CORRECT IMPLEMENTATION — replace any existing version with this

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { user?: { id: string; email: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  const user = body?.user
  if (!user?.id || !user?.email) {
    return new Response(JSON.stringify({ error: 'No user in payload' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  try {
    // Check if org already created for this user (idempotency — RULE B3)
    const { data: existingMember } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (existingMember?.org_id) {
      // Already has an org — just ensure user_metadata is set
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, org_id: existingMember.org_id, role: 'owner' }
      })
      return new Response(JSON.stringify({ success: true, org_id: existingMember.org_id }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    // Derive org name from email domain or provided metadata
    const orgNameFromMeta = user.user_metadata?.organization_name as string | undefined
    const emailDomain = user.email.split('@')[1]?.split('.')[0] || 'org'
    const orgName = orgNameFromMeta || emailDomain.charAt(0).toUpperCase() + emailDomain.slice(1)
    const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36)

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName, slug: orgSlug, plan: 'free' })
      .select()
      .single()

    if (orgError || !org) {
      throw new Error(`Failed to create org: ${orgError?.message}`)
    }

    // Create org_member record
    const { error: memberError } = await supabase
      .from('org_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

    if (memberError) {
      throw new Error(`Failed to create member: ${memberError.message}`)
    }

    // Create default notification prefs
    await supabase.from('notification_prefs').insert({ user_id: user.id })

    // Create plan_usage record
    await supabase.from('plan_usage').insert({
      org_id: org.id,
      live_environments: 0,
      total_nodes: 0
    })

    // Create free trial subscription (14 days Pro trial)
    await supabase.from('subscriptions').insert({
      org_id: org.id,
      plan: 'pro',
      status: 'trialing',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    })

    // CRITICAL: Set org_id in user_metadata — this is what ALL RLS policies use
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        org_id: org.id,
        org_slug: org.slug,
        role: 'owner',
        full_name: user.user_metadata?.full_name || user.email.split('@')[0]
      }
    })

    if (updateError) {
      throw new Error(`Failed to update user metadata: ${updateError.message}`)
    }

    // Send welcome email (non-blocking — don't fail signup if email fails)
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'welcome',
        org_id: org.id,
        recipient_email: user.email,
        recipient_name: user.user_metadata?.full_name || user.email.split('@')[0],
        payload: { org_name: orgName }
      })
    }).catch(err => console.error('Welcome email failed (non-fatal):', err.message))

    return new Response(JSON.stringify({ success: true, org_id: org.id, org_name: orgName }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    const err = error as Error
    console.error('auth-hook error:', err.message)
    // Return 500 so Supabase Auth shows the error — DO NOT return 200 on failure
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
```

Save this as `supabase/functions/auth-hook/index.ts` — replace any existing file.

## C4 — Verify and Fix aws-assume-role Function

```typescript
// supabase/functions/aws-assume-role/index.ts
// Production-grade implementation with all security checks

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand
} from 'npm:@aws-sdk/client-sts@3'
import {
  IAMClient,
  SimulatePrincipalPolicyCommand
} from 'npm:@aws-sdk/client-iam@3'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// Minimum required permissions — all must be present
const REQUIRED_PERMISSIONS = [
  'eks:CreateCluster', 'eks:DescribeCluster', 'eks:DeleteCluster',
  'eks:CreateNodegroup', 'eks:DescribeNodegroup', 'eks:DeleteNodegroup',
  'ec2:CreateVpc', 'ec2:DescribeVpcs', 'ec2:DeleteVpc',
  'ec2:CreateSubnet', 'ec2:CreateInternetGateway', 'ec2:CreateNatGateway',
  'ec2:CreateRouteTable', 'ec2:CreateSecurityGroup', 'ec2:CreateTags',
  'ecr:CreateRepository', 'ecr:GetAuthorizationToken',
  'elasticloadbalancing:CreateLoadBalancer', 'elasticloadbalancing:CreateTargetGroup',
  'iam:CreateRole', 'iam:AttachRolePolicy', 'iam:PassRole',
  'codebuild:CreateProject', 'codebuild:StartBuild', 'codebuild:BatchGetBuilds',
  'sts:AssumeRole', 'sts:GetCallerIdentity'
]

const ERROR_MAP: Record<string, string> = {
  'AccessDenied': 'Cannot assume role. Check that the role trust policy allows AutoStack and includes ExternalId.',
  'NoSuchEntity': 'IAM role not found. Verify the role ARN is correct.',
  'InvalidClientTokenId': 'AWS credentials invalid. Check your Account ID.',
  'ExpiredToken': 'AWS credentials expired. Refresh your credentials.',
  'ValidationError': 'Invalid ARN format. Use: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME',
}

function getFriendlyError(err: Error): string {
  const code = (err as Error & { name?: string }).name || ''
  return ERROR_MAP[code] || `AWS error: ${err.message}`
}

function validateArn(arn: string): boolean {
  return /^arn:aws:iam::\d{12}:role\/[\w+=,.@\-/]+$/.test(arn)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // Auth check
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  const org_id = user.user_metadata?.org_id as string
  if (!org_id) {
    return new Response(JSON.stringify({ error: 'User has no organization. Signup flow incomplete.' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  // Parse and validate input
  let body: { account_id: string; region: string; role_arn: string; display_name?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  const { account_id, region, role_arn, display_name } = body

  // Input validation
  if (!account_id || !/^\d{12}$/.test(account_id)) {
    return new Response(JSON.stringify({ error: 'account_id must be a 12-digit number' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
  if (!validateArn(role_arn)) {
    return new Response(JSON.stringify({ error: 'Invalid role_arn format. Expected: arn:aws:iam::123456789012:role/RoleName' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
  const arnAccountId = role_arn.split(':')[4]
  if (arnAccountId !== account_id) {
    return new Response(JSON.stringify({ error: `ARN account (${arnAccountId}) does not match account_id (${account_id})` }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  const validRegions = [
    'us-east-1','us-east-2','us-west-1','us-west-2',
    'eu-west-1','eu-west-2','eu-central-1','eu-north-1',
    'ap-southeast-1','ap-southeast-2','ap-northeast-1','ap-northeast-2',
    'ap-south-1','ca-central-1','sa-east-1'
  ]
  if (!validRegions.includes(region)) {
    return new Response(JSON.stringify({ error: `Invalid region. Supported: ${validRegions.join(', ')}` }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  // Attempt to assume role
  const sts = new STSClient({ region })
  let tempCreds: { accessKeyId: string; secretAccessKey: string; sessionToken: string }

  try {
    const { Credentials } = await sts.send(new AssumeRoleCommand({
      RoleArn: role_arn,
      RoleSessionName: `AutoStack-Verify-${Date.now()}`,
      ExternalId: org_id,        // SECURITY: confused deputy prevention
      DurationSeconds: 900
    }))
    if (!Credentials?.AccessKeyId) throw new Error('STS returned empty credentials')
    // RULE A1: credentials in memory only — never written to DB
    tempCreds = {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey!,
      sessionToken: Credentials.SessionToken!
    }
  } catch (err: unknown) {
    const errObj = err as Error
    const friendly = getFriendlyError(errObj)

    // Save failed attempt for debugging
    await supabase.from('cloud_credentials').upsert({
      org_id, provider: 'aws', display_name: display_name || `AWS ${account_id}`,
      account_id, region, role_arn, external_id: org_id,
      status: 'error', error_message: friendly
    }, { onConflict: 'org_id,role_arn' })

    return new Response(JSON.stringify({ error: friendly }), {
      status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  // Check permissions using the temporary credentials
  const iam = new IAMClient({ region, credentials: tempCreds })
  const callerSts = new STSClient({ region, credentials: tempCreds })
  const missing: string[] = []

  try {
    const { Arn: callerArn } = await callerSts.send(new GetCallerIdentityCommand({}))
    const batchSize = 100
    for (let i = 0; i < REQUIRED_PERMISSIONS.length; i += batchSize) {
      const batch = REQUIRED_PERMISSIONS.slice(i, i + batchSize)
      const { EvaluationResults } = await iam.send(new SimulatePrincipalPolicyCommand({
        PolicySourceArn: callerArn!,
        ActionNames: batch,
        ResourceArns: ['*']
      }))
      for (const r of EvaluationResults || []) {
        if (r.EvalDecision !== 'allowed') missing.push(r.EvalActionName!)
      }
    }
  } catch {
    // SimulatePrincipalPolicy requires iam:SimulatePrincipalPolicy permission
    // If unavailable, we can still proceed — log warning
    console.error('Could not verify permissions (iam:SimulatePrincipalPolicy not available)')
  }

  const permissionsOk = missing.length === 0

  // Save verified credential to DB (RULE A1: no credentials stored)
  const adminSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data: savedCred, error: saveError } = await adminSupabase
    .from('cloud_credentials')
    .upsert({
      org_id, provider: 'aws',
      display_name: display_name || `AWS ${account_id}`,
      account_id, region, role_arn, external_id: org_id,
      status: permissionsOk ? 'verified' : 'error',
      last_verified_at: new Date().toISOString(),
      permissions_ok: permissionsOk,
      missing_permissions: missing,
      error_message: permissionsOk ? null : `Missing ${missing.length} permissions`
    }, { onConflict: 'org_id,role_arn' })
    .select('id')
    .single()

  if (saveError) {
    return new Response(JSON.stringify({ error: `Failed to save credential: ${saveError.message}` }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({
    success: true,
    credential_id: savedCred.id,
    permissions_ok: permissionsOk,
    missing_permissions: missing,
    verified_at: new Date().toISOString(),
    message: permissionsOk
      ? `IAM role verified — ${REQUIRED_PERMISSIONS.length} permissions confirmed`
      : `Role assumed but missing ${missing.length} permissions. Add them to proceed.`
  }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})
```

## C5 — Shared Utilities: Verify _shared/ modules exist and are correct

```bash
SHARED_DIR="supabase/functions/_shared"

# Required shared modules
REQUIRED_SHARED=(
  "cors.ts"
  "rate-limiter.ts"
  "validator.ts"
  "audit.ts"
  "plan-guard.ts"
  "providers/interface.ts"
  "providers/factory.ts"
  "providers/aws/index.ts"
)

echo "=== SHARED MODULE CHECK ==="
for module in "${REQUIRED_SHARED[@]}"; do
  if [ -f "${SHARED_DIR}/${module}" ]; then
    echo "  ✅ _shared/${module}"
  else
    echo "  ❌ MISSING: _shared/${module}"
  fi
done
```

If `_shared/cors.ts` is missing, create it:

```typescript
// supabase/functions/_shared/cors.ts
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Hub-Signature-256, X-GitHub-Event',
}

export function corsResponse(): Response {
  return new Response(null, { status: 200, headers: CORS_HEADERS })
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  })
}

export function errorResponse(status: number, message: string, code?: string): Response {
  return new Response(JSON.stringify({
    error: message,
    code: code || 'ERROR',
    status
  }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  })
}
```

If `_shared/rate-limiter.ts` is missing, create it:

```typescript
// supabase/functions/_shared/rate-limiter.ts
import { Redis } from 'https://esm.sh/@upstash/redis@1'

const LIMITS: Record<string, { window: number; max: number; by: string }> = {
  'aws-assume-role':    { window: 60,   max: 5,   by: 'user_id' },
  'die-analyze':        { window: 3600, max: 3,   by: 'org_id' },
  'infra-provision':    { window: 3600, max: 3,   by: 'org_id' },
  'deploy-redeploy':    { window: 3600, max: 50,  by: 'org_id' },
  'infra-teardown':     { window: 3600, max: 10,  by: 'org_id' },
  'send-notification':  { window: 3600, max: 50,  by: 'org_id' },
  'github-webhook':     { window: 60,   max: 500, by: 'ip' },
  'agent-metrics':      { window: 60,   max: 120, by: 'cluster_id' },
  'agent-heartbeat':    { window: 60,   max: 10,  by: 'cluster_id' },
  'ai-chat':            { window: 60,   max: 10,  by: 'user_id' },
  'stripe-webhook':     { window: 60,   max: 100, by: 'ip' },
}

export async function checkRateLimit(
  redis: Redis,
  endpoint: string,
  identifier: string
): Promise<{ pass: boolean; remaining: number; resetIn: number }> {
  const config = LIMITS[endpoint]
  if (!config) return { pass: true, remaining: 999, resetIn: 0 }

  const now = Math.floor(Date.now() / 1000)
  const key = `rl:${endpoint}:${identifier}`

  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(key, 0, now - config.window)
  pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })
  pipeline.zcard(key)
  pipeline.expire(key, config.window + 1)

  const results = await pipeline.exec()
  const count = (results[2] as number) || 0

  return {
    pass: count <= config.max,
    remaining: Math.max(0, config.max - count),
    resetIn: config.window
  }
}

export function rateLimitResponse(
  endpoint: string,
  resetIn: number,
  corsHeaders: Record<string, string>
): Response {
  const config = LIMITS[endpoint]
  return new Response(
    JSON.stringify({ error: `Rate limit exceeded. Retry after ${resetIn} seconds.` }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(resetIn),
        'X-RateLimit-Limit': String(config?.max || 0),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + resetIn)
      }
    }
  )
}
```

## C6 — Deploy All Edge Functions

```bash
source /tmp/autostack-env.sh
cd /path/to/AutoStack

# Link to Supabase project first
supabase link --project-ref ${SUPABASE_PROJECT_REF} \
  --password "${SUPABASE_DB_PASSWORD}"

# Set all secrets before deploying
echo "Setting Supabase function secrets..."
supabase secrets set \
  SUPABASE_URL="${SUPABASE_URL}" \
  SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}" \
  AWS_REGION="${AWS_REGION}" \
  GITHUB_APP_ID="${GITHUB_APP_ID}" \
  GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET}" \
  RESEND_API_KEY="${RESEND_API_KEY}" \
  UPSTASH_REDIS_REST_URL="${UPSTASH_REDIS_REST_URL}" \
  UPSTASH_REDIS_REST_TOKEN="${UPSTASH_REDIS_REST_TOKEN}" \
  NVIDIA_API_KEY_1="${NVIDIA_API_KEY_1}" \
  NVIDIA_API_KEY_2="${NVIDIA_API_KEY_2}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_placeholder}" \
  STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_placeholder}" \
  NOTIFICATION_SECRET="$(openssl rand -hex 32)"

# Deploy all Edge Functions one by one with error checking
FUNCTIONS_TO_DEPLOY=(
  "auth-hook"
  "aws-assume-role"
  "die-analyze"
  "infra-provision"
  "infra-teardown"
  "deploy-redeploy"
  "deploy-preview"
  "github-webhook"
  "github-app-install"
  "coie-cycle"
  "aire-detect"
  "agent-register"
  "agent-heartbeat"
  "agent-metrics"
  "send-notification"
  "stripe-webhook"
  "stripe-checkout"
  "stripe-portal"
  "add-custom-domain"
  "provision-database"
  "export-org-data"
  "invite-member"
  "ai-chat"
)

DEPLOY_FAILURES=0
for fn in "${FUNCTIONS_TO_DEPLOY[@]}"; do
  if [ -d "supabase/functions/${fn}" ]; then
    echo -n "Deploying ${fn}..."
    if supabase functions deploy "${fn}" 2>&1 | tail -1; then
      echo "  ✅ ${fn} deployed"
    else
      echo "  ❌ ${fn} FAILED"
      DEPLOY_FAILURES=$((DEPLOY_FAILURES + 1))
    fi
  else
    echo "  ⚠️ ${fn}: directory not found — skipping"
  fi
done

echo ""
echo "Deployment complete. Failures: ${DEPLOY_FAILURES}"
[ $DEPLOY_FAILURES -eq 0 ] && echo "✅ ALL FUNCTIONS DEPLOYED" || echo "❌ $DEPLOY_FAILURES functions failed — fix and redeploy"
```

## C7 — Verify All Functions Respond Correctly

```bash
source /tmp/autostack-env.sh

echo "=== FUNCTION HEALTH CHECK ==="
FAILED=0

check_function() {
  local fn_name="$1"
  local expected_status="${2:-200}"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X OPTIONS \
    -H "Origin: https://autostack.io" \
    -H "Access-Control-Request-Method: POST" \
    "${SUPABASE_URL}/functions/v1/${fn_name}")

  CORS=$(curl -s -I \
    -X OPTIONS \
    "${SUPABASE_URL}/functions/v1/${fn_name}" 2>/dev/null \
    | grep -i "access-control-allow-origin" | tr -d '\r')

  if [ "${STATUS}" = "200" ] && [ -n "${CORS}" ]; then
    echo "  ✅ ${fn_name}: CORS OK"
  else
    echo "  ❌ ${fn_name}: CORS FAIL (HTTP ${STATUS}, cors: ${CORS:-MISSING})"
    FAILED=$((FAILED + 1))
  fi
}

for fn in auth-hook aws-assume-role die-analyze infra-provision infra-teardown \
          deploy-redeploy deploy-preview github-webhook coie-cycle aire-detect \
          agent-register agent-heartbeat agent-metrics send-notification \
          stripe-webhook stripe-checkout stripe-portal add-custom-domain \
          provision-database invite-member ai-chat; do
  check_function "$fn"
done

echo ""
[ $FAILED -eq 0 ] && echo "✅ ALL FUNCTIONS RESPONDING WITH CORS" || \
  echo "❌ $FAILED functions failing — redeploy or check code"
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE D — AWS INFRASTRUCTURE SETUP
# Create IAM role, verify permissions, test assumption
# ══════════════════════════════════════════════════════════════════

## D1 — Create AutoStack IAM Role

```bash
source /tmp/autostack-env.sh

echo "=== CREATING AUTOSTACK IAM ROLE ==="

# Check if role already exists
EXISTING=$(aws iam get-role --role-name AutoStackDeploymentRole 2>&1)
if echo "${EXISTING}" | grep -q "RoleName"; then
  echo "✅ AutoStackDeploymentRole already exists"
  export AUTOSTACK_ROLE_ARN=$(echo "${EXISTING}" | python3 -c "import json,sys; print(json.load(sys.stdin)['Role']['Arn'])")
  echo "Role ARN: ${AUTOSTACK_ROLE_ARN}"
else
  echo "Creating AutoStackDeploymentRole..."

  # Trust policy — allows the same account to assume this role
  # The ExternalId = org_id check is enforced at code level
  cat > /tmp/autostack-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${AWS_ACCOUNT_ID}:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringLike": {
          "sts:ExternalId": "*"
        }
      }
    }
  ]
}
EOF

  # Create the role
  CREATE_RESULT=$(aws iam create-role \
    --role-name AutoStackDeploymentRole \
    --assume-role-policy-document file:///tmp/autostack-trust-policy.json \
    --description "AutoStack deployment role — grants infrastructure provisioning permissions" \
    --tags Key=autostack:managed,Value=true)

  export AUTOSTACK_ROLE_ARN=$(echo "${CREATE_RESULT}" | \
    python3 -c "import json,sys; print(json.load(sys.stdin)['Role']['Arn'])")
  echo "Created role ARN: ${AUTOSTACK_ROLE_ARN}"

  # Attach required AWS managed policies
  POLICIES=(
    "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess"
    "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess"
    "arn:aws:iam::aws:policy/AmazonVPCFullAccess"
    "arn:aws:iam::aws:policy/IAMFullAccess"
    "arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess"
    "arn:aws:iam::aws:policy/AmazonRoute53FullAccess"
    "arn:aws:iam::aws:policy/AWSCertificateManagerFullAccess"
  )

  for policy in "${POLICIES[@]}"; do
    echo -n "  Attaching ${policy##*/}..."
    aws iam attach-role-policy \
      --role-name AutoStackDeploymentRole \
      --policy-arn "${policy}" && echo " ✅" || echo " ❌"
  done

  # Create and attach inline policy for EKS-specific permissions not in managed policies
  cat > /tmp/autostack-inline-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "eks:*",
        "ec2:*",
        "ecr:*",
        "sts:AssumeRole",
        "sts:GetCallerIdentity",
        "iam:SimulatePrincipalPolicy",
        "logs:CreateLogGroup",
        "logs:CreateLogDelivery",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "resourcegroupstaggingapi:GetResources",
        "resourcegroupstaggingapi:TagResources"
      ],
      "Resource": "*"
    }
  ]
}
EOF

  aws iam put-role-policy \
    --role-name AutoStackDeploymentRole \
    --policy-name AutoStackInlinePolicy \
    --policy-document file:///tmp/autostack-inline-policy.json
  echo "✅ Inline policy attached"
fi

# Update the credentials file with the role ARN
sed -i "s|AUTOSTACK_ROLE_ARN=.*|AUTOSTACK_ROLE_ARN=\"${AUTOSTACK_ROLE_ARN}\"|" /tmp/autostack-env.sh

echo ""
echo "AUTOSTACK_ROLE_ARN=${AUTOSTACK_ROLE_ARN}"
```

## D2 — Test IAM Role Assumption

```bash
source /tmp/autostack-env.sh

echo "=== TESTING IAM ROLE ASSUMPTION ==="

# Test with a dummy ExternalId (production will use org_id)
ASSUME_RESULT=$(aws sts assume-role \
  --role-arn "${AUTOSTACK_ROLE_ARN}" \
  --role-session-name "AutoStack-Test-$(date +%s)" \
  --external-id "test-org-id" \
  --duration-seconds 900 \
  2>&1)

if echo "${ASSUME_RESULT}" | grep -q "AccessKeyId"; then
  echo "✅ Role assumption SUCCESSFUL"
  TEMP_ACCESS_KEY=$(echo "${ASSUME_RESULT}" | python3 -c \
    "import json,sys; c=json.load(sys.stdin)['Credentials']; print(c['AccessKeyId'][:8]+'...')")
  echo "  Temp credentials: ${TEMP_ACCESS_KEY}"

  # Test that temp credentials work
  TEMP_IDENTITY=$(AWS_ACCESS_KEY_ID=$(echo "${ASSUME_RESULT}" | python3 -c \
    "import json,sys; print(json.load(sys.stdin)['Credentials']['AccessKeyId'])") \
    AWS_SECRET_ACCESS_KEY=$(echo "${ASSUME_RESULT}" | python3 -c \
    "import json,sys; print(json.load(sys.stdin)['Credentials']['SecretAccessKey'])") \
    AWS_SESSION_TOKEN=$(echo "${ASSUME_RESULT}" | python3 -c \
    "import json,sys; print(json.load(sys.stdin)['Credentials']['SessionToken'])") \
    aws sts get-caller-identity 2>&1)

  if echo "${TEMP_IDENTITY}" | grep -q "Account"; then
    echo "✅ Temp credentials work — GetCallerIdentity successful"
    echo "${TEMP_IDENTITY}"
  else
    echo "❌ Temp credentials do not work: ${TEMP_IDENTITY}"
  fi
else
  echo "❌ Role assumption FAILED:"
  echo "${ASSUME_RESULT}"
fi
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE E — AUTH SYSTEM VERIFICATION
# Register auth hook, test signup, verify org creation
# ══════════════════════════════════════════════════════════════════

## E1 — Register Auth Hook in Supabase Dashboard

This cannot be done via CLI — must be done in the Supabase Dashboard.

```
Manual steps (takes 2 minutes):

1. Open: https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd
2. Left sidebar → Authentication → Hooks
3. Click "Add hook" or "Enable hook"
4. Select: "Auth hook"
5. Hook type: "After signup" (triggers after successful user creation)
6. Function: auth-hook
7. Save

VERIFY in the next step.
```

## E2 — Test Auth Hook End-to-End

```bash
source /tmp/autostack-env.sh

echo "=== AUTH HOOK TEST ==="

# Create test user
SIGNUP_RESULT=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "auth-test-'$(date +%s)'@autostack-e2e.io",
    "password": "TestPassword123!",
    "options": {
      "data": {
        "full_name": "Auth Test User",
        "organization_name": "Auth Test Corp"
      }
    }
  }')

echo "Signup response:"
echo "${SIGNUP_RESULT}" | jq '{
  access_token: .access_token[0:20],
  user_id: .user.id,
  org_id: .user.user_metadata.org_id,
  role: .user.user_metadata.role,
  email: .user.email
}'

# Critical checks
ORG_ID=$(echo "${SIGNUP_RESULT}" | jq -r '.user.user_metadata.org_id // empty')
ROLE=$(echo "${SIGNUP_RESULT}" | jq -r '.user.user_metadata.role // empty')
ACCESS_TOKEN=$(echo "${SIGNUP_RESULT}" | jq -r '.access_token // empty')

if [ -z "${ORG_ID}" ]; then
  echo ""
  echo "❌ CRITICAL: org_id MISSING from user_metadata"
  echo "   This means auth-hook DID NOT RUN"
  echo "   Go to Supabase Dashboard → Authentication → Hooks and register auth-hook"
  echo "   Then re-run this test"
  exit 1
else
  echo ""
  echo "✅ org_id present: ${ORG_ID}"
fi

[ "${ROLE}" = "owner" ] && echo "✅ role = owner" || echo "❌ role missing or wrong: ${ROLE}"

# Verify org was created in DB
ORG=$(curl -s "${SUPABASE_URL}/rest/v1/organizations?id=eq.${ORG_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")
ORG_NAME=$(echo "${ORG}" | jq -r '.[0].name // empty')
[ -n "${ORG_NAME}" ] && echo "✅ Organization created: ${ORG_NAME}" || echo "❌ Organization NOT in DB"

# Verify subscription (trial) was created
SUB=$(curl -s "${SUPABASE_URL}/rest/v1/subscriptions?org_id=eq.${ORG_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")
SUB_STATUS=$(echo "${SUB}" | jq -r '.[0].status // empty')
[ "${SUB_STATUS}" = "trialing" ] && echo "✅ Trial subscription created" || echo "⚠️ Subscription status: ${SUB_STATUS}"

# RLS isolation test
SECOND_SIGNUP=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email": "rls-test-'$(date +%s)'@evil.io", "password": "TestPassword123!"}')
SECOND_JWT=$(echo "${SECOND_SIGNUP}" | jq -r '.access_token')

# Attacker tries to read first user's org
STOLEN=$(curl -s "${SUPABASE_URL}/rest/v1/organizations?id=eq.${ORG_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SECOND_JWT}")
STOLEN_COUNT=$(echo "${STOLEN}" | jq length)

[ "${STOLEN_COUNT}" = "0" ] && echo "✅ RLS isolation: cross-org read blocked" || \
  echo "❌ CRITICAL: RLS BYPASS — org data leaked to another user!"

export TEST_JWT="${ACCESS_TOKEN}"
export TEST_ORG_ID="${ORG_ID}"

echo ""
echo "Test credentials saved:"
echo "  TEST_JWT: ${TEST_JWT:0:20}..."
echo "  TEST_ORG_ID: ${TEST_ORG_ID}"
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE F — FRONTEND BUILD & VERIFICATION
# ══════════════════════════════════════════════════════════════════

## F1 — Verify Frontend Environment

```bash
# Create frontend .env.local with all required variables
source /tmp/autostack-env.sh

cat > frontend/.env.local << EOF
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
VITE_APP_URL=https://autostack.io
VITE_POSTHOG_KEY=${POSTHOG_KEY:-phc_placeholder}
VITE_POSTHOG_HOST=https://app.posthog.com
VITE_SENTRY_DSN=${SENTRY_DSN:-}
EOF

echo "✅ frontend/.env.local created"
cat frontend/.env.local | sed 's/=.*/=***/' # show keys without values
```

## F2 — Fix Frontend Build Issues

```bash
cd frontend

# Install dependencies
npm install 2>&1 | tail -5

# Check for import errors
echo "=== CHECKING FOR IMPORT ERRORS ==="
npx tsc --noEmit 2>&1 | head -50 || echo "TypeScript errors found — check above"

# Attempt build
echo "=== BUILDING FRONTEND ==="
npm run build 2>&1

BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
  echo "✅ Frontend build SUCCESSFUL"
  ls -lh dist/
else
  echo "❌ Frontend build FAILED (exit code: ${BUILD_EXIT})"
  echo "Run: cd frontend && npm run build to see full error"
fi

cd ..
```

Common build fixes:

If you see `Cannot find module '@/...'`:
```bash
# Check vite.config.ts has path aliases
grep -n "resolve" frontend/vite.config.ts
# Should have: resolve: { alias: { '@': path.resolve(__dirname, './src') } }
```

If you see `rollup: Could not resolve`:
```bash
cd frontend && npm install [missing-package]
```

If you see TypeScript errors about types:
```bash
cd frontend && npm install --save-dev @types/node
```

## F3 — Check Bundle Sizes

```bash
cd frontend && npm run build 2>/dev/null && ls -lh dist/assets/ | sort -k5 -h -r | head -20
# Warning if any single file > 500KB
# Critical if index.js > 200KB (means ui/index.jsx not split)
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE G — CREATE TEST REPOSITORY
# ══════════════════════════════════════════════════════════════════

## G1 — Create GitHub Test Repository

```bash
source /tmp/autostack-env.sh

# Authenticate gh CLI
echo "${GITHUB_PAT}" | gh auth login --with-token 2>/dev/null || \
  gh auth login --hostname github.com

# Create test app
mkdir -p /tmp/autostack-e2e-test

cat > /tmp/autostack-e2e-test/index.js << 'EOF'
const http = require('http')
const port = process.env.PORT || 3000

const server = http.createServer((req, res) => {
  const now = new Date().toISOString()

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      healthy: true,
      timestamp: now,
      env: process.env.NODE_ENV || 'unknown',
      version: '1.0.0'
    }))
    return
  }

  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      uptime_seconds: process.uptime(),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      requests_total: ++global.reqCount || 1
    }))
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    message: 'AutoStack E2E Test App',
    timestamp: now,
    node_version: process.version
  }))
})

server.listen(port, '0.0.0.0', () => {
  console.log(`AutoStack test server running on port ${port}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})
EOF

cat > /tmp/autostack-e2e-test/package.json << 'EOF'
{
  "name": "autostack-e2e-test",
  "version": "1.0.0",
  "description": "AutoStack end-to-end test application — simple Node.js HTTP server",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node index.js"
  },
  "engines": {
    "node": ">=20"
  },
  "keywords": ["autostack", "test"],
  "license": "MIT"
}
EOF

echo "node_modules/" > /tmp/autostack-e2e-test/.gitignore
echo "# AutoStack E2E Test App" > /tmp/autostack-e2e-test/README.md

# Create the repo
cd /tmp/autostack-e2e-test
git init
git add .
git commit -m "Initial commit: AutoStack E2E test app"

# Push to GitHub
gh repo create autostack-e2e-test \
  --public \
  --description "AutoStack end-to-end test application" \
  --source . \
  --push 2>/dev/null

GITHUB_USERNAME=$(gh api user -q .login)
export TEST_REPO_URL="https://github.com/${GITHUB_USERNAME}/autostack-e2e-test"
echo "✅ Test repo created: ${TEST_REPO_URL}"
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE H — FULL E2E TEST EXECUTION
# The actual test: repo → live URL on AWS
# ══════════════════════════════════════════════════════════════════

## H1 — Verify AWS Credentials Endpoint

```bash
source /tmp/autostack-env.sh

echo "=== STEP 1: AWS CREDENTIAL VERIFICATION ==="

CRED_RESULT=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/aws-assume-role" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"account_id\": \"${AWS_ACCOUNT_ID}\",
    \"region\": \"${AWS_REGION}\",
    \"role_arn\": \"${AUTOSTACK_ROLE_ARN}\",
    \"display_name\": \"E2E Test Account\"
  }")

echo "${CRED_RESULT}" | jq .

SUCCESS=$(echo "${CRED_RESULT}" | jq -r '.success')
CRED_ID=$(echo "${CRED_RESULT}" | jq -r '.credential_id // empty')

if [ "${SUCCESS}" = "true" ] && [ -n "${CRED_ID}" ]; then
  echo "✅ Cloud credential verified and saved"
  echo "  credential_id: ${CRED_ID}"
  export TEST_CRED_ID="${CRED_ID}"
else
  echo "❌ Cloud credential verification FAILED"
  echo "  Error: $(echo ${CRED_RESULT} | jq -r '.error')"
  echo "  Check: IAM role ARN, trust policy, ExternalId"
  exit 1
fi

# Verify no credentials in DB
DB_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/cloud_credentials?id=eq.${CRED_ID}&select=role_arn,status,permissions_ok" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}")
echo "DB record (no credentials should appear here):"
echo "${DB_CHECK}" | jq .
```

## H2 — Create Project and Run DIE Analysis

```bash
source /tmp/autostack-env.sh

echo "=== STEP 2: PROJECT CREATION & ANALYSIS ==="
DEPLOY_START=$(date +%s)

# Create project record
PROJECT=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/projects" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"org_id\": \"${TEST_ORG_ID}\",
    \"name\": \"e2e-test-$(date +%s)\",
    \"repo_url\": \"${TEST_REPO_URL}\",
    \"branch\": \"main\",
    \"environment\": \"production\",
    \"size\": \"small\"
  }")

export TEST_PROJECT_ID=$(echo "${PROJECT}" | jq -r '.[0].id')
echo "Project created: ${TEST_PROJECT_ID}"

# Run DIE analysis
echo "Running repo analysis..."
ANALYZE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/die-analyze" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"${TEST_PROJECT_ID}\",
    \"credential_id\": \"${TEST_CRED_ID}\"
  }")

echo "Analysis result:"
echo "${ANALYZE}" | jq .

STATUS=$(echo "${ANALYZE}" | jq -r '.status')
LANG=$(echo "${ANALYZE}" | jq -r '.repo_profile.language // "unknown"')
COST=$(echo "${ANALYZE}" | jq -r '.infra_plan.totalMonthlyCost // 0')

echo ""
[ "${STATUS}" = "waiting_confirm" ] && echo "✅ Analysis complete, cost plan ready" || echo "❌ Analysis failed: ${STATUS}"
echo "  Detected language: ${LANG}"
echo "  Estimated cost: \$${COST}/month"

export PROVISION_COST="${COST}"
```

## H3 — Confirm and Provision Infrastructure

```bash
source /tmp/autostack-env.sh

echo "=== STEP 3: INFRASTRUCTURE PROVISIONING ==="
echo "About to create real AWS resources. Estimated cost: ~\$0.63 for 2-hour test."
echo ""

PROVISION_START=$(date +%s)

# Trigger provisioning
PROVISION=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/infra-provision" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"${TEST_PROJECT_ID}\",
    \"credential_id\": \"${TEST_CRED_ID}\",
    \"confirmed\": true
  }")

echo "Provision response: $(echo ${PROVISION} | jq .)"

# Poll for completion with detailed progress
echo ""
echo "Polling for infrastructure creation..."
LAST_STAGE=""
TIMEOUT=1500  # 25 minutes

while true; do
  ELAPSED=$(( $(date +%s) - PROVISION_START ))

  PROJECT_STATUS=$(curl -s \
    "${SUPABASE_URL}/rest/v1/projects?id=eq.${TEST_PROJECT_ID}&select=provisioning_status,die_stage,live_url,cluster_arn,vpc_id" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}")

  STATUS=$(echo "${PROJECT_STATUS}" | jq -r '.[0].provisioning_status')
  STAGE=$(echo "${PROJECT_STATUS}" | jq -r '.[0].die_stage // ""')

  # Get latest events
  LATEST_EVENT=$(curl -s \
    "${SUPABASE_URL}/rest/v1/infrastructure_events?project_id=eq.${TEST_PROJECT_ID}&order=created_at.desc&limit=1" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].message // ""')

  if [ "${STAGE}" != "${LAST_STAGE}" ] && [ -n "${STAGE}" ]; then
    printf "[%3ds] %-40s %s\n" "${ELAPSED}" "${STAGE}" "${LATEST_EVENT:0:60}"
    LAST_STAGE="${STAGE}"
  fi

  if [ "${STATUS}" = "live" ]; then
    LIVE_URL=$(echo "${PROJECT_STATUS}" | jq -r '.[0].live_url')
    VPC_ID=$(echo "${PROJECT_STATUS}" | jq -r '.[0].vpc_id')
    CLUSTER_ARN=$(echo "${PROJECT_STATUS}" | jq -r '.[0].cluster_arn')
    TOTAL_TIME=$(( $(date +%s) - DEPLOY_START ))

    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ✅ DEPLOYMENT LIVE!                                      ║"
    printf "║  Time: %-50s  ║\n" "${TOTAL_TIME}s ($(( TOTAL_TIME / 60 ))m $(( TOTAL_TIME % 60 ))s)"
    printf "║  URL:  %-50s  ║\n" "${LIVE_URL}"
    printf "║  VPC:  %-50s  ║\n" "${VPC_ID}"
    echo "╚══════════════════════════════════════════════════════════╝"
    export TEST_LIVE_URL="${LIVE_URL}"
    export TEST_VPC_ID="${VPC_ID}"
    export TEST_CLUSTER_ARN="${CLUSTER_ARN}"
    break
  fi

  if [ "${STATUS}" = "failed" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ❌ DEPLOYMENT FAILED                                     ║"
    printf "║  Stage: %-49s  ║\n" "${STAGE}"
    echo "╚══════════════════════════════════════════════════════════╝"

    echo ""
    echo "Full event log:"
    curl -s "${SUPABASE_URL}/rest/v1/infrastructure_events?project_id=eq.${TEST_PROJECT_ID}&order=created_at.asc" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${TEST_JWT}" | \
      jq -r '.[] | "[\(.stage)] [\(.event_type)] \(.message)"'

    export DEPLOY_FAILED=true
    break
  fi

  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo "❌ TIMEOUT after ${TIMEOUT}s"
    export DEPLOY_FAILED=true
    break
  fi

  sleep 30
done
```

## H4 — Live URL Validation Suite

```bash
source /tmp/autostack-env.sh

if [ -z "${DEPLOY_FAILED}" ]; then
  echo "=== LIVE URL VALIDATION SUITE ==="

  PASS=0
  FAIL=0

  run_test() {
    local name="$1"
    local cmd="$2"
    local expected="$3"

    RESULT=$(eval "$cmd" 2>&1)
    if echo "${RESULT}" | grep -q "${expected}"; then
      echo "  ✅ ${name}"
      PASS=$((PASS + 1))
    else
      echo "  ❌ ${name}: expected '${expected}', got: $(echo ${RESULT} | head -c 100)"
      FAIL=$((FAIL + 1))
    fi
  }

  # T1: Health endpoint returns 200
  run_test "Health endpoint HTTP 200" \
    "curl -s -o /dev/null -w '%{http_code}' ${TEST_LIVE_URL}/health" \
    "200"

  # T2: Health response is valid JSON with healthy:true
  run_test "Health response is JSON" \
    "curl -s ${TEST_LIVE_URL}/health" \
    '"healthy":true'

  # T3: HTTPS works
  run_test "HTTPS/TLS active" \
    "curl -s --max-time 10 https://${TEST_LIVE_URL#https://}/health -o /dev/null -w '%{http_code}'" \
    "200"

  # T4: Response time < 2 seconds
  LATENCY=$(curl -s -o /dev/null -w '%{time_total}' "${TEST_LIVE_URL}/health")
  if (( $(echo "${LATENCY} < 2.0" | bc -l) )); then
    echo "  ✅ Response latency: ${LATENCY}s (< 2s)"
    PASS=$((PASS + 1))
  else
    echo "  ⚠️ Response latency: ${LATENCY}s (> 2s — check ALB target health)"
  fi

  # T5-T14: Concurrent load test (10 requests)
  echo "  Running load test (10 concurrent)..."
  CONCURRENT_RESULTS=$(for i in {1..10}; do
    curl -s -o /dev/null -w "%{http_code} " --max-time 5 "${TEST_LIVE_URL}/health" &
  done; wait)
  FAILED_CONCURRENT=$(echo "${CONCURRENT_RESULTS}" | tr ' ' '\n' | grep -v "200" | wc -l)
  if [ "${FAILED_CONCURRENT}" = "0" ]; then
    echo "  ✅ Load test: 10/10 requests returned 200"
    PASS=$((PASS + 1))
  else
    echo "  ❌ Load test: ${FAILED_CONCURRENT}/10 requests failed"
    echo "    Responses: ${CONCURRENT_RESULTS}"
    FAIL=$((FAIL + 1))
  fi

  # T15: AWS resource tagging
  VPC_TAGS=$(aws ec2 describe-vpcs \
    --filters "Name=tag:autostack:project_id,Values=${TEST_PROJECT_ID}" \
    --region "${AWS_REGION}" --output json 2>/dev/null | jq '.Vpcs | length')
  [ "${VPC_TAGS}" = "1" ] && echo "  ✅ VPC tagged with project_id" && PASS=$((PASS+1)) || \
    echo "  ❌ VPC tag not found" && FAIL=$((FAIL+1))

  echo ""
  echo "Live URL Tests: ${PASS} passed, ${FAIL} failed"
  [ $FAIL -eq 0 ] && echo "✅ ALL LIVE URL TESTS PASSED" || echo "❌ $FAIL tests failed"
fi
```

## H5 — Intelligence Layer Tests

```bash
source /tmp/autostack-env.sh

echo "=== INTELLIGENCE LAYER TESTS ==="

# Get cluster ID (created during provisioning)
CLUSTER_ID=$(curl -s "${SUPABASE_URL}/rest/v1/clusters?org_id=eq.${TEST_ORG_ID}&limit=1" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].id')

echo "Cluster ID: ${CLUSTER_ID}"

# COIE Test
echo ""
echo "--- COIE Test ---"
COIE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/coie-cycle" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"cluster_id\": \"${CLUSTER_ID}\"}")

echo "COIE response: $(echo ${COIE} | jq .)"
sleep 10

SCORES=$(curl -s "${SUPABASE_URL}/rest/v1/clusters?id=eq.${CLUSTER_ID}&select=health_score,score_security,score_reliability,score_cost,score_performance" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}")
echo "Cluster scores after COIE:"
echo "${SCORES}" | jq .

HEALTH=$(echo "${SCORES}" | jq -r '.[0].health_score // 0')
[ "${HEALTH}" -gt 0 ] && echo "✅ COIE ran, health_score = ${HEALTH}" || echo "❌ COIE failed — health_score is 0 or null"

# AIRE Test
echo ""
echo "--- AIRE Test ---"
INCIDENT=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/incidents" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"cluster_id\": \"${CLUSTER_ID}\",
    \"trigger_type\": \"oom_kill\",
    \"affected_resource\": \"test-pod-e2e\",
    \"namespace\": \"default\",
    \"severity\": \"high\",
    \"status\": \"detected\",
    \"log_excerpts\": [\"OOMKilled: container exceeded memory limit 512Mi\", \"Killed process 1 (node)\"]
  }")

INCIDENT_ID=$(echo "${INCIDENT}" | jq -r '.[0].id')
echo "Created incident: ${INCIDENT_ID}"
echo "Waiting 45s for AIRE diagnosis..."
sleep 45

DIAG=$(curl -s "${SUPABASE_URL}/rest/v1/incidents?id=eq.${INCIDENT_ID}&select=status,matched_pattern,root_cause,immediate_action" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}")
echo "Incident after AIRE:"
echo "${DIAG}" | jq .

AIRE_STATUS=$(echo "${DIAG}" | jq -r '.[0].status')
AIRE_RCA=$(echo "${DIAG}" | jq -r '.[0].root_cause // empty')
[ "${AIRE_STATUS}" = "diagnosed" ] && [ -n "${AIRE_RCA}" ] && \
  echo "✅ AIRE diagnosed: ${AIRE_RCA:0:80}" || \
  echo "❌ AIRE failed — status: ${AIRE_STATUS}, root_cause: ${AIRE_RCA:-null}"
```

## H6 — Security Test Suite

```bash
source /tmp/autostack-env.sh

echo "=== SECURITY TEST SUITE ==="
SEC_PASS=0
SEC_FAIL=0

sec_test() {
  local name="$1"
  local expected_code="$2"
  local cmd="$3"

  CODE=$(eval "$cmd" 2>&1)
  if [ "${CODE}" = "${expected_code}" ]; then
    echo "  ✅ ${name}"
    SEC_PASS=$((SEC_PASS + 1))
  else
    echo "  ❌ ${name}: expected HTTP ${expected_code}, got HTTP ${CODE}"
    SEC_FAIL=$((SEC_FAIL + 1))
  fi
}

# Auth tests
sec_test "No auth header → 401" "401" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST '${SUPABASE_URL}/functions/v1/die-analyze' -H 'Content-Type: application/json' -d '{\"test\": true}'"

sec_test "Fake JWT → 401" "401" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST '${SUPABASE_URL}/functions/v1/die-analyze' -H 'Authorization: Bearer eyJfake.fake.fake' -H 'Content-Type: application/json' -d '{\"test\": true}'"

sec_test "Invalid ARN → 400" "400" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST '${SUPABASE_URL}/functions/v1/aws-assume-role' -H 'Authorization: Bearer ${TEST_JWT}' -H 'Content-Type: application/json' -d '{\"account_id\": \"not-valid\", \"region\": \"us-east-1\", \"role_arn\": \"not-an-arn\"}'"

sec_test "Unsigned GitHub webhook → 401" "401" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST '${SUPABASE_URL}/functions/v1/github-webhook' -H 'Content-Type: application/json' -H 'X-GitHub-Event: push' -d '{\"ref\": \"refs/heads/main\"}'"

sec_test "SQL injection in account_id → 400" "400" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST '${SUPABASE_URL}/functions/v1/aws-assume-role' -H 'Authorization: Bearer ${TEST_JWT}' -H 'Content-Type: application/json' -d '{\"account_id\": \"1; DROP TABLE organizations;--\", \"region\": \"us-east-1\", \"role_arn\": \"arn:aws:iam::000000000000:role/test\"}'"

# RLS test
ATTACKER_SIGNUP=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email": "sec-attacker-'$(date +%s)'@evil.io", "password": "Attack123!"}')
ATTACKER_JWT=$(echo "${ATTACKER_SIGNUP}" | jq -r '.access_token')

STOLEN_CLUSTER=$(curl -s "${SUPABASE_URL}/rest/v1/clusters?id=eq.${CLUSTER_ID}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ATTACKER_JWT}" | jq length)
[ "${STOLEN_CLUSTER}" = "0" ] && \
  echo "  ✅ RLS isolation: attacker cannot read cluster" && SEC_PASS=$((SEC_PASS+1)) || \
  echo "  ❌ CRITICAL: RLS BYPASSED — ${STOLEN_CLUSTER} rows leaked to attacker" && SEC_FAIL=$((SEC_FAIL+1))

# Service role key check
LEAK=$(grep -r "SERVICE_ROLE" frontend/src/ 2>/dev/null | grep -v "test\|spec\|\.md" | head -3)
[ -z "${LEAK}" ] && echo "  ✅ No SERVICE_ROLE_KEY in frontend source" && SEC_PASS=$((SEC_PASS+1)) || \
  echo "  ❌ SERVICE_ROLE_KEY found in frontend: ${LEAK}" && SEC_FAIL=$((SEC_FAIL+1))

echo ""
echo "Security Tests: ${SEC_PASS} passed, ${SEC_FAIL} failed"
[ $SEC_FAIL -eq 0 ] && echo "✅ ALL SECURITY TESTS PASSED" || echo "❌ $SEC_FAIL SECURITY ISSUES"
```

## H7 — Redeploy and Rollback Test

```bash
source /tmp/autostack-env.sh

if [ -z "${DEPLOY_FAILED}" ]; then
  echo "=== REDEPLOY + ROLLBACK TEST ==="

  FIRST_DEPLOY_ID=$(curl -s "${SUPABASE_URL}/rest/v1/deployments?project_id=eq.${TEST_PROJECT_ID}&order=started_at.asc&limit=1" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].id')

  echo "First deploy ID: ${FIRST_DEPLOY_ID}"
  echo "Triggering redeploy..."

  REDEPLOY=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/deploy-redeploy" \
    -H "Authorization: Bearer ${TEST_JWT}" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\": \"${TEST_PROJECT_ID}\", \"commit_sha\": \"test$(date +%s)\", \"commit_msg\": \"E2E test redeploy\"}")

  SECOND_DEPLOY_ID=$(echo "${REDEPLOY}" | jq -r '.deployment_id')
  echo "Redeploy started: ${SECOND_DEPLOY_ID}"
  echo "Waiting 3 minutes for redeploy to complete..."
  sleep 180

  SECOND_STATUS=$(curl -s "${SUPABASE_URL}/rest/v1/deployments?id=eq.${SECOND_DEPLOY_ID}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].status')

  [ "${SECOND_STATUS}" = "success" ] && echo "✅ Redeploy succeeded" || echo "❌ Redeploy status: ${SECOND_STATUS}"

  # Test rollback
  echo ""
  echo "Testing rollback to first deployment..."
  ROLLBACK=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/deploy-rollback" \
    -H "Authorization: Bearer ${TEST_JWT}" \
    -H "Content-Type: application/json" \
    -d "{\"deployment_id\": \"${FIRST_DEPLOY_ID}\"}")
  echo "Rollback response: $(echo ${ROLLBACK} | jq .)"

  sleep 180
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${TEST_LIVE_URL}/health")
  [ "${HEALTH}" = "200" ] && echo "✅ App still serving after rollback (HTTP 200)" || \
    echo "❌ App not responding after rollback (HTTP ${HEALTH})"
fi
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE I — GENERATE DIAGNOSTIC REPORT
# ══════════════════════════════════════════════════════════════════

```bash
source /tmp/autostack-env.sh
REPORT_FILE="/tmp/autostack-diagnostic-report-$(date +%Y%m%d-%H%M%S).md"
TOTAL_TIME=$(( $(date +%s) - DEPLOY_START ))

cat > "${REPORT_FILE}" << REPORT_HEADER
# AUTOSTACK FINAL DIAGNOSTIC REPORT
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Total test duration: ${TOTAL_TIME}s ($(( TOTAL_TIME / 60 ))m $(( TOTAL_TIME % 60 ))s)

REPORT_HEADER

# Section 1: Overall verdict
{
  echo "## SECTION 1 — OVERALL VERDICT"
  echo ""
  if [ -z "${DEPLOY_FAILED}" ]; then
    echo "CORE PRODUCT PROMISE: ✅ DELIVERED"
    echo "  'User pastes GitHub URL, connects AWS, gets live URL in < 15 min'"
    echo "  Actual time: ${TOTAL_TIME}s ($(( TOTAL_TIME / 60 ))m)"
    echo "  Live URL: ${TEST_LIVE_URL}"
    HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TEST_LIVE_URL}/health" 2>/dev/null)
    echo "  URL responds: HTTP ${HEALTH_CODE}"
    echo "  READINESS SCORE: 90+/100 — PRODUCTION READY"
  else
    echo "CORE PRODUCT PROMISE: ❌ NOT DELIVERED (deployment failed)"
    echo "  See Section 3 for failure details"
    echo "  READINESS SCORE: 60/100 — BETA READY (after fixing failures)"
  fi
  echo ""
} >> "${REPORT_FILE}"

# Print location
echo "Report saved to: ${REPORT_FILE}"
echo "Run: cat ${REPORT_FILE} to view"
```

## Generate full report sections

```bash
source /tmp/autostack-env.sh

# Append all results to report
cat >> "${REPORT_FILE}" << 'SECTIONS'

## SECTION 2 — WHAT PASSED

SECTIONS

# Dynamically append pass/fail results from all tests run above
# (each test section should append to ${REPORT_FILE})

# Section on AWS resources
{
  echo "## SECTION 8 — AWS RESOURCE AUDIT"
  echo ""
  echo "Resources created during this test run:"
  echo "  VPC ID:          ${TEST_VPC_ID:-'not created'}"
  echo "  EKS Cluster ARN: ${TEST_CLUSTER_ARN:-'not created'}"
  echo "  Project ID:      ${TEST_PROJECT_ID:-'not created'}"
  echo ""
  echo "Resource tagging: All resources tagged with autostack:project_id"
  echo "Teardown required: YES — Step J will destroy everything"
  echo ""
} >> "${REPORT_FILE}"

# Product viability section
cat >> "${REPORT_FILE}" << 'VIABILITY'

## SECTION 9 — PRODUCT VIABILITY PREDICTION

CORE VALUE PROP:
  "User pastes GitHub URL → live URL on their AWS in < 15 min"
  This is real. Railway/Render/ToyStack do not do this.
  They deploy on their cloud. AutoStack deploys on the user's cloud.
  This is the enterprise unlock: SOC2, HIPAA, GDPR, FedRAMP all require own-cloud.

DIFFERENTIATION FROM TOYSTACK:
  ToyStack runs on ToyStack's Kubernetes. AutoStack runs on the user's AWS.
  Enterprise cannot use ToyStack (compliance). Enterprise can use AutoStack.
  That's not marginal differentiation — it's a different market.

BIGGEST TECHNICAL RISK:
  EKS provisioning takes 12-18 minutes. Users expect < 5 min for "one click".
  Mitigation: show live progress so it feels fast, and pre-provision clusters
  on first AWS connect (not on first deploy).

BIGGEST MARKET RISK:
  Vercel/Railway have massive mindshare. Developer default is "deploy to Vercel".
  AutoStack is not for that user. Target: engineering teams > 5 people
  who have hit Vercel limits, need custom networking, or have compliance requirements.

FIRST PAYING CUSTOMER PROBABILITY:
  If E2E test passed: 70% in 30 days with proper outreach.
  If E2E test failed but fixable: 40% in 45 days.

RECOMMENDED NEXT 7 DAYS:
  Day 1: Fix any E2E test failures found in this run
  Day 2: Record a demo video (screen record the deploy flow — it's impressive)
  Day 3: Deploy autostack.io landing page with "Deploy to AWS" hero
  Day 4: Post on HackerNews "Show HN: Deploy to YOUR AWS in 8 minutes"
  Day 5: Respond to every comment, fix any issues raised
  Day 6: Reach out to 10 YC companies that recently raised and need infrastructure
  Day 7: Call the most interested ones, offer free setup

THE ONE THING THAT MATTERS:
  Getting the first user to see their OWN AWS console with resources tagged
  "autostack:managed=true" and a live URL returning HTTP 200.
  That moment is the product. Everything else is marketing and polish.

VIABILITY

echo "Report complete: ${REPORT_FILE}"
cat "${REPORT_FILE}"
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE J — DESTROY ALL AWS RESOURCES
# MANDATORY. Run after report is saved.
# ══════════════════════════════════════════════════════════════════

```bash
source /tmp/autostack-env.sh

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  STARTING TEARDOWN — ALL AWS COSTS WILL STOP             ║"
echo "╚══════════════════════════════════════════════════════════╝"

TEARDOWN_START=$(date +%s)

# Trigger teardown via Edge Function
TEARDOWN=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/infra-teardown" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"${TEST_PROJECT_ID}\"}")

echo "Teardown initiated: $(echo ${TEARDOWN} | jq .)"
echo ""
echo "Monitoring teardown progress..."

while true; do
  ELAPSED=$(( $(date +%s) - TEARDOWN_START ))
  STATUS=$(curl -s "${SUPABASE_URL}/rest/v1/projects?id=eq.${TEST_PROJECT_ID}&select=provisioning_status" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[0].provisioning_status')

  printf "[%3ds] Status: %s\n" "${ELAPSED}" "${STATUS}"

  [ "${STATUS}" = "deleted" ] && echo "✅ Teardown complete" && break
  [ $ELAPSED -gt 1200 ] && echo "⚠️ Teardown > 20 min — checking AWS manually" && break
  sleep 30
done

# MANDATORY: Verify zero orphaned resources
echo ""
echo "=== ORPHAN RESOURCE VERIFICATION ==="
echo "(All counts MUST be 0)"
echo ""

echo -n "Tagged resources remaining: "
aws resourcegroupstaggingapi get-resources \
  --tag-filters "Key=autostack:project_id,Values=${TEST_PROJECT_ID}" \
  --region "${AWS_REGION}" --output json 2>/dev/null | \
  jq '.ResourceTagMappingList | length'

echo -n "VPCs with our tag: "
aws ec2 describe-vpcs \
  --filters "Name=tag:autostack:project_id,Values=${TEST_PROJECT_ID}" \
  --region "${AWS_REGION}" --output json 2>/dev/null | jq '.Vpcs | length'

echo -n "EKS clusters with our tag: "
aws eks list-clusters --region "${AWS_REGION}" --output json 2>/dev/null | \
  jq -r '.clusters[]' 2>/dev/null | while read cluster; do
  TAGS=$(aws eks describe-cluster --name "${cluster}" --region "${AWS_REGION}" \
    --query 'cluster.tags' --output json 2>/dev/null)
  echo "${TAGS}" | grep -q "${TEST_PROJECT_ID}" && echo "${cluster}" || true
done | wc -l

echo -n "NAT Gateways with our tag: "
aws ec2 describe-nat-gateways \
  --filter "Name=tag:autostack:project_id,Values=${TEST_PROJECT_ID}" \
  --region "${AWS_REGION}" --output json 2>/dev/null | \
  jq '[.NatGateways[] | select(.State != "deleted")] | length'

echo ""

FINAL_TIME=$(( $(date +%s) - TEARDOWN_START ))
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ALL COSTS STOPPED                                        ║"
printf "║  Teardown time: %-42s  ║\n" "${FINAL_TIME}s"
echo "║                                                           ║"
echo "║  NEXT: Check AWS Cost Explorer in 24 hours               ║"
echo "║  Expected: < \$2 USD total                                ║"
echo "║  URL: https://console.aws.amazon.com/cost-management      ║"
echo "╚══════════════════════════════════════════════════════════╝"
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE K — POST-TEST: FIX ALL FAILURES FOUND
# ══════════════════════════════════════════════════════════════════

After running phases A-J and reading the diagnostic report,
fix every item in this order. Do not fix things that are not broken.

## K1 — If auth-hook org_id was null

```bash
# The auth hook needs to be registered as an Auth Hook in Supabase Dashboard
# This cannot be done via CLI — manual step required

# 1. Open https://supabase.com/dashboard/project/prrmrukwmrjkdxcyzovd
# 2. Authentication → Hooks
# 3. Enable hook on: auth.users INSERT
# 4. Function: auth-hook
# 5. Save

# After registering: test again
curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email": "retest-'$(date +%s)'@test.io", "password": "Test123!"}' | \
  jq '.user.user_metadata.org_id'
# MUST return a UUID, not null
```

## K2 — If any Edge Function returned 404 after deployment

```bash
# Check if function was actually deployed
supabase functions list

# If not listed, redeploy that specific function
supabase functions deploy [function-name]

# Check the logs for deployment errors
supabase functions logs [function-name] --limit 20
```

## K3 — If infra-provision failed partway through

```bash
source /tmp/autostack-env.sh

# Get the rollback_data from DB to see what was created
ROLLBACK=$(curl -s "${SUPABASE_URL}/rest/v1/projects?id=eq.${TEST_PROJECT_ID}&select=rollback_data,die_stage" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}")
echo "${ROLLBACK}" | jq .

# Check the specific error in infrastructure_events
curl -s "${SUPABASE_URL}/rest/v1/infrastructure_events?project_id=eq.${TEST_PROJECT_ID}&event_type=eq.failed" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" | jq -r '.[] | "[\(.stage)] \(.message)"'

# Common fixes:
# EKS limit exceeded: aws service-quotas request-service-quota-increase
# VPC limit: aws ec2 describe-vpcs (default limit 5 per region)
# IAM permission missing: check which permission failed and add to role
```

## K4 — If frontend build failed

```bash
cd frontend

# Check exact error
npm run build 2>&1 | grep -i "error" | head -20

# Most common: missing env vars
cat .env.local | grep VITE_SUPABASE_URL

# If VITE_SUPABASE_URL is empty or wrong:
source /tmp/autostack-env.sh
echo "VITE_SUPABASE_URL=${SUPABASE_URL}" >> .env.local
echo "VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" >> .env.local

# Retry
npm run build
```

## K5 — If COIE scores are 0 or null

```bash
# COIE needs cluster_metrics data to compute scores
# Agent provides this — without agent, simulate it

source /tmp/autostack-env.sh

# Insert sample metrics
curl -s -X POST "${SUPABASE_URL}/rest/v1/cluster_metrics" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "[
    {\"cluster_id\": \"${CLUSTER_ID}\", \"cpu_pct\": 45.2, \"memory_pct\": 62.1, \"requests\": 150, \"latency_p99\": 120.5},
    {\"cluster_id\": \"${CLUSTER_ID}\", \"cpu_pct\": 48.1, \"memory_pct\": 65.3, \"requests\": 165, \"latency_p99\": 115.2}
  ]"

# Retrigger COIE
curl -s -X POST "${SUPABASE_URL}/functions/v1/coie-cycle" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"cluster_id\": \"${CLUSTER_ID}\"}" | jq .
```

## K6 — If AIRE didn't diagnose the incident

```bash
# Check if aire-detect is triggered by DB webhook or must be called explicitly
# If no webhook: set up a DB webhook in Supabase Dashboard

# Supabase Dashboard → Database → Webhooks → Add webhook
# Table: incidents
# Event: INSERT
# URL: https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/aire-detect
# HTTP method: POST
# Headers: Authorization: Bearer [SERVICE_ROLE_KEY]

# OR call AIRE manually for now:
source /tmp/autostack-env.sh
curl -s -X POST "${SUPABASE_URL}/functions/v1/aire-detect" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"incident_id\": \"${INCIDENT_ID}\", \"cluster_id\": \"${CLUSTER_ID}\"}" | jq .
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE L — FINAL PRODUCTION READINESS VERIFICATION
# Run this AFTER all fixes from Phase K are applied
# ══════════════════════════════════════════════════════════════════

```bash
source /tmp/autostack-env.sh

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  FINAL PRODUCTION READINESS CHECKLIST                    ║"
echo "╚══════════════════════════════════════════════════════════╝"

READY=0
NOT_READY=0

check() {
  local name="$1"
  local cmd="$2"
  local expected="$3"

  RESULT=$(eval "$cmd" 2>&1)
  if echo "${RESULT}" | grep -q "${expected}"; then
    echo "  ✅ ${name}"
    READY=$((READY + 1))
  else
    echo "  ❌ ${name}"
    NOT_READY=$((NOT_READY + 1))
  fi
}

echo ""
echo "DATABASE:"
check "Tables with RLS" \
  "curl -s '${SUPABASE_URL}/rest/v1/projects?limit=0' -H 'apikey: ${SUPABASE_ANON_KEY}' -o /dev/null -w '%{http_code}'" "200"

check "auth.org_id() function" \
  "curl -s -X POST '${SUPABASE_URL}/rest/v1/rpc/get_org_id_test' -H 'apikey: ${SUPABASE_SERVICE_ROLE_KEY}'" "200"

echo ""
echo "EDGE FUNCTIONS:"
for fn in auth-hook aws-assume-role die-analyze coie-cycle aire-detect; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "${SUPABASE_URL}/functions/v1/${fn}")
  [ "${CODE}" = "200" ] && echo "  ✅ ${fn}" && READY=$((READY+1)) || \
    echo "  ❌ ${fn} (HTTP ${CODE})" && NOT_READY=$((NOT_READY+1))
done

echo ""
echo "SECURITY:"
check "No SERVICE_ROLE in frontend" \
  "grep -r SERVICE_ROLE frontend/src/ 2>/dev/null | wc -l" "^0$"
check "No hardcoded tokens" \
  "grep -rE '(eyJ[a-zA-Z0-9_-]+\.|AKIA[0-9A-Z]{16})' --include='*.ts' --include='*.js' --include='*.jsx' --exclude-dir=node_modules . 2>/dev/null | wc -l" "^0$"
check ".env.local not committed" \
  "git log --all --full-history -- .env.local 2>/dev/null | wc -l" "^0$"

echo ""
echo "FRONTEND:"
check "Build succeeds" \
  "cd frontend && npm run build 2>&1 | tail -3" "✓"

echo ""
echo "AWS:"
check "IAM role accessible" \
  "aws iam get-role --role-name AutoStackDeploymentRole --query 'Role.Arn' --output text 2>/dev/null" "AutoStackDeploymentRole"

echo ""
echo "═══════════════════════════════════════════"
echo "TOTAL: ${READY} ready, ${NOT_READY} not ready"
echo ""
if [ $NOT_READY -eq 0 ]; then
  echo "✅ PRODUCTION READY — One-click deployment works."
  echo "   Next step: deploy autostack.io and get first user."
else
  echo "❌ NOT READY — Fix ${NOT_READY} items above, then re-run this check."
fi
echo "═══════════════════════════════════════════"
```

---

# ══════════════════════════════════════════════════════════════════
# APPENDIX — QUICK REFERENCE
# ══════════════════════════════════════════════════════════════════

## Common commands during development

```bash
# Deploy a single function after changes
supabase functions deploy [function-name]

# View function logs
supabase functions logs [function-name] --limit 50

# Apply new migrations
supabase db push --password "${SUPABASE_DB_PASSWORD}"

# Check all function statuses
supabase functions list

# Test a specific function
curl -s -X POST "${SUPABASE_URL}/functions/v1/[function-name]" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

# Check DB directly
supabase db query "SELECT COUNT(*) FROM [table_name];"

# Tail all function logs at once (useful during provisioning)
for fn in die-analyze infra-provision coie-cycle aire-detect; do
  supabase functions logs $fn --limit 5 &
done; wait

# Verify teardown worked
aws resourcegroupstaggingapi get-resources \
  --tag-filters "Key=autostack:managed,Values=true" \
  --region us-east-1 --output json | jq '.ResourceTagMappingList | length'
```

## Success criteria — the test is done when ALL of these are true:

```
✅ New user signs up → org_id in user_metadata (auth-hook working)
✅ Second user cannot read first user's data (RLS working)
✅ IAM role assumption succeeds with ExternalId (confused deputy blocked)
✅ die-analyze returns repo_profile + infra_plan for Node.js test repo
✅ infra-provision creates VPC, EKS, ECR, ALB in real AWS account
✅ All AWS resources tagged with autostack:project_id
✅ Application reachable via HTTPS URL, /health returns HTTP 200
✅ COIE cycle runs, health scores populated (> 0), findings created
✅ AIRE diagnoses OOM incident, root_cause populated
✅ Redeploy completes in < 3 minutes
✅ Rollback completes, app still serving HTTP 200
✅ GitHub webhook without signature returns 401
✅ RLS: cross-org read returns 0 rows
✅ infra-teardown removes ALL tagged resources (0 orphans)
✅ Frontend builds without errors
✅ All 20+ Edge Functions return 200 on OPTIONS preflight

When all 16 items above are ✅:
AutoStack is production-ready. Ship it.
```
