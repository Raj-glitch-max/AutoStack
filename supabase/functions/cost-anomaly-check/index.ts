import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CostDataPoint {
  date: string
  amount: number
  environment: string
}

interface AnomalyResult {
  anomaly: boolean
  critical?: boolean
  current_amount?: number
  expected_amount?: number
  deviation_pct?: number
  z_score?: number
  direction?: 'spike' | 'drop'
}

function detectAnomaly(
  history: CostDataPoint[],
  current: CostDataPoint
): AnomalyResult {
  if (history.length < 7) {
    // Need at least 7 days of history for meaningful baseline
    return { anomaly: false }
  }

  // Calculate baseline from last 30 days
  const amounts = history.map(h => h.amount)
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const stdDev = Math.sqrt(
    amounts.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / amounts.length
  )

  // Avoid division by zero
  if (stdDev === 0) {
    return { anomaly: false }
  }

  // Z-score of current vs baseline
  const zScore = (current.amount - mean) / stdDev

  // Thresholds (RULE W1: environment-aware)
  // |z| > 2.0: warning (unusual, might be expected growth)
  // |z| > 3.0: critical (definitely anomalous)
  const isAnomaly = Math.abs(zScore) > 2.0
  const isCritical = Math.abs(zScore) > 3.0

  if (!isAnomaly) return { anomaly: false }

  return {
    anomaly: true,
    critical: isCritical,
    current_amount: current.amount,
    expected_amount: Math.round(mean * 100) / 100,
    deviation_pct: Math.round((current.amount - mean) / mean * 100),
    z_score: Math.round(zScore * 100) / 100,
    direction: current.amount > mean ? 'spike' : 'drop'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get all organizations
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')

    if (!orgs) {
      return new Response('No organizations found', { status: 404 })
    }

    const anomalies = []

    for (const org of orgs) {
      // Get all projects for this org
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, estimated_monthly_cost, environment_type')
        .eq('org_id', org.id)
        .eq('provisioning_status', 'live')

      if (!projects || projects.length === 0) continue

      for (const project of projects) {
        // Get 30-day cost history
        const { data: history } = await supabase
          .from('org_usage')
          .select('date, total_cost')
          .eq('org_id', org.id)
          .eq('project_id', project.id)
          .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
          .order('date', { ascending: false })

        if (!history || history.length < 7) continue

        const historyPoints: CostDataPoint[] = history.map(h => ({
          date: h.date,
          amount: h.total_cost,
          environment: project.name
        }))

        // Current day's cost (projected from estimated_monthly_cost)
        const currentDailyCost = (project.estimated_monthly_cost || 0) / 30
        const current: CostDataPoint = {
          date: new Date().toISOString().split('T')[0],
          amount: currentDailyCost,
          environment: project.name
        }

        const result = detectAnomaly(historyPoints, current)

        if (result.anomaly) {
          anomalies.push({
            org_id: org.id,
            org_name: org.name,
            project_id: project.id,
            project_name: project.name,
            environment_type: project.environment_type,
            ...result
          })

          // Send notification
          const { data: owner } = await supabase
            .from('org_members')
            .select('user_id')
            .eq('org_id', org.id)
            .eq('role', 'owner')
            .single()

          if (owner) {
            const { data: user } = await supabase.auth.admin.getUserById(owner.user_id)
            if (user?.user) {
              await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('NOTIFICATION_SECRET')}`
                },
                body: JSON.stringify({
                  type: 'cost_anomaly',
                  org_id: org.id,
                  recipient_email: user.user.email,
                  recipient_name: user.user.user_metadata?.full_name || 'Owner',
                  payload: {
                    project_name: project.name,
                    environment_type: project.environment_type,
                    current_amount: result.current_amount,
                    expected_amount: result.expected_amount,
                    deviation_pct: result.deviation_pct,
                    direction: result.direction,
                    critical: result.critical,
                    dashboard_url: `${Deno.env.get('APP_URL')}/dashboard?tab=cost`
                  }
                })
              })
            }
          }
        }
      }
    }

    console.log(`[Cost Anomaly Check] Found ${anomalies.length} anomalies`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        anomalies_found: anomalies.length,
        anomalies 
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[Cost Anomaly Check] Error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
