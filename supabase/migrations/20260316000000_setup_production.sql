-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. auth.org_id() function
DO $$
BEGIN
    CREATE OR REPLACE FUNCTION public.get_auth_org_id()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $func$
      SELECT coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'org_id',
        current_setting('request.jwt.claim.org_id', true)
      )::uuid
    $func$;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create function in public schema';
END
$$;

-- 3. Enable RLS and create base policy for all tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
        
        -- Check if org_id column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tablename AND column_name = 'org_id') THEN
            EXECUTE format('DROP POLICY IF EXISTS "org_isolation" ON public.%I', r.tablename);
            EXECUTE format('CREATE POLICY "org_isolation" ON public.%I USING (org_id = public.get_auth_org_id())', r.tablename);
        END IF;
    END LOOP;
END
$$;

-- 4. Register pg_cron jobs
SELECT cron.schedule('coie-cycle', '*/5 * * * *', 
  format('SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)', 
    'https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/coie-cycle', 
    '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k", "Content-Type": "application/json"}', 
    '{}'
  )
);

SELECT cron.schedule('cost-anomaly-check', '0 * * * *', 
  format('SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)', 
    'https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/cost-anomaly-check', 
    '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycm1ydWt3bXJqa2R4Y3l6b3ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4MTk2MiwiZXhwIjoyMDg4OTU3OTYyfQ.oEnIj-ASGRJGVxcB265PTwTdR5n1q8cO3QVGB6vYu_k", "Content-Type": "application/json"}', 
    '{}'
  )
);
