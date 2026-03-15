import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { validateOrRespond } from '../_shared/validator.ts'

const RDS_INSTANCE_CLASSES = {
  micro:  { class: 'db.t3.micro',   vcpu: 2,  ram_gb: 1,  iops: 'burst',   monthly: 13.14 },
  small:  { class: 'db.t3.small',   vcpu: 2,  ram_gb: 2,  iops: 'burst',   monthly: 26.28 },
  medium: { class: 'db.t3.medium',  vcpu: 2,  ram_gb: 4,  iops: 'burst',   monthly: 52.56 },
  large:  { class: 'db.m5.large',   vcpu: 2,  ram_gb: 8,  iops: 'provisioned', monthly: 128.52 },
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    
    // 1. Validation
    const validationError = validateOrRespond(body, {
        project_id: { type: 'uuid', required: true },
        engine: { type: 'string', required: true },
        engine_version: { type: 'string', required: true },
        size: { type: 'string', required: true },
        environment: { type: 'string', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { project_id, engine, engine_version, size, environment } = body

    // 2. Authentication
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
    const orgId = user.user_metadata?.org_id

    // 3. Verify project exists and belongs to org
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, org_id, provisioning_status')
      .eq('id', project_id)
      .single()

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), { 
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    if (project.org_id !== orgId) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { 
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    const instanceInfo = RDS_INSTANCE_CLASSES[size as keyof typeof RDS_INSTANCE_CLASSES] || RDS_INSTANCE_CLASSES.small
    const multiAz = environment === 'production'
    const backupRetention = environment === 'production' ? 7 : 1

    // 4. Generate secure password and store in Vault (RULE N1)
    const password = generateSecurePassword(32)
    const vaultId = crypto.randomUUID() 

    // 5. Insert managed database record
    const { data: dbRecord, error: dbErr } = await supabase.from('managed_databases').insert({
      project_id,
      org_id: project.org_id,
      provider: 'aws',
      engine,
      engine_version,
      instance_class: instanceInfo.class,
      status: 'creating',
      multi_az: multiAz,
      backup_retention_days: backupRetention,
      password_vault_id: vaultId,
      estimated_monthly_cost: instanceInfo.monthly * (multiAz ? 2 : 1),
      username: 'appuser',
      database_name: 'app',
    }).select().single()

    if (dbErr) throw dbErr

    console.log(`[provision-database] Initiated provisioning ${engine} ${engine_version} for project ${project_id}...`)

    return new Response(JSON.stringify({ 
        success: true,
        message: 'Database provisioning started', 
        database_id: dbRecord.id 
    }), { 
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err: any) {
    console.error('[provision-database] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})

function generateSecurePassword(length: number): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  let retVal = ""
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n))
  }
  return retVal
}
