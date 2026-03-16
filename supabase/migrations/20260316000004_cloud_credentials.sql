-- ============================================================================
-- Migration: Cloud Credentials Table
-- Purpose: Store AWS/GCP/Azure credentials for organizations
-- Date: 2026-03-16
-- ============================================================================

-- Cloud credentials table for storing AWS IAM role ARNs
CREATE TABLE IF NOT EXISTS cloud_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('aws', 'gcp', 'azure')),
  account_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'us-east-1',
  role_arn TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one credential per org per role_arn
  CONSTRAINT cloud_credentials_unique UNIQUE (org_id, role_arn)
);

-- Index for fast org lookups
CREATE INDEX IF NOT EXISTS idx_cloud_credentials_org
  ON cloud_credentials(org_id);

-- RLS policies
ALTER TABLE cloud_credentials ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DO $$
BEGIN
  DROP POLICY IF EXISTS "cloud_credentials_org_access" ON cloud_credentials;
  DROP POLICY IF EXISTS "cloud_credentials_service_role" ON cloud_credentials;
END $$;

CREATE POLICY "cloud_credentials_org_access" ON cloud_credentials
  FOR ALL USING (
    org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid
  );

-- Service role can access all credentials
CREATE POLICY "cloud_credentials_service_role" ON cloud_credentials
  FOR ALL USING (
    auth.role() = 'service_role'
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cloud_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS cloud_credentials_updated_at ON cloud_credentials;

CREATE TRIGGER cloud_credentials_updated_at
  BEFORE UPDATE ON cloud_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_cloud_credentials_updated_at();
