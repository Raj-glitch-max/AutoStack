-- Migration to add weekly digest cron job
SELECT cron.schedule('weekly-digest', '0 9 * * 1', -- every Monday at 9:00 AM
  format('SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)', 
    'https://prrmrukwmrjkdxcyzovd.supabase.co/functions/v1/weekly-digest', 
    '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}', 
    '{}'
  )
);
