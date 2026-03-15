/**
 * github.ts - GitHub App Authentication & CSRF Helpers
 *
 * Handles:
 * - App-level JWT generation (RS256, 9-minute expiry)
 * - Installation token exchange with Redis caching (50-minute TTL)
 * - CSRF state generation/validation for the OAuth install flow
 *
 * RULE G1: App JWT generated fresh every call (~2ms), never cached.
 * RULE G2: Installation tokens cached 50 min (10-min safety margin on 60-min expiry).
 */

import { RedisClient } from './redis.ts'

const GITHUB_APP_ID = Deno.env.get('GITHUB_APP_ID');
const GITHUB_PRIVATE_KEY = Deno.env.get('GITHUB_APP_PRIVATE_KEY');

const GITHUB_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'AutoStack-Platform/1.0',
};

// ---------------------------------------------------------------------------
// Installation Token (cached in Redis)
// ---------------------------------------------------------------------------

/**
 * Returns a valid installation token for a given GitHub App installation.
 * Checks Redis cache first; fetches from GitHub API if expired.
 *
 * @param installationId - GitHub installation ID from the integrations table
 * @param redis - RedisClient instance
 */
export async function getInstallationToken(
  installationId: string,
  redis: RedisClient
): Promise<string> {
  const cacheKey = `github:install:token:${installationId}`;

  // RULE A3: Check cache before hitting paid API
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const jwt = await generateAppJWT();

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        ...GITHUB_HEADERS,
        'Authorization': `Bearer ${jwt}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`GitHub token exchange failed (${response.status}): ${err.message}`);
  }

  const { token } = await response.json();

  // Cache for 50 minutes (RULE G2: 10-min safety margin, RULE B5: always set TTL)
  await redis.set(cacheKey, token, 3000);

  return token;
}

// ---------------------------------------------------------------------------
// App JWT (generated fresh every call — RULE G1)
// ---------------------------------------------------------------------------

export async function generateAppJWT(): Promise<string> {
  if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) {
    throw new Error('Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY');
  }

  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,  // 60s in the past for clock skew tolerance
    exp: now + 540, // 9 minutes (GitHub max is 10)
    iss: GITHUB_APP_ID,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const message = `${encode(header)}.${encode(payload)}`;

  const keyData = pemToArrayBuffer(GITHUB_PRIVATE_KEY);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(message)
  );

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${message}.${sigBase64}`;
}

// ---------------------------------------------------------------------------
// CSRF State for OAuth Install Flow
// ---------------------------------------------------------------------------

/**
 * Generates a CSRF state token for the GitHub App install redirect.
 * Stored in Redis with a 10-minute TTL (one-time use).
 */
export async function generateInstallState(
  redis: RedisClient,
  orgId: string
): Promise<string> {
  const state = btoa(`${orgId}:${Date.now()}:${crypto.randomUUID()}`);
  await redis.set(`github:oauth:state:${orgId}`, state, 600);
  return state;
}

/**
 * Validates and consumes a CSRF state token.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @returns true if the state is valid, false otherwise
 */
export async function validateInstallState(
  redis: RedisClient,
  orgId: string,
  receivedState: string
): Promise<boolean> {
  const key = `github:oauth:state:${orgId}`;
  const stored = await redis.get(key);

  if (!stored) return false; // Expired or never set

  // Consume immediately — one-time use
  await redis.del(key);

  // Constant-time comparison — prevent timing attacks
  if (stored.length !== receivedState.length) return false;

  let mismatch = 0;
  for (let i = 0; i < stored.length; i++) {
    mismatch |= stored.charCodeAt(i) ^ receivedState.charCodeAt(i);
  }

  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const isPkcs1 = pem.includes('BEGIN RSA PRIVATE KEY');

  const base64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryString = atob(base64);
  const pkcs1Bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pkcs1Bytes[i] = binaryString.charCodeAt(i);
  }

  if (!isPkcs1) {
    return pkcs1Bytes.buffer; // Already PKCS#8
  }

  // Wrap PKCS#1 in standard PKCS#8 ASN.1 envelope:
  // SEQUENCE {
  //   INTEGER 0 (version)
  //   SEQUENCE { OID rsaEncryption, NULL }
  //   OCTET STRING { <pkcs1 bytes> }
  // }
  const pkcs8Header = new Uint8Array([
    0x30, 0x82, 0x00, 0x00, // SEQUENCE (length placeholder)
    0x02, 0x01, 0x00,       // INTEGER 0
    0x30, 0x0d,             // SEQUENCE
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID 1.2.840.113549.1.1.1
    0x05, 0x00,             // NULL
    0x04, 0x82, 0x00, 0x00  // OCTET STRING (length placeholder)
  ]);

  const totalLen = pkcs8Header.length + pkcs1Bytes.length;
  const result = new Uint8Array(totalLen);
  result.set(pkcs8Header);
  result.set(pkcs1Bytes, pkcs8Header.length);

  // Patch SEQUENCE length (total - 4 for the tag + length bytes)
  const seqLen = totalLen - 4;
  result[2] = (seqLen >> 8) & 0xff;
  result[3] = seqLen & 0xff;

  // Patch OCTET STRING length (pkcs1 bytes length)
  const octetOffset = pkcs8Header.length - 2;
  result[octetOffset] = (pkcs1Bytes.length >> 8) & 0xff;
  result[octetOffset + 1] = pkcs1Bytes.length & 0xff;

  return result.buffer;
}
