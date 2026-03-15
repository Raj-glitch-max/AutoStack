-- 006_multi_region.sql
--
-- Multi-region deployment tracking and DNS routing configuration.
-- Enables deploying the same project to multiple regions simultaneously
-- with latency-based Route53 routing.

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

CREATE POLICY "project_regions_org_access" ON project_regions
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

ALTER TABLE dns_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dns_routing_org_access" ON dns_routing
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects
      WHERE org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid
    )
  );

CREATE INDEX IF NOT EXISTS idx_dns_routing_project ON dns_routing(project_id);
