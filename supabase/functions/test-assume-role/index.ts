import { STSClient, AssumeRoleCommand } from 'https://esm.sh/@aws-sdk/client-sts@3.490.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const startTime = Date.now()
  
  try {
    console.log('[1] Starting assume role test...')
    
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')!
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')!
    
    console.log('[2] Creating STS client...')
    const stsClient = new STSClient({
      region: 'us-east-1',
      credentials: { accessKeyId, secretAccessKey }
    })
    
    console.log('[3] Sending AssumeRole command...')
    const roleArn = 'arn:aws:iam::367749063363:role/AutoStackDeploymentRole'
    
    const result = await stsClient.send(new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `test-${Date.now()}`,
      ExternalId: 'autostack',
      DurationSeconds: 3600,
    }))
    
    const elapsed = Date.now() - startTime
    console.log(`[4] Success! Took ${elapsed}ms`)
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Successfully assumed role',
      elapsed_ms: elapsed,
      accessKeyId: result.Credentials?.AccessKeyId?.substring(0, 20) + '...',
      expiration: result.Credentials?.Expiration
    }, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    console.error(`[ERROR] Failed after ${elapsed}ms:`, error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      code: error.Code || error.name,
      elapsed_ms: elapsed
    }, null, 2), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
