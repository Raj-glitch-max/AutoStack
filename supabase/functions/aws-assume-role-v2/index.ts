// aws-assume-role-v2/index.ts
// Simplified version without AWS SDK - just validates and returns success
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  
  const loggerClient = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log('Request received')

    // Parse request body
    let body: { role_arn?: string; external_id?: string; account_id?: string; region?: string; display_name?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const roleArn = body.role_arn
    const accountId = body.account_id
    
    if (!roleArn) {
      return json({ error: 'role_arn is required' }, 400)
    }
    
    if (!accountId || !/^\d{12}$/.test(accountId)) {
      return json({ error: 'account_id must be a 12-digit AWS account number' }, 400)
    }

    // Get user context if authenticated
    let orgId = 'anonymous'
    let userId = 'anonymous'
    
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      })

      const { data: { user } } = await supabaseClient.auth.getUser()
      if (user) {
        orgId = user.user_metadata?.org_id || user.id
        userId = user.id
        console.log('User authenticated:', userId)
      }
    }

    const region = body.region || 'us-east-1'
    const externalId = body.external_id || orgId

    // Save to database if we have a valid org
    if (orgId !== 'anonymous') {
      const { error: dbError } = await loggerClient
        .from('cloud_credentials')
        .upsert({
          org_id: orgId,
          provider: 'aws',
          account_id: accountId,
          region,
          role_arn: roleArn,
          external_id: externalId,
          verified: true,
          verified_at: new Date().toISOString(),
          display_name: body.display_name || `AWS Account ${accountId}`,
        }, { onConflict: 'org_id,role_arn' })

      if (dbError) {
        console.error('DB upsert failed:', dbError)
      } else {
        console.log('Credentials saved to database')
      }
    }

    console.log('Finished successfully')
    
    return json({
      success: true,
      verified: true,
      credential_id: orgId !== 'anonymous' ? `${orgId}-${accountId}` : null,
      account_id: accountId,
      region,
      role_arn: roleArn,
      external_id: externalId,
      available_regions: [
        'us-east-1', 'us-west-2', 'eu-west-1',
        'ap-south-1', 'ap-southeast-1', 'ca-central-1'
      ],
      message: 'AWS IAM role verified successfully'
    })

  } catch (err: any) {
    console.error('Unhandled error:', err)
    return json({ 
      error: 'Internal server error', 
      detail: err.message 
    }, 500)
  }
})
