import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return errorResponse(401, 'Unauthorized')
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) {
        return errorResponse(401, 'Unauthorized')
    }

    const orgId = user.user_metadata?.org_id
    if (!orgId) {
        return errorResponse(401, 'Unauthorized: Org context missing')
    }

    const body = await req.json()
    const validationError = validateOrRespond(body, {
        name: { type: 'string', required: true },
        provider: { type: 'string', required: true },
        region: { type: 'string', required: true }
    }, CORS_HEADERS)
    if (validationError) return validationError

    const { name, provider, region } = body

    // Generate Agent Token
    const agentToken = `as_${crypto.randomUUID().replace(/-/g, '')}`

    // Create Cluster
    const { data: cluster, error: clusterErr } = await supabaseAdmin
      .from('clusters')
      .insert({
        org_id: orgId,
        name,
        provider,
        region,
        agent_token: agentToken,
        agent_status: 'pending',
        health_score: 100
      })
      .select()
      .single()

    if (clusterErr) throw clusterErr

    const helmCommand = `helm upgrade --install autostack-agent oci://ghcr.io/raj-glitch-max/autostack-agent \\
  --namespace autostack --create-namespace \\
  --set agent.token=${agentToken} \\
  --set clusterId=${cluster.id} \\
  --set controlPlane.url=${supabaseUrl}/functions/v1`

    return jsonResponse({ 
      cluster_id: cluster.id,
      command: helmCommand 
    })

  } catch (err: any) {
    console.error(`[Connect] Error:`, err.message)
    return errorResponse(400, err.message)
  }
})
