import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, jsonResponse, errorResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { user?: { id: string; email: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } }

  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'Invalid JSON body')
  }

  const user = body?.user
  if (!user?.id || !user?.email) {
    return errorResponse(400, 'No user in payload')
  }

  try {
    // Check if org already created for this user (idempotency — RULE B3)
    const { data: existingMember } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (existingMember?.org_id) {
      // Already has an org — just ensure user_metadata is set
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, org_id: existingMember.org_id, role: 'owner' }
      })
      return jsonResponse({ success: true, org_id: existingMember.org_id })
    }

    // Derive org name from email domain or provided metadata
    const orgNameFromMeta = user.user_metadata?.organization_name as string | undefined
    const emailDomain = user.email.split('@')[1]?.split('.')[0] || 'org'
    const orgName = orgNameFromMeta || emailDomain.charAt(0).toUpperCase() + emailDomain.slice(1)
    const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36)

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName, slug: orgSlug, plan: 'free' })
      .select()
      .single()

    if (orgError || !org) {
      throw new Error(`Failed to create org: ${orgError?.message}`)
    }

    // Create org_member record
    console.log(`[auth-hook] Creating member for user ${user.id} in org ${org.id}`)
    const { error: memberError } = await supabase
      .from('org_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

    if (memberError) {
      throw new Error(`Failed to create member: ${memberError.message}`)
    }

    // Associated records with upsert for idempotency
    console.log('[auth-hook] Creating associated records...')
    await supabase.from('notification_prefs').upsert({ user_id: user.id }, { onConflict: 'user_id' })
    await supabase.from('plan_usage').upsert({ org_id: org.id, live_environments: 0, total_nodes: 0 }, { onConflict: 'org_id' })
    await supabase.from('subscriptions').upsert({
      org_id: org.id,
      plan: 'pro',
      status: 'trialing',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'org_id' })

    // CRITICAL: Set org_id in user_metadata — this is what ALL RLS policies use
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        org_id: org.id,
        org_slug: org.slug,
        role: 'owner',
        full_name: user.user_metadata?.full_name || user.email.split('@')[0]
      }
    })

    if (updateError) {
      throw new Error(`Failed to update user metadata: ${updateError.message}`)
    }

    // Send welcome email (non-blocking — don't fail signup if email fails)
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'welcome',
        org_id: org.id,
        recipient_email: user.email,
        recipient_name: user.user_metadata?.full_name || user.email.split('@')[0],
        payload: { org_name: orgName }
      })
    }).catch(err => console.error('Welcome email failed (non-fatal):', err.message))

    return jsonResponse({ success: true, org_id: org.id, org_name: orgName })

  } catch (error: unknown) {
    const err = error as Error
    console.error('auth-hook error:', err.message)
    return errorResponse(500, err.message)
  }
})
