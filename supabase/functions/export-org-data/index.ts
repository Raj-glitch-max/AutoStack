import { CORS_HEADERS } from '../_shared/cors.ts'
/**
 * export-org-data/index.ts
 *
 * SaaS to On-Prem Migration Tool (Enterprise Only).
 * Exports an organization's critical state into an AES-256-GCM encrypted payload
 * using a customer-provided encryption key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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


  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { encryption_key } = await req.json()

    if (!encryption_key || encryption_key.length < 32) {
      return new Response(JSON.stringify({ error: '32+ character encryption_key is required' }), { status: 400 })
    }

    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    const orgId = user?.user_metadata?.org_id
    if (!orgId) return new Response('Unauthorized', { status: 401 })

    // Verify Enterprise plan
    const { data: org } = await supabase.from('organizations').select('plan').eq('id', orgId).single()
    if (org?.plan !== 'enterprise') {
      return new Response(JSON.stringify({ error: 'Export requires Enterprise plan' }), { status: 403 })
    }

    // Export Core Data
    const payloads: Record<string, any> = { metadata: { version: '1.0', org_id: orgId } }
    
    // Organizations & Members
    const orgRes = await supabase.from('organizations').select('*').eq('id', orgId)
    const membersRes = await supabase.from('org_members').select('*').eq('org_id', orgId)
    
    // Clusters
    const clustersRes = await supabase.from('clusters').select('*').eq('org_id', orgId)
    
    // Projects, Deployments, and Creds
    const projectsRes = await supabase.from('projects').select('*').eq('org_id', orgId)
    const projectIds = projectsRes.data?.map((p: any) => p.id) || []
    let deploymentsData = []
    
    if (projectIds.length > 0) {
      const depRes = await supabase.from('deployments').select('*').in('project_id', projectIds)
      deploymentsData = depRes.data || []
    }

    const credsRes = await supabase.from('cloud_credentials').select('*').eq('org_id', orgId)

    payloads['organizations'] = orgRes.data || []
    payloads['org_members'] = membersRes.data || []
    payloads['clusters'] = clustersRes.data || []
    payloads['projects'] = projectsRes.data || []
    payloads['deployments'] = deploymentsData
    payloads['cloud_credentials'] = credsRes.data || [] // Already encrypted by Vault in Postgres, safe to export

    // Encrypt payload with AES-GCM
    const plaintext = JSON.stringify(payloads)
    
    const encoder = new TextEncoder()
    const rawKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(encryption_key.substring(0, 32)), // Ensure exactly 256-bit key
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    )

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      rawKey,
      encoder.encode(plaintext)
    )

    // Format output as base64
    const ivBase64 = btoa(String.fromCharCode(...iv))
    const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))

    return new Response(JSON.stringify({
      data: cipherBase64,
      iv: ivBase64,
      encrypted_with: 'customer-provided-key',
      instructions: 'Use docker run autostack/migrate --import [file] --key [encryption_key] to import.'
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('[export-org-data] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
