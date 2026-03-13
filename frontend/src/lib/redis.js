/**
 * AutoStack Redis/Cache Wrapper (Upstash)
 * ⚠️ COST GUARDRAIL: Used for metadata caching and rate limiting
 */

const UPSTASH_REDIS_REST_URL = import.meta.env.VITE_UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN;

/**
 * Execute a Redis command via HTTP
 * @param {Array} command - e.g. ["SET", "key", "value"]
 */
const redisFetch = async (command) => {
    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
        console.warn('Redis skipped: Upstash credentials not configured');
        return null;
    }

    try {
        const response = await fetch(UPSTASH_REDIS_REST_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
            },
            body: JSON.stringify(command),
        });

        const data = await response.json();
        return data.result;
    } catch (error) {
        console.error('Redis service error:', error);
        return null;
    }
};

export const cache = {
    /**
     * Set a value with optional TTL (seconds)
     */
    set: async (key, value, ttl = 3600) => {
        const stringified = typeof value === 'object' ? JSON.stringify(value) : value;
        if (ttl) {
            return redisFetch(['SET', key, stringified, 'EX', ttl]);
        }
        return redisFetch(['SET', key, stringified]);
    },

    /**
     * Get a value and parse if it looks like JSON
     */
    get: async (key) => {
        const result = await redisFetch(['GET', key]);
        if (!result) return null;
        try {
            return JSON.parse(result);
        } catch (e) {
            return result;
        }
    },

    /**
     * Delete a key
     */
    del: async (key) => {
        return redisFetch(['DEL', key]);
    },

    /**
     * Check rate limit
     * @param {string} identifier - e.g. user IP or ID
     * @param {number} limit - max requests
     * @param {number} window - time window in seconds
     */
    isRateLimited: async (identifier, limit = 10, window = 60) => {
        const key = `ratelimit:${identifier}`;
        const current = await redisFetch(['INCR', key]);

        if (current === 1) {
            await redisFetch(['EXPIRE', key, window]);
        }

        return current > limit;
    }
};
