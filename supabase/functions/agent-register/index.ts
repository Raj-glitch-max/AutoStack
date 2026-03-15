import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jwt from 'https://deno.land/x/djwt@v2.9.1/mod.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    
    // 1. Validation
    const validationError = validateOrRespond(body, {
        agent_token: { type: 'string', required: true },
        cluster_id: { type: 'uuid', required: true },
        version: { type: 'string', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { agent_token, cluster_id, version } = body

    // 2. Verify token exists and is pending
    const { data: cluster, error: err } = await supabase
      .from('clusters')
      .select('id, org_id, agent_token, agent_status')
      .eq('id', cluster_id)
      .eq('agent_token', agent_token)
      .eq('agent_status', 'pending')
      .single()

    if (err || !cluster) {
      return new Response(JSON.stringify({ error: 'Invalid or already used token' }), { 
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 3. Mark token as used (Audit c2)
    const { error: updateErr } = await supabase
      .from('clusters')
      .update({
        agent_status: 'active',
        agent_version: version,
        agent_token: 'USED_' + Date.now() // invalidate the one-time token
      })
      .eq('id', cluster_id)

    if (updateErr) throw updateErr

    // 4. Generate JWT for the agent
    const jwtSecret = Deno.env.get('JWT_SECRET')
    if (!jwtSecret) throw new Error('JWT_SECRET not configured')

    const keyData = new TextEncoder().encode(jwtSecret)
    const key = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )

    const exp = Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    const token = await jwt.create({ alg: 'HS256', typ: 'JWT' }, {
      sub: cluster_id,
      role: 'agent',
      org_id: cluster.org_id,
      cluster_id: cluster_id,
      exp
    }, key)

    return new Response(JSON.stringify({
      success: true,
      jwt: token,
      expires_at: new Date(exp * 1000).toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error(`[AgentRegister] Error:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
