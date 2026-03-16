import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from 'https://esm.sh/@aws-sdk/client-sts@3.490.0'

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
    const region = Deno.env.get('AWS_REGION') || 'us-east-1'

    console.log('Testing AWS credentials...')
    console.log('AWS_ACCESS_KEY_ID exists:', !!accessKeyId)
    console.log('AWS_SECRET_ACCESS_KEY exists:', !!secretAccessKey)
    console.log('AWS_REGION:', region)

    if (!accessKeyId || !secretAccessKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'AWS credentials not configured',
        details: {
          hasAccessKey: !!accessKeyId,
          hasSecretKey: !!secretAccessKey,
          region
        }
      }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    // Test 1: Get caller identity (verify credentials work)
    console.log('Test 1: Getting caller identity...')
    const stsClient = new STSClient({
      region,
      credentials: { accessKeyId, secretAccessKey }
    })

    const identity = await stsClient.send(new GetCallerIdentityCommand({}))
    console.log('Caller identity:', identity)

    // Test 2: Try to assume the deployment role
    console.log('Test 2: Attempting to assume role...')
    const roleArn = 'arn:aws:iam::367749063363:role/AutoStackDeploymentRole'
    
    try {
      const assumed = await stsClient.send(new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `autostack-test-${Date.now()}`,
        ExternalId: 'autostack',
        DurationSeconds: 3600,
      }))

      console.log('Role assumption successful!')

      return new Response(JSON.stringify({
        success: true,
        message: 'AWS credentials are valid and can assume the deployment role',
        tests: {
          callerIdentity: {
            success: true,
            account: identity.Account,
            arn: identity.Arn,
            userId: identity.UserId
          },
          assumeRole: {
            success: true,
            roleArn,
            externalId: 'autostack',
            accessKeyId: assumed.Credentials?.AccessKeyId?.substring(0, 10) + '...'
          }
        }
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    } catch (assumeError: any) {
      console.error('Role assumption failed:', assumeError)
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to assume deployment role',
        tests: {
          callerIdentity: {
            success: true,
            account: identity.Account,
            arn: identity.Arn
          },
          assumeRole: {
            success: false,
            error: assumeError.message,
            code: assumeError.Code || assumeError.name,
            roleArn,
            externalId: 'autostack'
          }
        },
        troubleshooting: {
          possibleCauses: [
            'IAM role does not exist',
            'Trust relationship not configured correctly',
            'External ID mismatch',
            'IAM user does not have sts:AssumeRole permission'
          ],
          checkTrustPolicy: `The role ${roleArn} must have a trust policy allowing the IAM user to assume it`
        }
      }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

  } catch (error: any) {
    console.error('Test failed:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      code: error.Code || error.name,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
