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

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const envId = pathParts.length > 2 ? pathParts[pathParts.length - 1] : null

    if (req.method === 'GET') {
      if (envId) {
        const { data: env, error } = await supabaseAdmin
          .from('projects')
          .select('*')
          .eq('id', envId)
          .eq('org_id', orgId)
          .single()
        
        if (error || !env) {
          return new Response(JSON.stringify({ error: 'Not found' }), { 
              status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
        }
        return new Response(JSON.stringify(env), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        const { data: envs, error } = await supabaseAdmin
          .from('projects')
          .select('*')
          .eq('org_id', orgId)
        
        if (error) throw error
        return new Response(JSON.stringify(envs), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const validationError = validateOrRespond(body, {
          name: { type: 'string', required: true },
          repo_url: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          environment: { type: 'string', required: true },
          size: { type: 'string', required: true },
          cloud_credential_id: { type: 'uuid', required: true }
      }, corsHeaders)
      if (validationError) return validationError

      const { name, repo_url, branch, environment, size, cloud_credential_id, env_vars, secret_env_vars } = body
      
      const { data: created, error } = await supabaseAdmin.from('projects').insert({
        org_id: orgId,
        name,
        repo_url,
        provisioning_status: 'live', // Simplified for Terraform mock
        live_url: `https://${name}.autostack.io`,
        config: { branch, environment, size, cloud_credential_id, env_vars, secret_env_vars }
      }).select().single()

      if (error) throw error
      return new Response(JSON.stringify(created), { 
          status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    if (req.method === 'DELETE') {
      if (!envId) {
          return new Response(JSON.stringify({ error: 'Missing environment ID' }), { 
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
      }
      
      const { error } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', envId)
        .eq('org_id', orgId)
      
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (error: any) {
    console.error(`[api-environments] Error:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
