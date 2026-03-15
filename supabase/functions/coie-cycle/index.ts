import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { rateLimitCheck, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { validateOrRespond } from '../_shared/validator.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

interface Check {
  id: string;
  dimension: 'security' | 'reliability' | 'cost' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  maxDeduction: number;
  title: string;
  description: string;
  remediation: string;
}

const CHECKS: Check[] = [
  {
    id: 'UNUSED_NAT_GATEWAY',
    dimension: 'cost',
    severity: 'high',
    maxDeduction: 20,
    title: 'Unused NAT Gateway',
    description: 'NAT Gateway is active but processing zero traffic, incurring unnecessary hourly costs.',
    remediation: 'Migrate to VPC Endpoints or remove the NAT Gateway if internet access is not required by private nodes.'
  },
  {
    id: 'UNATTACHED_EBS_VOLUME',
    dimension: 'cost',
    severity: 'medium',
    maxDeduction: 15,
    title: 'Unattached EBS Volume',
    description: 'EBS volume is not attached to any EC2 instance but is still being charged for storage capacity.',
    remediation: 'Snapshot and delete the volume to stop storage billing.'
  },
  {
    id: 'UNDERUTILIZED_EC2',
    dimension: 'cost',
    severity: 'medium',
    maxDeduction: 25,
    title: 'Underutilized EC2 Instances',
    description: 'EKS worker nodes are consistently below 10% CPU utilization.',
    remediation: 'Downsize to a smaller instance type or consolidate workloads to fewer nodes.'
  },
  {
    id: 'IAM_PERMISSION_DRIFT',
    dimension: 'security',
    severity: 'high',
    maxDeduction: 20,
    title: 'IAM Permission Drift',
    description: 'The AutoStackRole has permissions beyond the required least-privilege set.',
    remediation: 'Apply the latest AutoStack-Managed-Policy to the IAM role.'
  }
];

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    
    // 2. Auth Check (Internal Secret or JWT)
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const isInternal = token === Deno.env.get('INTERNAL_SECRET')

    if (!isInternal && token) {
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
        if (authErr || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
    } else if (!isInternal) {
         return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
    }

    const { cluster_id, trigger } = body
    
    // 1. Validation & Multi-Cluster Handling
    if (!cluster_id && trigger === 'scheduled') {
      console.log(`[COIE] Scheduled global sweep started`);
      const { data: clusters } = await supabase.from('clusters').select('id')
      
      const results = []
      for (const c of clusters || []) {
        // Trigger individual cycle via internal call
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/coie-cycle`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cluster_id: c.id, trigger: 'scheduled_sweep' })
        })
        results.push({ cluster_id: c.id, status: res.status })
      }
      
      return new Response(JSON.stringify({ success: true, processed: results.length, details: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Rate Limiting
    const redis = createRedisClient()
    const rl = await rateLimitCheck(redis, 'coie-cycle', cluster_id)
    if (!rl.pass) return rateLimitResponse('coie-cycle', rl.resetIn, corsHeaders)

    console.log(`[COIE] Starting cycle for cluster ${cluster_id} (Trigger: ${trigger || 'manual'})`);

    // 4. Fetch Cluster & Projects
    const { data: cluster, error: clusterErr } = await supabase.from('clusters').select('*').eq('id', cluster_id).single()
    if (clusterErr || !cluster) throw new Error('Cluster not found');

    const { data: projects } = await supabase.from('projects').select('*').eq('cluster_id', cluster_id)

    // 5. Evaluate Scores (Heuristic / Simulated)
    let securityDeduction = 0;
    let reliabilityDeduction = 0;
    let costDeduction = 0;
    let perfDeduction = 0;

    if (cluster.agent_status !== 'healthy') {
        reliabilityDeduction += 30;
    }

    const projectCount = projects?.length || 0;
    securityDeduction = Math.min(60, projectCount * 5);
    costDeduction = Math.min(40, projectCount * 4);

    const securityScore = Math.max(0, 100 - securityDeduction);
    const reliabilityScore = Math.max(0, 100 - reliabilityDeduction);
    const costScore = Math.max(0, 100 - costDeduction);
    const perfScore = 95;

    const healthScore = Math.round(
      securityScore * 0.35 +
      reliabilityScore * 0.30 +
      costScore * 0.20 +
      perfScore * 0.15
    )

    // 6. Update Cluster
    await supabase.from('clusters').update({
      health_score: healthScore,
      score_security: securityScore,
      score_reliability: reliabilityScore,
      score_cost: costScore,
      score_performance: perfScore,
      score_updated_at: new Date().toISOString()
    }).eq('id', cluster_id)

    // 7. Insert Time-series
    await supabase.from('cluster_scores').insert({
      cluster_id,
      health_score: healthScore,
      score_security: securityScore,
      score_reliability: reliabilityScore,
      score_cost: costScore,
      score_performance: perfScore
    })

    // 8. Find & Fix (Cloud Cost Findings)
    if (projectCount > 0 && costScore < 90) {
      const targetProject = projects![0];
      const checkToFail = CHECKS.find(c => ['UNUSED_NAT_GATEWAY', 'UNDERUTILIZED_EC2'].includes(c.id));
      
      if (checkToFail) {
        const { data: finding, error: findErr } = await supabase.from('findings').insert({
          cluster_id,
          project_id: targetProject.id,
          org_id: cluster.org_id,
          check_id: checkToFail.id,
          title: checkToFail.title,
          description: checkToFail.description,
          severity: checkToFail.severity,
          dimension: checkToFail.dimension,
          remediation: checkToFail.remediation,
          status: 'open'
        }).select().single();

        if (finding && !findErr) {
          console.log(`[COIE] Finding created: ${checkToFail.id}. Triggering auto-fix...`);
          
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/coie-fix`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ finding_id: finding.id })
          }).catch(e => console.error("[COIE] coie-fix trigger failed:", e.message))
        }
      }
    }

    console.log(`[COIE] Cycle complete for ${cluster_id}. Score: ${healthScore}`);

    return new Response(JSON.stringify({ success: true, health_score: healthScore }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    console.error(`[COIE] Error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
