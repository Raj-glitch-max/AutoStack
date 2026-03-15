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
    const domainId = pathParts.length > 2 ? pathParts[pathParts.length - 1] : null

    if (req.method === 'GET') {
      if (domainId) {
        const { data: domain, error } = await supabaseAdmin
          .from('custom_domains')
          .select('*')
          .eq('id', domainId)
          .eq('org_id', orgId)
          .single()
        
        if (error || !domain) {
          return new Response(JSON.stringify({ error: 'Not found' }), { 
              status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
        }
        return new Response(JSON.stringify(domain), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        const { data: domains, error } = await supabaseAdmin
          .from('custom_domains')
          .select('*')
          .eq('org_id', orgId)
        
        if (error) throw error
        return new Response(JSON.stringify(domains), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const validationError = validateOrRespond(body, {
          environment_id: { type: 'uuid', required: true },
          domain: { type: 'string', required: true }
      }, corsHeaders)
      if (validationError) return validationError

      const { environment_id, domain } = body
      
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
        .from('custom_domains')
        .insert({
          org_id: orgId,
          environment_id,
          domain,
          status: 'pending_validation',
          validation_records: [
            { type: 'CNAME', name: domain, value: `${environment_id}.autostack.io` }
          ]
        })
        .select()
        .single()

      if (error) throw error
      return new Response(JSON.stringify(created), { 
          status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    if (req.method === 'DELETE') {
      if (!domainId) {
          return new Response(JSON.stringify({ error: 'Missing domain ID' }), { 
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
      }
      
      const { error } = await supabaseAdmin
        .from('custom_domains')
        .delete()
        .eq('id', domainId)
        .eq('org_id', orgId)
      
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (error: any) {
    console.error(`[api-domains] Error:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
