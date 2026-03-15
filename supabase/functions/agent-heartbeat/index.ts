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
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const body = await req.json()
    
    // 1. Validation
    const validationError = validateOrRespond(body, {
        cluster_id: { type: 'uuid', required: true },
        version: { type: 'string', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { cluster_id, version } = body

    // 2. Verify JWT
    const jwtSecret = Deno.env.get('JWT_SECRET')
    if (!jwtSecret) throw new Error('JWT_SECRET not configured')

    const keyData = new TextEncoder().encode(jwtSecret)
    const key = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
    )

    const payload = await jwt.verify(token, key) as any
    if (payload.cluster_id !== cluster_id || payload.role !== 'agent') {
        return new Response(JSON.stringify({ error: 'Forbidden: Invalid cluster context' }), { 
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    // 3. Update heartbeat (Audit c4)
    const { error } = await supabase
      .from('clusters')
      .update({
        agent_status: 'active',
        last_heartbeat_at: new Date().toISOString(),
        agent_version: version
      })
      .eq('id', cluster_id)

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error(`[Heartbeat] Error:`, err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
