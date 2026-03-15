import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { rateLimitCheck, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { validateOrRespond } from '../_shared/validator.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { logAudit } from '../_shared/audit.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // 1. Authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()

    // 2. Validation
    const validationError = validateOrRespond(body, {
        project_id: { type: 'uuid', required: false },
        repo_url: { type: 'string', required: false },
        environment_type: { type: 'string', enum: ['production', 'preview', 'staging'], default: 'production' }
    }, corsHeaders)
    if (validationError) return validationError

    const { 
        deployment_id, 
        project_id, 
        repo_url, 
        branch, 
        environment_type,
        environment_name,
        pr_number,
        pr_title
    } = body
    
    // 3. Rate Limiting
    const redis = createRedisClient()
    const rl = await rateLimitCheck(redis, 'infra-provision', user.id)
    if (!rl.pass) return rateLimitResponse('infra-provision', rl.resetIn, corsHeaders)

    console.log(`[Infra] Provisioning [${environment_type}] for ${repo_url || project_id}`)

    // 4. Resolve or Create Project
    let finalProjectId = project_id
    if (!finalProjectId && repo_url) {
        // Direct webhook trigger for a preview
        const { data: newProject, error: projectErr } = await supabase.from('projects').insert({
            org_id: user.user_metadata?.org_id,
            name: environment_name || `Preview: ${pr_title || branch}`,
            repo_url,
            branch,
            provisioning_status: 'provisioning',
            environment_type: environment_type || 'production',
            environment: environment_type || 'production',
            pr_number,
            pr_title,
            auto_destroy_at: environment_type === 'preview' ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() : null
        }).select().single()
        
        if (projectErr) throw projectErr
        finalProjectId = newProject.id

        await logAudit(req, {
            org_id: user.user_metadata?.org_id,
            action: 'infra.provision.preview',
            target_type: 'project',
            target_id: finalProjectId,
            payload: { repo_url, branch, pr_number }
        })
    }

    let finalDeploymentId = deployment_id
    // 5. Resolve or Create Deployment
    if (!finalDeploymentId) {
        const { data: project } = await supabase.from('projects').select('cluster_id, org_id').eq('id', finalProjectId).single()
        const { data: newDeployment, error: deployErr } = await supabase.from('deployments').insert({
            project_id: finalProjectId,
            org_id: project?.org_id || user.user_metadata?.org_id,
            cluster_id: project?.cluster_id,
            status: 'in_progress',
            stage: 'provisioning',
            triggered_by: environment_type === 'preview' ? 'github_pr' : 'api'
        }).select().single()
        
        if (deployErr) throw deployErr
        finalDeploymentId = newDeployment.id
    }

    // 6. Infrastructure Logic (Simulated for Now - Will be replaced by CDK/Terraform calls in Phase F)
    const delay = environment_type === 'preview' ? 1400 : 5800
    await new Promise(r => setTimeout(r, delay))

    // 7. Trigger Stage 4: Build & Deploy
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/build-and-deploy`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            deployment_id: finalDeploymentId, 
            project_id: finalProjectId 
        })
    }).catch(err => console.error('[Infra] Async trigger failed:', err))

    return new Response(JSON.stringify({ 
        success: true, 
        project_id: finalProjectId, 
        deployment_id: finalDeploymentId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error(`[Infra] Provisioning failed:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
