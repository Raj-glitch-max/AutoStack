-- AutoStack Auth Hook Automation
-- This script creates a trigger on auth.users to automatically call the auth-hook Edge Function.

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user_hook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  edge_url text;
  anon_key text;
BEGIN
  -- We use the SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment
  -- In a real DB, we might store these in a config table or vault.
  -- For this project, we'll hardcode the URL based on project_ref (prrmrukwmrjkdxcyzovd)
  edge_url := 'https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/auth-hook';
  
  -- We include the service role key to authenticate the hook call
  -- Note: In production, use a more secure way to store the key.
  
  payload := jsonb_build_object(
    'user', jsonb_build_object(
      'id', NEW.id,
      'email', NEW.email,
      'user_metadata', NEW.raw_user_meta_data,
      'app_metadata', NEW.raw_app_meta_data
    )
  );

  PERFORM
    net.http_post(
      url := edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := payload
    );

  RETURN NEW;
END;
$$;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_hook();
