import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { createRedisClient } from '../_shared/redis.ts'
import { validateOrRespond } from '../_shared/validator.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const body = await req.json()
    const validationError = validateOrRespond(body, {
        user_code: { type: 'string', required: true },
        access_token: { type: 'string', required: true },
        refresh_token: { type: 'string', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { user_code, access_token, refresh_token } = body
    const redis = createRedisClient()
    
    // Look up the device_code by user_code
    const lookupStr = await redis.get(`cli_auth_lookup:${user_code}`)
    if (!lookupStr) {
      return new Response(JSON.stringify({ error: 'Invalid or expired user code' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const lookup = typeof lookupStr === 'string' ? JSON.parse(lookupStr) : lookupStr
    const deviceCode = lookup.device_code

    // Verify the device code is still pending
    const deviceStr = await redis.get(`cli_auth:${deviceCode}`)
    if (!deviceStr) {
      return new Response(JSON.stringify({ error: 'Device code expired' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const device = typeof deviceStr === 'string' ? JSON.parse(deviceStr) : deviceStr
    if (device.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Already authorized' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mark as authorized and store tokens (TTL remains the rest of the 15 mins, but let's just reset to 5 mins for pick-up)
    const pickupTTL = 300 

    await redis.set(`cli_auth:${deviceCode}`, JSON.stringify({
      status: 'authorized',
      access_token,
      refresh_token
    }), pickupTTL)
    
    await redis.del(`cli_auth_lookup:${user_code}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error(`[cli-auth-approve] Error: ${error.message}`)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
