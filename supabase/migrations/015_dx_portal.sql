-- Phase 25: Developer Experience Portal (DX Portal)
-- Service catalog for large engineering orgs

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS runbook_url     TEXT,
    -- Link to Confluence, Notion, GitHub Wiki, etc.
  ADD COLUMN IF NOT EXISTS team_owner      TEXT,
    -- Team name (free text): "Platform", "Backend", "Data"
  ADD COLUMN IF NOT EXISTS on_call_slack   TEXT,
    -- Slack channel for this service: "#backend-oncall"
  ADD COLUMN IF NOT EXISTS sla_target_uptime DECIMAL(5,2),
    -- Uptime SLA: 99.9, 99.95, 99.99
  ADD COLUMN IF NOT EXISTS service_tier    TEXT DEFAULT 'standard';
    -- 'critical' | 'standard' | 'internal' | 'deprecated'

-- Create index for service catalog queries
CREATE INDEX IF NOT EXISTS idx_projects_team_owner ON projects(team_owner) WHERE team_owner IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_service_tier ON projects(service_tier);

-- View for service catalog with computed health scores
CREATE OR REPLACE VIEW service_catalog AS
SELECT 
  p.id,
  p.name,
  p.team_owner,
  p.service_tier,
  p.runbook_url,
  p.on_call_slack,
  p.sla_target_uptime,
  p.live_url,
  p.provisioning_status,
  p.estimated_monthly_cost,
  p.environment_type,
  p.created_at,
  c.health_score,
  c.provider,
  c.region,
  c.agent_status,
  -- Compute uptime from incidents
  COALESCE(
    100.0 - (
      SELECT SUM(
        EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - detected_at)) / 3600.0
      ) * 100.0 / (30 * 24)  -- 30 days in hours
      FROM incidents
      WHERE cluster_id = c.id
        AND detected_at >= NOW() - INTERVAL '30 days'
        AND severity IN ('critical', 'high')
    ),
    100.0
  ) AS uptime_30d,
  -- Count open incidents
  (
    SELECT COUNT(*)
    FROM incidents
    WHERE cluster_id = c.id
      AND status != 'resolved'
  ) AS open_incidents,
  -- Count open findings
  (
    SELECT COUNT(*)
    FROM findings
    WHERE cluster_id = c.id
      AND status = 'open'
  ) AS open_findings,
  -- Last deployment
  (
    SELECT MAX(completed_at)
    FROM deployments
    WHERE cluster_id = c.id
      AND status = 'success'
  ) AS last_deployed_at
FROM projects p
LEFT JOIN clusters c ON c.id = p.id
WHERE p.provisioning_status IN ('live', 'degraded');

-- Grant access to service catalog view
GRANT SELECT ON service_catalog TO authenticated;

-- Function to compute service health score
CREATE OR REPLACE FUNCTION compute_service_health_score(project_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  score INTEGER := 100;
  critical_incidents INTEGER;
  high_incidents INTEGER;
  critical_findings INTEGER;
  high_findings INTEGER;
  last_deploy_days INTEGER;
  uptime_pct DECIMAL;
BEGIN
  -- Count active incidents
  SELECT 
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high')
  INTO critical_incidents, high_incidents
  FROM incidents
  WHERE cluster_id = project_uuid
    AND status != 'resolved';
  
  -- Count open findings
  SELECT 
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high')
  INTO critical_findings, high_findings
  FROM findings
  WHERE cluster_id = project_uuid
    AND status = 'open';
  
  -- Days since last deployment
  SELECT EXTRACT(DAY FROM NOW() - MAX(completed_at))
  INTO last_deploy_days
  FROM deployments
  WHERE cluster_id = project_uuid
    AND status = 'success';
  
  -- Calculate uptime
  SELECT 
    100.0 - (
      SUM(
        EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - detected_at)) / 3600.0
      ) * 100.0 / (30 * 24)
    )
  INTO uptime_pct
  FROM incidents
  WHERE cluster_id = project_uuid
    AND detected_at >= NOW() - INTERVAL '30 days'
    AND severity IN ('critical', 'high');
  
  uptime_pct := COALESCE(uptime_pct, 100.0);
  
  -- Apply deductions
  score := score - (critical_incidents * 40);
  score := score - (high_incidents * 20);
  score := score - (critical_findings * 10);
  score := score - (high_findings * 5);
  
  IF last_deploy_days > 30 THEN
    score := score - 5;  -- Stale service risk
  END IF;
  
  IF uptime_pct < 99.9 THEN
    score := score - 15;
  END IF;
  
  RETURN GREATEST(0, score);
END;
$$;
