// AWS Signature Version 4 signing for direct API calls
// No SDK needed - pure HTTPS requests

export async function sha256(message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  return await crypto.subtle.digest('SHA-256', data)
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

export async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode('AWS4' + key), dateStamp)
  const kRegion = await hmac(kDate, regionName)
  const kService = await hmac(kRegion, serviceName)
  const kSigning = await hmac(kService, 'aws4_request')
  return kSigning
}

export interface SignedRequest {
  url: string
  headers: Record<string, string>
  body?: string
}

export async function signRequest(params: {
  method: string
  service: string
  region: string
  endpoint: string
  path: string
  querystring?: string
  headers?: Record<string, string>
  payload?: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}): Promise<SignedRequest> {
  const {
    method,
    service,
    region,
    endpoint,
    path,
    querystring = '',
    headers = {},
    payload = '',
    accessKeyId,
    secretAccessKey,
    sessionToken
  } = params

  // Create timestamp
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.substring(0, 8)

  // Canonical request
  const payloadHash = toHex(await sha256(payload))
  
  const canonicalHeaders = {
    'host': endpoint,
    'x-amz-date': amzDate,
    ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
    ...headers
  }

  const signedHeaders = Object.keys(canonicalHeaders).sort().join(';')
  const canonicalHeadersStr = Object.keys(canonicalHeaders)
    .sort()
    .map(key => `${key}:${canonicalHeaders[key]}\n`)
    .join('')

  const canonicalRequest = [
    method,
    path,
    querystring,
    canonicalHeadersStr,
    signedHeaders,
    payloadHash
  ].join('\n')

  // String to sign
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest))
  ].join('\n')

  // Calculate signature
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service)
  const signature = toHex(await hmac(signingKey, stringToSign))

  // Authorization header
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    url: `https://${endpoint}${path}${querystring ? '?' + querystring : ''}`,
    headers: {
      ...canonicalHeaders,
      'Authorization': authorizationHeader
    },
    body: payload || undefined
  }
}
