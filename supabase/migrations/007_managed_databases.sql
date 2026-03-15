-- 007_managed_databases.sql
--
-- Data model for managed databases (RDS, CloudSQL, Azure SQL, Redis)
-- Tracks the provisioning state, version, and the Vault ID for the password.
-- Passwords are never stored in plaintext in this table (RULE N1).

CREATE TABLE IF NOT EXISTS managed_databases (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id                UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider              TEXT        NOT NULL DEFAULT 'aws',   -- aws | gcp | azure
  engine                TEXT        NOT NULL DEFAULT 'postgres',
    -- postgres | mysql | redis
  engine_version        TEXT        NOT NULL,   -- '16.1' for Postgres 16
  instance_class        TEXT        NOT NULL,   -- 'db.t3.micro' | 'db.t3.small' etc.
  storage_gb            INTEGER     NOT NULL DEFAULT 20,
  status                TEXT        NOT NULL DEFAULT 'pending',
    -- pending | creating | available | modifying | deleting | deleted | failed
  endpoint              TEXT,       -- RDS endpoint
  port                  INTEGER     DEFAULT 5432,
  database_name         TEXT        NOT NULL DEFAULT 'app',
  username              TEXT        NOT NULL DEFAULT 'appuser',
  password_vault_id     UUID,       -- vault secret ID — RULE N1
  rds_instance_id       TEXT,       -- Provider resource ID for teardown
  aws_region            TEXT,
  multi_az              BOOLEAN     DEFAULT FALSE,    -- HA: only for Production
  estimated_monthly_cost DECIMAL(10,2),
  backup_retention_days INTEGER     DEFAULT 7,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE managed_databases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managed_db_org_access" ON managed_databases
  FOR ALL USING (org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_managed_db_project ON managed_databases(project_id);
CREATE INDEX IF NOT EXISTS idx_managed_db_org ON managed_databases(org_id);
