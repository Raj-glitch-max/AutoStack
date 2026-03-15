import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getInstallationToken } from '../_shared/github.ts'
import { createRedisClient } from '../_shared/redis.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { rateLimitCheck, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { validateOrRespond } from '../_shared/validator.ts'

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
      project_id: { type: 'uuid', required: true },
      installation_id: { type: 'string', required: true },
      size: { type: 'string', enum: ['small', 'medium', 'large'], default: 'small' }
    }, corsHeaders)
    if (validationError) return validationError

    const { project_id, installation_id, size } = body

    // 3. Rate Limiting
    const redis = createRedisClient()
    const rl = await rateLimitCheck(redis, 'die-analyze', user.id)
    if (!rl.pass) return rateLimitResponse('die-analyze', rl.resetIn, corsHeaders)

    // 4. Stage 1: Repo Analysis
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()

    if (projectErr || !project) throw new Error("Project not found")
    if (project.org_id !== user.user_metadata?.org_id) {
       return new Response(JSON.stringify({ error: 'Forbidden: Project belongs to another organization' }), {
         status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       })
    }

    await supabase.from('projects').update({ analysis_status: 'analyzing' }).eq('id', project_id)
    
    // GitHub Logic
    const token = await getInstallationToken(installation_id, redis)
    const [owner, repo] = project.repo_url.split('github.com/')[1].split('/')

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${project.branch || 'main'}?recursive=0`, {
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'AutoStack-App' }
    })
    
    if (!treeRes.ok) {
        throw new Error(`GitHub API error: ${treeRes.statusText}`)
    }

    const treeData = await treeRes.json()
    const filenames: string[] = (treeData.tree || []).map((f: any) => f.path)

    const detection = detectStack(filenames)
    const generatedDockerfile = filenames.includes('Dockerfile') ? null : generateDockerfile(detection.stack)

    // 5. Stage 2: Infra Planning & Cost
    const costPlan = calculateCost(size, detection.stack)
    
    await supabase.from('projects').update({ 
        analysis_status: 'planning',
        stack: detection.stack,
        estimated_monthly_cost: costPlan.total,
        infra_plan_json: {
            size,
            resources: costPlan.resources,
            dockerfile: generatedDockerfile ? 'generated' : 'existing'
        }
    }).eq('id', project_id)

    // 6. Create Deployment Record
    const { data: deployment, error: deployErr } = await supabase.from('deployments').insert({
        project_id,
        org_id: project.org_id,
        status: 'in_progress',
        stage: 'planning'
    }).select().single()

    if (deployErr) throw deployErr

    // 7. Trigger Stage 3: Provisioning (Asynchronous)
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/infra-provision`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            deployment_id: deployment.id,
            project_id: project.id,
            plan: costPlan
        })
    }).catch(err => console.error('[DIE] Async trigger failed:', err))

    return new Response(JSON.stringify({ 
        success: true, 
        deployment_id: deployment.id,
        stack: detection.stack,
        estimated_cost: costPlan.total 
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error(`[DIE] Error:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function detectStack(filenames: string[]) {
    if (filenames.includes('package.json')) return { stack: 'Node.js', type: 'web-service' }
    if (filenames.includes('requirements.txt')) return { stack: 'Python', type: 'web-service' }
    if (filenames.includes('go.mod')) return { stack: 'Go', type: 'web-service' }
    return { stack: 'Docker', type: 'web-service' }
}

function generateDockerfile(stack: string) {
    switch (stack) {
        case 'Node.js': return `FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]`
        case 'Python': return `FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["python", "app.py"]`
        default: return null
    }
}

function calculateCost(size: string, stack: string) {
    const basePrices: Record<string, number> = {
        'small': 127,
        'medium': 285,
        'large': 640
    }
    const base = basePrices[size] || 127
    return {
        total: base + 22 + 35 + 2, // Cluster + ALB + NAT + ECR
        resources: [
            { name: "EKS Cluster", cost: base },
            { name: "Application LB", cost: 22 },
            { name: "NAT Gateway", cost: 35 },
            { name: "ECR / Storage", cost: 2 }
        ]
    }
}
