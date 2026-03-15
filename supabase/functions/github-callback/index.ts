import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const url = new URL(req.url)
    const installation_id = url.searchParams.get('installation_id')
    const state = url.searchParams.get('state') // Contains org_id:nonce

    if (!installation_id || !state) {
      return new Response(JSON.stringify({ error: 'Missing installation_id or state' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Extract orgId from state (simplified for this audit)
    let orgId: string;
    try {
      orgId = atob(state).split(':')[0];
    } catch {
      orgId = state.split(':')[0]; // Fallback if not base64
    }

    if (!orgId) throw new Error('Invalid state: org_id missing')

    // Verify org exists
    const { data: org } = await supabaseAdmin.from('organizations').select('id').eq('id', orgId).single()
    if (!org) throw new Error('Organization not found')

    const { error: intErr } = await supabaseAdmin.from('integrations').upsert({
      org_id: orgId,
      name: 'github',
      status: 'connected',
      config: {
        installation_id,
        connected_at: new Date().toISOString()
      }
    }, { onConflict: 'org_id,name' })

    if (intErr) throw intErr

    return Response.redirect(`${Deno.env.get('APP_URL')}/dashboard?tab=settings&github=success`, 303)

  } catch (err: any) {
    console.error(`[GitHub Callback] Error:`, err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
