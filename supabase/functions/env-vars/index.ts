import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'
import { logAudit } from '../_shared/audit.ts'

const ENV_VAR_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

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
    const { action, project_id } = body

    if (!project_id || !action) {
      return new Response(JSON.stringify({ error: 'project_id and action are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify project belongs to org
    const { data: project, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('org_id')
      .eq('id', project_id)
      .eq('org_id', orgId)
      .single()

    if (projErr || !project) {
        return new Response(JSON.stringify({ error: 'Project not found or unauthorized' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    switch (action) {
      case 'list':
        return await listEnvVars(supabaseAdmin, project_id)

      case 'set':
        return await setEnvVar(supabaseAdmin, body, req, orgId)

      case 'delete':
        return await deleteEnvVar(supabaseAdmin, body, req, orgId)

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
  } catch (error: any) {
    console.error('[env-vars] Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function listEnvVars(supabase: any, projectId: string): Promise<Response> {
  const { data, error } = await supabase
    .from('project_env_vars')
    .select('id, project_id, key, is_secret, created_at')
    .eq('project_id', projectId)
    .order('key')

  if (error) throw error

  const result = await Promise.all(
    (data ?? []).map(async (row: any) => {
      if (row.is_secret) {
        return { ...row, value: null, masked: true }
      }
      const { data: full } = await supabase
        .from('project_env_vars')
        .select('value')
        .eq('id', row.id)
        .single()
      return { ...row, value: full?.value ?? '', masked: false }
    })
  )

  return new Response(JSON.stringify({ env_vars: result }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function setEnvVar(supabase: any, body: any, req: Request, orgId: string): Promise<Response> {
  const { project_id, key, value, is_secret } = body

  if (!key || !ENV_VAR_KEY_PATTERN.test(key)) {
    return new Response(JSON.stringify({ error: 'Key must be uppercase letters, numbers, and underscores (e.g., DATABASE_URL)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (key.length > 255) {
    return new Response(JSON.stringify({ error: 'Key must be at most 255 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let vaultId: string | null = null
  let storedValue: string | null = value

  if (is_secret && value) {
    const { data: secret, error: vaultErr } = await supabase
      .rpc('vault_create_secret', {
        new_secret: value,
        new_name: `${project_id}:${key}`,
      })

    if (vaultErr) {
      console.error('[env-vars] Vault error:', vaultErr)
      return new Response(JSON.stringify({ error: 'Failed to store secret in vault' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    vaultId = secret
    storedValue = null
  }

  if (!is_secret) {
    const { data: existing } = await supabase
      .from('project_env_vars')
      .select('vault_id')
      .eq('project_id', project_id)
      .eq('key', key)
      .maybeSingle()

    if (existing?.vault_id) {
      await supabase.rpc('vault_delete_secret', { secret_id: existing.vault_id })
    }
  }

  const { error: upsertErr } = await supabase
    .from('project_env_vars')
    .upsert(
      {
        project_id,
        key,
        value: storedValue,
        vault_id: vaultId,
        is_secret: !!is_secret,
      },
      { onConflict: 'project_id,key' }
    )

  if (upsertErr) throw upsertErr

  await logAudit(req, {
    org_id: orgId,
    action: 'infra.provision',
    target_type: 'project',
    target_id: project_id,
    payload: { env_var_key: key, is_secret: !!is_secret, operation: 'set' },
  })

  return new Response(
    JSON.stringify({ success: true, key, is_secret: !!is_secret }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function deleteEnvVar(supabase: any, body: any, req: Request, orgId: string): Promise<Response> {
  const { project_id, key } = body

  if (!key) {
      return new Response(JSON.stringify({ error: 'key is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
  }

  const { data: existing } = await supabase
    .from('project_env_vars')
    .select('vault_id')
    .eq('project_id', project_id)
    .eq('key', key)
    .maybeSingle()

  if (existing?.vault_id) {
    await supabase.rpc('vault_delete_secret', { secret_id: existing.vault_id })
  }

  const { error } = await supabase
    .from('project_env_vars')
    .delete()
    .eq('project_id', project_id)
    .eq('key', key)

  if (error) throw error

  await logAudit(req, {
    org_id: orgId,
    action: 'infra.provision',
    target_type: 'project',
    target_id: project_id,
    payload: { env_var_key: key, operation: 'delete' },
  })

  return new Response(
    JSON.stringify({ success: true, key, deleted: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
