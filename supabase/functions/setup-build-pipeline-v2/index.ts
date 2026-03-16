// Setup build pipeline using direct AWS API calls (no SDK)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { CORS_HEADERS } from '../_shared/cors.ts'
import { getOrgAWSCredentials, trackResource, setStage, appendLog } from '../_shared/aws-client-direct.ts'
import { createECRRepository } from '../_shared/aws-ecr-api.ts'

function sanitizeAppName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 50)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { deployment_id, org_id, github_repo_url } = await req.json()

    console.log('[1] Getting deployment details...')
    const { data: deployment } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', deployment_id)
      .single()

    if (!deployment) {
      throw new Error('Deployment not found')
    }

    const appName = sanitizeAppName(deployment.app_name || github_repo_url.split('/').pop())
    const region = deployment.region || 'us-east-1'

    console.log('[2] Getting AWS credentials...')
    // Redis is optional
    let redis = null
    try {
      const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL')
      const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')
      if (redisUrl && redisToken) {
        const { Redis } = await import('https://esm.sh/@upstash/redis@1.20.1')
        redis = new Redis({ url: redisUrl, token: redisToken })
      }
    } catch (err) {
      console.warn('Redis not available:', err)
    }

    const awsCreds = await getOrgAWSCredentials(org_id, redis, supabase)

    console.log('[3] Creating ECR repository...')
    await setStage(supabase, deployment_id, 'provisioning_infra')
    await appendLog(supabase, deployment_id, '▶ Creating container registry (ECR)...', 'step')

    const repoName = `autostack/${appName}`
    const ecr = await createECRRepository(awsCreds, repoName)

    await appendLog(supabase, deployment_id, `✓ ECR repository created: ${ecr.repositoryUri}`, 'success')
    await trackResource(supabase, deployment_id, org_id, 'ecr', repoName, ecr.repositoryArn, region)

    console.log('[4] Updating deployment record...')
    await supabase
      .from('deployments')
      .update({
        ecr_repository_uri: ecr.repositoryUri,
        current_stage: 'ready_to_build'
      })
      .eq('id', deployment_id)

    console.log('[5] Success!')
    return new Response(JSON.stringify({
      success: true,
      ecr_repository_uri: ecr.repositoryUri,
      message: 'Build pipeline setup complete (ECR created)'
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Setup failed:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
