-- Migration 001: Add Helper Functions for RLS Policies
-- Critical for all Row Level Security policies to function correctly

-- ═══════════════════════════════════════════════════════════════════
-- auth.org_id() - Extract org_id from JWT user_metadata
-- ═══════════════════════════════════════════════════════════════════
-- This function is referenced in EVERY RLS policy across the system
-- Without it, all RLS policies evaluate to FALSE and users see no data

CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'org_id')::UUID,
    NULL
  );
$$;

COMMENT ON FUNCTION auth.org_id() IS 'Extracts org_id from JWT user_metadata. Used by all RLS policies. CRITICAL: Do not modify without testing all RLS policies.';

-- ═══════════════════════════════════════════════════════════════════
-- auth.user_role() - Extract role from JWT user_metadata
-- ═══════════════════════════════════════════════════════════════════
-- Used by RLS policies that need role-based access control

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    'viewer'
  );
$$;

COMMENT ON FUNCTION auth.user_role() IS 'Extracts role from JWT user_metadata. Defaults to viewer if not set.';

-- ═══════════════════════════════════════════════════════════════════
-- Verify functions work correctly
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Test that functions exist and return correct types
  PERFORM auth.org_id();
  PERFORM auth.user_role();
  
  RAISE NOTICE 'Helper functions created successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create helper functions: %', SQLERRM;
END $$;
