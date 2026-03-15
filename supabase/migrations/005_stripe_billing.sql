-- 005_stripe_billing.sql
--
-- Stripe subscription and billing infrastructure.
-- Subscriptions table is the single source of truth for org plan status.
-- Only service role (stripe-webhook) can modify subscription records.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT        UNIQUE,
  stripe_subscription_id TEXT        UNIQUE,
  stripe_price_id        TEXT,
  plan                   TEXT        NOT NULL DEFAULT 'free',
  status                 TEXT        NOT NULL DEFAULT 'active',
    -- trialing | active | past_due | canceled | unpaid | incomplete | paused
  trial_ends_at          TIMESTAMPTZ,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN     DEFAULT FALSE,
  canceled_at            TIMESTAMPTZ,
  payment_failed_at      TIMESTAMPTZ,
  dunning_email_count    INTEGER     DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_org_read" ON subscriptions
  FOR SELECT USING (org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)
  WHERE status IN ('past_due', 'unpaid');

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT        UNIQUE,
  amount_paid       INTEGER,
  amount_due        INTEGER,
  currency          TEXT        DEFAULT 'usd',
  status            TEXT,
  period_start      TIMESTAMPTZ,
  period_end        TIMESTAMPTZ,
  invoice_pdf_url   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_org_read" ON invoices
  FOR SELECT USING (org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid);
CREATE INDEX IF NOT EXISTS idx_invoices_org_time ON invoices(org_id, created_at DESC);

-- plan_usage: tracks resource counts for plan enforcement
CREATE TABLE IF NOT EXISTS plan_usage (
  org_id              UUID        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  live_environments   INTEGER     NOT NULL DEFAULT 0,
  total_nodes         INTEGER     NOT NULL DEFAULT 0,
  deployments_today   INTEGER     NOT NULL DEFAULT 0,
  last_reset_date     DATE        DEFAULT CURRENT_DATE,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plan_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_usage_org_read" ON plan_usage
  FOR SELECT USING (org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid);

-- Trigger: keep plan_usage.live_environments in sync
CREATE OR REPLACE FUNCTION update_plan_usage_on_project_change()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE plan_usage
  SET live_environments = (
    SELECT COUNT(*) FROM projects
    WHERE org_id = COALESCE(NEW.org_id, OLD.org_id)
    AND provisioning_status = 'live'
  ),
  updated_at = NOW()
  WHERE org_id = COALESCE(NEW.org_id, OLD.org_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_plan_usage_projects
AFTER INSERT OR UPDATE OF provisioning_status OR DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION update_plan_usage_on_project_change();
