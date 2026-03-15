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
    const credId = pathParts.length > 2 ? pathParts[pathParts.length - 1] : null

    if (req.method === 'GET') {
      if (credId) {
        const { data: cred, error } = await supabaseAdmin
          .from('cloud_credentials')
          .select('*')
          .eq('id', credId)
          .eq('org_id', orgId)
          .single()
        
        if (error || !cred) {
          return new Response(JSON.stringify({ error: 'Not found' }), { 
              status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
        }
        return new Response(JSON.stringify(cred), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        const { data: creds, error } = await supabaseAdmin
          .from('cloud_credentials')
          .select('*')
          .eq('org_id', orgId)
        
        if (error) throw error
        return new Response(JSON.stringify(creds), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const validationError = validateOrRespond(body, {
          display_name: { type: 'string', required: true },
          provider: { type: 'string', required: true },
          account_id: { type: 'string', required: true },
          region: { type: 'string', required: true },
          role_arn: { type: 'string', required: true }
      }, corsHeaders)
      if (validationError) return validationError

      const { display_name, provider, account_id, region, role_arn } = body
      
      const { data: created, error } = await supabaseAdmin
        .from('cloud_credentials')
        .insert({
          org_id: orgId,
          display_name,
          provider,
          account_id,
          region,
          role_arn,
          status: 'active'
        })
        .select()
        .single()

      if (error) throw error
      return new Response(JSON.stringify(created), { 
          status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    if (req.method === 'DELETE') {
      if (!credId) {
          return new Response(JSON.stringify({ error: 'Missing credential ID' }), { 
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
      }
      
      // Check if credential is in use
      const { data: projects } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('org_id', orgId)
        .contains('config', { cloud_credential_id: credId })
      
      if (projects && projects.length > 0) {
        return new Response(
          JSON.stringify({ error: 'Credential is in use by active projects' }), 
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabaseAdmin
        .from('cloud_credentials')
        .delete()
        .eq('id', credId)
        .eq('org_id', orgId)
      
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (error: any) {
    console.error(`[api-credentials] Error:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
