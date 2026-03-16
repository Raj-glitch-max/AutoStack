import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getOrgAWSCredentials, setStage, appendLog } from '../_shared/aws-client-direct.ts'
import { startBuild, getBuildStatus } from '../_shared/aws-codebuild-api.ts'

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

    const { deployment_id, branch } = await req.json()

    console.log('[1] Starting build for deployment:', deployment_id)

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

    // ─── Start the build ─────────────────────────────────────────────────────
    await setStage(supabase, deployment_id, 'building_image')
    await appendLog(supabase, deployment_id, '▶ Starting Docker image build...', 'step')
    await appendLog(supabase, deployment_id, `  Repository: ${deployment.repo_url || 'N/A'}`, 'info')
    await appendLog(supabase, deployment_id, `  Branch: ${branch}`, 'info')

    console.log('[3] Starting CodeBuild project:', deployment.codebuild_project_name)

    const build = await startBuild(awsCreds, deployment.codebuild_project_name, branch)

    await supabase.from('deployments')
      .update({ codebuild_build_id: build.buildId })
      .eq('id', deployment_id)

    await appendLog(supabase, deployment_id, `  Build ID: ${build.buildId}`, 'info')
    await appendLog(supabase, deployment_id, '  Waiting for build environment to start...', 'info')

    console.log('[4] Build started:', build.buildId)

    // ─── Monitor build status ──────────────────────────────────────────
    monitorBuildStatus(
      build.buildId,
      deployment_id,
      deployment.org_id,
      awsCreds,
      supabase
    ).catch(err => console.error('[run-build] Monitor error:', err))

    return new Response(JSON.stringify({
      success: true,
      build_id: build.buildId,
      build_arn: build.buildArn,
      message: 'Build started — monitoring progress'
    }), { 
      status: 200, 
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
    })

  } catch (err: any) {
    console.error('[run-build] Error:', err)
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

async function monitorBuildStatus(
  buildId: string,
  deploymentId: string,
  orgId: string,
  awsCreds: any,
  supabase: any
) {
  let buildComplete = false
  let lastStatus = ''
  let pollCount = 0
  const maxPolls = 360 // 30 minutes (5 sec intervals)

  console.log('[Monitor] Starting build monitoring for:', buildId)

  while (!buildComplete && pollCount < maxPolls) {
    await new Promise(r => setTimeout(r, 5000))  // Poll every 5 seconds
    pollCount++

    try {
      const build = await getBuildStatus(awsCreds, buildId)
      const status = build.status

      if (status !== lastStatus) {
        lastStatus = status
        console.log('[Monitor] Build status changed:', status)
        
        const statusMap: Record<string, string> = {
          'IN_PROGRESS': 'Building...',
          'SUCCEEDED': '✓ Build succeeded',
          'FAILED': '✗ Build failed',
          'TIMED_OUT': '✗ Build timed out',
          'STOPPED': '✗ Build was cancelled',
        }
        
        await appendLog(supabase, deploymentId, statusMap[status] || status,
          status === 'SUCCEEDED' ? 'success' : status === 'IN_PROGRESS' ? 'info' : 'error')
      }

      if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'STOPPED'].includes(status)) {
        buildComplete = true
        console.log('[Monitor] Build complete with status:', status)

        if (status === 'SUCCEEDED') {
          // Build succeeded - trigger next step
          await supabase.from('deployments')
            .update({ 
              image_tag: 'latest',
              current_stage: 'pushing_image' 
            })
            .eq('id', deploymentId)

          await appendLog(supabase, deploymentId, '▶ Triggering infrastructure provisioning...', 'step')
          
          // Trigger provision-infrastructure function
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/provision-infrastructure`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              deployment_id: deploymentId, 
              image_tag: 'latest'
            })
          })
        } else {
          // Build failed
          await setStage(supabase, deploymentId, 'failed')
          await appendLog(supabase, deploymentId, `Build failed with status: ${status}`, 'error')
        }
      }
    } catch (err: any) {
      console.error('[Monitor] Status check error:', err.message)
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  if (pollCount >= maxPolls) {
    console.log('[Monitor] Max polls reached, stopping monitoring')
    await appendLog(supabase, deploymentId, 'Build monitoring timeout - check AWS Console', 'warn')
  }
}
