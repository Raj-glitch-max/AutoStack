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
    const dbId = pathParts.length > 2 ? pathParts[pathParts.length - 1] : null

    if (req.method === 'GET') {
      if (dbId) {
        const { data: db, error } = await supabaseAdmin
          .from('managed_databases')
          .select('*')
          .eq('id', dbId)
          .eq('org_id', orgId)
          .single()
        
        if (error || !db) {
          return new Response(JSON.stringify({ error: 'Not found' }), { 
              status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
        }
        return new Response(JSON.stringify(db), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        const { data: dbs, error } = await supabaseAdmin
          .from('managed_databases')
          .select('*')
          .eq('org_id', orgId)
        
        if (error) throw error
        return new Response(JSON.stringify(dbs), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const validationError = validateOrRespond(body, {
          environment_id: { type: 'uuid', required: true },
          engine: { type: 'string', required: true },
          engine_version: { type: 'string', required: true },
          size: { type: 'string', required: true },
          name: { type: 'string', required: true }
      }, corsHeaders)
      if (validationError) return validationError

      const { environment_id, engine, engine_version, size, name } = body
      
      // Verify environment (project) belongs to org
      const { data: env, error: envErr } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('id', environment_id)
        .eq('org_id', orgId)
        .single()
      
      if (envErr || !env) {
        return new Response(JSON.stringify({ error: 'Environment not found' }), { 
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }

      const { data: created, error } = await supabaseAdmin
        .from('managed_databases')
        .insert({
          org_id: orgId,
          environment_id,
          engine,
          engine_version,
          size,
          name,
          status: 'provisioning',
          connection_string: `${engine}://user:pass@${name}.autostack.io:5432/${name}` // Mock template
        })
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify(created), { 
          status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    if (req.method === 'DELETE') {
      if (!dbId) {
          return new Response(JSON.stringify({ error: 'Missing database ID' }), { 
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
      }
      
      const { error } = await supabaseAdmin
        .from('managed_databases')
        .delete()
        .eq('id', dbId)
        .eq('org_id', orgId)
      
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (error: any) {
    console.error(`[api-databases] Error:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
