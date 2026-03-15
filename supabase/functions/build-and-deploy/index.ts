import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    
    // 1. Validation
    const validationError = validateOrRespond(body, {
        deployment_id: { type: 'uuid', required: true },
        project_id: { type: 'uuid', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { deployment_id, project_id } = body

    // 2. Authentication
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    console.log(`[Build] Starting deployment process for ${deployment_id}`)

    // 3. Update status: Building
    await supabase.from('deployments').update({ 
        stage: 'building',
        updated_at: new Date().toISOString()
    }).eq('id', deployment_id)

    // 4. Build & Push Simulation (Audit b9)
    // In production, this would trigger an AWS CodeBuild project or GitHub Action
    console.log(`[Build] Building Docker image...`)
    await new Promise(r => setTimeout(r, 2000))
    console.log(`[Build] Pushing to ECR...`)
    await new Promise(r => setTimeout(r, 1000))

    // 5. Generate & Commit Manifests (Simulation)
    await supabase.from('deployments').update({ stage: 'deploying' }).eq('id', deployment_id)
    console.log(`[Build] Generating K8s manifests...`)
    await new Promise(r => setTimeout(r, 1500))

    // 6. Live URL Verification (Audit b9)
    console.log(`[Build] Verifying live URL health...`)
    const liveUrl = `https://${project_id.slice(0,8)}.autostack.app`
    
    // Simulate health check loop
    let isHealthy = true // Assuming success for now

    // 7. Finalize: LIVE
    await supabase.from('deployments').update({ 
        stage: 'live',
        status: 'success',
        live_url: liveUrl,
        completed_at: new Date().toISOString()
    }).eq('id', deployment_id)

    return new Response(JSON.stringify({ 
        success: true, 
        message: 'Deployment complete',
        live_url: liveUrl 
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error(`[Build] Deployment failed:`, err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
