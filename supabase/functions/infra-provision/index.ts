import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, corsResponse, errorResponse, jsonResponse } from "../_shared/cors.ts"
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts"
import { Redis } from 'https://esm.sh/@upstash/redis@1'
import { validateOrRespond } from '../_shared/validator.ts'
import { logAudit } from '../_shared/audit.ts'

console.log("[Infra] Function initialized");

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    console.log("[Infra] Request received");

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Authentication
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    const isServiceRole = authHeader === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    let user = null
    if (!isServiceRole) {
      const { data: authData, error: authError } = await supabase.auth.getUser(authHeader)
      if (authError || !authData.user) return errorResponse(401, 'Unauthorized')
      user = authData.user
    }

    const body = await req.json()
    console.log("[Infra] Auth passed", { user_id: user?.id || 'service-role' });

    // 2. Validation
    const validationError = validateOrRespond(body, {
        project_id: { type: 'uuid', required: false },
        repo_url: { type: 'string', required: false },
        environment_type: { type: 'string', enum: ['production', 'preview', 'staging'], default: 'production' }
    }, CORS_HEADERS)
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
    const redis = new Redis({
      url: Deno.env.get('UPSTASH_REDIS_REST_URL') || '',
      token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '',
    })
    const { pass, resetIn } = await checkRateLimit(redis, 'infra-provision', user?.id || 'service-role')
    if (!pass) return rateLimitResponse('infra-provision', resetIn, CORS_HEADERS)

    // Ensure we have an org_id if not service role (or if provided in body)
    const org_id = body.org_id || user?.user_metadata?.org_id
    if (!org_id && !isServiceRole) return errorResponse(400, 'Missing organization context')

    console.log(`[Infra] Provisioning [${environment_type}] for ${repo_url || project_id}`)

    // 4. Resolve or Create Project
    let finalProjectId = project_id
    if (!finalProjectId && repo_url) {
        console.log("[Infra] Creating new project for preview");
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

        if (projectErr) {
            console.error("[Infra] Project creation failed:", projectErr);
            throw projectErr;
        }
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
        console.log("[Infra] Creating new deployment entry", { finalProjectId });
        const { data: project } = await supabase.from('projects').select('cluster_id, org_id').eq('id', finalProjectId).single()
        const { data: newDeployment, error: deployErr } = await supabase.from('deployments').insert({
            project_id: finalProjectId,
            cluster_id: project?.cluster_id,
            status: 'in_progress',
            stage: 'provisioning',
            commit_sha: 'test-sha',
            branch: branch || 'main',
            triggered_by: environment_type === 'preview' ? 'github_pr' : 'api'
        }).select().single()

        if (deployErr) {
            console.error('[Infra] Deployment creation failed:', deployErr)
            throw deployErr
        }
        finalDeploymentId = newDeployment.id
    }

    // 6. Infrastructure Logic: Dispatching to GitHub Action Engine
    console.log("[Infra] Dispatching to GitHub Engine...");

    // Get the Cloud Credential (Role ARN) for this Org
    const { data: creds } = await supabase.from('cloud_credentials')
        .select('role_arn, region')
        .eq('org_id', user.user_metadata?.org_id)
        .eq('provider', 'aws')
        .single()

    if (!creds?.role_arn) {
        throw new Error("No AWS cloud credentials found for this organization. connect cloud first.")
    }

    const GITHUB_PAT = Deno.env.get('GITHUB_PAT')
    const ENGINE_REPO = "raj-glitch-max/AutoStack" // The repo where the engine workflow lives

    const dispatchRes = await fetch(`https://api.github.com/repos/${ENGINE_REPO}/dispatches`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GITHUB_PAT}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            event_type: 'provision-infra',
            client_payload: {
                project_id: finalProjectId,
                deployment_id: finalDeploymentId,
                role_arn: creds.role_arn,
                region: creds.region || 'us-east-1',
                org_id: org_id,
                supabase_url: Deno.env.get('SUPABASE_URL'),
                supabase_anon_key: Deno.env.get('SUPABASE_ANON_KEY'),
                token: authHeader
            }
        })
    })

    if (!dispatchRes.ok) {
        const errorText = await dispatchRes.text()
        console.error(`[Infra] GitHub Dispatch failed: ${dispatchRes.status} - ${errorText}`)
        throw new Error(`Engine dispatch failed: ${dispatchRes.statusText}`)
    }

    console.log("[Infra] Engine dispatched successfully");

    return jsonResponse({
        success: true,
        message: 'Infrastructure provisioning dispatched',
        project_id: finalProjectId,
        deployment_id: finalDeploymentId,
        engine_status: 'dispatched'
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error(`[Infra] Provisioning failed:`, error.message)
    return errorResponse(500, error.message)
  }
})
