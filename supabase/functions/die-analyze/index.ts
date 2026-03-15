import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getInstallationToken } from '../_shared/github.ts'
import { CORS_HEADERS, corsResponse, errorResponse, jsonResponse } from "../_shared/cors.ts"
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts"
import { Redis } from 'https://esm.sh/@upstash/redis@1'
import { validateOrRespond } from '../_shared/validator.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const redis = new Redis({
      url: Deno.env.get('UPSTASH_REDIS_REST_URL') || '',
      token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '',
    })

    // 1. Authentication
    const authHeader = req.headers.get('Authorization')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader?.replace('Bearer ', '') || '')
    
    if (authError || !user) return errorResponse(401, 'Unauthorized')

    const body = await req.json()

    // 2. Validation
    const validationError = validateOrRespond(body, {
      project_id: { type: 'uuid', required: true },
      installation_id: { type: 'string', required: true },
      size: { type: 'string', enum: ['small', 'medium', 'large'], default: 'small' }
    }, CORS_HEADERS)
    if (validationError) return validationError

    const { project_id, installation_id, size } = body

    // 3. Rate Limiting
    const { pass, resetIn } = await checkRateLimit(redis, 'die-analyze', user.id)
    if (!pass) return rateLimitResponse('die-analyze', resetIn, CORS_HEADERS)

    // 4. Stage 1: Repo Analysis
    const { data: project, error: projectErr } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()

    if (projectErr || !project) return errorResponse(404, "Project not found")
    if (project.org_id !== user.user_metadata?.org_id) {
       return errorResponse(403, 'Forbidden: Project belongs to another organization')
    }

    await supabaseClient.from('projects').update({ analysis_status: 'analyzing' }).eq('id', project_id)
    
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
    
    const stack = detection.stack
    const cost = costPlan.total
    const infra_plan_json = {
        size,
        resources: costPlan.resources,
        dockerfile: generatedDockerfile ? 'generated' : 'existing'
    }

    await supabaseClient.from('projects').update({ 
        analysis_status: 'planning',
        stack: stack,
        estimated_monthly_cost: cost,
        infra_plan_json: infra_plan_json
    }).eq('id', project_id)

    // 6. Create Deployment Record
    const { data: deployment, error: deployErr } = await supabaseClient.from('deployments').insert({
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

    return jsonResponse({
      success: true,
      deployment_id: deployment.id,
      stack,
      estimated_cost: cost,
      infra_plan_json
    })

  } catch (error) {
    console.error('Analysis error:', error)
    return errorResponse(400, (error as Error).message)
  }
})

function detectStack(filenames: string[]) {
    // Priority order for stack detection
    if (filenames.includes('package.json')) return { stack: 'Node.js', type: 'web-service' }
    if (filenames.includes('requirements.txt') || filenames.includes('pyproject.toml')) return { stack: 'Python', type: 'web-service' }
    if (filenames.includes('go.mod')) return { stack: 'Go', type: 'web-service' }
    if (filenames.includes('pom.xml') || filenames.includes('build.gradle')) return { stack: 'Java', type: 'web-service' }
    if (filenames.includes('Cargo.toml')) return { stack: 'Rust', type: 'web-service' }
    if (filenames.includes('Dockerfile')) return { stack: 'Docker', type: 'web-service' }
    
    return { stack: 'Other', type: 'web-service' }
}

function generateDockerfile(stack: string) {
    switch (stack) {
        case 'Node.js': 
            return `FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --production\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]`
        case 'Python': 
            return `FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["python", "app.py"]`
        case 'Go':
            return `FROM golang:1.21-alpine AS builder\nWORKDIR /app\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN go build -o main .\nFROM alpine:latest\nWORKDIR /root/\nCOPY --from=builder /app/main .\nEXPOSE 8080\nCMD ["./main"]`
        default: 
            return null
    }
}

function calculateCost(size: string, stack: string) {
    // Prices based on the Manifesto Part 1 Onboarding Step 2
    const config: Record<string, { base: number, vcpu: string, ram: string, nodes: number }> = {
        'small':  { base: 127, vcpu: '2', ram: '4GB',  nodes: 2 },
        'medium': { base: 285, vcpu: '4', ram: '16GB', nodes: 3 },
        'large':  { base: 640, vcpu: '8', ram: '32GB', nodes: 5 }
    }
    
    const selected = config[size] || config.small
    const clusterCost = selected.base
    const albCost = 22
    const natCost = 35
    const ecrCost = 2 // Small amount for storage
    
    return {
        total: clusterCost + albCost + natCost + ecrCost,
        resources: [
            { name: `EKS Cluster (${selected.nodes} × t3.${selected.base === 127 ? 'medium' : 'large'})`, cost: clusterCost },
            { name: "Application Load Balancer", cost: albCost },
            { name: "NAT Gateway", cost: natCost },
            { name: "ECR / Image Storage", cost: ecrCost }
        ],
        specs: {
            vcpu: selected.vcpu,
            ram: selected.ram,
            nodes: selected.nodes
        }
    }
}
