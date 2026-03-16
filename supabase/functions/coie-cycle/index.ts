import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts'

// ---------------------------------------------------------------------------
// Check Definitions — 16 checks across 4 dimensions
// ---------------------------------------------------------------------------

interface Workload {
  name: string
  namespace: string
  kind: string
  replicas: number
  containers: {
    name: string
    image: string
    resources?: {
      requests?: { cpu?: string; memory?: string }
      limits?: { cpu?: string; memory?: string }
    }
    securityContext?: {
      privileged?: boolean
      runAsNonRoot?: boolean
      readOnlyRootFilesystem?: boolean
      allowPrivilegeEscalation?: boolean
    }
    livenessProbe?: unknown
    readinessProbe?: unknown
  }[]
}

interface Inventory {
  workloads: Workload[]
  networkPolicies?: { namespace: string; name: string }[]
  pdbs?: { namespace: string; name: string; minAvailable?: number }[]
  hpas?: { namespace: string; name: string; targetRef: string }[]
}

interface CheckResult {
  failed: boolean
  affectedResources: string[]
  deduction: number
  description: string
}

interface Check {
  id: string
  dimension: 'security' | 'reliability' | 'cost' | 'performance'
  severity: 'critical' | 'high' | 'medium' | 'low'
  maxDeduction: number
  title: string
  remediation: string
  evaluate: (inventory: Inventory) => CheckResult
}

const CHECKS: Check[] = [
  // ---- SECURITY (6 checks) ----
  {
    id: 'PRIVILEGED_CONTAINERS',
    dimension: 'security',
    severity: 'critical',
    maxDeduction: 25,
    title: 'Privileged container detected',
    remediation: 'Remove privileged: true from the container securityContext. Use specific capabilities instead.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => c.securityContext?.privileged === true)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 25, 25), description: `${affected.length} workload(s) running in privileged mode` }
    }
  },
  {
    id: 'MISSING_RESOURCE_LIMITS',
    dimension: 'security',
    severity: 'high',
    maxDeduction: 30,
    title: 'Missing CPU or memory limits',
    remediation: 'Add resources.limits.cpu and resources.limits.memory to all containers.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => !c.resources?.limits?.cpu || !c.resources?.limits?.memory)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 10, 30), description: `${affected.length} workload(s) missing resource limits` }
    }
  },
  {
    id: 'RUN_AS_ROOT',
    dimension: 'security',
    severity: 'high',
    maxDeduction: 20,
    title: 'Container running as root',
    remediation: 'Set runAsNonRoot: true and specify a non-root user in the container securityContext.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => c.securityContext?.runAsNonRoot !== true)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 5, 20), description: `${affected.length} workload(s) not enforcing runAsNonRoot` }
    }
  },
  {
    id: 'WRITABLE_ROOT_FS',
    dimension: 'security',
    severity: 'medium',
    maxDeduction: 10,
    title: 'Writable root filesystem',
    remediation: 'Set readOnlyRootFilesystem: true and use emptyDir volumes for writable paths.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => c.securityContext?.readOnlyRootFilesystem !== true)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 3, 10), description: `${affected.length} workload(s) with writable root filesystem` }
    }
  },
  {
    id: 'PRIVILEGE_ESCALATION',
    dimension: 'security',
    severity: 'high',
    maxDeduction: 15,
    title: 'Privilege escalation allowed',
    remediation: 'Set allowPrivilegeEscalation: false in the container securityContext.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => c.securityContext?.allowPrivilegeEscalation !== false)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 5, 15), description: `${affected.length} workload(s) allowing privilege escalation` }
    }
  },
  {
    id: 'NO_NETWORK_POLICY',
    dimension: 'security',
    severity: 'medium',
    maxDeduction: 15,
    title: 'No NetworkPolicy configured',
    remediation: 'Create NetworkPolicy resources to restrict ingress/egress traffic for each namespace.',
    evaluate: (inv) => {
      const hasPolicies = (inv.networkPolicies || []).length > 0
      return { failed: !hasPolicies, affectedResources: hasPolicies ? [] : ['cluster'], deduction: hasPolicies ? 0 : 15, description: hasPolicies ? '' : 'No NetworkPolicies found in the cluster' }
    }
  },

  // ---- RELIABILITY (4 checks) ----
  {
    id: 'MISSING_LIVENESS_PROBE',
    dimension: 'reliability',
    severity: 'high',
    maxDeduction: 20,
    title: 'Missing liveness probe',
    remediation: 'Add a livenessProbe to detect and restart unresponsive containers.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => !c.livenessProbe)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 7, 20), description: `${affected.length} workload(s) missing liveness probe` }
    }
  },
  {
    id: 'MISSING_READINESS_PROBE',
    dimension: 'reliability',
    severity: 'high',
    maxDeduction: 20,
    title: 'Missing readiness probe',
    remediation: 'Add a readinessProbe so traffic is only sent to pods that are ready.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => !c.readinessProbe)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 7, 20), description: `${affected.length} workload(s) missing readiness probe` }
    }
  },
  {
    id: 'SINGLE_REPLICA',
    dimension: 'reliability',
    severity: 'medium',
    maxDeduction: 15,
    title: 'Single replica deployment',
    remediation: 'Increase replicas to at least 2 for production workloads to ensure availability during rolling updates.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w => w.replicas === 1 && w.kind === 'Deployment')
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 5, 15), description: `${affected.length} deployment(s) running with only 1 replica` }
    }
  },
  {
    id: 'NO_PDB',
    dimension: 'reliability',
    severity: 'medium',
    maxDeduction: 10,
    title: 'No PodDisruptionBudget',
    remediation: 'Create PodDisruptionBudgets for critical workloads to prevent all pods from being evicted simultaneously.',
    evaluate: (inv) => {
      const hasPDBs = (inv.pdbs || []).length > 0
      return { failed: !hasPDBs, affectedResources: hasPDBs ? [] : ['cluster'], deduction: hasPDBs ? 0 : 10, description: hasPDBs ? '' : 'No PodDisruptionBudgets found' }
    }
  },

  // ---- COST (3 checks) ----
  {
    id: 'OVER_PROVISIONED_CPU',
    dimension: 'cost',
    severity: 'medium',
    maxDeduction: 20,
    title: 'Over-provisioned CPU requests',
    remediation: 'Reduce CPU requests to match actual usage. Use VPA recommendations as a guide.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w => {
        return w.containers.some(c => {
          const reqStr = c.resources?.requests?.cpu
          if (!reqStr) return false
          const millis = parseMillicores(reqStr)
          return millis >= 1000 // Requesting 1+ full CPUs is a flag
        })
      })
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 7, 20), description: `${affected.length} workload(s) requesting 1+ CPU cores` }
    }
  },
  {
    id: 'NO_HPA',
    dimension: 'cost',
    severity: 'medium',
    maxDeduction: 15,
    title: 'No HorizontalPodAutoscaler',
    remediation: 'Configure HPA to scale workloads based on CPU/memory usage, avoiding over-provisioning.',
    evaluate: (inv) => {
      const hasHPA = (inv.hpas || []).length > 0
      return { failed: !hasHPA, affectedResources: hasHPA ? [] : ['cluster'], deduction: hasHPA ? 0 : 15, description: hasHPA ? '' : 'No HPA configured — fixed replica count may waste resources' }
    }
  },
  {
    id: 'MISSING_RESOURCE_REQUESTS',
    dimension: 'cost',
    severity: 'high',
    maxDeduction: 20,
    title: 'Missing resource requests',
    remediation: 'Set resources.requests for all containers. Without requests, the scheduler cannot bin-pack efficiently.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => !c.resources?.requests?.cpu && !c.resources?.requests?.memory)
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 8, 20), description: `${affected.length} workload(s) with no resource requests` }
    }
  },

  // ---- PERFORMANCE (3 checks) ----
  {
    id: 'LATEST_IMAGE_TAG',
    dimension: 'performance',
    severity: 'medium',
    maxDeduction: 10,
    title: 'Using :latest image tag',
    remediation: 'Pin container images to a specific version tag for reproducible deployments and cache efficiency.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w =>
        w.containers.some(c => !c.image || c.image.endsWith(':latest') || !c.image.includes(':'))
      )
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 3, 10), description: `${affected.length} workload(s) using :latest or unversioned image tags` }
    }
  },
  {
    id: 'HIGH_RESTART_COUNT',
    dimension: 'performance',
    severity: 'high',
    maxDeduction: 20,
    title: 'Workloads with high restart counts',
    remediation: 'Investigate containers with frequent restarts. Check logs for OOM kills, crash loops, or application errors.',
    evaluate: (_inv) => {
      // This check requires runtime pod status — use from the inventory if available
      return { failed: false, affectedResources: [], deduction: 0, description: 'Restart count data requires runtime metrics from the agent' }
    }
  },
  {
    id: 'MANY_CONTAINERS_PER_POD',
    dimension: 'performance',
    severity: 'low',
    maxDeduction: 5,
    title: 'Pods with many sidecar containers',
    remediation: 'Reduce unnecessary sidecars. Each container adds overhead in scheduling, networking, and resource allocation.',
    evaluate: (inv) => {
      const affected = inv.workloads.filter(w => w.containers.length > 3)
      return { failed: affected.length > 0, affectedResources: affected.map(w => w.name), deduction: Math.min(affected.length * 2, 5), description: `${affected.length} workload(s) with more than 3 containers per pod` }
    }
  }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMillicores(cpu: string): number {
  if (cpu.endsWith('m')) return parseInt(cpu.slice(0, -1), 10)
  return parseFloat(cpu) * 1000
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()

    // Auth: internal secret or JWT
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const isInternal = token === Deno.env.get('INTERNAL_SECRET') ||
                       token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!isInternal && token) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
    } else if (!isInternal) {
      return jsonResponse({ error: 'Unauthorized: Missing token' }, 401)
    }

    const { cluster_id, environment_id, trigger } = body
    const targetId = environment_id || cluster_id

    // Scheduled sweep: process all environments
    if (!targetId && trigger === 'scheduled') {
      console.log('[COIE] Scheduled global sweep started')
      const { data: envs } = await supabase.from('environments').select('id')
      const fallback = await supabase.from('clusters').select('id')
      const targets = envs || fallback.data || []

      const results = []
      for (const t of targets) {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/coie-cycle`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ environment_id: t.id, trigger: 'scheduled_sweep' })
        })
        results.push({ id: t.id, status: res.status })
      }

      return jsonResponse({ success: true, processed: results.length, details: results })
    }

    if (!targetId) {
      return jsonResponse({ error: 'Missing environment_id or cluster_id' }, 400)
    }

    console.log(`[COIE] Starting cycle for ${targetId} (Trigger: ${trigger || 'manual'})`)

    // Fetch inventory from Redis
    const redis = createRedisClient()
    const inventoryRaw = await redis.get<string>(`inventory:${targetId}`)

    if (!inventoryRaw) {
      console.warn(`[COIE] No inventory found in Redis for ${targetId} — skipping cycle (no fake scores)`)
      return jsonResponse({
        success: false,
        reason: 'no_inventory',
        message: 'Workload inventory not available. Agent must be connected and reporting before COIE can score.'
      })
    }

    let inventory: Inventory
    try {
      inventory = typeof inventoryRaw === 'string' ? JSON.parse(inventoryRaw) : inventoryRaw as unknown as Inventory
    } catch {
      console.error(`[COIE] Failed to parse inventory JSON for ${targetId}`)
      return jsonResponse({ error: 'Invalid inventory data in Redis' }, 500)
    }

    // Run all 16 checks
    const failures: { checkId: string; dimension: string; severity: string; title: string; remediation: string; deduction: number; affectedResources: string[]; description: string }[] = []
    const deductions = { security: 0, reliability: 0, cost: 0, performance: 0 }

    for (const check of CHECKS) {
      const result = check.evaluate(inventory)
      if (result.failed) {
        const deduction = Math.min(result.deduction, check.maxDeduction)
        deductions[check.dimension] += deduction
        failures.push({
          checkId: check.id,
          dimension: check.dimension,
          severity: check.severity,
          title: check.title,
          remediation: check.remediation,
          deduction,
          affectedResources: result.affectedResources,
          description: result.description
        })
      }
    }

    const securityScore = Math.max(0, 100 - deductions.security)
    const reliabilityScore = Math.max(0, 100 - deductions.reliability)
    const costScore = Math.max(0, 100 - deductions.cost)
    const performanceScore = Math.max(0, 100 - deductions.performance)
    const healthScore = Math.round(
      securityScore * 0.35 +
      reliabilityScore * 0.30 +
      costScore * 0.20 +
      performanceScore * 0.15
    )

    // MANDATORY WRITE 1: Update environment/cluster scores
    const scoreUpdate = {
      health_score: healthScore,
      score_security: securityScore,
      score_reliability: reliabilityScore,
      score_cost: costScore,
      score_performance: performanceScore,
      score_updated_at: new Date().toISOString()
    }

    // Try environments table first, fall back to clusters
    const { error: envErr } = await supabase.from('environments').update(scoreUpdate).eq('id', targetId)
    if (envErr) {
      await supabase.from('clusters').update(scoreUpdate).eq('id', targetId)
    }

    // MANDATORY WRITE 2: Insert time-series score record
    await supabase.from('cluster_scores').insert({
      environment_id: targetId,
      cluster_id: targetId,
      health_score: healthScore,
      score_security: securityScore,
      score_reliability: reliabilityScore,
      score_cost: costScore,
      score_performance: performanceScore
    })

    // MANDATORY WRITE 3: Insert/update findings with deduplication
    for (const failure of failures) {
      for (const resource of failure.affectedResources) {
        // Dedup: check if open finding already exists for this check + resource
        const { data: existing } = await supabase.from('findings')
          .select('id')
          .eq('environment_id', targetId)
          .eq('check_id', failure.checkId)
          .eq('affected_resource', resource)
          .eq('status', 'open')
          .maybeSingle()

        if (existing) {
          await supabase.from('findings').update({
            last_seen_at: new Date().toISOString()
          }).eq('id', existing.id)
        } else {
          // Fetch org_id for the finding
          const { data: env } = await supabase.from('environments').select('org_id').eq('id', targetId).maybeSingle()
          const { data: cluster } = env ? { data: env } : await supabase.from('clusters').select('org_id').eq('id', targetId).maybeSingle()
          const orgId = cluster?.org_id

          await supabase.from('findings').insert({
            environment_id: targetId,
            cluster_id: targetId,
            org_id: orgId,
            check_id: failure.checkId,
            title: failure.title,
            description: failure.description,
            severity: failure.severity,
            dimension: failure.dimension,
            remediation: failure.remediation,
            affected_resource: resource,
            status: 'open'
          })
        }
      }
    }

    console.log(`[COIE] Cycle complete for ${targetId}. Score: ${healthScore}. Findings: ${failures.length}`)

    // Fire-and-forget notifications
    const criticalFindings = failures.filter(f => f.severity === 'critical')
    if (criticalFindings.length > 0) {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'finding_critical',
          org_id: '',
          cluster_id: targetId,
          recipient_email: '',
          recipient_name: '',
          payload: {
            findings: criticalFindings.map(f => ({ title: f.title, resource: f.affectedResources[0], description: f.description })),
            health_score: healthScore
          }
        })
      }).catch(e => console.error('[COIE] Critical finding notification failed:', e.message))
    }

    return jsonResponse({
      success: true,
      health_score: healthScore,
      scores: { security: securityScore, reliability: reliabilityScore, cost: costScore, performance: performanceScore },
      findings_count: failures.length,
      checks_run: CHECKS.length
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error(`[COIE] Error:`, error.message)
    return jsonResponse({ error: error.message }, 500)
  }
})
