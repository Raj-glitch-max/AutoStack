import { Redis } from 'https://esm.sh/@upstash/redis@1'

const LIMITS: Record<string, { window: number; max: number; by: string }> = {
  'aws-assume-role':    { window: 60,   max: 5,   by: 'user_id' },
  'die-analyze':        { window: 3600, max: 3,   by: 'org_id' },
  'infra-provision':    { window: 3600, max: 3,   by: 'org_id' },
  'deploy-redeploy':    { window: 3600, max: 50,  by: 'org_id' },
  'infra-teardown':     { window: 3600, max: 10,  by: 'org_id' },
  'send-notification':  { window: 3600, max: 50,  by: 'org_id' },
  'github-webhook':     { window: 60,   max: 500, by: 'ip' },
  'agent-metrics':      { window: 60,   max: 120, by: 'cluster_id' },
  'agent-heartbeat':    { window: 60,   max: 10,  by: 'cluster_id' },
  'ai-chat':            { window: 60,   max: 10,  by: 'user_id' },
  'stripe-webhook':     { window: 60,   max: 100, by: 'ip' },
}

export async function checkRateLimit(
  redis: Redis,
  endpoint: string,
  identifier: string
): Promise<{ pass: boolean; remaining: number; resetIn: number }> {
  const config = LIMITS[endpoint]
  if (!config) return { pass: true, remaining: 999, resetIn: 0 }

  const now = Math.floor(Date.now() / 1000)
  const key = `rl:${endpoint}:${identifier}`

  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(key, 0, now - config.window)
  pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })
  pipeline.zcard(key)
  pipeline.expire(key, config.window + 1)

  const results = await pipeline.exec()
  const count = (results[2] as number) || 0

  return {
    pass: count <= config.max,
    remaining: Math.max(0, config.max - count),
    resetIn: config.window
  }
}

export function rateLimitResponse(
  endpoint: string,
  resetIn: number,
  corsHeaders: Record<string, string>
): Response {
  const config = LIMITS[endpoint]
  return new Response(
    JSON.stringify({ error: `Rate limit exceeded. Retry after ${resetIn} seconds.` }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(resetIn),
        'X-RateLimit-Limit': String(config?.max || 0),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + resetIn)
      }
    }
  )
}
