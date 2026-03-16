-- CC7.1 Data Retention Policy
-- Enable pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cleanup function for audit logs older than 1 year (SOC2 requirement)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '365 days';
    DELETE FROM pod_logs WHERE logged_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Schedule the cleanup job to run every Sunday at 3 AM
SELECT cron.schedule('audit-cleanup', '0 3 * * 0', 'SELECT cleanup_old_audit_logs()');
