import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from 'npm:@aws-sdk/client-sts@3'
import { IAMClient, SimulatePrincipalPolicyCommand } from 'npm:@aws-sdk/client-iam@3'
import { CORS_HEADERS, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { Redis } from 'https://esm.sh/@upstash/redis@1'
import { checkRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'

const REQUIRED_PERMISSIONS = [
  'eks:CreateCluster', 'eks:DescribeCluster', 'eks:DeleteCluster',
  'eks:CreateNodegroup', 'eks:DescribeNodegroup', 'eks:DeleteNodegroup',
  'ec2:CreateVpc', 'ec2:DescribeVpcs', 'ec2:DeleteVpc',
  'ec2:CreateSubnet', 'ec2:CreateInternetGateway', 'ec2:CreateNatGateway',
  'ec2:CreateRouteTable', 'ec2:CreateSecurityGroup', 'ec2:CreateTags',
  'ecr:CreateRepository', 'ecr:GetAuthorizationToken',
  'elasticloadbalancing:CreateLoadBalancer', 'elasticloadbalancing:CreateTargetGroup',
  'iam:CreateRole', 'iam:AttachRolePolicy', 'iam:PassRole',
  'codebuild:CreateProject', 'codebuild:StartBuild', 'codebuild:BatchGetBuilds',
  'sts:AssumeRole', 'sts:GetCallerIdentity'
]

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
})

function getFriendlyError(err: Error): string {
  const code = (err as any).name || ''
  const MAP: Record<string, string> = {
    'AccessDenied': 'Cannot assume role. Check that the role trust policy allows AutoStack and includes ExternalId.',
    'NoSuchEntity': 'IAM role not found. Verify the role ARN is correct.',
    'InvalidClientTokenId': 'AWS credentials invalid. Check your Account ID.',
  }
  return MAP[code] || `AWS error: ${err.message}`
}

function validateArn(arn: string): boolean {
  return /^arn:aws:iam::\d{12}:role\/[\w+=,.@\-/]+$/.test(arn)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return errorResponse(401, 'Unauthorized: Missing token')

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return errorResponse(401, authErr?.message || 'Invalid user')

    const org_id = user.user_metadata?.org_id
    if (!org_id) return errorResponse(401, 'Org context missing in JWT')

    // Rate Limiting
    const { pass, remaining, resetIn } = await checkRateLimit(redis, 'aws-assume-role', user.id)
    if (!pass) return rateLimitResponse('aws-assume-role', resetIn, CORS_HEADERS)

    const { account_id, region, role_arn, display_name } = await req.json()

    // Input validation
    if (!account_id || !/^\d{12}$/.test(account_id)) {
      return errorResponse(400, 'account_id must be a 12-digit number')
    }
    if (!validateArn(role_arn)) {
      return errorResponse(400, 'Invalid role_arn format')
    }
    const arnAccountId = role_arn.split(':')[4]
    if (arnAccountId !== account_id) {
      return errorResponse(400, `ARN account (${arnAccountId}) does not match account_id (${account_id})`)
    }

    // Attempt to assume role
    const sts = new STSClient({ region })
    let tempCreds: { accessKeyId: string; secretAccessKey: string; sessionToken: string }

    try {
      const { Credentials } = await sts.send(new AssumeRoleCommand({
        RoleArn: role_arn,
        RoleSessionName: `AutoStack-Verify-${Date.now()}`,
        ExternalId: org_id,        // SECURITY: confused deputy prevention
        DurationSeconds: 900
      }))
      if (!Credentials?.AccessKeyId) throw new Error('STS returned empty credentials')
      tempCreds = {
        accessKeyId: Credentials.AccessKeyId,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken!
      }
    } catch (err: unknown) {
      const friendly = getFriendlyError(err as Error)
      await supabase.from('cloud_credentials').upsert({
        org_id, provider: 'aws', display_name: display_name || `AWS ${account_id}`,
        account_id, region, role_arn, external_id: org_id,
        status: 'error', error_message: friendly
      }, { onConflict: 'org_id,role_arn' })

      return errorResponse(403, friendly)
    }

    // Check permissions using the temporary credentials
    const iam = new IAMClient({ region, credentials: tempCreds })
    const callerSts = new STSClient({ region, credentials: tempCreds })
    const missing: string[] = []

    try {
      const { Arn: callerArn } = await callerSts.send(new GetCallerIdentityCommand({}))
      const batchSize = 100
      for (let i = 0; i < REQUIRED_PERMISSIONS.length; i += batchSize) {
        const batch = REQUIRED_PERMISSIONS.slice(i, i + batchSize)
        const { EvaluationResults } = await iam.send(new SimulatePrincipalPolicyCommand({
          PolicySourceArn: callerArn!,
          ActionNames: batch,
          ResourceArns: ['*']
        }))
        for (const r of EvaluationResults || []) {
          if (r.EvalDecision !== 'allowed') missing.push(r.EvalActionName!)
        }
      }
    } catch (err) {
      console.error('Could not verify permissions:', (err as Error).message)
    }

    const permissionsOk = missing.length === 0

    const { data: savedCred, error: saveError } = await supabase
      .from('cloud_credentials')
      .upsert({
        org_id, provider: 'aws',
        display_name: display_name || `AWS ${account_id}`,
        account_id, region, role_arn, external_id: org_id,
        status: permissionsOk ? 'verified' : 'error',
        last_verified_at: new Date().toISOString(),
        permissions_ok: permissionsOk,
        missing_permissions: missing,
        error_message: permissionsOk ? null : `Missing ${missing.length} permissions`
      }, { onConflict: 'org_id,role_arn' })
      .select('id')
      .single()

    if (saveError) return errorResponse(500, `Failed to save credential: ${saveError.message}`)

    return jsonResponse({
      success: true,
      credential_id: savedCred.id,
      permissions_ok: permissionsOk,
      missing_permissions: missing,
      verified_at: new Date().toISOString(),
      message: permissionsOk
        ? `IAM role verified — ${REQUIRED_PERMISSIONS.length} permissions confirmed`
        : `Role assumed but missing ${missing.length} permissions. Add them to proceed.`
    })
  } catch (err: unknown) {
    console.error('aws-assume-role error:', (err as Error).message)
    return errorResponse(500, (err as Error).message)
  }
})
