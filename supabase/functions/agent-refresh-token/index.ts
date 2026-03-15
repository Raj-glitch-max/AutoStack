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
    const oldToken = authHeader?.replace('Bearer ', '')
    if (!oldToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const body = await req.json()
    
    // 1. Validation
    const validationError = validateOrRespond(body, {
        cluster_id: { type: 'uuid', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { cluster_id } = body

    // 2. Verify old JWT
    const jwtSecret = Deno.env.get('JWT_SECRET')
    if (!jwtSecret) throw new Error('JWT_SECRET not configured')

    const keyData = new TextEncoder().encode(jwtSecret)
    const key = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
    )

    const payload = await jwt.verify(oldToken, key) as any
    if (payload.cluster_id !== cluster_id || payload.role !== 'agent') {
        return new Response(JSON.stringify({ error: 'Forbidden: Invalid cluster context' }), { 
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    // 3. Issue new JWT
    const exp = Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    const token = await jwt.create({ alg: 'HS256', typ: 'JWT' }, {
      sub: cluster_id,
      role: 'agent',
      org_id: payload.org_id,
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
  } catch (err: any) {
    console.error(`[RefreshToken] Error:`, err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
