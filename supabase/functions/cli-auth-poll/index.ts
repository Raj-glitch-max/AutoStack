import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { createRedisClient } from '../_shared/redis.ts'
import { validateOrRespond } from '../_shared/validator.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const body = await req.json()
    const validationError = validateOrRespond(body, {
        device_code: { type: 'string', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { device_code } = body
    const redis = createRedisClient()
    const storeStr = await redis.get(`cli_auth:${device_code}`)
    
    if (!storeStr) {
      return new Response(JSON.stringify({ error: 'expired_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const store = typeof storeStr === 'string' ? JSON.parse(storeStr) : storeStr
    
    if (store.status === 'pending') {
      return new Response(JSON.stringify({ error: 'authorization_pending' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (store.status === 'authorized') {
      // Return tokens and delete from redis to prevent reuse
      await redis.del(`cli_auth:${device_code}`)

      return new Response(
        JSON.stringify({
          status: 'authorized',
          access_token: store.access_token,
          refresh_token: store.refresh_token
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error(`[cli-auth-poll] Error: ${error.message}`)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
