// Test direct AWS API calls without SDK
import { signRequest } from '../_shared/aws-sig-v4.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  try {
    console.log('[1] Testing direct AWS API calls...')
    
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')!
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')!
    const region = 'us-east-1'
    
    // Build AssumeRole request
    const params = new URLSearchParams({
      'Action': 'AssumeRole',
      'RoleArn': 'arn:aws:iam::367749063363:role/AutoStackDeploymentRole',
      'RoleSessionName': `test-${Date.now()}`,
      'ExternalId': 'autostack',
      'DurationSeconds': '3600',
      'Version': '2011-06-15'
    })
    
    const payload = params.toString()
    
    console.log('[2] Signing request...')
    const signed = await signRequest({
      method: 'POST',
      service: 'sts',
      region,
      endpoint: `sts.${region}.amazonaws.com`,
      path: '/',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
      },
      payload,
      accessKeyId,
      secretAccessKey
    })
    
    console.log('[3] Making request to AWS STS...')
    const response = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: payload
    })
    
    const text = await response.text()
    console.log('[4] Response status:', response.status)
    
    if (!response.ok) {
      return new Response(JSON.stringify({
        success: false,
        status: response.status,
        error: 'AWS API call failed',
        response: text
      }, null, 2), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }
    
    // Parse XML response
    const accessKeyMatch = text.match(/<AccessKeyId>([^<]+)<\/AccessKeyId>/)
    const secretKeyMatch = text.match(/<SecretAccessKey>([^<]+)<\/SecretAccessKey>/)
    const sessionTokenMatch = text.match(/<SessionToken>([^<]+)<\/SessionToken>/)
    
    if (!accessKeyMatch || !secretKeyMatch || !sessionTokenMatch) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to parse credentials from response',
        response: text.substring(0, 500)
      }, null, 2), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('[5] Success! Got temporary credentials')
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Direct AWS API calls work!',
      credentials: {
        accessKeyId: accessKeyMatch[1].substring(0, 20) + '...',
        secretAccessKey: '***',
        sessionToken: sessionTokenMatch[1].substring(0, 50) + '...'
      }
    }, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    console.error('[ERROR]:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
