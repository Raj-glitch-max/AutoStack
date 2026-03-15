-- supabase/migrations/009_sso_configurations.sql

CREATE TABLE IF NOT EXISTS public.sso_configurations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  protocol        TEXT        NOT NULL CHECK (protocol IN ('saml', 'oidc')),
  status          TEXT        NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'error')),
  enforced        BOOLEAN     DEFAULT FALSE,
  default_role    TEXT        NOT NULL DEFAULT 'developer' CHECK (default_role IN ('owner', 'admin', 'developer', 'viewer')),
  allowed_domains TEXT[]      DEFAULT '{}'::TEXT[],

  -- SAML-Specific
  idp_entity_id   TEXT,
  idp_sso_url     TEXT,
  idp_certificate TEXT,
  sp_entity_id    TEXT,
  sp_acs_url      TEXT,

  -- OIDC-Specific
  oidc_client_id  TEXT,
  oidc_client_secret_vault_id UUID REFERENCES vault.secrets(id) ON DELETE SET NULL,
  oidc_discovery_url TEXT,
  oidc_scopes     TEXT[]      DEFAULT '{openid, email, profile}'::TEXT[],

  -- Attribute Mapping
  attribute_map   JSONB DEFAULT '{
    "email":       "email",
    "firstName":   "first_name",
    "lastName":    "last_name",
    "groups":      "groups"
  }',

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.sso_configurations
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- RLS
ALTER TABLE public.sso_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sso_config_read_admin" ON public.sso_configurations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = sso_configurations.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

CREATE POLICY "sso_config_update_admin" ON public.sso_configurations
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = sso_configurations.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

CREATE POLICY "sso_config_insert_admin" ON public.sso_configurations
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = sso_configurations.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

CREATE POLICY "sso_config_delete_admin" ON public.sso_configurations
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = sso_configurations.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);
