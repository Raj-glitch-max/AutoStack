import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // 1. Auth Check (Internal Secret)
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const isInternal = token === Deno.env.get('INTERNAL_SECRET') || token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!isInternal) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[Weekly Digest] Starting global digest generation...`);

    // 2. Fetch all active organizations
    const { data: orgs } = await supabase.from('organizations').select('id, name')
    
    const results = []

    for (const org of orgs || []) {
      // 3. Aggregate Stats for the last 7 days
      const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString()
      
      // Cost Stats
      const { data: usage } = await supabase
        .from('org_usage')
        .select('total_cost')
        .eq('org_id', org.id)
        .gte('date', lastWeek.split('T')[0])
      
      const totalCost = usage?.reduce((sum, u) => sum + u.total_cost, 0) || 0

      // Incident Stats
      const { count: incidentCount } = await supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .gte('created_at', lastWeek)

      // Cluster Health
      const { data: clusters } = await supabase
        .from('clusters')
        .select('name, health_score')
        .eq('org_id', org.id)

      const avgHealth = clusters?.length 
        ? Math.round(clusters.reduce((sum, c) => sum + (c.health_score || 0), 0) / clusters.length)
        : 100

      // 4. Fetch Owner
      const { data: owner } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', org.id)
        .eq('role', 'owner')
        .single()

      if (owner) {
        const { data: userRecord } = await supabase.auth.admin.getUserById(owner.user_id)
        if (userRecord?.user) {
          // 5. Trigger Notification
          const notificationRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'weekly_digest',
              org_id: org.id,
              recipient_email: userRecord.user.email,
              recipient_name: userRecord.user.user_metadata?.full_name || 'Owner',
              payload: {
                org_name: org.name,
                total_cost: totalCost,
                incident_count: incidentCount,
                avg_health: avgHealth,
                cluster_count: clusters?.length || 0,
                dashboard_url: `${Deno.env.get('APP_URL')}/dashboard`
              }
            })
          })
          results.push({ org_id: org.id, status: notificationRes.status })
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, details: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error(`[Weekly Digest] Error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
