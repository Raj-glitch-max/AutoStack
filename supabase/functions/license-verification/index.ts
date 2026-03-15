import { CORS_HEADERS } from '../_shared/cors.ts'
/**
 * license-verification/index.ts
 *
 * Validates AutoStack Enterprise on-premise license keys (RSA-signed JWTs).
 * Runs completely locally without calling autostack.io (RULE O2).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as base64url from 'https://deno.land/std@0.224.0/encoding/base64url.ts'

// AutoStack Public Key bundled with the container image
// Used to verify the signature of the offline license key
const AUTOSTACK_PUBLIC_KEY = Deno.env.get('AUTOSTACK_PUBLIC_KEY') || '';

interface LicenseInfo {
  org_id: string;
  org_name: string;
  plan: 'enterprise';
  max_users: number;
  max_environments: number;
  features: string[];
  issued_at: number;
  expires_at: number;
  version: string;
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


  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { license_key } = await req.json()

    if (!license_key) {
      return new Response(JSON.stringify({ error: 'license_key is required' }), { status: 400 })
    }

    if (!AUTOSTACK_PUBLIC_KEY) {
      // For development/testing if no public key is bundled
      return new Response(JSON.stringify({ error: 'Server misconfigured: missing AUTOSTACK_PUBLIC_KEY' }), { status: 500 })
    }

    const payload = await verifyLicenseSignature(license_key, AUTOSTACK_PUBLIC_KEY)
    
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Invalid license signature' }), { status: 401 })
    }

    const now = Math.floor(Date.now() / 1000)
    
    if (payload.expires_at < now) {
      // License expired
      const daysExpired = Math.floor((now - payload.expires_at) / 86400)
      
      if (daysExpired > 30) {
        return new Response(JSON.stringify({ 
          error: 'License expired over 30 days ago. System degraded to read-only mode.',
          status: 'expired_grace_period_ended',
          license: payload
        }), { status: 402 })
      } else {
        return new Response(JSON.stringify({ 
          warning: `License expired ${daysExpired} days ago. Please renew to avoid service disruption.`,
          status: 'expired_grace_period',
          license: payload
        }), { status: 200 })
      }
    }

    // License is valid
    return new Response(JSON.stringify({
      valid: true,
      status: 'active',
      license: payload
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('[license-verification] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// Web Crypto API RSA-JWT Signature Verification
async function verifyLicenseSignature(jwt: string, pemPublicKey: string): Promise<LicenseInfo | null> {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null

  const headerRaw = new TextDecoder().decode(base64url.decodeBase64Url(parts[0]))
  const payloadRaw = new TextDecoder().decode(base64url.decodeBase64Url(parts[1]))
  
  try {
    const header = JSON.parse(headerRaw)
    if (header.alg !== 'RS256') return null

    const payload = JSON.parse(payloadRaw) as LicenseInfo
    
    // Format PEM public key into CryptoKey
    const pemHeader = '-----BEGIN PUBLIC KEY-----'
    const pemFooter = '-----END PUBLIC KEY-----'
    const pemContents = pemPublicKey.substring(pemHeader.length, pemPublicKey.length - pemFooter.length - 1).replace(/\s/g, '')
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

    const key = await crypto.subtle.importKey(
      'spki',
      binaryDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const encoder = new TextEncoder()
    const signatureInput = `${parts[0]}.${parts[1]}`
    const signatureBytes = base64url.decodeBase64Url(parts[2])

    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signatureBytes,
      encoder.encode(signatureInput)
    )

    return isValid ? payload : null
  } catch (e) {
    console.error('[license-verification] Crypto Error:', e)
    return null
  }
}
