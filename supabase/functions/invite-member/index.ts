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

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !caller) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const body = await req.json()
    const validationError = validateOrRespond(body, {
        email: { type: 'string', required: true },
        role: { type: 'string', required: true, enum: ['owner', 'admin', 'member', 'viewer'] },
        org_id: { type: 'uuid', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const { email, role, org_id } = body

    // Verify Caller is Admin/Owner
    const { data: membership } = await supabaseAdmin
      .from('org_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', caller.id)
      .single()
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return new Response(JSON.stringify({ error: 'Forbidden: Insufficient permissions' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const inviteToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { error: invErr } = await supabaseAdmin
      .from('invitations')
      .insert({
        org_id,
        email,
        role,
        token: inviteToken,
        invited_by: caller.id,
        expires_at: expiresAt.toISOString()
      })

    if (invErr) throw invErr

    const { data: org } = await supabaseAdmin.from('organizations').select('name').eq('id', org_id).single()
    
    // Trigger Notification asynchronously
    fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('NOTIFICATION_SECRET')}`
      },
      body: JSON.stringify({
        type: 'invite_member',
        org_id,
        recipient_email: email,
        recipient_name: 'Team Member',
        payload: {
          org_name: org?.name || 'AutoStack Org',
          role,
          token: inviteToken
        }
      })
    }).catch(err => console.error('[Invite] Notification trigger failed:', err))

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err: any) {
    console.error(`[Invite] Error:`, err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
