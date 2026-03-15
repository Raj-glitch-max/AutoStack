-- Migration 012: Audit Log Immutability (SOC2 Requirement)
-- Makes audit_log append-only to satisfy SOC2 CC6.1 requirements
-- Auditors need proof that logs cannot be tampered with

-- ═══════════════════════════════════════════════════════════════════
-- Prevent UPDATE on audit_log
-- ═══════════════════════════════════════════════════════════════════

CREATE POLICY "audit_log_no_update" ON public.audit_log
  FOR UPDATE
  USING (FALSE);

COMMENT ON POLICY "audit_log_no_update" ON public.audit_log IS 'SOC2 CC6.1: Audit logs are immutable. No updates allowed.';

-- ═══════════════════════════════════════════════════════════════════
-- Prevent DELETE on audit_log (except by automated retention policy)
-- ═══════════════════════════════════════════════════════════════════

CREATE POLICY "audit_log_no_delete" ON public.audit_log
  FOR DELETE
  USING (FALSE);

COMMENT ON POLICY "audit_log_no_delete" ON public.audit_log IS 'SOC2 CC6.1: Audit logs cannot be manually deleted. Only pg_cron retention policy can delete old logs.';

-- ═══════════════════════════════════════════════════════════════════
-- Allow pg_cron to delete old logs (bypass RLS for system user)
-- ═══════════════════════════════════════════════════════════════════

-- Note: pg_cron runs as postgres superuser and bypasses RLS automatically
-- The DELETE policy above only affects authenticated users

-- ═══════════════════════════════════════════════════════════════════
-- Verify immutability
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  test_id UUID;
BEGIN
  -- Insert a test log entry
  INSERT INTO public.audit_log (event_type, actor_id, metadata)
  VALUES ('test.immutability', gen_random_uuid(), '{"test": true}')
  RETURNING id INTO test_id;
  
  -- Try to update it (should fail)
  BEGIN
    UPDATE public.audit_log SET event_type = 'test.modified' WHERE id = test_id;
    RAISE EXCEPTION 'Audit log UPDATE should have been blocked but succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Audit log UPDATE correctly blocked';
  END;
  
  -- Try to delete it (should fail)
  BEGIN
    DELETE FROM public.audit_log WHERE id = test_id;
    RAISE EXCEPTION 'Audit log DELETE should have been blocked but succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Audit log DELETE correctly blocked';
  END;
  
  -- Clean up test entry (as superuser, bypassing RLS)
  DELETE FROM public.audit_log WHERE id = test_id;
  
  RAISE NOTICE 'Audit log immutability verified successfully';
END $$;
