import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getOrgAWSCredentials, trackResource, setStage, appendLog } from '../_shared/aws-client-direct.ts'
import { createAppRunnerService, describeAppRunnerService, createAccessRole } from '../_shared/aws-apprunner-api.ts'
import { getIAMRole } from '../_shared/aws-iam-api.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { deployment_id, image_tag } = await req.json()

    console.log('[1] Provisioning infrastructure for deployment:', deployment_id)

    // Get deployment details
    const { data: deployment } = await supabase
      .from('deployments')
      .select('*')
      .eq('id', deployment_id)
      .single()

    if (!deployment) {
      throw new Error('Deployment not found')
    }

    console.log('[2] Getting AWS credentials for org:', deployment.org_id)

    const awsCreds = await getOrgAWSCredentials(deployment.org_id, null, supabase)
    const imageUri = `${deployment.ecr_repository_uri}:${image_tag}`
    const appName = sanitizeAppName(deployment.app_name || deployment.id.slice(0, 8))

    console.log('[3] Image URI:', imageUri)

    // ─── Provision App Runner ─────────────────────────────────────────────────
    await setStage(supabase, deployment_id, 'deploying')
    await appendLog(supabase, deployment_id, '▶ Provisioning AWS App Runner service...', 'step')
    await appendLog(supabase, deployment_id, '  App Runner auto-scales to zero — no idle costs', 'info')

    // Get or create App Runner access role
    console.log('[4] Getting App Runner access role')
    const accessRoleArn = await getOrCreateAppRunnerRole(awsCreds, deployment.org_id, supabase)
    console.log('[5] Access role ARN:', accessRoleArn)

    // Create App Runner service
    console.log('[6] Creating App Runner service:', `autostack-${appName}`)
    
    const service = await createAppRunnerService(awsCreds, {
      serviceName: `autostack-${appName}`,
      sourceConfiguration: {
        imageRepository: {
          imageIdentifier: imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: String(deployment.port || 3000),
            runtimeEnvironmentVariables: {
              PORT: String(deployment.port || 3000),
              NODE_ENV: 'production'
            }
          }
        },
        autoDeploymentsEnabled: false
      },
      instanceConfiguration: {
        cpu: getCPUForMemory(deployment.memory_mb || 512),
        memory: getMemoryString(deployment.memory_mb || 512)
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: deployment.health_check_path || '/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 3
      }
    })

    console.log('[7] App Runner service created:', service.serviceArn)

    await trackResource(supabase, deployment_id, deployment.org_id, 'app_runner', service.serviceArn, service.serviceArn, awsCreds.region)
    await supabase.from('deployments').update({ app_runner_service_arn: service.serviceArn }).eq('id', deployment_id)
    
    await appendLog(supabase, deployment_id, `  Service ARN: ${service.serviceArn}`, 'info')
    await appendLog(supabase, deployment_id, '  Waiting for App Runner to start (2-3 minutes)...', 'info')

    // Poll for App Runner to become RUNNING
    pollAppRunnerStatus(service.serviceArn, deployment_id, awsCreds, supabase)
      .catch(err => console.error('[provision-infrastructure] Polling error:', err))

    return new Response(JSON.stringify({
      success: true,
      service_arn: service.serviceArn,
      service_url: service.serviceUrl,
      message: 'App Runner service created — waiting for RUNNING status'
    }), { 
      status: 200, 
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
    })

  } catch (err: any) {
    console.error('[provision-infrastructure] Error:', err)
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message,
      stack: err.stack
    }), { 
      status: 500, 
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
    })
  }
})

async function pollAppRunnerStatus(
  serviceArn: string, 
  deploymentId: string, 
  awsCreds: any, 
  supabase: any
) {
  let attempts = 0
  const maxAttempts = 40  // 40 × 15s = 10 minutes max

  console.log('[Poll] Starting App Runner status monitoring')

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 15000))  // Poll every 15 seconds
    attempts++

    try {
      const service = await describeAppRunnerService(awsCreds, serviceArn)
      const status = service.status

      console.log('[Poll] Status:', status, `(attempt ${attempts}/${maxAttempts})`)

      if (status === 'RUNNING') {
        const liveUrl = `https://${service.serviceUrl}`
        await appendLog(supabase, deploymentId, `✓ App Runner service is RUNNING`, 'success')
        await appendLog(supabase, deploymentId, `  URL: ${liveUrl}`, 'success')

        console.log('[Poll] Service is RUNNING:', liveUrl)

        // Run health checks
        await runHealthChecks(liveUrl, deploymentId, supabase)
        return
      }

      if (status === 'CREATE_FAILED') {
        await appendLog(supabase, deploymentId, '✗ App Runner failed to start', 'error')
        await setStage(supabase, deploymentId, 'failed')
        console.log('[Poll] Service creation failed')
        return
      }

      if (status === 'OPERATION_IN_PROGRESS') {
        await appendLog(supabase, deploymentId, `  Status: ${status} (attempt ${attempts}/${maxAttempts})`, 'info')
      }
    } catch (err: any) {
      console.error('[Poll] Error:', err.message)
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  console.log('[Poll] Timeout reached')
  await appendLog(supabase, deploymentId, '✗ Timed out waiting for App Runner (10 minutes)', 'error')
  await setStage(supabase, deploymentId, 'failed')
}

async function runHealthChecks(baseUrl: string, deploymentId: string, supabase: any) {
  await setStage(supabase, deploymentId, 'health_checking')
  await appendLog(supabase, deploymentId, '▶ Running health checks...', 'step')

  const maxAttempts = 12  // 12 × 10s = 2 minutes
  let lastError: string = ''

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000))

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${baseUrl}/health`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'AutoStack-HealthCheck/1.0' }
      })
      clearTimeout(timeout)

      if (response.ok) {
        await appendLog(supabase, deploymentId, `  ✓ Health check passed (${response.status})`, 'success')

        // Mark deployment as active
        await supabase.from('deployments').update({
          current_stage: 'active',
          live_url: baseUrl,
          status: 'healthy',
        }).eq('id', deploymentId)

        await appendLog(supabase, deploymentId, `\n✅ Deployment complete!`, 'success')
        await appendLog(supabase, deploymentId, `   ${baseUrl}`, 'success')

        return { success: true, live_url: baseUrl }
      }

      lastError = `HTTP ${response.status}`
    } catch (err: any) {
      lastError = err.name === 'AbortError' ? 'Request timed out' : err.message
    }

    await appendLog(supabase, deploymentId, `  Attempt ${i + 1}/${maxAttempts}: ${lastError}`, 'warn')
  }

  // Health checks failed
  await appendLog(supabase, deploymentId, `✗ Health checks failed after 2 minutes. Last error: ${lastError}`, 'error')
  await setStage(supabase, deploymentId, 'failed')
}

async function getOrCreateAppRunnerRole(awsCreds: any, orgId: string, supabase: any): Promise<string> {
  const roleName = 'AutoStackAppRunnerAccessRole'

  // Check if role exists
  const existingRole = await getIAMRole(awsCreds, roleName)
  if (existingRole) {
    return existingRole.roleArn
  }

  // Create new role
  const role = await createAccessRole(awsCreds, roleName)
  
  // Wait for role propagation
  await new Promise(r => setTimeout(r, 10000))

  return role.roleArn
}

function getCPUForMemory(memoryMB: number): string {
  if (memoryMB <= 512) return '0.25 vCPU'
  if (memoryMB <= 1024) return '0.5 vCPU'
  if (memoryMB <= 2048) return '1 vCPU'
  return '2 vCPU'
}

function getMemoryString(memoryMB: number): string {
  if (memoryMB <= 512) return '1 GB'
  if (memoryMB <= 1024) return '2 GB'
  if (memoryMB <= 2048) return '3 GB'
  return '4 GB'
}

function sanitizeAppName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}
