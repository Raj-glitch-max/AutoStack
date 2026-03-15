import { CORS_HEADERS } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

async function verifyToken(userId: string, prefType: string, token: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(SUPABASE_SERVICE_ROLE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const signature = new Uint8Array(token.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  return await crypto.subtle.verify('HMAC', key, signature, encoder.encode(`${userId}:${prefType}`))
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Hub-Signature-256, x-client-info, apikey",
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // CORS OPTIONS handler (Audit a1)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const type = url.searchParams.get('type') // e.g., event_incident
  const userId = url.searchParams.get('id') // Added id to query to know who it is

  if (!token || !type || !userId) {
    return new Response('Invalid unsubscribe link.', { status: 400 })
  }

  try {
    // 1. Verify Token
    const valid = await verifyToken(userId, type, token)
    if (!valid) throw new Error("Invalid signature")

    // 2. Update Prefs
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const { error } = await supabase
      .from('notification_prefs')
      .update({ [type]: false })
      .eq('user_id', userId)

    if (error) throw error

    // 3. Return HTML Page
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed | AutoStack</title>
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
            .card { background: white; padding: 2rem; border-radius: 0.75rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 400px; text-align: center; }
            h1 { font-size: 1.5rem; margin-bottom: 1rem; }
            p { color: #4b5563; line-height: 1.5; }
            .btn { display: inline-block; margin-top: 1.5rem; padding: 0.5rem 1rem; background: #000; color: white; text-decoration: none; border-radius: 0.375rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Successfully Unsubscribed</h1>
            <p>You will no longer receive "${type.replace(/_/g, ' ')}" notifications. You can re-enable them anytime in your dashboard settings.</p>
            <a href="https://autostack.io/dashboard" class="btn">Return to Dashboard</a>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    })

  } catch (err) {
    console.error("[Unsubscribe] Error:", err.message)
    return new Response('Failed to unsubscribe. Please contact support.', { status: 500 })
  }
})
