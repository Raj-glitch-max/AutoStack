/**
 * redis.ts - Upstash Redis Client for AutoStack Edge Functions
 *
 * Provides a typed client over the Upstash REST API for use across
 * all Edge Functions. Replaces raw fetch calls with a consistent interface.
 *
 * RULE B5: Every Redis key MUST have a TTL. The set() method enforces this.
 */

interface RedisPipelineResult {
  result: unknown;
  error?: string;
}

export class RedisClient {
  private readonly url: string;
  private readonly token: string;

  constructor(url?: string, token?: string) {
    this.url = url ?? Deno.env.get('UPSTASH_REDIS_REST_URL') ?? '';
    this.token = token ?? Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? '';

    if (!this.url || !this.token) {
      console.warn('[Redis] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    }
  }

  private async command<T = unknown>(...args: (string | number)[]): Promise<T> {
    const response = await fetch(`${this.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Redis] Command failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`[Redis] ${data.error}`);
    }

    return data.result as T;
  }

  /**
   * Execute multiple commands atomically via pipeline.
   * Returns an array of results in order.
   */
  async pipeline(commands: (string | number)[][]): Promise<RedisPipelineResult[]> {
    const response = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[Redis] Pipeline failed (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  async get<T = string>(key: string): Promise<T | null> {
    return await this.command<T | null>('GET', key);
  }

  /**
   * Set a key with a mandatory TTL in seconds.
   * RULE B5: Never store a key without expiry.
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      throw new Error('[Redis] TTL must be positive — RULE B5 requires expiry on all keys');
    }
    await this.command('SET', key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<number> {
    return await this.command<number>('DEL', key);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    return await this.command<number>('EXPIRE', key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.command<number>('TTL', key);
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    return await this.command<number>('ZREMRANGEBYSCORE', key, min, max);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return await this.command<number>('ZADD', key, score, member);
  }

  async zcard(key: string): Promise<number> {
    return await this.command<number>('ZCARD', key);
  }
}

/**
 * Creates a RedisClient using environment variables.
 * Call once per request — the client is stateless (REST-based).
 */
export function createRedisClient(): RedisClient {
  return new RedisClient();
}

/**
 * Increments a key and returns the current count within a time window.
 * Used for simple fixed-window rate limiting.
 *
 * @param key - The unique identifier for the rate limit bucket
 * @param windowSeconds - The fixed window duration in seconds
 * @returns The current count after increment
 */
export async function incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
  const url = Deno.env.get('UPSTASH_REDIS_REST_URL');
  const token = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

  if (!url || !token) {
    console.error('[Redis] Skip rate limiting: Missing Upstash credentials');
    return 0;
  }

  try {
    const fullKey = `rate_limit:${key}`;
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ['INCR', fullKey],
        ['EXPIRE', fullKey, windowSeconds, 'NX']
      ]),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upstash error: ${error}`);
    }

    const results = await response.json();
    return results[0].result;
  } catch (err) {
    console.error(`[Redis] Rate limit check failed for ${key}:`, err);
    return 0;
  }
}
