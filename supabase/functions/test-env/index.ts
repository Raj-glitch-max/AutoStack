// Simple test to check if environment variables are accessible

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  try {
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const region = Deno.env.get('AWS_REGION')

    const result = {
      success: true,
      message: 'Environment variables check',
      env: {
        AWS_ACCESS_KEY_ID: accessKeyId ? {
          exists: true,
          length: accessKeyId.length,
          prefix: accessKeyId.substring(0, 4),
          startsWithAKIA: accessKeyId.startsWith('AKIA')
        } : { exists: false },
        AWS_SECRET_ACCESS_KEY: secretAccessKey ? {
          exists: true,
          length: secretAccessKey.length,
          isCorrectLength: secretAccessKey.length === 40
        } : { exists: false },
        AWS_REGION: region || 'not set'
      }
    }

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
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
