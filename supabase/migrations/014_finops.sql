-- Phase 24: FinOps - Advanced Cost Intelligence
-- RULE W1: Cost anomaly thresholds are per-environment, not global
-- RULE W2: Cost recommendations are actionable, not informational
-- RULE W3: Historical cost data retained for 13 months

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
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Budget alert tracking (prevent spam — one alert per threshold crossing per period)
CREATE TABLE IF NOT EXISTS budget_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id       UUID        NOT NULL REFERENCES cost_budgets(id) ON DELETE CASCADE,
  threshold_pct   INTEGER     NOT NULL,
  period_key      TEXT        NOT NULL,  -- 'YYYY-MM' for monthly budgets
  alerted_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(budget_id, threshold_pct, period_key)
);

-- Cost anomalies detected by automated checks
CREATE TABLE IF NOT EXISTS cost_anomalies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID        REFERENCES projects(id),
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  current_amount  DECIMAL(10,2) NOT NULL,
  expected_amount DECIMAL(10,2) NOT NULL,
  deviation_pct   INTEGER     NOT NULL,
  z_score         DECIMAL(5,2),
  direction       TEXT,       -- spike | drop
  critical        BOOLEAN     DEFAULT FALSE,
  status          TEXT        DEFAULT 'open',  -- open | investigating | resolved | dismissed
  resolved_at     TIMESTAMPTZ,
  notes           TEXT
);

-- Reserved Instance recommendations
CREATE TABLE IF NOT EXISTS ri_recommendations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id            UUID        REFERENCES projects(id),
  instance_type         TEXT        NOT NULL,
  region                TEXT        NOT NULL,
  usage_hours_last_90d  INTEGER     NOT NULL,
  utilization_pct       DECIMAL(5,2) NOT NULL,
  current_monthly_cost  DECIMAL(10,2) NOT NULL,
  ri_monthly_cost       DECIMAL(10,2) NOT NULL,
  monthly_savings       DECIMAL(10,2) NOT NULL,
  annual_savings        DECIMAL(10,2) NOT NULL,
  confidence            TEXT,       -- high | medium | low
  status                TEXT        DEFAULT 'pending',  -- pending | purchased | dismissed
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_budgets_org ON cost_budgets(org_id);
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_org ON cost_anomalies(org_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_status ON cost_anomalies(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_ri_recommendations_org ON ri_recommendations(org_id);
CREATE INDEX IF NOT EXISTS idx_ri_recommendations_status ON ri_recommendations(status) WHERE status = 'pending';

-- RLS policies
ALTER TABLE cost_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ri_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_budgets_org_access" ON cost_budgets
  FOR ALL USING (org_id = auth.org_id());

CREATE POLICY "budget_alerts_org_access" ON budget_alerts
  FOR ALL USING (
    budget_id IN (SELECT id FROM cost_budgets WHERE org_id = auth.org_id())
  );

CREATE POLICY "cost_anomalies_org_access" ON cost_anomalies
  FOR ALL USING (org_id = auth.org_id());

CREATE POLICY "ri_recommendations_org_access" ON ri_recommendations
  FOR ALL USING (org_id = auth.org_id());

-- Function to check budget thresholds
CREATE OR REPLACE FUNCTION check_budget_thresholds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  budget_rec RECORD;
  current_period TEXT;
  spend_pct INTEGER;
  threshold INTEGER;
BEGIN
  FOR budget_rec IN 
    SELECT * FROM cost_budgets WHERE status = 'active'
  LOOP
    -- Calculate current period key
    current_period := TO_CHAR(NOW(), 'YYYY-MM');
    
    -- Calculate current spend percentage
    spend_pct := ROUND((budget_rec.current_spend / budget_rec.budget_usd) * 100);
    
    -- Check each threshold
    FOREACH threshold IN ARRAY budget_rec.alert_at_pct
    LOOP
      IF spend_pct >= threshold THEN
        -- Check if we've already alerted for this threshold in this period
        IF NOT EXISTS (
          SELECT 1 FROM budget_alerts
          WHERE budget_id = budget_rec.id
            AND threshold_pct = threshold
            AND period_key = current_period
        ) THEN
          -- Insert alert record
          INSERT INTO budget_alerts (budget_id, threshold_pct, period_key)
          VALUES (budget_rec.id, threshold, current_period);
          
          -- TODO: Send notification via send-notification function
          RAISE NOTICE 'Budget alert: % reached %% of budget', budget_rec.name, threshold;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- RULE W3: Modify org_usage retention to keep 13 months
-- Update the existing cleanup job to keep 13 months instead of 90 days
DO $$
BEGIN
  -- Update existing pg_cron job if it exists
  UPDATE cron.job
  SET command = $$DELETE FROM org_usage WHERE date < NOW() - INTERVAL '13 months'$$
  WHERE jobname = 'cleanup-org-usage';
  
  -- If job doesn't exist, create it
  IF NOT FOUND THEN
    PERFORM cron.schedule(
      'cleanup-org-usage',
      '0 2 * * *',  -- 2 AM daily
      $$DELETE FROM org_usage WHERE date < NOW() - INTERVAL '13 months'$$
    );
  END IF;
END $$;

-- Schedule cost anomaly check (hourly)
SELECT cron.schedule(
  'cost-anomaly-check',
  '0 * * * *',  -- Every hour
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/cost-anomaly-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);

-- Schedule budget threshold check (every 6 hours)
SELECT cron.schedule(
  'budget-threshold-check',
  '0 */6 * * *',  -- Every 6 hours
  $$SELECT check_budget_thresholds()$$
);
