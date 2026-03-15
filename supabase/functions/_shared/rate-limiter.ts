/**
 * rate-limiter.ts - Distributed Sliding Window Rate Limiter
 *
 * Uses Redis sorted sets for accurate per-window counting.
 * Each request adds a timestamp-scored member; expired members are pruned atomically.
 *
 * Pulled forward from Phase 8 because github-webhook needs protection now.
 */

import { RedisClient } from './redis.ts'

interface RateLimitConfig {
  /** Window duration in seconds */
  window: number;
  /** Maximum requests allowed in the window */
  max: number;
  /** What identifier to rate-limit by */
  by: 'user_id' | 'org_id' | 'ip' | 'cluster_id';
}

const LIMITS: Record<string, RateLimitConfig> = {
  'aws-assume-role':    { window: 60,   max: 5,    by: 'user_id'    },
  'die-analyze':        { window: 3600, max: 3,    by: 'org_id'     },
  'infra-provision':    { window: 3600, max: 3,    by: 'org_id'     },
  'deploy-redeploy':    { window: 3600, max: 50,   by: 'org_id'     },
  'deploy-preview':     { window: 3600, max: 20,   by: 'org_id'     },
  'infra-teardown':     { window: 3600, max: 10,   by: 'org_id'     },
  'send-notification':  { window: 3600, max: 50,   by: 'org_id'     },
  'github-webhook':     { window: 60,   max: 500,  by: 'ip'         },
  'agent-metrics':      { window: 60,   max: 120,  by: 'cluster_id' },
  'agent-heartbeat':    { window: 60,   max: 10,   by: 'cluster_id' },
}

interface RateLimitResult {
  pass: boolean;
  remaining: number;
  resetIn: number;
}

/**
 * Checks whether a request passes rate limiting using a sliding window.
 *
 * @param redis - RedisClient instance
 * @param endpoint - The Edge Function name (must match a key in LIMITS)
 * @param identifier - The value for the `by` field (user_id, org_id, ip, etc.)
 * @returns Whether the request passes, remaining quota, and window reset time
 */
export async function rateLimitCheck(
  redis: RedisClient,
  endpoint: string,
  identifier: string
): Promise<RateLimitResult> {
  const config = LIMITS[endpoint];
  if (!config) return { pass: true, remaining: 999, resetIn: 0 };

  const now = Math.floor(Date.now() / 1000);
  const key = `rl:${endpoint}:${identifier}`;
  const windowStart = now - config.window;

  try {
    // Atomic pipeline: prune expired → add current → count
    const results = await redis.pipeline([
      ['ZREMRANGEBYSCORE', key, '0', String(windowStart)],
      ['ZADD', key, String(now), `${now}:${crypto.randomUUID().slice(0, 8)}`],
      ['ZCARD', key],
    ]);

    // Always refresh TTL — RULE B5
    await redis.expire(key, config.window + 1);

    const count = (results[2]?.result as number) ?? 0;
    return {
      pass: count <= config.max,
      remaining: Math.max(0, config.max - count),
      resetIn: config.window,
    };
  } catch (err) {
    // Fail open: if Redis is unreachable, allow the request through
    console.error(`[RateLimiter] Check failed for ${endpoint}:${identifier}:`, err);
    return { pass: true, remaining: config.max, resetIn: config.window };
  }
}

/**
 * Builds a standard 429 response with proper rate-limit headers.
 */
export function rateLimitResponse(
  endpoint: string,
  resetIn: number,
  corsHeaders: Record<string, string>
): Response {
  const config = LIMITS[endpoint];
  return new Response(
    JSON.stringify({ error: `Rate limit exceeded. Retry after ${resetIn} seconds.` }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(resetIn),
        'X-RateLimit-Limit': String(config?.max ?? 0),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + resetIn),
      },
    }
  );
}
