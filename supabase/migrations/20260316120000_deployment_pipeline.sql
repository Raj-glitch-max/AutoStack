-- ============================================================================
-- Migration: Deployment Pipeline Schema
-- Purpose: Add columns and tables for real-time build/deploy pipeline
-- Date: 2026-03-16
-- ============================================================================

-- Add deployment pipeline tracking columns to deployments table
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS repo_url TEXT,
  ADD COLUMN IF NOT EXISTS app_name TEXT,
  ADD COLUMN IF NOT EXISTS port INT DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS memory_mb INT DEFAULT 512,
  ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'us-east-1',
  ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_url TEXT,
  ADD COLUMN IF NOT EXISTS ecr_repository_uri TEXT,
  ADD COLUMN IF NOT EXISTS image_tag TEXT,
  ADD COLUMN IF NOT EXISTS infra_type TEXT, -- app_runner | ecs_fargate | eks_fargate
  ADD COLUMN IF NOT EXISTS app_runner_service_arn TEXT,
  ADD COLUMN IF NOT EXISTS ecs_cluster_arn TEXT,
  ADD COLUMN IF NOT EXISTS ecs_service_arn TEXT,
  ADD COLUMN IF NOT EXISTS alb_arn TEXT,
  ADD COLUMN IF NOT EXISTS alb_dns_name TEXT,
  ADD COLUMN IF NOT EXISTS vpc_id TEXT,
  ADD COLUMN IF NOT EXISTS subnet_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS security_group_id TEXT,
  ADD COLUMN IF NOT EXISTS codebuild_project_name TEXT,
  ADD COLUMN IF NOT EXISTS codebuild_build_id TEXT,
  ADD COLUMN IF NOT EXISTS health_check_path TEXT DEFAULT '/health',
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rollback_available BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS previous_image_tag TEXT,
  ADD COLUMN IF NOT EXISTS error_analysis JSONB;

-- Backfill org_id from projects for existing deployments
UPDATE deployments d
SET org_id = p.org_id
FROM projects p
WHERE d.project_id = p.id
AND d.org_id IS NULL;

-- Valid stage values (for documentation):
-- queued → analyzing → cost_selection → provisioning_infra → building_image
-- → pushing_image → deploying → health_checking → active → failed → rolling_back

-- Build log entries table (separate from JSONB for real-time streaming)
CREATE TABLE IF NOT EXISTS build_log_entries (
  id BIGSERIAL PRIMARY KEY,
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  level TEXT NOT NULL DEFAULT 'info', -- info | warn | error | success | step
  text TEXT NOT NULL,
  source TEXT DEFAULT 'codebuild'  -- codebuild | autostack | k8s
);

CREATE INDEX IF NOT EXISTS idx_build_logs_deployment 
  ON build_log_entries(deployment_id, timestamp);

-- Enable realtime for log streaming to frontend (only if not already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'build_log_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE build_log_entries;
  END IF;
END $$;

-- Infrastructure resources registry (for teardown tracking)
CREATE TABLE IF NOT EXISTS infra_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'aws',
  resource_type TEXT NOT NULL,  -- vpc | subnet | security_group | ecr | codebuild | app_runner | ecs_cluster | ecs_service | alb
  resource_id TEXT NOT NULL,    -- the AWS resource ID/ARN
  resource_arn TEXT,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deletion_status TEXT DEFAULT 'active'  -- active | deleting | deleted | failed
);

CREATE INDEX IF NOT EXISTS idx_infra_resources_deployment 
  ON infra_resources(deployment_id);

CREATE INDEX IF NOT EXISTS idx_infra_resources_org 
  ON infra_resources(org_id, deletion_status);

-- RLS policies for build_log_entries
ALTER TABLE build_log_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view logs for their org's deployments" ON build_log_entries;
  DROP POLICY IF EXISTS "Service role can insert logs" ON build_log_entries;
END $$;

CREATE POLICY "Users can view logs for their org's deployments"
  ON build_log_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deployments d
      WHERE d.id = build_log_entries.deployment_id
      AND d.org_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid
    )
  );

CREATE POLICY "Service role can insert logs"
  ON build_log_entries FOR INSERT
  WITH CHECK (true);

-- RLS policies for infra_resources
ALTER TABLE infra_resources ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view their org's resources" ON infra_resources;
  DROP POLICY IF EXISTS "Service role can manage resources" ON infra_resources;
END $$;

CREATE POLICY "Users can view their org's resources"
  ON infra_resources FOR SELECT
  USING (org_id = (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid);

CREATE POLICY "Service role can manage resources"
  ON infra_resources FOR ALL
  USING (true)
  WITH CHECK (true);
