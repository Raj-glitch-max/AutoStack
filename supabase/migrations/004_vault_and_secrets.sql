-- 004_vault_and_secrets.sql
--
-- Enable Vault extension and create env vars table.
-- Secret values are stored in vault.secrets; non-secrets in the table directly.
-- Frontend never accesses the decrypted view — only service role key can.

-- Env vars: split storage (non-secret in table, secret in vault)
CREATE TABLE IF NOT EXISTS project_env_vars (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         TEXT        NOT NULL,
  value       TEXT,           -- plaintext value (for non-secret vars)
  vault_id    UUID,           -- vault secret ID (for secret vars, value is NULL)
  is_secret   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT env_unique_key UNIQUE (project_id, key)
);

ALTER TABLE project_env_vars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_vars_org" ON project_env_vars
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE org_id = (auth.jwt()->'user_metadata'->>'org_id')::uuid
    )
  );

CREATE INDEX IF NOT EXISTS idx_env_vars_project ON project_env_vars(project_id);

-- Decrypted view: service role only. Frontend never queries this.
CREATE OR REPLACE VIEW project_env_vars_decrypted AS
SELECT
  ev.id, ev.project_id, ev.key, ev.is_secret,
  CASE
    WHEN ev.is_secret AND ev.vault_id IS NOT NULL
    THEN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ev.vault_id)
    ELSE ev.value
  END as value
FROM project_env_vars ev;

-- Helper function: creates a vault secret and returns its ID
CREATE OR REPLACE FUNCTION vault_create_secret(new_secret TEXT, new_name TEXT)
RETURNS UUID AS $$
DECLARE
  secret_id UUID;
BEGIN
  INSERT INTO vault.secrets (secret, name)
  VALUES (new_secret, new_name)
  RETURNING id INTO secret_id;
  RETURN secret_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: deletes a vault secret by ID
CREATE OR REPLACE FUNCTION vault_delete_secret(secret_id UUID)
RETURNS VOID AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = secret_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
