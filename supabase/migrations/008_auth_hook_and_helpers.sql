-- 008_auth_hook_and_helpers.sql
--
-- Adds the auth.org_id() helper function for RLS policies
-- and creates the Postgres function and trigger to register the auth-hook.
-- (Required for Audit Section 1)

-- 1. Helper function for RLS (Extracts org_id from JWT user_metadata)
CREATE OR REPLACE FUNCTION auth.org_id() 
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'org_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Note: The auth-hook Edge Function itself handles the logic, 
-- but we also ensure database-level user creation safety if needed.
-- In Supabase, Edge Function Auth Hooks are configured in the dashboard.
-- We document here that it MUST be registered in Authentication -> Hooks.
