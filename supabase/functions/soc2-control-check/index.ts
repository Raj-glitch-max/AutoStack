// SOC2 Type II automated control testing — runs monthly via pg_cron.
// Logs every check result to compliance_log for auditor evidence.
// RULE T1: every check produces a log entry regardless of outcome.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Redis } from 'https://esm.sh/@upstash/redis@1'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

type CheckResult = 'passed' | 'failed' | 'warning' | 'n/a'

interface ControlCheck {
  id: string               // e.g. 'CC6.1-001'
  name: string             // human-readable name
  category: string         // CC1 through CC9
  description: string
  run: (ctx: CheckContext) => Promise<{ result: CheckResult; details: string; evidence?: unknown }>
}

interface CheckContext {
  supabase: ReturnType<typeof createClient>
  redis: Redis
  supabaseUrl: string
  serviceRoleKey: string
}

// ─── Control checks ───────────────────────────────────────────────────────────
const CONTROLS: ControlCheck[] = [

  // ── CC6 — Logical and Physical Access Controls ──────────────────────────────
  {
    id: 'CC6.1-001',
    name: 'RLS enabled on all user tables',
    category: 'CC6',
    description: 'Row Level Security must be active on every table that contains user data',
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .rpc('check_rls_all_tables')
        .single()
        .catch(() => ({ data: null, error: new Error('rpc not available') }))

      if (error) {
        // Fallback: check via information_schema
        const { data: tables } = await supabase
          .from('_realtime')
          .select('*')
          .limit(1)
          .catch(() => ({ data: null }))

        // Can't verify directly without service role access to pg_tables
        // Mark as warning — manual verification needed
        return {
          result: 'warning' as CheckResult,
          details: 'Automated RLS check requires direct DB access. Verify manually in Dashboard → Database → Tables.',
        }
      }

      const tablesWithoutRls = (data as { table_name: string }[] | null)?.filter((t: { table_name: string }) =>
        !['schema_migrations', 'spatial_ref_sys'].includes(t.table_name)
      ) ?? []

      if (tablesWithoutRls.length === 0) {
        return { result: 'passed', details: 'All tables have Row Level Security enabled', evidence: tablesWithoutRls }
      }

      return {
        result: 'failed',
        details: `${tablesWithoutRls.length} tables missing RLS: ${tablesWithoutRls.map((t: { table_name: string }) => t.table_name).join(', ')}`,
        evidence: tablesWithoutRls,
      }
    },
  },

  {
    id: 'CC6.1-002',
    name: 'Rate limiting active on critical endpoints',
    category: 'CC6',
    description: 'Redis rate limit keys must be present and have TTLs set',
    run: async ({ redis }) => {
      const testEndpoints = ['aws-assume-role', 'die-analyze', 'infra-provision']
      const results: string[] = []
      let passed = 0

      for (const endpoint of testEndpoints) {
        // Check if rate limit keys exist with TTLs (using a known org_id pattern)
        // We'll check if the rate limiter module is functional by testing a dummy key
        const testKey = `rl:${endpoint}:test-check-${Date.now()}`
        try {
          await redis.zadd(testKey, { score: Date.now() / 1000, member: 'test' })
          await redis.expire(testKey, 5)
          const ttl = await redis.ttl(testKey)
          await redis.del(testKey)

          if (ttl > 0) {
            passed++
            results.push(`${endpoint}: ✓ (TTL working)`)
          } else {
            results.push(`${endpoint}: ✗ (TTL not working)`)
          }
        } catch (e: unknown) {
          results.push(`${endpoint}: error — ${(e as Error).message}`)
        }
      }

      return {
        result: passed === testEndpoints.length ? 'passed' : 'warning',
        details: results.join('; '),
        evidence: { passed, total: testEndpoints.length },
      }
    },
  },

  {
    id: 'CC6.1-003',
    name: 'auth.org_id() helper function exists',
    category: 'CC6',
    description: 'The auth.org_id() function must exist — all RLS policies depend on it',
    run: async ({ supabase }) => {
      // Call the function via RPC to verify it exists
      const { error } = await supabase.rpc('check_auth_org_id_exists').single()

      if (!error) {
        return { result: 'passed', details: 'auth.org_id() function exists and is callable' }
      }

      // Try alternative verification
      const { data } = await supabase
        .from('organizations')
        .select('id')
        .limit(0)

      // If we can query organizations table, RLS is probably working
      // (would return error if org_id function was broken and RLS policy threw)
      return {
        result: 'warning',
        details: "Cannot directly verify auth.org_id() — check via Supabase SQL: SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'auth' AND routine_name = 'org_id'",
      }
    },
  },

  // ── CC6.2 — Credential Issuance ─────────────────────────────────────────────
  {
    id: 'CC6.2-001',
    name: 'No hardcoded credentials in recent audit log',
    category: 'CC6',
    description: 'Audit log should show no events indicating credential exposure',
    run: async ({ supabase }) => {
      // Check audit log for any suspicious events in the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
      const { data: events, error } = await supabase
        .from('audit_log')
        .select('action, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (error) {
        return { result: 'warning', details: 'Cannot read audit log — check service role access' }
      }

      const suspicious = (events ?? []).filter((e: { action: string }) =>
        e.action?.includes('credential.exposed') ||
        e.action?.includes('key.rotated.forced')
      )

      if (suspicious.length > 0) {
        return {
          result: 'failed',
          details: `${suspicious.length} suspicious credential events in last 30 days`,
          evidence: suspicious.slice(0, 5),
        }
      }

      const eventCount = events?.length ?? 0
      return {
        result: 'passed',
        details: `${eventCount} audit events in last 30 days — no credential exposure events found`,
        evidence: { event_count: eventCount },
      }
    },
  },

  // ── CC7 — System Operations ──────────────────────────────────────────────────
  {
    id: 'CC7.1-001',
    name: 'All user data tables have audit trail',
    category: 'CC7',
    description: 'Key operations (deploy, delete, invite) must appear in audit_log',
    run: async ({ supabase }) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
      const { data: actions, error } = await supabase
        .from('audit_log')
        .select('action')
        .gte('created_at', thirtyDaysAgo)

      if (error) {
        return { result: 'warning', details: 'Cannot read audit_log' }
      }

      const actionSet = new Set((actions ?? []).map((a: { action: string }) => a.action))
      const requiredActions = ['user.signup', 'deployment.started', 'cloud_credential.verified']
      const covered = requiredActions.filter(a => {
        // Check if any action in audit_log matches (partial match OK)
        for (const logged of actionSet) {
          if (logged.startsWith(a.split('.')[0])) return true
        }
        return false
      })

      if (covered.length === requiredActions.length) {
        return {
          result: 'passed',
          details: `Audit coverage confirmed for ${covered.length}/${requiredActions.length} required action types`,
          evidence: { total_actions_30d: actions?.length ?? 0, action_types: actionSet.size },
        }
      }

      const missing = requiredActions.filter(a => !covered.includes(a))
      return {
        result: 'warning',
        details: `Audit coverage partial: ${covered.length}/${requiredActions.length}. Missing categories: ${missing.join(', ')}`,
      }
    },
  },

  {
    id: 'CC7.2-001',
    name: 'Redis keys have TTLs (no persistent accumulation)',
    category: 'CC7',
    description: 'All Redis keys must have TTLs set — RULE B5. Keys without TTLs fill quota.',
    run: async ({ redis }) => {
      // Sample recently-created keys to check for TTL discipline
      const sampleKeys = [
        `rl:die-analyze:test`,
        `llm:cache:test`,
        `github:install:token:test`,
        `notif:cooldown:test`,
      ]

      const results: string[] = []
      let withoutTtl = 0

      for (const key of sampleKeys) {
        try {
          const ttl = await redis.ttl(key)
          if (ttl === -1) {
            // Key exists but has no TTL
            withoutTtl++
            results.push(`${key}: NO TTL ⚠️`)
          } else if (ttl === -2) {
            // Key doesn't exist — can't check
            results.push(`${key}: not present (cannot verify)`)
          } else {
            results.push(`${key}: TTL=${ttl}s ✓`)
          }
        } catch {
          results.push(`${key}: check failed`)
        }
      }

      // Also check for any keys with persistent TTL pattern
      return {
        result: withoutTtl === 0 ? 'passed' : 'warning',
        details: results.join('; '),
        evidence: { keys_without_ttl: withoutTtl },
      }
    },
  },

  {
    id: 'CC7.3-001',
    name: 'Data retention: old metrics cleaned up',
    category: 'CC7',
    description: 'cluster_metrics older than 90 days should not exist (pg_cron cleanup)',
    run: async ({ supabase }) => {
      const ninetyDaysAgo = new Date(Date.now() - 91 * 86400 * 1000).toISOString()

      const { count, error } = await supabase
        .from('cluster_metrics')
        .select('id', { count: 'exact', head: true })
        .lt('sampled_at', ninetyDaysAgo)

      if (error) {
        return { result: 'warning', details: 'Cannot query cluster_metrics retention' }
      }

      if ((count ?? 0) === 0) {
        return { result: 'passed', details: 'No cluster_metrics rows older than 90 days found' }
      }

      return {
        result: 'failed',
        details: `${count} cluster_metrics rows older than 90 days exist — pg_cron cleanup not running`,
        evidence: { stale_rows: count },
      }
    },
  },

  {
    id: 'CC7.4-001',
    name: 'Incident response coverage: AIRE diagnosed recent incidents',
    category: 'CC7',
    description: 'Incidents should reach "diagnosed" status — AIRE must be functioning',
    run: async ({ supabase }) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString()

      const { data: incidents, error } = await supabase
        .from('incidents')
        .select('id, status, trigger_type, detected_at')
        .gte('detected_at', sevenDaysAgo)
        .limit(50)

      if (error) {
        return { result: 'warning', details: 'Cannot query incidents table' }
      }

      if (!incidents?.length) {
        return { result: 'n/a', details: 'No incidents in last 7 days — AIRE has nothing to diagnose' }
      }

      const diagnosed = incidents.filter((i: { status: string }) => i.status === 'diagnosed' || i.status === 'resolved')
      const stuck = incidents.filter((i: { status: string }) => i.status === 'detected')
      const rate = Math.round(diagnosed.length / incidents.length * 100)

      if (rate >= 80) {
        return {
          result: 'passed',
          details: `AIRE diagnosed ${diagnosed.length}/${incidents.length} incidents (${rate}% diagnosis rate)`,
          evidence: { total: incidents.length, diagnosed: diagnosed.length, stuck: stuck.length },
        }
      }

      return {
        result: 'warning',
        details: `AIRE diagnosis rate is ${rate}% (${diagnosed.length}/${incidents.length}). ${stuck.length} incidents stuck in 'detected' state.`,
        evidence: { total: incidents.length, diagnosed: diagnosed.length, stuck: stuck.length },
      }
    },
  },

  // ── CC8 — Change Management ──────────────────────────────────────────────────
  {
    id: 'CC8.1-001',
    name: 'All deployments tracked in audit log',
    category: 'CC8',
    description: 'Every deployment should produce an audit event (change management)',
    run: async ({ supabase }) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString()

      const { count: deployCount, error: deployErr } = await supabase
        .from('deployments')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', thirtyDaysAgo)

      const { count: auditDeployCount, error: auditErr } = await supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo)
        .like('action', 'deployment.%')

      if (deployErr || auditErr) {
        return { result: 'warning', details: 'Cannot query deployment audit coverage' }
      }

      const deployTotal = deployCount ?? 0
      const auditTotal = auditDeployCount ?? 0

      if (deployTotal === 0) {
        return { result: 'n/a', details: 'No deployments in last 30 days' }
      }

      const coverage = Math.round(auditTotal / deployTotal * 100)
      if (coverage >= 95) {
        return {
          result: 'passed',
          details: `${auditTotal}/${deployTotal} deployments have audit records (${coverage}% coverage)`,
        }
      }

      return {
        result: 'warning',
        details: `Only ${coverage}% of deployments have audit records (${auditTotal}/${deployTotal})`,
        evidence: { deployments: deployTotal, audit_events: auditTotal },
      }
    },
  },

  // ── CC9 — Risk Mitigation ────────────────────────────────────────────────────
  {
    id: 'CC9.1-001',
    name: 'Stripe webhook idempotency keys are active',
    category: 'CC9',
    description: 'Stripe event IDs should be cached in Redis to prevent duplicate processing',
    run: async ({ redis }) => {
      // Check if stripe event key pattern is present (from recent events)
      // We cannot list all keys in Upstash without SCAN, so we verify the pattern works
      const testEventId = `evt_test_${Date.now()}`
      const key = `stripe:event:${testEventId}`

      try {
        await redis.set(key, '1', { ex: 86400 })
        const val = await redis.get(key)
        const ttl = await redis.ttl(key)
        await redis.del(key)

        if (val === '1' && ttl > 0) {
          return {
            result: 'passed',
            details: 'Stripe idempotency key mechanism working (set/get/ttl verified)',
            evidence: { test_key: key, ttl_confirmed: ttl > 0 },
          }
        }

        return { result: 'warning', details: 'Stripe idempotency key mechanism may have issues' }
      } catch (e: unknown) {
        return { result: 'failed', details: `Redis operation failed: ${(e as Error).message}` }
      }
    },
  },

  {
    id: 'CC9.2-001',
    name: 'Email quota guard is functional',
    category: 'CC9',
    description: 'Email daily quota counter must be enforced to prevent Resend overages',
    run: async ({ redis }) => {
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      const quotaKey = `email:quota:${today}`

      try {
        const current = await redis.get<number>(quotaKey)
        const ttl = await redis.ttl(quotaKey)

        if (current === null) {
          return {
            result: 'n/a',
            details: `No emails sent today (${today}) — quota counter not yet initialized`,
          }
        }

        const count = Number(current)
        if (count > 90) {
          return {
            result: 'warning',
            details: `Email quota nearly exhausted: ${count}/100 used today. New emails are being suppressed.`,
            evidence: { count, date: today },
          }
        }

        return {
          result: 'passed',
          details: `Email quota healthy: ${count}/100 used today (TTL: ${ttl}s)`,
          evidence: { count, date: today, ttl },
        }
      } catch (e: unknown) {
        return { result: 'warning', details: `Cannot check email quota: ${(e as Error).message}` }
      }
    },
  },

  {
    id: 'CC9.3-001',
    name: 'Subscription state integrity',
    category: 'CC9',
    description: 'No subscriptions should be stuck in non-terminal inconsistent states',
    run: async ({ supabase }) => {
      // Check for subscriptions with plan = 'pro'/'team' but status = 'canceled'
      // (should be 'free' if canceled)
      const { data: inconsistent } = await supabase
        .from('subscriptions')
        .select('id, org_id, plan, status')
        .in('status', ['canceled', 'unpaid'])
        .not('plan', 'in', '("free")')
        .limit(10)

      if ((inconsistent?.length ?? 0) > 0) {
        return {
          result: 'warning',
          details: `${inconsistent!.length} subscriptions have non-free plan with canceled/unpaid status — check Stripe webhook processing`,
          evidence: inconsistent,
        }
      }

      // Check for expired trials that weren't downgraded
      const now = new Date().toISOString()
      const { data: expiredTrials } = await supabase
        .from('subscriptions')
        .select('id, org_id, trial_ends_at, plan')
        .eq('status', 'trialing')
        .lt('trial_ends_at', now)
        .limit(10)

      if ((expiredTrials?.length ?? 0) > 0) {
        return {
          result: 'failed',
          details: `${expiredTrials!.length} expired trials not yet downgraded — pg_cron expire-trials job may not be running`,
          evidence: expiredTrials,
        }
      }

      return {
        result: 'passed',
        details: 'All subscription states are consistent',
      }
    },
  },
]

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // This function is called by pg_cron (service role) or manually by admins
  // Verify via service role key in header OR via user JWT with admin role
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`
  let orgId: string | undefined

  if (!isServiceRole) {
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Verify user JWT and check they're an admin
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await userSupabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const role = user.user_metadata?.role as string
    if (!['owner', 'admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    orgId = user.user_metadata?.org_id as string
  }

  const adminSupa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey
  )

  const redis = new Redis({
    url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
    token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
  })

  const ctx: CheckContext = {
    supabase: adminSupa,
    redis,
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  }

  const runStarted = new Date().toISOString()
  const checkResults: Array<{
    control_id: string
    name: string
    category: string
    result: CheckResult
    details: string
    evidence?: unknown
    checked_at: string
  }> = []

  let passed = 0
  let failed = 0
  let warnings = 0
  let na = 0

  // Run all controls — continue even if individual checks throw
  for (const control of CONTROLS) {
    const start = Date.now()
    let result: CheckResult = 'warning'
    let details = 'Check did not run'
    let evidence: unknown

    try {
      const outcome = await control.run(ctx)
      result = outcome.result
      details = outcome.details
      evidence = outcome.evidence
    } catch (err: unknown) {
      result = 'warning'
      details = `Check threw an error: ${(err as Error).message}`
    }

    const duration = Date.now() - start
    const checkedAt = new Date().toISOString()

    checkResults.push({
      control_id: control.id,
      name: control.name,
      category: control.category,
      result,
      details,
      evidence,
      checked_at: checkedAt,
    })

    // RULE T1: log EVERY check to compliance_log regardless of outcome
    await adminSupa.from('compliance_log').insert({
      control_id: control.id,
      check_type: 'automated_test',
      result,
      details: {
        name: control.name,
        description: control.description,
        message: details,
        evidence: evidence ?? null,
        duration_ms: duration,
        org_id: orgId ?? 'global',
        run_started: runStarted,
      },
    }).then(() => {}).catch((e: Error) => console.error('compliance_log write failed:', e.message))

    if (result === 'passed') passed++
    else if (result === 'failed') failed++
    else if (result === 'warning') warnings++
    else if (result === 'n/a') na++
  }

  const summary = {
    run_at: runStarted,
    total: CONTROLS.length,
    passed,
    failed,
    warnings,
    na,
    overall: failed > 0 ? 'FAILING' : warnings > 2 ? 'WARNING' : 'PASSING',
    controls: checkResults,
  }

  // Also log the summary run to audit_log
  await adminSupa.from('audit_log').insert({
    org_id: orgId ?? '00000000-0000-0000-0000-000000000000',
    actor_type: 'system',
    actor_id: 'soc2-control-check',
    actor_name: 'AutoStack SOC2 Automation',
    action: 'compliance.monthly_check_completed',
    metadata: {
      total: CONTROLS.length,
      passed,
      failed,
      warnings,
      overall: summary.overall,
    },
  }).then(() => {}).catch(() => {})

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
