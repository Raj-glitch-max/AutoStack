import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { createRedisClient } from '../_shared/redis.ts'

const generateRandomString = (length: number, chars: string) => {
  let result = ''
  const cryptoStr = new Uint8Array(length)
  crypto.getRandomValues(cryptoStr)
  for (let i = 0; i < length; i++) {
    result += chars[cryptoStr[i] % chars.length]
  }
  return result
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const redis = createRedisClient()
    
    // Generate device code (40 hex chars)
    const deviceCode = generateRandomString(40, '0123456789abcdef')
    
    // Generate user code (8 chars, A-Z, 0-9)
    const rawUserCode = generateRandomString(8, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    const userCode = `${rawUserCode.slice(0, 4)}-${rawUserCode.slice(4)}` // e.g. ABCD-1234
    
    // Store in Redis with 15 minute TTL
    const TTL = 900
    
    // Using simple SET for each instead of pipeline if not available in shared client
    // Our shared client uses Upstash Redis REST API usually
    await redis.set(`cli_auth:${deviceCode}`, JSON.stringify({ user_code: userCode, status: 'pending' }), TTL)
    await redis.set(`cli_auth_lookup:${userCode}`, JSON.stringify({ device_code: deviceCode }), TTL)

    const appUrl = Deno.env.get('APP_URL') || 'https://autostack.io'

    return new Response(
      JSON.stringify({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${appUrl}/cli-auth`,
        expires_in: TTL,
        interval: 5
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error(`[cli-auth-start] Error: ${error.message}`)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
