import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const orgId = user.user_metadata?.org_id
    if (!orgId) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Org context missing' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const body = await req.json()
    const validationError = validateOrRespond(body, {
        name: { type: 'string', required: true },
        provider: { type: 'string', required: true },
        region: { type: 'string', required: true }
    }, corsHeaders)
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

    const helmCommand = `helm repo add autostack https://charts.autostack.com
helm upgrade --install autostack-agent autostack/autostack-agent \\
  --namespace autostack --create-namespace \\
  --set agentToken=${agentToken} \\
  --set clusterId=${cluster.id} \\
  --set apiUrl=${supabaseUrl}/functions/v1`

    return new Response(JSON.stringify({ 
      cluster_id: cluster.id,
      command: helmCommand 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error(`[Connect] Error:`, err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
