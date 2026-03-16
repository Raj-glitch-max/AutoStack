// AWS Client Utility - Handles all AWS operations with role assumption
import { STSClient, AssumeRoleCommand } from 'https://esm.sh/@aws-sdk/client-sts@3.490.0'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  region: string
}

/**
 * Gets temporary AWS credentials by assuming the org's IAM role
 * Credentials are cached in Redis for 55 minutes (5 min buffer before 1h expiry)
 */
export async function getOrgAWSCredentials(
  orgId: string,
  redis: any,
  supabaseServiceClient: SupabaseClient
): Promise<AWSCredentials> {
  
  // Check cache first (avoid STS call on every function invocation)
  // Redis is optional - if not available, we'll just fetch fresh credentials each time
  if (redis) {
    try {
      const cacheKey = `aws:creds:${orgId}`
      const cached = await redis.get(cacheKey)
      
      if (cached) {
        const parsed = JSON.parse(cached as string)
        // Check if expiring in < 5 minutes
        if (new Date(parsed.expiration) > new Date(Date.now() + 5 * 60 * 1000)) {
          return parsed.credentials
        }
      }
    } catch (err) {
      console.warn('Redis cache check failed, fetching fresh credentials:', err)
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

  // Assume the role using AutoStack's service account credentials
  const stsClient = new STSClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    }
  })

  const assumed = await stsClient.send(new AssumeRoleCommand({
    RoleArn: creds.role_arn,
    RoleSessionName: `autostack-${Date.now()}`,
    ExternalId: creds.external_id || 'autostack',
    DurationSeconds: 3600, // 1 hour
  }))

  if (!assumed.Credentials) {
    throw new Error('Failed to assume AWS role - check trust policy')
  }

  const credentials: AWSCredentials = {
    accessKeyId: assumed.Credentials.AccessKeyId!,
    secretAccessKey: assumed.Credentials.SecretAccessKey!,
    sessionToken: assumed.Credentials.SessionToken!,
    region: creds.region || 'us-east-1',
  }

  // Cache for 55 minutes (5 min buffer before 1h expiry)
  // Redis is optional - if not available, credentials will be fetched fresh each time
  if (redis) {
    try {
      const cacheKey = `aws:creds:${orgId}`
      await redis.set(cacheKey, JSON.stringify({
        credentials,
        expiration: assumed.Credentials.Expiration!.toISOString()
      }), { ex: 3300 })
    } catch (err) {
      console.warn('Failed to cache credentials in Redis:', err)
    }
  }

  return credentials
}

/**
 * Track every AWS resource for teardown
 */
export async function trackResource(
  supabase: SupabaseClient,
  deploymentId: string,
  orgId: string,
  resourceType: string,
  resourceId: string,
  resourceArn: string | null,
  region: string
) {
  await supabase.from('infra_resources').insert({
    deployment_id: deploymentId,
    org_id: orgId,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_arn: resourceArn,
    region,
  })
}

/**
 * Update deployment stage and broadcast progress via Realtime
 */
export async function setStage(
  supabase: SupabaseClient,
  deploymentId: string,
  stage: string,
  extraData?: Record<string, any>
) {
  await supabase.from('deployments').update({
    current_stage: stage,
    stage_started_at: new Date().toISOString(),
    ...extraData,
  }).eq('id', deploymentId)
  // Supabase Realtime CDC automatically broadcasts this UPDATE to frontend subscribers
}

/**
 * Append a build log line (streams to frontend via Realtime)
 */
export async function appendLog(
  supabase: SupabaseClient,
  deploymentId: string,
  text: string,
  level: 'info' | 'warn' | 'error' | 'success' | 'step' = 'info'
) {
  await supabase.from('build_log_entries').insert({
    deployment_id: deploymentId,
    level,
    text,
  })
}
