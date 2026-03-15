import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("[Cost] Function initialized");

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
    return { anomaly: false }
  }

  const amounts = history.map(h => h.amount)
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const stdDev = Math.sqrt(
    amounts.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / amounts.length
  )

  if (stdDev === 0) return { anomaly: false }

  const zScore = (current.amount - mean) / stdDev
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    console.log("[Cost] Request received");
    const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name')
    if (orgErr) throw orgErr

    const anomalies = []

    for (const org of orgs || []) {
      console.log(`[Cost] Checking org: ${org.name} (${org.id})`);
      const { data: projects, error: projErr } = await supabase
        .from('projects')
        .select('id, name, estimated_monthly_cost, environment_type')
        .eq('org_id', org.id)
        .eq('provisioning_status', 'live')

      if (projErr) {
        console.error(`[Cost] Project fetch failed for ${org.id}:`, projErr);
        continue
      }

      for (const project of projects || []) {
        console.log(`[Cost] Checking project: ${project.name}`);
        const { data: history, error: historyErr } = await supabase
          .from('org_usage')
          .select('date, total_cost')
          .eq('org_id', org.id)
          .eq('project_id', project.id)
          .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
          .order('date', { ascending: false })

        if (historyErr) {
          console.warn(`[Cost] History missing or table not found for ${org.id}: ${historyErr.message}`);
          continue
        }

        if (!history || history.length < 7) continue

        const historyPoints: CostDataPoint[] = history.map(h => ({
          date: h.date,
          amount: h.total_cost,
          environment: project.name
        }))

        const currentDailyCost = (project.estimated_monthly_cost || 0) / 30
        const current: CostDataPoint = {
          date: new Date().toISOString().split('T')[0],
          amount: currentDailyCost,
          environment: project.name
        }

        const result = detectAnomaly(historyPoints, current)

        if (result.anomaly) {
          console.log(`[Cost] Anomaly detected for ${project.name}`);
          anomalies.push({ org_id: org.id, org_name: org.name, project_id: project.id, project_name: project.name, ...result })
          
          await supabase.from('cost_anomalies').insert({
              org_id: org.id,
              project_id: project.id,
              current_amount: result.current_amount,
              expected_amount: result.expected_amount,
              deviation_pct: result.deviation_pct,
              z_score: result.z_score,
              direction: result.direction,
              critical: result.critical,
              status: 'detected'
          }).catch(e => console.error("[Cost] Failed to log anomaly:", e))
        }
      }
    }

    console.log(`[Cost] Done. Anomalies found: ${anomalies.length}`);
    return new Response(JSON.stringify({ 
      success: true, 
      anomalies_found: anomalies.length,
      anomalies 
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error(`[Cost] Failed:`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
