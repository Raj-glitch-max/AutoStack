import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { STSClient, AssumeRoleCommand } from 'npm:@aws-sdk/client-sts@3'
import { IAMClient, SimulatePrincipalPolicyCommand } from 'npm:@aws-sdk/client-iam@3'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

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

const ERROR_MAP: Record<string, string> = {
  'AccessDenied': 'Cannot assume role. Check that the role trust policy allows AutoStack and includes ExternalId.',
  'NoSuchEntity': 'IAM role not found. Verify the role ARN is correct.',
  'InvalidClientTokenId': 'AWS credentials invalid. Check your Account ID.',
  'ExpiredToken': 'AWS credentials expired. Refresh your credentials.',
  'ValidationError': 'Invalid ARN format. Use: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME',
}

function getFriendlyError(err: any): string {
  const code = err.name || ''
  return ERROR_MAP[code] || `AWS error: ${err.message}`
}

function validateArn(arn: string): boolean {
  return /^arn:aws:iam::\d{12}:role\/[\w+=,.@\-/]+$/.test(arn)
}

serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  console.log('[AWS] Starting aws-assume-role request')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) {
        return new Response(JSON.stringify({ error: `Unauthorized: ${authErr?.message || 'Invalid user'}` }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const orgId = user.user_metadata?.org_id
    if (!orgId) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Org context missing' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    console.log(`[AWS] User authorized: ${user.id}, Org: ${orgId}`)

    const body = await req.json()
    const validationError = validateOrRespond(body, {
        account_id: { type: 'string', required: true },
        region: { type: 'string', required: true },
        role_arn: { type: 'string', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { account_id, region, role_arn, display_name } = body

    if (!/^\d{12}$/.test(account_id)) {
      return new Response(JSON.stringify({ error: 'account_id must be a 12-digit number' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!validateArn(role_arn)) {
      return new Response(JSON.stringify({ error: 'Invalid role_arn format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    
    if (!awsAccessKeyId || !awsSecretAccessKey) {
        throw new Error('Server-side AWS credentials missing. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY secrets.')
    }

    const sts = new STSClient({ 
        region,
        credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey
        }
    })
    let tempCreds: { accessKeyId: string; secretAccessKey: string; sessionToken: string }

    console.log(`[AWS] Attempting AssumeRole for: ${role_arn}`)

    try {
      const { Credentials } = await sts.send(new AssumeRoleCommand({
        RoleArn: role_arn,
        RoleSessionName: `AutoStack-Verify-${Date.now()}`,
        ExternalId: orgId,
        DurationSeconds: 900
      }))
      if (!Credentials?.AccessKeyId) throw new Error('STS returned empty credentials')
      tempCreds = {
        accessKeyId: Credentials.AccessKeyId,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken!
      }
      console.log(`[AWS] AssumeRole successful`)
    } catch (err: any) {
      const friendly = getFriendlyError(err)
      console.error(`[AWS] AssumeRole failed: ${err.message}`)
      
      const existing = await supabaseAdmin.from('cloud_credentials').select('id').eq('org_id', orgId).eq('role_arn', role_arn).maybeSingle()
      if (existing.data) {
        await supabaseAdmin.from('cloud_credentials').update({ status: 'error', error_message: friendly }).eq('id', existing.data.id)
      } else {
        await supabaseAdmin.from('cloud_credentials').insert({
          org_id: orgId, provider: 'aws', display_name: display_name || `AWS ${account_id}`,
          account_id, region, role_arn, external_id: orgId,
          status: 'error', error_message: friendly
        })
      }

      return new Response(JSON.stringify({ error: friendly }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[AWS] Simulating permissions for assumed role`)
    const iam = new IAMClient({
      region,
      credentials: tempCreds
    })

    let permissionsOk = false
    let missing: string[] = []
    let simulationErrorObj: any = null

    try {
      const simulationResult = await iam.send(new SimulatePrincipalPolicyCommand({
        PolicySourceArn: role_arn,
        ActionNames: REQUIRED_PERMISSIONS
      }))

      console.log(`[aws-assume-role] Simulation results returned. Evaluated ${simulationResult.EvaluationResults?.length} actions.`);
      if (simulationResult.EvaluationResults && simulationResult.EvaluationResults.length > 0) {
         console.log(`Sample evaluation decision for ${simulationResult.EvaluationResults[0].EvalActionName}: ${simulationResult.EvaluationResults[0].EvalDecision}`);
         simulationErrorObj = `Sample Decision: ${simulationResult.EvaluationResults[0].EvalDecision}`;
      }
      missing = simulationResult.EvaluationResults?.filter(r => r.EvalDecision !== 'allowed').map(r => r.EvalActionName!) || []
      permissionsOk = missing.length === 0
    } catch (simError: any) {
      console.error('[aws-assume-role] Simulation API crashed:', simError.message)
      simulationErrorObj = simError.message;
      missing = REQUIRED_PERMISSIONS // If simulation crashes, assume all permissions are missing
      permissionsOk = false
    }

    console.log(`[AWS] Permissions check: ${permissionsOk ? 'PASS' : 'FAIL'}`)

    const existingCred = await supabaseAdmin
      .from('cloud_credentials')
      .select('id')
      .eq('org_id', orgId)
      .eq('role_arn', role_arn)
      .maybeSingle()

    let credentialId: string
    if (existingCred.data) {
      credentialId = existingCred.data.id
      const { error: updateError } = await supabaseAdmin
        .from('cloud_credentials')
        .update({
          display_name: display_name || `AWS ${account_id}`,
          account_id, region, external_id: orgId,
          status: permissionsOk ? 'verified' : 'error',
          last_verified_at: new Date().toISOString(),
          permissions_ok: permissionsOk,
          missing_permissions: missing,
          error_message: permissionsOk ? null : `Missing ${missing.length} permissions`
        })
        .eq('id', credentialId)
      if (updateError) throw updateError
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('cloud_credentials')
        .insert({
          org_id: orgId, provider: 'aws',
          display_name: display_name || `AWS ${account_id}`,
          account_id, region, role_arn, external_id: orgId,
          status: permissionsOk ? 'verified' : 'error',
          last_verified_at: new Date().toISOString(),
          permissions_ok: permissionsOk,
          missing_permissions: missing,
          error_message: permissionsOk ? null : `Missing ${missing.length} permissions`
        })
        .select('id')
        .single()
      if (insertError) throw insertError
      credentialId = inserted.id
    }

    return new Response(JSON.stringify({
      success: true,
      credential_id: credentialId,
      permissions_ok: permissionsOk,
      missing_permissions: missing,
      verified_at: new Date().toISOString()
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error(`[AWS] Error:`, err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
