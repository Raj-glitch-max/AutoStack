// Test AWS SDK v2 (smaller bundle)
import AWS from 'https://esm.sh/aws-sdk@2.1450.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  try {
    console.log('[1] Testing AWS SDK v2...')
    
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')!
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')!
    
    AWS.config.update({
      accessKeyId,
      secretAccessKey,
      region: 'us-east-1'
    })
    
    console.log('[2] Creating STS client...')
    const sts = new AWS.STS()
    
    console.log('[3] Assuming role...')
    const result = await sts.assumeRole({
      RoleArn: 'arn:aws:iam::367749063363:role/AutoStackDeploymentRole',
      RoleSessionName: `test-${Date.now()}`,
      ExternalId: 'autostack',
      DurationSeconds: 3600
    }).promise()
    
    console.log('[4] Success!')
    
    return new Response(JSON.stringify({
      success: true,
      message: 'AWS SDK v2 works!',
      accessKeyId: result.Credentials?.AccessKeyId?.substring(0, 20) + '...'
    }, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    console.error('[ERROR]:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      code: error.code
    }, null, 2), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
