// ⚠️ COST GUARDRAIL — READ BEFORE MODIFYING
// Service: Supabase
// Free tier limit: 500MB DB, 50K MAU, 2GB bandwidth, 200 concurrent realtime connections
// RULE: All realtime subscriptions must unsubscribe on unmount
// RULE: eventsPerSecond capped at 10 to limit realtime traffic

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials missing — running in demo mode');
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder',
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
        },
        realtime: {
            params: { eventsPerSecond: 10 },
        },
    }
);
