import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

// @ts-ignore Intent type
const INTENTS: Array<{ type: string; pattern: RegExp; contextNeeds: string[] }> = [
  { type: 'memory_analysis',   pattern: /memory|ram|oom|killed|allocation/i,         contextNeeds: ['metrics', 'incidents', 'deployments'] },
  { type: 'cpu_analysis',      pattern: /cpu|processor|throttl|slow|performance/i,   contextNeeds: ['metrics', 'cluster'] },
  { type: 'cost_analysis',     pattern: /cost|expensive|spending|bill|saving|price/i, contextNeeds: ['findings', 'project'] },
  { type: 'incident_query',    pattern: /crash|fail|down|error|broken|incident|alert/i, contextNeeds: ['incidents', 'cluster'] },
  { type: 'deployment_query',  pattern: /deploy|release|rollout|version|update|push/i, contextNeeds: ['deployments', 'pipelines'] },
  { type: 'log_query',         pattern: /log|output|print|console|stderr|stdout/i,   contextNeeds: ['logs'] },
  { type: 'security_query',    pattern: /security|vulnerab|patch|cve|exploit|access/i, contextNeeds: ['findings'] },
  { type: 'general_help',      pattern: /.*/,                                         contextNeeds: ['cluster', 'deployments'] },
]

function classifyIntent(message: string) {
  for (const intent of INTENTS) {
    if (intent.pattern.test(message)) return intent
  }
  return INTENTS[INTENTS.length - 1]
}

function stripPII(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [TOKEN]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[AWS_KEY]')
    .replace(/(?:password|secret|key|token)\s*[:=]\s*['"]?[^\s'"]+['"]?/gi, '[REDACTED]')
    .replace(/postgres:\/\/[^@\s]+@/g, 'postgres://[REDACTED]@')
    .replace(/mongodb\+srv:\/\/[^@\s]+@/g, 'mongodb+srv://[REDACTED]@')
}

async function fetchContext(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  environmentId: string | null,
  contextNeeds: string[]
): Promise<Record<string, unknown>> {
  const ctx: Record<string, unknown> = {}

  if (environmentId) {
    const { data: cluster } = await supabase
      .from('clusters')
      .select('name, provider, region, agent_status, health_score, node_count, pod_count')
      .eq('id', environmentId)
      .single()
    if (cluster) ctx.cluster = cluster
  }

  if (contextNeeds.includes('metrics') && environmentId) {
    const { data: metrics } = await supabase
      .from('cluster_metrics')
      .select('sampled_at, cpu_pct, memory_pct, requests, latency_p99')
      .eq('cluster_id', environmentId)
      .gte('sampled_at', new Date(Date.now() - 86_400_000).toISOString())
      .order('sampled_at', { ascending: false })
      .limit(48)
    if (metrics?.length) {
      const cpuAvg = metrics.reduce((s, m: any) => s + (m.cpu_pct ?? 0), 0) / metrics.length
      const memAvg = metrics.reduce((s, m: any) => s + (m.memory_pct ?? 0), 0) / metrics.length
      ctx.metrics_24h_summary = {
        readings: metrics.length,
        cpu_avg_pct: Math.round(cpuAvg * 10) / 10,
        mem_avg_pct: Math.round(memAvg * 10) / 10,
        cpu_max_pct: Math.max(...metrics.map((m: any) => m.cpu_pct ?? 0)),
        mem_max_pct: Math.max(...metrics.map((m: any) => m.memory_pct ?? 0)),
        latest: metrics[0],
      }
    }
  }

  if (contextNeeds.includes('incidents') && environmentId) {
    const { data: incidents } = await supabase
      .from('incidents')
      .select('trigger_type, severity, status, root_cause, detected_at, resolved_at')
      .eq('cluster_id', environmentId)
      .order('detected_at', { ascending: false })
      .limit(5)
    if (incidents?.length) ctx.recent_incidents = incidents
  }

  if (contextNeeds.includes('findings') && environmentId) {
    const { data: findings } = await supabase
      .from('findings')
      .select('dimension, severity, title, projected_saving, status')
      .eq('cluster_id', environmentId)
      .eq('status', 'open')
      .order('severity', { ascending: true })
      .limit(10)
    if (findings?.length) ctx.open_findings = findings
  }

  if (contextNeeds.includes('deployments') && environmentId) {
    const { data: deployments } = await supabase
      .from('deployments')
      .select('commit_sha, commit_msg, status, started_at, completed_at, triggered_by')
      .eq('cluster_id', environmentId)
      .order('started_at', { ascending: false })
      .limit(5)
    if (deployments?.length) ctx.recent_deployments = deployments
  }

  if (contextNeeds.includes('project') && environmentId) {
    const { data: project } = await supabase
      .from('projects')
      .select('name, environment, status, estimated_monthly_cost, potential_savings, detected_language')
      .eq('cluster_id', environmentId)
      .single()
    if (project) ctx.project = project
  }

  if (contextNeeds.includes('logs') && environmentId) {
    const { data: logs } = await supabase
      .from('pod_logs')
      .select('log_line, log_level, logged_at, pod_name')
      .eq('cluster_id', environmentId)
      .order('logged_at', { ascending: false })
      .limit(30)
    if (logs?.length) {
      ctx.recent_logs = logs.map(l => ({
        ...l,
        log_line: stripPII(l.log_line ?? ''), 
      }))
    }
  }

  return ctx
}

function validateLLMResponse(text: string): { valid: boolean; cleaned: string } {
  if (!text || typeof text !== 'string') return { valid: false, cleaned: '' }

  let cleaned = text
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]{20,}/gi, 'Bearer [REDACTED]')
    .replace(/postgres:\/\/[^@\s]+@[^\s]+/g, 'postgres://[REDACTED]')

  if (cleaned.length > 2000) {
    cleaned = cleaned.slice(0, 1900) + '\n\n*(Response truncated for brevity.)*'
  }

  return { valid: true, cleaned }
}

function buildSystemPrompt(): string {
  return `You are AutoStack's AI operations assistant — an expert Kubernetes engineer and cloud architect.
You have access to real-time data about the user's Kubernetes infrastructure provided in the context.

Your job:
1. Answer the user's question directly and concisely using the provided data
2. Cite specific numbers from the context (CPU %, memory %, costs, counts)
3. Give actionable next steps — not just observations
4. Suggest kubectl commands when helpful (read-only: get, describe, logs, top)
5. If data is insufficient, say so clearly and suggest what to check

Strict rules:
- Keep responses under 400 words unless complexity requires more
- Never display raw credentials, connection strings, API keys, or tokens
- If you see [REDACTED] in context, do not speculate about its value
- Acknowledge uncertainty honestly
- When recommending a fix, mention AutoStack's AIRE may have already opened a PR
- Format using plain text, not markdown headers (the UI handles formatting)`
}

async function callNvidiaStreaming(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  context: Record<string, unknown>
): Promise<ReadableStream<Uint8Array>> {
  const contextStr = JSON.stringify(context, null, 2).slice(0, 6000)

  const payload = {
    model: 'meta/llama-3.1-70b-instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Infrastructure context:\n\`\`\`json\n${contextStr}\n\`\`\`\n\nQuestion: ${userMessage}`,
      },
    ],
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 600,
    stream: true,
  }

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`NVIDIA API error: ${response.status} ${await response.text()}`)
  }

  return response.body!
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const orgId = user.user_metadata?.org_id as string
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'User has no organization' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const redis = createRedisClient()

  const aiDisabled = await redis.get<string>(`ai:disabled:${orgId}`)
  if (aiDisabled === 'true') {
    return new Response(JSON.stringify({
      error: 'AI features are currently disabled for your organization.',
      code: 'AI_FEATURES_DISABLED',
    }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Rate limit — 10 messages per minute per user
  const now = Math.floor(Date.now() / 1000)
  const rlKey = `rl:ai-chat:${user.id}`
  
  await redis.zremrangebyscore(rlKey, 0, now - 60)
  await redis.zadd(rlKey, now, `${now}:${Math.random()}`)
  const requestCount = await redis.zcard(rlKey)
  await redis.expire(rlKey, 61)

  if (requestCount > 10) {
    return new Response(JSON.stringify({
      error: 'You\'ve sent too many messages. Please wait a moment before continuing.',
      code: 'RATE_LIMITED',
      retry_after: 60,
    }), {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': '60',
        'X-RateLimit-Remaining': '0',
      },
    })
  }

  // Parse request body
  let body: { message: string; environment_id?: string; conversation_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { message, environment_id } = body
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const cleanMessage = message.trim().slice(0, 500) // max 500 chars per message

  // Classify intent and fetch relevant context
  const intent = classifyIntent(cleanMessage)
  const context = await fetchContext(supabase, orgId, environment_id ?? null, intent.contextNeeds)

  // RULE U1: check cache before calling LLM
  // Cache key = hash of (message + context fingerprint)
  const contextFingerprint = JSON.stringify({
    msg: cleanMessage,
    cluster_status: (context.cluster as Record<string, unknown> | undefined)?.agent_status,
    health: (context.cluster as Record<string, unknown> | undefined)?.health_score,
    incident_count: Array.isArray(context.recent_incidents) ? context.recent_incidents.length : 0,
  })
  const cacheKey = `llm:chat:${await sha256(contextFingerprint)}`
  const cached = await redis.get<string>(cacheKey)
  if (cached) {
    // Return cached response as a complete (non-streaming) response
    return new Response(
      JSON.stringify({ text: cached, cached: true }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Get NVIDIA API key (rotate between two keys for load balancing)
  const apiKeys = [
    Deno.env.get('NVIDIA_API_KEY_1'),
    Deno.env.get('NVIDIA_API_KEY_2'),
  ].filter(Boolean) as string[]

  if (apiKeys.length === 0) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)]
  const systemPrompt = buildSystemPrompt()

  try {
    const nvidiaStream = await callNvidiaStreaming(apiKey, systemPrompt, cleanMessage, context)

    // Transform NVIDIA SSE stream into our own SSE format
    // Also accumulate text to cache after streaming completes
    let accumulated = ''

    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content ?? ''
            if (!content) continue

            accumulated += content

            // RULE U4: basic real-time validation — skip suspicious chunks
            if (content.match(/AKIA[0-9A-Z]{16}|Bearer [A-Za-z0-9._-]{30,}/)) continue

            const sseEvent = `data: ${JSON.stringify({ type: 'text', text: content })}\n\n`
            controller.enqueue(new TextEncoder().encode(sseEvent))
          } catch {
            // Malformed JSON in stream — skip
          }
        }
      },
      async flush(controller) {
        // Validate and cache the complete response — RULE U4
        const { valid, cleaned } = validateLLMResponse(accumulated)
        if (valid && cleaned.length > 10) {
          // Cache for 24 hours — RULE U1 + RULE B5
          await redis.set(cacheKey, cleaned, 86400)
        }

        // Send done event
        controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'))
      },
    })

    return new Response(nvidiaStream.pipeThrough(transformStream), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('ai-chat LLM error:', error.message)

    // RULE U5: graceful degradation — return helpful non-LLM response
    const fallback = `I'm having trouble connecting to the AI service right now. ` +
      `Here's what I can tell you from your data: ` +
      (context.cluster ? `Your cluster health score is ${(context.cluster as any).health_score ?? 'unknown'}.` : '') +
      ` Check the Monitoring and Incidents tabs for detailed information.`

    return new Response(JSON.stringify({ text: fallback, fallback: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
