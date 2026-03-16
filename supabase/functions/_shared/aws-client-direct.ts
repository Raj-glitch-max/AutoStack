// AWS Client using direct API calls (no SDK)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { signRequest } from './aws-sig-v4.ts'

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  region: string
}

/**
 * Gets temporary AWS credentials by assuming the org's IAM role
 * Uses direct STS API calls instead of AWS SDK
 */
export async function getOrgAWSCredentials(
  orgId: string,
  redis: any,
  supabaseServiceClient: SupabaseClient
): Promise<AWSCredentials> {
  
  // Check cache first (avoid STS call on every function invocation)
  if (redis) {
    try {
      const cacheKey = `aws:creds:${orgId}`
      const cached = await redis.get(cacheKey)
      
      if (cached) {
        const parsed = JSON.parse(cached as string)
        if (new Date(parsed.expiration) > new Date(Date.now() + 5 * 60 * 1000)) {
          return parsed.credentials
        }
      }
    } catch (err) {
      console.warn('Redis cache check failed:', err)
    }
  }

  // Fetch org's IAM role from DB
  const { data: creds, error } = await supabaseServiceClient
    .from('cloud_credentials')
    .select('role_arn, external_id, region')
    .eq('org_id', orgId)
    .eq('provider', 'aws')
    .single()

  if (error || !creds) {
    throw new Error(`No AWS credentials found for org ${orgId}. User needs to connect their AWS account.`)
  }

  // Get AutoStack's service credentials
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')!
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')!
  const region = creds.region || 'us-east-1'

  // Build AssumeRole request
  const params = new URLSearchParams({
    'Action': 'AssumeRole',
    'RoleArn': creds.role_arn,
    'RoleSessionName': `autostack-${Date.now()}`,
    'ExternalId': creds.external_id || 'autostack',
    'DurationSeconds': '3600',
    'Version': '2011-06-15'
  })

  const payload = params.toString()

  // Sign and send request
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

  const response = await fetch(signed.url, {
    method: 'POST',
    headers: signed.headers,
    body: payload
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`STS AssumeRole failed: ${text}`)
  }

  const text = await response.text()

  // Parse XML response
  const accessKeyMatch = text.match(/<AccessKeyId>([^<]+)<\/AccessKeyId>/)
  const secretKeyMatch = text.match(/<SecretAccessKey>([^<]+)<\/SecretAccessKey>/)
  const sessionTokenMatch = text.match(/<SessionToken>([^<]+)<\/SessionToken>/)
  const expirationMatch = text.match(/<Expiration>([^<]+)<\/Expiration>/)

  if (!accessKeyMatch || !secretKeyMatch || !sessionTokenMatch) {
    throw new Error('Failed to parse credentials from STS response')
  }

  const credentials: AWSCredentials = {
    accessKeyId: accessKeyMatch[1],
    secretAccessKey: secretKeyMatch[1],
    sessionToken: sessionTokenMatch[1],
    region
  }

  // Cache for 55 minutes
  if (redis) {
    try {
      const cacheKey = `aws:creds:${orgId}`
      await redis.set(cacheKey, JSON.stringify({
        credentials,
        expiration: expirationMatch ? expirationMatch[1] : new Date(Date.now() + 3600000).toISOString()
      }), { ex: 3300 })
    } catch (err) {
      console.warn('Failed to cache credentials:', err)
    }
  }

  return credentials
}

/**
 * Track AWS resource for teardown
 */
export async function trackResource(
  supabase: SupabaseClient,
  deploymentId: string,
  orgId: string,
  resourceType: string,
  resourceId: string,
  resourceArn: string,
  region: string
) {
  await supabase.from('infra_resources').insert({
    deployment_id: deploymentId,
    org_id: orgId,
    provider: 'aws',
    resource_type: resourceType,
    resource_id: resourceId,
    resource_arn: resourceArn,
    region
  })
}

/**
 * Update deployment stage
 */
export async function setStage(
  supabase: SupabaseClient,
  deploymentId: string,
  stage: string
) {
  await supabase
    .from('deployments')
    .update({
      current_stage: stage,
      stage_started_at: new Date().toISOString()
    })
    .eq('id', deploymentId)
}

/**
 * Append log entry
 */
export async function appendLog(
  supabase: SupabaseClient,
  deploymentId: string,
  text: string,
  level: string = 'info'
) {
  await supabase.from('build_log_entries').insert({
    deployment_id: deploymentId,
    text,
    level,
    timestamp: new Date().toISOString()
  })
}
