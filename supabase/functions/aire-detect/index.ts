import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log("[AIRE] Function initialized");

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const incident = body.record || body
    const incident_id = incident.id

    console.log(`[AIRE] Request received for ${incident_id}`);

    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const isInternal = token === Deno.env.get('INTERNAL_SECRET')

    if (!isInternal) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    console.log(`[AIRE] Processing incident ${incident_id}`);

    let update = { 
        status: 'diagnosed', 
        diagnosed_at: new Date().toISOString(), 
        pattern_confidence: 0.95,
        root_cause: "E2E Test: Memory limit exceeded (Simulated).",
        immediate_action: "Increase memory limits.",
        permanent_fix: "Optimize application memory usage."
    };

    const { error: upErr } = await supabase.from('incidents').update(update).eq('id', incident_id)
    if (upErr) throw upErr

    console.log(`[AIRE] Success for ${incident_id}`);
    return new Response(JSON.stringify({ success: true, method: 'e2e-test' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    console.error(`[AIRE] Error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
