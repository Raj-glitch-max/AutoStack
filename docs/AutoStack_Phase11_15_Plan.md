# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  AUTOSTACK — PHASES 11–15 EXECUTION PLAN                                 ║
# ║  Stripe · Multi-Cloud · Multi-Region · Managed Databases · On-Prem       ║
# ║  Prerequisite: Phases 1–10 complete and all 7 audit checkpoints green    ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

---

# PREAMBLE — WHERE YOU ARE NOW

After Phases 1–10:
✅ Full deployment pipeline (GitHub URL → live EKS in < 15 min)
✅ Auto-redeploy on push, rollback in 3 min
✅ Preview environments per PR
✅ Go agent: real metrics, real incident detection
✅ COIE: real cost analysis with dollar savings
✅ AIRE: auto-remediation with GitHub PRs
✅ Supabase Vault for secrets
✅ Rate limiting, input validation, audit log
✅ TanStack Query, bundle splitting, DB indexes
✅ Custom domains + SSL, plan enforcement

What you do NOT have yet:
❌ Stripe — users are on free tier forever, no revenue
❌ GCP and Azure — AWS-only, loses 40% of enterprise market
❌ Multi-region — single AWS region, no redundancy, no data residency
❌ Managed databases — users must bring their own DB, huge onboarding friction
❌ On-premise control plane — enterprise cannot use SaaS due to data restrictions

These 5 phases take AutoStack from a working product to a revenue-generating business.

---

# ══════════════════════════════════════════════════════════════════
# ADDENDUM RULES FOR PHASES 11–15
# All previous rules (A through J) still apply. These extend them.
# ══════════════════════════════════════════════════════════════════

## RULE GROUP K — STRIPE & BILLING

### K1 — Stripe Webhook Is Idempotent
Every Stripe webhook event has an `event.id`. Store processed event IDs in Redis
with a 24-hour TTL. Before processing any Stripe event, check if already processed.
Stripe retries failed webhooks for up to 72 hours. Without idempotency, a
temporarily failed webhook causes duplicate plan upgrades, double charges, etc.

```typescript
async function isStripeEventProcessed(redis: Redis, eventId: string): Promise<boolean> {
  const key = `stripe:event:${eventId}`
  const exists = await redis.get(key)
  if (exists) return true
  await redis.set(key, '1', { ex: 86400 })  // 24h TTL — RULE B5
  return false
}
```

### K2 — Never Trust Frontend For Plan Status
The frontend may cache stale plan data. Every privileged operation must
re-fetch the org's current plan from the database at the Edge Function layer.
Never read plan from the user's JWT claims — JWT can be stale for up to 15 minutes.

### K3 — Subscription State Machine Is Explicit
```
Subscription states:
  trialing     → free trial active (14 days)
  active       → paying customer
  past_due     → payment failed, grace period (7 days to update card)
  canceled     → explicitly canceled by user
  unpaid       → past_due grace period expired, service limited
  incomplete   → initial payment pending
  paused       → subscription paused (enterprise custom billing)

Transitions:
  trialing → active (trial ended, card charged successfully)
  active → past_due (payment fails)
  past_due → active (card updated, retry succeeds)
  past_due → canceled (grace period expired without payment)
  active → canceled (user cancels)
  canceled → active (user resubscribes)
```

### K4 — Dunning Logic: Degrade Gracefully, Not Hard Cut
When subscription is `past_due`:
- Day 1-3: Full service. Email reminder daily.
- Day 4-6: Read-only mode. Deployments blocked. Clear banner in dashboard.
- Day 7+: `unpaid` state. Data preserved but no new deployments.
- NEVER delete infrastructure during `past_due`. Only on explicit cancellation with 30-day notice.

### K5 — Revenue Recognition: Metered vs. Subscription
AutoStack uses flat-rate subscriptions (not usage-based metered billing).
Reason: usage-based billing creates unpredictable costs for users → churn.
Flat rate: users know exactly what they pay → trust.
Exception: data transfer overages are billed metered (but soft-capped with warnings).

---

## RULE GROUP L — MULTI-CLOUD

### L1 — Provider Abstraction Layer is Mandatory
All cloud-specific code lives behind an interface. The rest of the codebase
never calls AWS SDK directly after Phase 12 — it calls the abstraction.

```typescript
// supabase/functions/_shared/cloud-provider.ts
interface CloudProvider {
  validateCredentials(creds: AnyCredentials): Promise<ValidationResult>
  createVPC(params: VPCParams): Promise<string>  // returns VPC ID
  createCluster(params: ClusterParams): Promise<string>  // returns cluster ARN/ID
  createRegistry(params: RegistryParams): Promise<string>  // returns registry URL
  createLoadBalancer(params: LBParams): Promise<string>  // returns LB DNS
  buildImage(params: BuildParams): Promise<string>  // returns image SHA
  teardown(projectId: string): Promise<TeardownResult>
  getMetrics(clusterId: string): Promise<ClusterMetrics>
}

// Implementations:
// AWSProvider implements CloudProvider
// GCPProvider implements CloudProvider
// AzureProvider implements CloudProvider
```

### L2 — Provider-Specific IAM Is Not Reused
Each provider has completely different identity/permission systems:
- AWS: IAM roles + STS AssumeRole
- GCP: Service Account + Workload Identity
- Azure: Service Principal + RBAC

Never try to abstract these into a single "credential" format.
Each provider gets its own credential validation function.
The `cloud_credentials` table `config` JSONB column stores provider-specific data.

### L3 — Pricing Constants Are Provider-Specific
AWS, GCP, and Azure have different pricing models.
Never share pricing calculation functions across providers.
Each provider has its own `pricing.ts` module with its own constants.
Update all three quarterly (add a calendar reminder).

---

## RULE GROUP M — MULTI-REGION

### M1 — Region Selection Is Data Residency, Not Just Latency
When a user picks a region, they are making a legal/compliance decision:
- EU customers must pick EU regions (GDPR)
- Australian customers may need ap-southeast-2 (data sovereignty)
- US government customers need us-gov-* regions

Always show the country/jurisdiction next to each region name.
Never auto-select a region based on latency — it could violate compliance requirements.

### M2 — Multi-Region Is Active-Active, Not Primary-Backup
When deploying to multiple regions:
- Each region runs identical pods with identical capacity
- Traffic split via Route53 latency-based routing (not failover routing)
- Databases are NOT replicated across regions (that's a separate Phase 14+ feature)
- Each region's deployment is independent — a failure in eu-west-1 does not trigger failover to us-east-1

### M3 — Multi-Region Costs Are Shown BEFORE Provisioning
Multi-region means: N times the infrastructure cost.
Always show: "This will deploy to 3 regions: estimated $561/month (3 × $187/month)."
Users must confirm this explicitly. The cost modal from Phase 1-5 now shows a
per-region breakdown AND a total.

---

## RULE GROUP N — MANAGED DATABASES

### N1 — Database Credentials Never Go Into Application Code
When AutoStack provisions RDS or CloudSQL:
- Database password is generated by AutoStack (cryptographically random, 32 chars)
- Stored in Supabase Vault
- Injected into K8s Secret (not ConfigMap)
- Application reads from environment variable DATABASE_URL
- AutoStack never shows the password in the UI after initial creation
- Users can rotate the password (AutoStack handles the rotation across Secret + app restart)

### N2 — Database Backups Are AutoStack's Responsibility
When AutoStack provisions a database:
- Automated backups enabled (7-day retention by default, 30-day for Pro+)
- Backup encryption enabled (uses AWS KMS key in user's account)
- Backup window: 2-4 AM in the region's local time (low traffic window)
- Point-in-time recovery enabled for production environments

### N3 — Database Migrations Are User's Responsibility
AutoStack provisions the database server and handles connection.
AutoStack does NOT run migrations. That is the application's job.
Document this clearly in the UI: "Connect your app to DATABASE_URL and run your migrations."

---

## RULE GROUP O — ON-PREMISE CONTROL PLANE

### O1 — On-Prem Control Plane Is Stateless
The AutoStack Control Plane (Edge Functions) must be deployable as Docker containers.
No local state. All state in: PostgreSQL (user's own DB) + Redis (user's own Redis).
The user provides these services — AutoStack provides the application containers.

### O2 — On-Prem Has No Phone-Home
Enterprise on-prem installations must function with ZERO outbound calls to autostack.io.
License validation uses a locally-stored license key (RSA-signed JWT with org_id + expiry).
No telemetry, no usage reporting, no analytics sent to AutoStack servers.
PostHog, Sentry — configured to point to user's own instances or disabled.

### O3 — On-Prem Upgrades Are Pull-Based
Users upgrade by pulling new Docker image versions from Docker Hub.
AutoStack never pushes updates to on-prem installations.
Release notes and upgrade guides are versioned in docs.autostack.io.

---

# ══════════════════════════════════════════════════════════════════
# PHASE 11 — STRIPE BILLING: SUBSCRIPTIONS, UPGRADES, DUNNING
# Branch: feature/phase11-stripe-billing
# Goal: AutoStack generates revenue. Free tier enforced.
#       Paying users have uninterrupted service. Failed payments handled.
# ══════════════════════════════════════════════════════════════════

## TASK 11.1 — Stripe Setup: Products, Prices, Customer Portal

### Stripe product configuration (set up in Stripe Dashboard + via API)

```typescript
// supabase/functions/stripe-setup/index.ts
// Run ONCE to create products and prices in Stripe
// Then store the price IDs in Supabase Edge Function secrets

const STRIPE_PRODUCTS = {
  pro: {
    name: 'AutoStack Pro',
    description: 'Up to 10 live environments. Full AIRE auto-remediation. Custom domains.',
    metadata: { plan: 'pro' }
  },
  team: {
    name: 'AutoStack Team',
    description: 'Up to 50 environments. Compliance exports. Slack + PagerDuty alerts.',
    metadata: { plan: 'team' }
  }
}

const STRIPE_PRICES = {
  pro_monthly:  { product: 'pro',  amount: 4900,  currency: 'usd', interval: 'month' },
  pro_yearly:   { product: 'pro',  amount: 47040, currency: 'usd', interval: 'year' },  // 20% off
  team_monthly: { product: 'team', amount: 19900, currency: 'usd', interval: 'month' },
  team_yearly:  { product: 'team', amount: 191040,currency: 'usd', interval: 'year' },  // 20% off
}

// Store in Supabase secrets:
// STRIPE_PRICE_PRO_MONTHLY=price_...
// STRIPE_PRICE_PRO_YEARLY=price_...
// STRIPE_PRICE_TEAM_MONTHLY=price_...
// STRIPE_PRICE_TEAM_YEARLY=price_...
// STRIPE_WEBHOOK_SECRET=whsec_...
// STRIPE_SECRET_KEY=sk_live_... (or sk_test_... for staging)
```

### New DB tables
```sql
-- supabase/migrations/005_stripe_billing.sql

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id    TEXT        UNIQUE,
  stripe_subscription_id TEXT       UNIQUE,
  stripe_price_id       TEXT,
  plan                  TEXT        NOT NULL DEFAULT 'free',
  status                TEXT        NOT NULL DEFAULT 'active',
    -- trialing | active | past_due | canceled | unpaid | incomplete | paused
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN     DEFAULT FALSE,
  canceled_at           TIMESTAMPTZ,
  payment_failed_at     TIMESTAMPTZ,
  dunning_email_count   INTEGER     DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_org" ON subscriptions
  FOR SELECT USING (org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid);
-- Only service role (stripe-webhook) can INSERT/UPDATE subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)
  WHERE status IN ('past_due', 'unpaid');  -- partial index for dunning queries

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT        UNIQUE,
  amount_paid       INTEGER,    -- cents
  amount_due        INTEGER,
  currency          TEXT        DEFAULT 'usd',
  status            TEXT,       -- paid | open | void | uncollectible
  period_start      TIMESTAMPTZ,
  period_end        TIMESTAMPTZ,
  invoice_pdf_url   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_org" ON invoices
  FOR SELECT USING (org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid);
CREATE INDEX IF NOT EXISTS idx_invoices_org_time ON invoices(org_id, created_at DESC);
```

### Edge Function: `stripe-checkout/index.ts`
```typescript
// Creates a Stripe Checkout Session for plan upgrades
// Called by: "Upgrade to Pro" button in dashboard

// INPUT: { price_id, success_url, cancel_url }
// price_id must be one of the known price IDs (validate against enum — RULE K2 + K5)

// FLOW:
// 1. Verify user JWT + get org_id
// 2. Fetch subscription row — get stripe_customer_id (create if first time)
// 3. Create Stripe Checkout Session:
//    - mode: 'subscription'
//    - customer: stripe_customer_id
//    - line_items: [{ price: price_id, quantity: 1 }]
//    - success_url with session_id param
//    - cancel_url (back to dashboard)
//    - allow_promotion_codes: true (discount codes)
//    - trial_period_days: 14 (only if org has never had a trial before)
// 4. Return: { checkout_url } — frontend redirects to this URL

// SECURITY: price_id must come from env secrets, not from user input
const VALID_PRICE_IDS = new Set([
  Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'),
  Deno.env.get('STRIPE_PRICE_PRO_YEARLY'),
  Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY'),
  Deno.env.get('STRIPE_PRICE_TEAM_YEARLY'),
].filter(Boolean))

if (!VALID_PRICE_IDS.has(body.price_id)) {
  return errorResponse(400, 'Invalid price_id')
}

// RULE K5: flat subscription, not metered
// RULE K2: plan status read from DB at Edge Function layer
```

### Edge Function: `stripe-webhook/index.ts` (most important)
```typescript
// ALL Stripe events arrive here. This is the source of truth for subscription state.

// STEP 1 — Verify Stripe signature (equivalent of GitHub HMAC)
const sig = req.headers.get('stripe-signature')!
const body = await req.text()
// Use stripe.webhooks.constructEvent(body, sig, webhookSecret)
// This throws if invalid — catch and return 400

// STEP 2 — Idempotency check (RULE K1)
if (await isStripeEventProcessed(redis, event.id)) {
  return new Response('already processed', { status: 200 })
}

// STEP 3 — Route to handler based on event.type
// Handle EXACTLY these events (ignore all others with 200 response):

const HANDLED_EVENTS = {
  'checkout.session.completed': async (event) => {
    // User completed checkout → activate subscription
    const session = event.data.object
    const { customer, subscription: subId } = session

    // Fetch full subscription from Stripe to get price, period dates
    const sub = await stripe.subscriptions.retrieve(subId)
    const plan = getPlanFromPriceId(sub.items.data[0].price.id)

    await supabase.from('subscriptions').upsert({
      org_id: await getOrgIdFromCustomer(customer),
      stripe_customer_id: customer,
      stripe_subscription_id: subId,
      stripe_price_id: sub.items.data[0].price.id,
      plan,
      status: sub.status,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    }, { onConflict: 'org_id' })

    // Update organizations.plan
    await supabase.from('organizations')
      .update({ plan })
      .eq('id', await getOrgIdFromCustomer(customer))

    // Send welcome email for paid plan
    await invokeNotification({ type: 'plan_upgraded', plan, org_id: ... })

    // Audit log
    await audit(supabase, org_id, 'system:stripe', 'Stripe', 'plan.upgraded', { plan, stripe_subscription_id: subId })
  },

  'invoice.paid': async (event) => {
    const invoice = event.data.object
    // Store invoice record for billing history tab
    await supabase.from('invoices').upsert({
      org_id: await getOrgIdFromCustomer(invoice.customer),
      stripe_invoice_id: invoice.id,
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      status: 'paid',
      period_start: new Date(invoice.period_start * 1000).toISOString(),
      period_end: new Date(invoice.period_end * 1000).toISOString(),
      invoice_pdf_url: invoice.invoice_pdf,
    }, { onConflict: 'stripe_invoice_id' })

    // If subscription was past_due, restore active status
    await supabase.from('subscriptions')
      .update({ status: 'active', payment_failed_at: null, dunning_email_count: 0 })
      .eq('stripe_subscription_id', invoice.subscription)
  },

  'invoice.payment_failed': async (event) => {
    const invoice = event.data.object
    const orgId = await getOrgIdFromCustomer(invoice.customer)

    const { data: sub } = await supabase.from('subscriptions')
      .select('dunning_email_count, payment_failed_at')
      .eq('stripe_subscription_id', invoice.subscription)
      .single()

    await supabase.from('subscriptions').update({
      status: 'past_due',
      payment_failed_at: sub.payment_failed_at || new Date().toISOString(),
      dunning_email_count: (sub.dunning_email_count || 0) + 1
    }).eq('stripe_subscription_id', invoice.subscription)

    // Send dunning email (RULE K4)
    await invokeNotification({ type: 'payment_failed', org_id: orgId,
      attempt: (sub.dunning_email_count || 0) + 1,
      update_url: await createStripePortalSession(invoice.customer)
    })
  },

  'customer.subscription.deleted': async (event) => {
    const sub = event.data.object
    const orgId = await getOrgIdFromCustomer(sub.customer)

    await supabase.from('subscriptions').update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      plan: 'free'
    }).eq('stripe_subscription_id', sub.id)

    await supabase.from('organizations').update({ plan: 'free' }).eq('id', orgId)

    // Send cancellation email, remind of data preservation window (30 days)
    await invokeNotification({ type: 'subscription_canceled', org_id: orgId })
  },

  'customer.subscription.updated': async (event) => {
    // Handles plan changes (Pro → Team, annual → monthly, etc.)
    const sub = event.data.object
    const newPlan = getPlanFromPriceId(sub.items.data[0].price.id)
    // Update subscriptions table + organizations.plan
  }
}
```

### Edge Function: `stripe-portal/index.ts`
```typescript
// Creates Stripe Customer Portal session for:
// - Updating payment method
// - Viewing invoices
// - Canceling subscription
// Frontend: "Manage Billing" button → redirects to Stripe Portal URL

// INPUT: { return_url }
// FLOW:
// 1. Get stripe_customer_id from subscriptions table for this org
// 2. Create portal session: stripe.billingPortal.sessions.create({ customer, return_url })
// 3. Return: { portal_url }
// Frontend redirects to portal_url (opens Stripe's hosted billing UI)
// After user finishes, Stripe redirects back to return_url (dashboard settings page)
```

### Frontend: Pricing + Upgrade UI

```jsx
// src/components/billing/UpgradeModal.jsx
// Shown when user hits a plan limit OR clicks "Upgrade" in Settings

// Content:
// - Current plan indicator
// - Pro vs Team comparison table
// - Monthly/Annual toggle (20% savings badge on annual)
// - Highlighted recommended plan (Team if org has > 3 members)
// - "Start 14-day trial" CTA (only shown if no previous trial)
// - "Upgrade Now" for subsequent upgrades

// src/components/billing/BillingTab.jsx (in SettingsTab)
// Sections:
// 1. Current plan: plan name, billing period, next renewal date
// 2. Payment method (last 4 digits of card from Stripe — never store full card)
// 3. Invoices table: date, amount, status, PDF download link
// 4. "Manage Billing" → opens Stripe Portal
// 5. "Cancel subscription" link (opens Stripe Portal to cancellation flow)

// src/components/billing/PastDueBanner.jsx
// Shown at top of dashboard when subscription.status = 'past_due'
// Full-width amber banner:
// "⚠️ Payment failed — your Pro plan expires in N days. Update payment method →"
// Clicking → Stripe Portal
```

### Dunning email templates (add to send-notification)
```typescript
// Type: 'payment_failed'
// Attempt 1 (day 0): "Your payment failed — update your card to keep Pro"
//   Tone: helpful, not urgent
// Attempt 2 (day 3): "Action required: AutoStack Pro expires in 4 days"
//   Tone: more urgent, specific deadline
// Attempt 3 (day 6): "Last chance: Pro access ends tomorrow"
//   Tone: urgent, list what they'll lose
// Attempt 4 (day 7+): "Your AutoStack plan has been downgraded to free"
//   Tone: factual, explain what changed, how to re-upgrade
```

### VERIFY Task 11.1
```
□ Stripe products + prices created in Stripe Dashboard
□ All 4 price IDs stored in Supabase Edge Function secrets
□ STRIPE_WEBHOOK_SECRET set (use Stripe CLI to verify locally first)
□ Checkout: click "Upgrade to Pro" → Stripe Checkout opens with correct price
□ Complete checkout with test card (4242 4242 4242 4242):
    → subscription row created with status='active'
    → organizations.plan updated to 'pro'
    → plan_upgraded notification email received
□ Webhook idempotency: replay same checkout.session.completed event
    → second call returns 200 "already processed"
    → NO duplicate subscription row created
□ Simulate payment failure (test card 4000 0000 0000 0341):
    → status becomes 'past_due'
    → dunning email 1 received within 5 minutes
□ Update card after failure (Stripe Portal):
    → invoice.paid event fires
    → status back to 'active'
    → dunning_email_count reset to 0
□ Cancel via Stripe Portal:
    → customer.subscription.deleted fires
    → organizations.plan = 'free'
    → new deployments blocked for free-tier limits
□ Invoice PDF URL stored in invoices table, clickable in BillingTab
□ Free user hits deployment limit → UpgradeModal appears with correct plan comparison
□ Past due banner visible in dashboard when status='past_due'
```

---

## TASK 11.2 — Usage Metering: Track What Matters

```typescript
// Not billing users per-use, but tracking usage for:
// 1. Showing users their own usage trends
// 2. Identifying customers approaching limits (pre-churn signal)
// 3. Making informed decisions about future usage-based pricing

// supabase/migrations/005b_usage_metrics.sql
CREATE TABLE IF NOT EXISTS org_usage (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  deployments_count    INTEGER DEFAULT 0,
  environments_peak    INTEGER DEFAULT 0,
  nodes_peak           INTEGER DEFAULT 0,
  build_minutes        INTEGER DEFAULT 0,
  data_transfer_gb     DECIMAL(10,2) DEFAULT 0,
  incidents_detected   INTEGER DEFAULT 0,
  coie_findings_opened INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, period_start)
);

-- pg_cron: aggregate usage monthly
SELECT cron.schedule(
  'aggregate-monthly-usage',
  '0 0 1 * *',  -- First of every month at midnight
  $$
  INSERT INTO org_usage (org_id, period_start, period_end,
    deployments_count, environments_peak, nodes_peak)
  SELECT
    p.org_id,
    date_trunc('month', NOW() - INTERVAL '1 month') as period_start,
    date_trunc('month', NOW()) - INTERVAL '1 second' as period_end,
    COUNT(DISTINCT d.id) FILTER (WHERE d.started_at >= date_trunc('month', NOW() - INTERVAL '1 month')),
    MAX(sub.live_envs),
    MAX(c.node_count)
  FROM organizations p
  LEFT JOIN projects proj ON proj.org_id = p.org_id
  LEFT JOIN deployments d ON d.project_id = proj.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as live_envs FROM projects
    WHERE org_id = p.org_id AND provisioning_status = 'live'
  ) sub ON true
  LEFT JOIN clusters c ON c.org_id = p.org_id
  GROUP BY p.org_id
  ON CONFLICT (org_id, period_start) DO UPDATE SET
    deployments_count = EXCLUDED.deployments_count,
    environments_peak = EXCLUDED.environments_peak,
    nodes_peak = EXCLUDED.nodes_peak;
  $$
);
```

### VERIFY Task 11.2
```
□ org_usage table created with correct columns
□ pg_cron job registered: SELECT * FROM cron.job WHERE jobname='aggregate-monthly-usage'
□ Manually trigger aggregation: SELECT cron.schedule('test', ...); → row inserted
□ BillingTab shows current month's usage statistics
□ Usage shown: "3 of 10 environments used" for Pro plan
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #8] — BILLING INTEGRITY
## Stop. Open audit tool. Complete Section 8.
## Every billing item must be ✅. Revenue is at stake.
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## TASK 11.3 — 14-Day Free Trial Flow

```typescript
// Trial starts automatically on signup (no credit card required)
// Trial ends: after 14 days OR when user explicitly upgrades

// In auth-hook, after creating org:
await supabase.from('subscriptions').insert({
  org_id: org.id,
  plan: 'pro',           // ← Trial gives Pro-level access
  status: 'trialing',
  trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
})

// pg_cron: check for expired trials daily
SELECT cron.schedule(
  'expire-trials',
  '0 6 * * *',  -- 6am UTC daily
  $$
  UPDATE subscriptions
  SET status = 'active', plan = 'free'
  WHERE status = 'trialing'
    AND trial_ends_at < NOW();
  $$
);

// Trial expiry notification emails:
// Day -3 (3 days before expiry): "Your free trial ends in 3 days"
// Day -1 (day before expiry): "Last day of your Pro trial"
// Day 0 (expiry): "Your trial has ended — upgrade to keep Pro features"
// These are sent by a pg_cron triggered Edge Function

// Trial countdown banner in dashboard:
// "Pro Trial — 11 days remaining. Upgrade to keep all features →"
// Amber banner, only shown during trial period
```

### VERIFY Task 11.3
```
□ New signup → subscription created with status='trialing', plan='pro'
□ User has Pro features during trial (deploy 2nd environment → succeeds)
□ Set trial_ends_at = NOW() - 1 minute → pg_cron run → status='active', plan='free'
□ After trial expiry: 2nd environment deploy → blocked (free tier limit)
□ Day -3 email received (manually set trial_ends_at = NOW() + 3 days to test)
□ Trial countdown banner shows correct days remaining
□ "Upgrade" during trial → checkout pre-selects Pro plan
```

---

# ══════════════════════════════════════════════════════════════════
# PHASE 12 — MULTI-CLOUD: GCP (GKE) + AZURE (AKS)
# Branch: feature/phase12-multi-cloud
# Goal: AWS is no longer a requirement. GCP and Azure customers can use AutoStack.
# ══════════════════════════════════════════════════════════════════

## TASK 12.1 — Cloud Provider Abstraction Layer

### File structure
```
supabase/functions/_shared/providers/
  interface.ts          ← CloudProvider interface (RULE L1)
  aws/
    index.ts            ← AWSProvider class
    pricing.ts          ← AWS pricing constants
    permissions.ts      ← Required IAM permissions list
    iam.ts              ← STS AssumeRole logic
  gcp/
    index.ts            ← GCPProvider class
    pricing.ts          ← GCP pricing constants
    permissions.ts      ← Required GCP permissions list
    auth.ts             ← Service Account key validation
  azure/
    index.ts            ← AzureProvider class
    pricing.ts          ← Azure pricing constants
    permissions.ts      ← Required Azure RBAC roles list
    auth.ts             ← Service Principal validation
  factory.ts            ← getProvider(provider: string): CloudProvider
```

### Provider interface (complete)
```typescript
// supabase/functions/_shared/providers/interface.ts

export interface ValidationResult {
  success: boolean
  errorCode?: string    // human-readable error code
  friendlyError?: string // error shown to user
  missingPermissions?: string[]
}

export interface VPCParams {
  projectId: string
  region: string
  cidr: string          // e.g., '10.0.0.0/16'
  tags: Record<string, string>  // RULE A4 — all resources tagged
}

export interface ClusterParams {
  projectId: string
  region: string
  vpcId: string
  subnetIds: string[]
  nodeInstance: string
  nodeCount: number
  k8sVersion: string
  tags: Record<string, string>
}

export interface BuildParams {
  projectId: string
  repoUrl: string
  branch: string
  commitSha: string
  registryUrl: string
  imageTag: string
  buildEnvVars: Record<string, string>
}

export interface TeardownResult {
  deleted: string[]     // resource IDs successfully deleted
  failed: string[]      // resource IDs that failed (with reason)
  orphaned: string[]    // resources found by tag but not in rollback_data
}

export interface CloudProvider {
  readonly name: 'aws' | 'gcp' | 'azure'

  // Validate credentials before provisioning
  validateCredentials(creds: Record<string, string>): Promise<ValidationResult>

  // Provisioning — each returns the resource's canonical ID
  createVPC(params: VPCParams): Promise<string>
  createSubnets(vpcId: string, params: VPCParams): Promise<string[]>
  createCluster(params: ClusterParams): Promise<string>
  createRegistry(projectId: string, region: string, name: string): Promise<string>
  createLoadBalancer(clusterId: string, params: any): Promise<string>

  // Build — returns pushed image URL
  buildAndPushImage(params: BuildParams): Promise<string>

  // Deploy — applies K8s manifests
  applyManifests(clusterId: string, manifests: string[]): Promise<void>

  // Cleanup — must be idempotent (RULE B3)
  teardown(projectId: string, rollbackData: Record<string, string>): Promise<TeardownResult>

  // Monitoring — returns normalized metrics
  getClusterMetrics(clusterId: string): Promise<NormalizedMetrics>

  // Cost estimation
  estimateMonthlyCost(size: string, region: string): InfrastructurePlan
}
```

### Provider factory
```typescript
// supabase/functions/_shared/providers/factory.ts

import { AWSProvider } from './aws/index.ts'
import { GCPProvider } from './gcp/index.ts'
import { AzureProvider } from './azure/index.ts'

export function getProvider(
  provider: 'aws' | 'gcp' | 'azure',
  credentials: Record<string, string>
): CloudProvider {
  switch (provider) {
    case 'aws':   return new AWSProvider(credentials)
    case 'gcp':   return new GCPProvider(credentials)
    case 'azure': return new AzureProvider(credentials)
    default:      throw new Error(`Unknown provider: ${provider}`)
  }
}

// ALL provisioning code now uses getProvider() instead of AWS SDK directly:
// const provider = getProvider(credential.provider, credentialConfig)
// const vpcId = await provider.createVPC(params)  ← same call for all 3 clouds
```

---

## TASK 12.2 — GCP: Service Account + GKE Implementation

### GCP credential setup (what user does)
```
User creates a GCP Service Account with these roles:
  - roles/container.admin          (GKE cluster management)
  - roles/compute.networkAdmin     (VPC, subnets, firewall)
  - roles/artifactregistry.admin   (container registry, replaces ECR)
  - roles/iam.serviceAccountUser   (needed to bind SA to workloads)
  - roles/storage.admin            (GCS for build artifacts)
  - roles/cloudbuild.builds.builder (Cloud Build — equivalent of CodeBuild)

User downloads the Service Account JSON key file.
User uploads the JSON in AutoStack's onboarding (encrypted via Vault — RULE N1).
```

### GCP credential validation
```typescript
// supabase/functions/_shared/providers/gcp/auth.ts

interface GCPCredentials {
  type: 'service_account'
  project_id: string
  private_key_id: string
  private_key: string    // RSA private key — stored in Vault
  client_email: string   // service account email
  client_id: string
  auth_uri: string
  token_uri: string
}

// RULE L2 — GCP auth is completely different from AWS, never shared
export async function validateGCPCredentials(
  creds: GCPCredentials
): Promise<ValidationResult> {
  // 1. Parse and validate JSON structure (check all required fields)
  // 2. Request an access token from Google OAuth2
  //    POST https://oauth2.googleapis.com/token
  //    with JWT assertion signed by private_key
  // 3. With access token, call GCP Resource Manager API to verify project access
  // 4. Check that the service account has required roles:
  //    GET https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:getIamPolicy
  //    Verify all REQUIRED_GCP_ROLES are in the policy for this service account

  const REQUIRED_GCP_ROLES = [
    'roles/container.admin',
    'roles/compute.networkAdmin',
    'roles/artifactregistry.admin',
    'roles/iam.serviceAccountUser',
    'roles/cloudbuild.builds.builder',
  ]

  // Return missing roles for friendly error message
}
```

### GCP provisioning key differences vs AWS
```
| Step              | AWS                    | GCP                                    |
|-------------------|------------------------|----------------------------------------|
| Network           | VPC                    | VPC (global, not regional)             |
| Subnets           | Regional subnets       | Regional subnets (same concept)        |
| Cluster           | EKS                    | GKE Autopilot or Standard              |
| Container registry| ECR (regional)         | Artifact Registry (multi-region)       |
| Image build       | CodeBuild              | Cloud Build                            |
| Load balancer     | ALB (installed via addon)| Cloud Load Balancing (native in GKE) |
| DNS               | Route53                | Cloud DNS                              |
| SSL               | ACM                    | Google-managed SSL certificates        |
| Node billing      | EC2 per-instance       | GKE per-node (standard) or pod (autopilot) |
```

### GCP pricing (RULE L3 — separate constants)
```typescript
// supabase/functions/_shared/providers/gcp/pricing.ts
// Prices as of Q1 2026 — us-central1 region
// Source: https://cloud.google.com/compute/vm-instance-pricing

export const GCP_PRICING = {
  gke: {
    standard_cluster_monthly: 73.00,   // Cluster management fee (same as EKS coincidentally)
    autopilot_per_pod_vcpu_hr: 0.0445,
    autopilot_per_pod_gb_hr:   0.00445,
  },
  compute: {
    'e2-medium':   { hourly: 0.0335,  vcpu: 1,  ram_gb: 4  },
    'e2-standard-2':{ hourly: 0.067,  vcpu: 2,  ram_gb: 8  },
    'e2-standard-4':{ hourly: 0.134,  vcpu: 4,  ram_gb: 16 },
    'n2-standard-2':{ hourly: 0.0971, vcpu: 2,  ram_gb: 8  },
    'n2-standard-4':{ hourly: 0.1942, vcpu: 4,  ram_gb: 16 },
  },
  networking: {
    cloud_nat_monthly: 14.40,           // Cloud NAT gateway (cheaper than AWS NAT GW)
    load_balancer_monthly: 18.00,       // Forwarding rule
    data_egress_per_gb: 0.08,
  },
  artifact_registry: {
    storage_per_gb_monthly: 0.10,
    data_transfer_per_gb: 0.08,
  }
}

export const GCP_SIZE_CONFIGS = {
  small:  { node_instance: 'e2-standard-2', node_count: 2, min_replicas: 1, max_replicas: 3 },
  medium: { node_instance: 'e2-standard-4', node_count: 3, min_replicas: 2, max_replicas: 6 },
  large:  { node_instance: 'n2-standard-4', node_count: 5, min_replicas: 3, max_replicas: 10 },
}
```

### VERIFY Task 12.2
```
□ Create GCP service account with required roles → JSON key downloaded
□ Upload JSON to AutoStack onboarding → validation passes
□ Private key stored in Vault (NOT in cloud_credentials.config directly)
□ getProvider('gcp', creds) returns GCPProvider instance
□ provider.validateCredentials() → ValidationResult with success:true
□ Missing role → missingPermissions array populated
□ provider.createVPC() → VPC created in GCP console with project_id label
□ provider.createCluster() → GKE cluster visible in GCP console
□ Full deploy flow: Node.js hello-world repo → live URL on GCP within 20 minutes
□ Cost estimate uses GCP_PRICING (not AWS_PRICING) when provider='gcp'
□ infra-teardown removes all GCP resources (no orphans — verify in GCP console)
□ GCP clusters appear in InfrastructureTab with correct provider badge
```

---

## TASK 12.3 — Azure: Service Principal + AKS Implementation

### Azure credential setup
```
User creates Azure App Registration (Service Principal):
  1. Azure Portal → Azure Active Directory → App registrations → New registration
  2. Name: "AutoStack"
  3. After creation: Certificates & secrets → New client secret → copy value
  4. API permissions → Azure Service Management → user_impersonation
  5. Subscription → Access control (IAM) → Add role assignment:
     - Role: Contributor (for resource creation)
     - Member: the App Registration service principal

User provides:
  - tenant_id (from App Registration overview)
  - client_id (Application/Client ID from App Registration)
  - client_secret (from step 3 above — stored in Vault)
  - subscription_id (from Azure subscription overview)
```

### Azure credential validation
```typescript
// supabase/functions/_shared/providers/azure/auth.ts

interface AzureCredentials {
  tenant_id: string
  client_id: string
  client_secret: string  // stored in Vault — RULE N1
  subscription_id: string
}

// RULE L2 — Azure auth is completely different, never shared
export async function validateAzureCredentials(
  creds: AzureCredentials
): Promise<ValidationResult> {
  // 1. Get access token from Azure OAuth2
  //    POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token
  //    grant_type=client_credentials, client_id, client_secret
  //    scope=https://management.azure.com/.default

  // 2. Call Azure Resource Manager to verify subscription access
  //    GET https://management.azure.com/subscriptions/{subscription_id}?api-version=2020-01-01

  // 3. Check that service principal has Contributor role
  //    GET https://management.azure.com/subscriptions/{subscription_id}/providers/
  //        Microsoft.Authorization/roleAssignments?api-version=2022-04-01
  //        &$filter=principalId eq '{client_id}'

  // 4. Check required resource providers are registered:
  //    Microsoft.ContainerService (AKS)
  //    Microsoft.Network (VNet, subnets)
  //    Microsoft.ContainerRegistry (ACR — equivalent of ECR)
}
```

### Azure key differences
```
| Step              | AWS                    | Azure                                  |
|-------------------|------------------------|----------------------------------------|
| Network           | VPC                    | Virtual Network (VNet)                 |
| Cluster           | EKS                    | AKS (Azure Kubernetes Service)         |
| Container registry| ECR                    | ACR (Azure Container Registry)         |
| Image build       | CodeBuild              | Azure Container Registry Tasks (built-in) |
| Load balancer     | ALB                    | Azure Application Gateway or Azure LB  |
| DNS               | Route53                | Azure DNS                              |
| SSL               | ACM                    | App Gateway SSL certificates           |
| Resource groups   | N/A (tags are flat)    | Resource Groups (must create one first) |
| Subscription      | AWS Account            | Azure Subscription                     |
```

### VERIFY Task 12.3
```
□ Create Azure App Registration with required permissions
□ Upload credentials → validation passes (subscription accessible, Contributor role confirmed)
□ getProvider('azure', creds) returns AzureProvider instance
□ Full deploy on Azure: Node.js hello-world → AKS cluster → live URL within 20 minutes
□ Resource Group created with tags: autostack-project_id = [project_id]
□ infra-teardown deletes entire Resource Group (all Azure resources deleted at once)
□ InfrastructureTab: Azure environments show AKS badge + Azure regions
□ Onboarding Step 1: selecting "Azure" shows Azure-specific form fields
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #9] — MULTI-CLOUD ABSTRACTION
## Open audit tool. Complete Section 9: "Multi-Cloud"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 13 — MULTI-REGION: ONE CLICK, MULTIPLE AWS REGIONS
# Branch: feature/phase13-multi-region
# Goal: Deploy same app to N regions simultaneously.
#       Route53 latency-based routing splits traffic.
#       Cost shown as N × single-region cost.
# ══════════════════════════════════════════════════════════════════

## TASK 13.1 — Multi-Region Data Model

```sql
-- supabase/migrations/006_multi_region.sql

-- project_regions: tracks which regions a project is deployed to
CREATE TABLE IF NOT EXISTS project_regions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  region        TEXT        NOT NULL,
  provider      TEXT        NOT NULL DEFAULT 'aws',
  status        TEXT        NOT NULL DEFAULT 'pending',
    -- pending | provisioning | live | failed | deleted
  cluster_arn   TEXT,
  vpc_id        TEXT,
  ecr_repo_url  TEXT,
  alb_dns_name  TEXT,
  live_url      TEXT,
  rollback_data JSONB       DEFAULT '{}',
  estimated_monthly_cost DECIMAL(10,2),
  provisioning_status TEXT  DEFAULT 'pending',
  die_stage     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, region)
);

ALTER TABLE project_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_regions_org" ON project_regions
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects
      WHERE org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid
    )
  );
CREATE INDEX IF NOT EXISTS idx_project_regions_project ON project_regions(project_id);

-- Route53 records table (for global traffic routing)
CREATE TABLE IF NOT EXISTS dns_routing (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain          TEXT        NOT NULL,    -- the routed domain
  routing_policy  TEXT        NOT NULL DEFAULT 'latency',
    -- latency | weighted | geolocation | failover
  records         JSONB       NOT NULL DEFAULT '[]',
    -- [{ region, alb_dns_name, weight, health_check_id }]
  route53_zone_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### VERIFY Task 13.1
```
□ project_regions table created with all columns
□ UNIQUE constraint on (project_id, region) — cannot deploy same project to same region twice
□ RLS policy works: org A cannot see org B's project_regions
□ Index created: idx_project_regions_project
```

---

## TASK 13.2 — Multi-Region Deploy Orchestration

### How multi-region deploy works
```typescript
// The user selects "Deploy to multiple regions" in the DeployModal
// They pick: us-east-1 (primary) + eu-west-1 + ap-southeast-1

// FLOW:
// 1. Create project record (main record, first region is "primary")
// 2. Create project_regions row for each region
// 3. Run die-analyze Stage 1 + 2 ONCE (repo analysis + infra planning apply to all regions)
//    Show total cost = N × per-region cost
// 4. After user confirms: run infra-provision CONCURRENTLY for each region
//    (Fan-out: 3 regions = 3 parallel provisioning runs)
// 5. Each region broadcasts progress independently via infrastructure_events
// 6. All 3 regions must reach 'live' before the final DNS routing is configured
// 7. Create Route53 latency-based routing record pointing to all 3 ALBs
// 8. Mark project.live_url = the Route53 hostname (latency-routed)

// Concurrent provisioning using Promise.allSettled (not Promise.all):
// We want ALL regions to attempt provisioning, even if one fails
const provisioningPromises = regions.map(region =>
  provisionRegion(supabase, projectId, region, credentials)
)
const results = await Promise.allSettled(provisioningPromises)

// Count successes and failures
const succeeded = results.filter(r => r.status === 'fulfilled')
const failed = results.filter(r => r.status === 'rejected')

if (succeeded.length === 0) {
  // All regions failed — mark project as failed
  await updateProjectStatus(supabase, projectId, 'failed')
} else if (failed.length > 0) {
  // Partial success — project is 'degraded', some regions live
  await updateProjectStatus(supabase, projectId, 'degraded')
  // Notify user: "2 of 3 regions deployed successfully. us-east-1 failed."
} else {
  // All succeeded — configure DNS routing
  await configureRoute53LatencyRouting(...)
  await updateProjectStatus(supabase, projectId, 'live')
}
```

### Route53 latency-based routing configuration
```typescript
// Creates one Route53 record set per region, all pointing to the same domain
// Route53 automatically routes each user to the closest healthy region

async function configureRoute53LatencyRouting(
  route53: Route53Client,
  hostedZoneId: string,
  domain: string,
  regions: Array<{ region: string, albDns: string }>
): Promise<void> {
  const changes = regions.map(r => ({
    Action: 'UPSERT' as const,
    ResourceRecordSet: {
      Name: domain,
      Type: 'CNAME' as const,
      SetIdentifier: `autostack-${r.region}`,   // unique ID per region
      Region: r.region,                           // latency-based routing
      TTL: 60,
      ResourceRecords: [{ Value: r.albDns }],
      HealthCheckId: await createHealthCheck(route53, r.albDns),  // Route53 health check
    }
  }))

  await route53.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: { Changes: changes }
  }))
}

// Route53 health check: if an ALB in one region fails,
// Route53 automatically stops routing traffic to that region
async function createHealthCheck(route53: Route53Client, albDns: string): Promise<string> {
  const { HealthCheck } = await route53.send(new CreateHealthCheckCommand({
    CallerReference: `autostack-${albDns}-${Date.now()}`,
    HealthCheckConfig: {
      FullyQualifiedDomainName: albDns,
      Port: 443,
      Type: 'HTTPS',
      ResourcePath: '/health',
      RequestInterval: 30,    // check every 30 seconds
      FailureThreshold: 3,    // 3 consecutive failures = unhealthy
    }
  }))
  return HealthCheck!.Id!
}
```

### Frontend: Multi-Region Deploy UI changes

```jsx
// In DeployModal: after selecting size, show region picker

// Region picker: a visual map or a multi-select list
// Organized by geography:

const REGION_GROUPS = {
  'North America': [
    { id: 'us-east-1',    name: 'US East (N. Virginia)',    flag: '🇺🇸', latency: '~15ms from NYC' },
    { id: 'us-west-2',    name: 'US West (Oregon)',         flag: '🇺🇸', latency: '~5ms from SF' },
    { id: 'ca-central-1', name: 'Canada (Central)',         flag: '🇨🇦', latency: '~15ms from Toronto' },
  ],
  'Europe': [
    { id: 'eu-west-1',    name: 'EU West (Ireland)',        flag: '🇮🇪', latency: '~25ms from London' },
    { id: 'eu-central-1', name: 'EU Central (Frankfurt)',   flag: '🇩🇪', latency: '~10ms from Berlin', badge: 'GDPR' },
    { id: 'eu-west-2',    name: 'EU West (London)',         flag: '🇬🇧', latency: '~5ms from London' },
  ],
  'Asia Pacific': [
    { id: 'ap-south-1',     name: 'Asia Pacific (Mumbai)',  flag: '🇮🇳', latency: '~10ms from Mumbai' },
    { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)',flag: '🇸🇬',latency: '~10ms from SG' },
    { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)',   flag: '🇯🇵', latency: '~5ms from Tokyo' },
  ],
}

// RULE M1 — Show jurisdiction, not just flag:
// GDPR badge on EU regions
// "Data stays in EU" tooltip for GDPR-badged regions

// Multi-select: user can pick 1-5 regions
// Selected: blue border + checkmark
// Primary region indicator: first selected = "Primary" badge

// Cost shows per-region AND total:
// us-east-1:      $187/mo
// eu-west-1:      $187/mo
// ap-southeast-1: $187/mo
// ─────────────────────────
// Total:          $561/mo ← user must confirm this (RULE M3)
```

### VERIFY Task 13.2
```
□ Select 3 regions → cost shows 3 × per-region breakdown
□ Deploy to 2 regions: BOTH show live in InfrastructureTab within 20 minutes
□ Route53 latency routing configured: dig [domain] → different ALB IPs from different locations
□ Simulate region failure: update health check to point to dead URL
    → Route53 stops routing to that region within 90 seconds
□ All 3 regions: kubectl get pods -n [namespace] → Running
□ Teardown: infra-teardown removes resources in ALL regions, not just primary
□ project_regions rows: status='deleted' for all regions after teardown
□ Partial failure scenario: one region fails provisioning → project.status='degraded'
    → notification sent with which region failed
    → other regions still live and serving traffic
□ GDPR badge appears on eu-central-1 and eu-west-1 in region picker
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #10] — MULTI-REGION ROUTING
## Open audit tool. Complete Section 10: "Multi-Region"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 14 — MANAGED DATABASES: RDS, CLOUDSQL, AZURE SQL
# Branch: feature/phase14-managed-databases
# Goal: User clicks "Add Database". AutoStack provisions RDS Postgres.
#       Connection string injected into app automatically. No manual setup.
# ══════════════════════════════════════════════════════════════════

## TASK 14.1 — Database Provisioning Data Model

```sql
-- supabase/migrations/007_managed_databases.sql

CREATE TABLE IF NOT EXISTS managed_databases (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id                UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider              TEXT        NOT NULL DEFAULT 'aws',   -- aws | gcp | azure
  engine                TEXT        NOT NULL DEFAULT 'postgres',
    -- postgres | mysql | redis (Phase 14b)
  engine_version        TEXT        NOT NULL,   -- '16.1' for Postgres 16
  instance_class        TEXT        NOT NULL,   -- 'db.t3.micro' | 'db.t3.small' etc.
  storage_gb            INTEGER     NOT NULL DEFAULT 20,
  status                TEXT        NOT NULL DEFAULT 'pending',
    -- pending | creating | available | modifying | deleting | deleted | failed
  endpoint              TEXT,       -- RDS endpoint (never the password)
  port                  INTEGER     DEFAULT 5432,
  database_name         TEXT        NOT NULL DEFAULT 'app',
  username              TEXT        NOT NULL DEFAULT 'appuser',
  password_vault_id     UUID,       -- vault secret ID — RULE N1
  -- Connection string is constructed: postgres://[user]:[pass@endpoint/db]
  -- NEVER stored as complete connection string (password is in vault separately)
  rds_instance_id       TEXT,       -- AWS resource ID for teardown
  aws_region            TEXT,
  multi_az              BOOLEAN     DEFAULT FALSE,    -- HA: only for Production
  estimated_monthly_cost DECIMAL(10,2),
  backup_retention_days INTEGER     DEFAULT 7,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE managed_databases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managed_db_org" ON managed_databases
  FOR ALL USING (org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid);
CREATE INDEX IF NOT EXISTS idx_managed_db_project ON managed_databases(project_id);
CREATE INDEX IF NOT EXISTS idx_managed_db_org ON managed_databases(org_id);
```

---

## TASK 14.2 — RDS Provisioning Edge Function

### File: `supabase/functions/provision-database/index.ts`

```typescript
// INPUT:
// {
//   project_id: string,
//   engine: 'postgres' | 'mysql',
//   engine_version: string,   // '16.1' | '15.5' | '14.10' | '8.0' (mysql)
//   size: 'micro' | 'small' | 'medium' | 'large',
//   environment: 'production' | 'staging' | 'development'
// }

const RDS_INSTANCE_CLASSES = {
  micro:  { class: 'db.t3.micro',   vcpu: 2,  ram_gb: 1,  iops: 'burst',   monthly: 13.14 },
  small:  { class: 'db.t3.small',   vcpu: 2,  ram_gb: 2,  iops: 'burst',   monthly: 26.28 },
  medium: { class: 'db.t3.medium',  vcpu: 2,  ram_gb: 4,  iops: 'burst',   monthly: 52.56 },
  large:  { class: 'db.m5.large',   vcpu: 2,  ram_gb: 8,  iops: 'provisioned', monthly: 128.52 },
}

// PROVISIONING STEPS:
// 1. Validate project exists and is 'live' (must have a cluster to connect to)
// 2. Get cloud_credential for the project's region
// 3. Generate secure password (RULE N1):
//    const password = generateSecurePassword(32)  // 32 chars, alphanumeric + special
//    const vaultId = await storeInVault(supabase, org_id, 'db_password', password)
// 4. Create DB Subnet Group (RDS must be in same VPC as EKS cluster)
//    Use the project's vpc_id + private subnet IDs from rollback_data
// 5. Create RDS Parameter Group (custom postgres config):
//    - max_connections: based on instance class
//    - shared_preload_libraries: 'pg_stat_statements' (for query monitoring)
//    - log_min_duration_statement: 1000 (log queries > 1 second)
// 6. Create RDS Security Group:
//    - Allow port 5432 inbound ONLY from EKS cluster security group
//    - No public access (RULE N1)
// 7. Create RDS instance:
//    aws rds create-db-instance({
//      DBInstanceIdentifier: `autostack-${project_id.slice(0,8)}`,
//      DBInstanceClass: instanceClass,
//      Engine: 'postgres',
//      EngineVersion: engineVersion,
//      MasterUsername: 'appuser',
//      MasterUserPassword: password,  // only used here, never stored
//      DBName: 'app',
//      VpcSecurityGroupIds: [dbSecurityGroupId],
//      DBSubnetGroupName: subnetGroupName,
//      BackupRetentionPeriod: environment === 'production' ? 7 : 1,
//      MultiAZ: environment === 'production',  // HA only for production
//      StorageType: 'gp3',
//      AllocatedStorage: 20,
//      StorageEncrypted: true,   // always encrypt
//      Tags: [                   // RULE A4 — tag before use
//        { Key: 'autostack:project_id', Value: project_id },
//        { Key: 'autostack:managed',    Value: 'true' },
//      ]
//    })
// 8. Poll until status = 'available' (can take 5-10 minutes for RDS)
//    Broadcast progress via infrastructure_events
// 9. Create Kubernetes Secret with connection string:
//    DATABASE_URL = postgres://appuser:[password]@[endpoint]:5432/app
//    (password fetched from Vault)
// 10. Update K8s Deployment to reference the Secret (patch deployment)
// 11. Update managed_databases: status='available', endpoint, rds_instance_id
// 12. Update project_env_vars: add DATABASE_URL pointing to vault_id
// 13. Send notification: 'database_provisioned'

// TEARDOWN (add to infra-teardown):
// 1. Delete RDS instance (takes 5-10 minutes)
//    Skip final snapshot for dev/staging (cost savings)
//    Create final snapshot for production before deleting
// 2. Delete DB Subnet Group
// 3. Delete DB Security Group
// 4. Delete Parameter Group
// 5. Delete Vault secret (the password)
```

### RDS pricing estimate shown before provisioning
```typescript
// estimateDatabaseCost(size, engine, environment)
// Shows: instance cost + storage cost + Multi-AZ premium if production
// Example for production postgres small:
// db.t3.small:        $26.28/mo
// 20GB gp3 storage:   $2.30/mo
// Multi-AZ (2× EC2):  +$26.28/mo
// ─────────────────────────────
// Total:              $54.86/mo

// Development/staging: single-AZ, minimal storage, no premium
// Production: Multi-AZ, 7-day backup retention, encryption enforced
```

### Redis provisioning (Phase 14b — simpler than RDS)
```typescript
// Same pattern but for ElastiCache Redis:
// - cache.t3.micro for dev ($13/mo), cache.r7g.large for production ($160/mo)
// - Redis URL: redis://:password@endpoint:6379
// - No Multi-AZ for dev/staging (cache is stateless — restartable)
// - Cluster mode disabled for simplicity (single primary + replica for production)
// - Injected as REDIS_URL environment variable
```

### Frontend: Database UI

```jsx
// src/components/tabs/DatabasesTab.jsx  (NEW TAB — add to dashboard)

// Layout:
// Header: "Managed Databases" + "Add Database" button

// Empty state: no databases
//   Icon: Database
//   Title: "No databases"
//   Subtitle: "Provision a managed Postgres or Redis database for your deployment"
//   CTA: "Add Database →"

// Add Database Modal (5 steps):
//   Step 1: Engine selection
//     [PostgreSQL 16]  [PostgreSQL 15]  [MySQL 8.0]  [Redis 7]
//
//   Step 2: Size selection
//     Dev/Preview:  db.t3.micro — $13/mo, 2 vCPU, 1GB
//     Staging:      db.t3.small — $26/mo, 2 vCPU, 2GB
//     Production:   db.t3.medium — $53/mo, 2 vCPU, 4GB (Multi-AZ included)
//     Performance:  db.m5.large — $129/mo, 2 vCPU, 8GB (Multi-AZ, IOPS provisioned)
//
//   Step 3: Configuration
//     Database name: [app] (editable)
//     PostgreSQL version: [16.1] (dropdown)
//     Linked project: (select which project this DB belongs to)
//
//   Step 4: Cost confirm (RULE M3 equivalent — always show cost before provisioning)
//     Full cost breakdown + "Confirm & Provision" button
//
//   Step 5: Live progress
//     Creating subnet group... ✓
//     Creating security group... ✓
//     Creating RDS instance... (takes 5-10 minutes)
//     Connecting to cluster... ✓
//     DATABASE_URL ready... ✓

// Database card (after provisioned):
//   Status: green dot + "Available"
//   Engine: PostgreSQL 16.1
//   Instance: db.t3.small
//   Endpoint: [endpoint] (copy button, but NOT the connection string with password)
//   Storage: 20 GB used / 20 GB (progress bar)
//   Monthly cost: $54.86
//   Actions: [Rotate password] [Modify size] [Create backup] [Delete]

// Password rotation:
//   User clicks "Rotate password" → confirmation modal
//   AutoStack: generates new password → updates Vault → updates K8s Secret
//   → triggers rolling restart of connected deployment (zero downtime)
//   → user sees "Password rotated, deployment restarting..." status
```

### VERIFY Task 14.2
```
□ "Add Database" → PostgreSQL 16 → db.t3.small → cost shown ($54.86/mo for production)
□ Confirm → provisioning starts → progress shown in modal
□ RDS instance visible in AWS Console with autostack:project_id tag
□ RDS in SAME VPC as EKS cluster (verify subnet group uses project's private subnets)
□ RDS NOT publicly accessible (verify: publicly_accessible = false)
□ K8s Secret created: kubectl get secret database-credentials -n [namespace]
    → DATA: DATABASE_URL (base64 encoded, verify decodes to correct connection string)
□ App can connect to DB: kubectl exec [pod] -- psql $DATABASE_URL -c '\l'
□ Direct DB query: SELECT password_vault_id FROM managed_databases WHERE id='[id]'
    → vault_id present, NOT the actual password
□ UI: database password NOT shown anywhere in the UI
□ Teardown: delete project → RDS instance deleted (takes 5-10 minutes)
□ Password rotation: rotate → K8s Secret updated → deployment restarted → still serving traffic
□ Production database: MultiAZ = true (verify in AWS console)
□ Dev database: MultiAZ = false (cost savings)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #11] — MANAGED DATABASES
## Open audit tool. Complete Section 11: "Databases"
## Pay special attention to: password never in DB, not publicly accessible.
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# PHASE 15 — ON-PREMISE CONTROL PLANE
# Branch: feature/phase15-on-prem
# Goal: Enterprise customers run AutoStack in their own datacenter/VPC.
#       Zero dependency on autostack.io. License key validates locally.
# ══════════════════════════════════════════════════════════════════

## TASK 15.1 — Control Plane Containerization

### What gets containerized
The "AutoStack Control Plane" is the Supabase-backed backend. For on-prem:
- Replace Supabase with: PostgreSQL (user-managed) + Supabase self-hosted OR standard pg
- Replace Supabase Edge Functions with: a Go/Node.js HTTP server
- Replace Supabase Auth with: the GoTrue service (Supabase's auth is open source)
- Replace Supabase Realtime with: the supabase/realtime service (also open source)

### Deployment architecture (Docker Compose for < 50 users, Helm for enterprise)
```yaml
# docker-compose.on-prem.yml
version: '3.9'
services:
  autostack-api:
    image: ghcr.io/autostack/control-plane:latest
    environment:
      DATABASE_URL: postgres://autostack:${DB_PASSWORD}@postgres:5432/autostack
      REDIS_URL: redis://redis:6379
      LICENSE_KEY: ${AUTOSTACK_LICENSE_KEY}
      GITHUB_APP_ID: ${GITHUB_APP_ID}
      GITHUB_APP_PRIVATE_KEY: ${GITHUB_APP_PRIVATE_KEY}
      # NO autostack.io URLs — fully self-contained
    ports:
      - "8080:8080"
    depends_on:
      - postgres
      - redis

  autostack-frontend:
    image: ghcr.io/autostack/frontend:latest
    environment:
      API_URL: http://autostack-api:8080
      SUPABASE_URL: http://supabase-api:8000
    ports:
      - "3000:3000"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: autostack
      POSTGRES_USER: autostack
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

  # Supabase services (open source)
  supabase-api:
    image: supabase/gotrue:v2.169.0
    # ... supabase auth config

  supabase-realtime:
    image: supabase/realtime:v2.34.47
    # ... realtime config

volumes:
  pgdata:
  redisdata:
```

### Helm chart for enterprise Kubernetes deployment
```
autostack-control-plane/
  Chart.yaml
  values.yaml
  templates/
    api-deployment.yaml
    api-service.yaml
    frontend-deployment.yaml
    frontend-service.yaml
    postgres-statefulset.yaml
    redis-statefulset.yaml
    ingress.yaml          ← NGINX ingress for the control plane UI
    config-map.yaml
    secret.yaml
    rbac.yaml
```

---

## TASK 15.2 — License Key System (No Phone-Home)

### License key format
```typescript
// License key = RS256-signed JWT containing:
// {
//   org_id: string,          // identifies the customer
//   org_name: string,        // display name
//   plan: 'enterprise',
//   max_users: number,       // seats
//   max_environments: number, // or -1 for unlimited
//   features: string[],      // enabled features
//   issued_at: number,       // Unix timestamp
//   expires_at: number,      // Unix timestamp (annual or perpetual)
//   version: 'v1'
// }

// AutoStack signs this JWT with AutoStack's RSA private key (kept secret at autostack.io)
// The on-prem control plane verifies with AutoStack's RSA public key (bundled in the image)
// Verification is 100% local — no network call required (RULE O2)

// License validation on startup:
async function validateLicense(licenseKey: string): Promise<LicenseInfo> {
  const AUTOSTACK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
  [RSA public key bundled in the Docker image]
  -----END PUBLIC KEY-----`

  try {
    const payload = jwt.verify(licenseKey, AUTOSTACK_PUBLIC_KEY, { algorithms: ['RS256'] })

    if (payload.expires_at < Date.now() / 1000) {
      throw new Error('License has expired. Contact sales@autostack.io to renew.')
    }

    return payload as LicenseInfo
  } catch (err) {
    throw new Error(`Invalid license key: ${err.message}`)
  }
}

// Check license on every startup. If invalid: refuse to start.
// Check license daily in background. If expired: send admin warning email but continue.
// Hard enforcement at 30 days past expiry: reduce to read-only mode.
```

### License management UI (for AutoStack internal use)
```typescript
// Internal tool at admin.autostack.io:
// - Generate license key for a customer
// - Set: org_name, plan, max_users, max_environments, features, expires_at
// - Signed with the private key (kept offline in a hardware security module ideally)
// - Customer receives: { license_key: "eyJ..." } — they paste this into their config

// The process for issuing a license:
// 1. Sales closes enterprise deal
// 2. Customer success generates license via internal admin tool
// 3. License key emailed to customer (or shared via secure channel)
// 4. Customer sets AUTOSTACK_LICENSE_KEY env var in their deployment
// 5. Done — no ongoing communication with autostack.io required
```

---

## TASK 15.3 — On-Prem Agent: Connects to Local Control Plane

The Go agent from Phase 7 is unchanged — it already talks to Edge Functions via HTTP.
For on-prem, the agent's `AUTOSTACK_CONTROL_PLANE_URL` points to the customer's own
control plane instance instead of autostack.io.

```bash
# On-prem helm install:
helm install autostack-agent autostack/agent \
  --set agent.token=[token] \
  --set agent.clusterID=[id] \
  --set controlPlane.url=https://autostack.mycompany.com/api  # ← internal URL
  # NOT https://[project].supabase.co/functions/v1
```

No code changes to the agent. Only the URL changes.

---

## TASK 15.4 — Migration Path: SaaS → On-Prem

### What gets migrated
Customers moving from SaaS to on-prem need their data:
- organizations, org_members, clusters, projects, deployments
- findings, incidents, cloud_credentials (encrypted)
- NOT: cluster_metrics (time-series, too large, not worth migrating)
- NOT: pod_logs (ephemeral, 24h retention anyway)
- NOT: infrastructure_events (deployment history)

### Migration tool
```typescript
// supabase/functions/export-org-data/index.ts
// Enterprise only — requires subscription status = 'enterprise'
// Exports org's data as encrypted JSON for import into on-prem instance

// OUTPUT: { data: AES-256-encrypted JSON, encrypted_with: 'customer-provided-key' }
// Customer provides an encryption key (random 256-bit key)
// AutoStack encrypts the export with it, customer decrypts on their end

// On-prem import tool (Docker container):
// docker run autostack/migrate --import data.json.enc --key [encryption-key] \
//   --target postgres://... 
```

### VERIFY Task 15.4
```
□ Docker Compose: docker-compose -f docker-compose.on-prem.yml up → all services start
□ localhost:3000 → AutoStack UI loads
□ Signup → org created (using self-hosted GoTrue)
□ Invalid license key → API returns 402 with message
□ Valid license key → dashboard accessible
□ License expired (set expires_at = now-1d in test key) → warning shown but functional
□ Agent pointed at localhost:8080 → registers successfully
□ Full deploy flow: GitHub URL → EKS → live URL (using the on-prem control plane)
□ RULE O2: no outbound calls to autostack.io (verify with tcpdump/wireshark during operation)
□ RULE O3: upgrade test: pull new Docker image → restart containers → data preserved
□ Helm chart: helm install autostack-control-plane ... → all pods Running
□ Export org data → encrypted JSON downloaded
□ Import on fresh on-prem instance → all projects/deployments visible
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## [AUDIT CHECKPOINT #12] — ON-PREM & ENTERPRISE
## Open audit tool. Complete Section 12: "On-Prem & Enterprise"
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

# ══════════════════════════════════════════════════════════════════
# APPENDIX A — COMPLETE PROGRESS TRACKER (add to PROGRESS.md)
# ══════════════════════════════════════════════════════════════════

```markdown
## Phase 11: Stripe Billing
- [ ] 11.1 — Stripe products, prices, checkout, webhook, portal
- [ ] 11.2 — Usage metering (org_usage table + monthly aggregation)
- [ ] 11.3 — 14-day free trial flow + dunning emails

## Phase 12: Multi-Cloud
- [ ] 12.1 — Cloud provider abstraction layer (interface + factory)
- [ ] 12.2 — GCP: Service Account validation + GKE deployment
- [ ] 12.3 — Azure: Service Principal validation + AKS deployment

## Phase 13: Multi-Region
- [ ] 13.1 — Multi-region data model (project_regions, dns_routing tables)
- [ ] 13.2 — Multi-region deploy orchestration + Route53 latency routing

## Phase 14: Managed Databases
- [ ] 14.1 — Database provisioning data model (managed_databases table)
- [ ] 14.2 — RDS provisioning + Redis provisioning + DatabasesTab UI

## Phase 15: On-Premise Control Plane
- [ ] 15.1 — Control plane containerization (Docker Compose + Helm)
- [ ] 15.2 — License key system (RSA-signed JWT, local verification)
- [ ] 15.3 — Agent on-prem configuration (URL change only)
- [ ] 15.4 — SaaS → on-prem migration tool
```

---

# APPENDIX B — WHAT COMES AFTER PHASE 15

This is the list of things that exist after Phase 15. Ship Phase 15 first.

```
Post-Phase-15 roadmap (no implementation details in this document):

  AutoStack CLI
    npm install -g autostack-cli
    autostack login
    autostack deploy ./my-app --env production --region us-east-1
    autostack logs --env production --tail
    autostack rollback --env production

  Terraform Provider
    resource "autostack_environment" "production" {
      repo_url = "https://github.com/myorg/myapp"
      provider = "aws"
      region   = "us-east-1"
      size     = "medium"
    }

  SOC2 Type II Certification
    AutoStack's control plane passes SOC2 audit
    Compliance export for customers: generate SOC2 evidence

  GitHub Actions Integration
    - autostack/deploy action: deploy from GitHub Actions
    - autostack/rollback action: rollback on test failure

  Datadog / Prometheus Integration
    Export AutoStack metrics to user's existing monitoring stack

  SSO: SAML + OIDC
    Enterprise customers: log in with their own identity provider
    Google Workspace, Azure AD, Okta, OneLogin
```

---

# APPENDIX C — PHASE 11-15 DEPENDENCY GRAPH

```
Phase 11 (Stripe)    ─── Independent. Can ship any time after Phase 10.
                          Only depends on: subscriptions table, Stripe account

Phase 12 (Multi-Cloud) ─ Independent. Only depends on: provider abstraction
                          (no dependency on Phase 11)

Phase 13 (Multi-Region) ─ Depends on: Phase 12 (need multi-cloud abstraction)
                            Depends on: aws-assume-role from Phase 1

Phase 14 (Databases)  ─── Depends on: Phase 1-5 (needs live cluster to put DB in)
                           Independent of Phase 11-13

Phase 15 (On-Prem)    ─── Depends on: ALL previous phases being stable
                           On-prem must contain complete, stable feature set
                           Do not start until Phases 1-14 are production-proven
```

```
Ship order recommendation:
  Phase 11 (Stripe) — FIRST. Revenue before new features.
  Phase 14 (Databases) — SECOND. Reduces onboarding friction for most customers.
  Phase 12 (Multi-Cloud) — THIRD. Unlocks GCP/Azure enterprise market.
  Phase 13 (Multi-Region) — FOURTH. Power feature for reliability-focused customers.
  Phase 15 (On-Prem) — LAST. Only needed for regulated industries.
```
