-- Migration 011: SOC2 Controls and Compliance Tracking
-- Implements technical controls required for SOC2 Type II certification

-- ═══════════════════════════════════════════════════════════════════
-- MFA Configuration Tracking (CC6.1)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_mfa_config (
  user_id              UUID  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  totp_enabled         BOOLEAN DEFAULT FALSE,
  backup_codes_generated BOOLEAN DEFAULT FALSE,
  last_verified_at     TIMESTAMPTZ,
  enforced             BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Org-level MFA enforcement
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_mfa BOOLEAN DEFAULT FALSE;

-- RLS for MFA config
ALTER TABLE public.user_mfa_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_mfa_config_own" ON public.user_mfa_config
  FOR ALL USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- Compliance Log (Evidence Collection for SOC2)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.compliance_log (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id  TEXT  NOT NULL,  -- 'CC6.1-001', 'CC7.1-001', etc.
  check_type  TEXT  NOT NULL,  -- 'automated_test' | 'manual_review' | 'cron_cleanup'
  result      TEXT  NOT NULL,  -- 'passed' | 'failed' | 'n/a'
  details     JSONB DEFAULT '{}',
  checked_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for auditor queries
CREATE INDEX IF NOT EXISTS idx_compliance_log_control ON public.compliance_log(control_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_log_result ON public.compliance_log(result, checked_at DESC);

-- RLS: Compliance log readable by admins only
ALTER TABLE public.compliance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_log_admin_read" ON public.compliance_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- Data Retention Enforcement (CC7.1, RULE T3)
-- ═══════════════════════════════════════════════════════════════════

-- 90-day audit log retention (Policy: Data Retention Policy §3.1)
SELECT cron.schedule(
  'cleanup-audit-logs-90d',
  '0 3 * * *',  -- Daily at 3 AM
  $$
  WITH deleted AS (
    DELETE FROM public.audit_log 
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND event_type NOT IN ('security.login', 'security.mfa_enabled', 'security.role_changed')
    RETURNING id
  )
  INSERT INTO public.compliance_log (control_id, check_type, result, details)
  VALUES (
    'CC7.1-001',
    'cron_cleanup',
    'passed',
    jsonb_build_object('deleted_count', (SELECT COUNT(*) FROM deleted), 'policy_section', '3.1')
  );
  $$
);

-- 1-year security event retention (Policy: §3.2)
SELECT cron.schedule(
  'cleanup-security-events-1y',
  '0 4 * * *',  -- Daily at 4 AM
  $$
  WITH deleted AS (
    DELETE FROM public.audit_log 
    WHERE created_at < NOW() - INTERVAL '1 year'
    AND event_type IN ('security.login', 'security.mfa_enabled', 'security.role_changed')
    RETURNING id
  )
  INSERT INTO public.compliance_log (control_id, check_type, result, details)
  VALUES (
    'CC7.1-002',
    'cron_cleanup',
    'passed',
    jsonb_build_object('deleted_count', (SELECT COUNT(*) FROM deleted), 'policy_section', '3.2')
  );
  $$
);

-- 30-day data deletion after subscription cancellation (Policy: §3.3)
SELECT cron.schedule(
  'cleanup-canceled-org-data',
  '0 5 * * *',  -- Daily at 5 AM
  $$
  WITH orgs_to_delete AS (
    SELECT o.id, o.name
    FROM public.organizations o
    JOIN public.subscriptions s ON s.org_id = o.id
    WHERE s.status = 'canceled'
    AND s.canceled_at < NOW() - INTERVAL '30 days'
    AND o.data_deletion_complete = FALSE
    LIMIT 10  -- Process in batches
  ),
  deleted_projects AS (
    DELETE FROM public.projects
    WHERE org_id IN (SELECT id FROM orgs_to_delete)
    RETURNING org_id
  ),
  deleted_members AS (
    DELETE FROM public.org_members
    WHERE org_id IN (SELECT id FROM orgs_to_delete)
    RETURNING org_id
  ),
  marked_complete AS (
    UPDATE public.organizations
    SET data_deletion_complete = TRUE
    WHERE id IN (SELECT id FROM orgs_to_delete)
    RETURNING id
  )
  INSERT INTO public.compliance_log (control_id, check_type, result, details)
  SELECT
    'CC7.1-003',
    'cron_cleanup',
    'passed',
    jsonb_build_object(
      'orgs_deleted', (SELECT COUNT(*) FROM marked_complete),
      'policy_section', '3.3'
    );
  $$
);

-- ═══════════════════════════════════════════════════════════════════
-- Automated Control Testing (CC4.1)
-- ═══════════════════════════════════════════════════════════════════

-- Monthly control check (called by soc2-control-check Edge Function)
-- This is a placeholder; actual checks run via Edge Function

CREATE TABLE IF NOT EXISTS public.control_test_results (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id  TEXT  NOT NULL,
  test_name   TEXT  NOT NULL,
  passed      BOOLEAN NOT NULL,
  details     JSONB DEFAULT '{}',
  tested_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_test_results ON public.control_test_results(control_id, tested_at DESC);

ALTER TABLE public.control_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "control_test_results_admin_read" ON public.control_test_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- Penetration Test Tracking (CC7.1, RULE T2)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.penetration_tests (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor            TEXT  NOT NULL,
  test_date         DATE  NOT NULL,
  report_url        TEXT,  -- Supabase Storage URL
  critical_findings INT   DEFAULT 0,
  high_findings     INT   DEFAULT 0,
  medium_findings   INT   DEFAULT 0,
  low_findings      INT   DEFAULT 0,
  status            TEXT  NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'completed' | 'remediated'
  remediation_notes JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.penetration_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pen_tests_admin_only" ON public.penetration_tests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- Audit Log Enhancements for SOC2
-- ═══════════════════════════════════════════════════════════════════

-- Add severity field to distinguish security events from debug logs
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info';  -- 'critical' | 'high' | 'medium' | 'low' | 'info'

-- Index for security event queries
CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON public.audit_log(severity, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- Data Deletion Flag
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS data_deletion_complete BOOLEAN DEFAULT FALSE;

-- ═══════════════════════════════════════════════════════════════════
-- Trigger for updated_at
-- ═══════════════════════════════════════════════════════════════════

CREATE TRIGGER set_updated_at_user_mfa_config
BEFORE UPDATE ON public.user_mfa_config
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_pen_tests
BEFORE UPDATE ON public.penetration_tests
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Comments for Auditors
-- ═══════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.compliance_log IS 'SOC2 evidence collection: automated control test results and cleanup job execution logs';
COMMENT ON TABLE public.user_mfa_config IS 'CC6.1: MFA enrollment tracking per user';
COMMENT ON TABLE public.control_test_results IS 'CC4.1: Monthly automated control testing results';
COMMENT ON TABLE public.penetration_tests IS 'CC7.1: Third-party penetration test tracking and remediation evidence';
COMMENT ON COLUMN public.organizations.require_mfa IS 'CC6.1: Org-level MFA enforcement flag';
COMMENT ON COLUMN public.audit_log.severity IS 'Distinguishes security events (1-year retention) from debug logs (90-day retention)';
