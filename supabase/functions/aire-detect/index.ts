import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { rateLimitCheck, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { validateOrRespond } from '../_shared/validator.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// RULE U3: Strip PII from logs
function stripPII(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [TOKEN]')
    .replace(/sk-[A-Za-z0-9]{32,}/g, '[API_KEY]')
    .replace(/AKIA[A-Z0-9]{16}/g, '[AWS_KEY]')
}

// RULE U1: Cached LLM diagnosis
async function llmDiagnose(incident: any, summary: string, redis: any): Promise<any> {
    const hash = btoa(summary).substring(0, 32);
  const cacheKey = `llm:diagnosis:${hash}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    console.log('[AIRE] LLM diagnosis cache hit')
    return JSON.parse(cached)
  }

  // RULE U2: Rate limit check (LLM specific)
  const rl = await rateLimitCheck(redis, 'aire-detect', incident.org_id || 'unknown')
  if (!rl.pass) {
    console.warn('[AIRE] LLM rate limit exceeded')
    return {
      root_cause: 'Diagnosis rate limit reached. AIRE will retry in 1 hour.',
      immediate_action: 'Check kubectl logs for the affected pod',
      permanent_fix: 'Monitor for recurrence',
      confidence: 0.3,
      pattern_type: 'unknown'
    }
  }

  // RULE U3: Strip PII from logs
  const cleanLogs = (incident.log_excerpts || []).map((line: string) => stripPII(line))

  const prompt = `You are diagnosing a Kubernetes incident. Analyze this incident and provide a root cause analysis.

Incident type: ${incident.trigger_type}
Pod: ${incident.affected_resource}
Namespace: ${incident.namespace || 'default'}
Severity: ${incident.severity}

Recent log lines (last 20):
${cleanLogs.slice(0, 20).join('\n')}

Respond with ONLY a JSON object (no other text):
{
  "root_cause": "1-2 sentence root cause explanation",
  "immediate_action": "What to do right now to stop the bleeding",
  "permanent_fix": "What to change to prevent recurrence",
  "confidence": 0.0-1.0,
  "pattern_type": "one of: oom_kill|crash_loop|config_error|image_error|resource_exhaustion|network_error|unknown"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.statusText}`)
  }

  const data = await response.json()
  const rawText = data.content[0].text

  // RULE U4: Validate response
  let diagnosis: any
  try {
    diagnosis = JSON.parse(rawText)
    if (!diagnosis.root_cause || typeof diagnosis.confidence !== 'number') {
      throw new Error('Missing required fields')
    }
  } catch {
    diagnosis = {
      root_cause: 'AI diagnosis failed to parse. See raw logs for manual investigation.',
      immediate_action: 'Check kubectl logs for the affected pod',
      permanent_fix: 'Monitor for recurrence',
      confidence: 0.3,
      pattern_type: 'unknown'
    }
  }

  // Cache for 24 hours
  await redis.set(cacheKey, JSON.stringify(diagnosis), 86400)
  return diagnosis
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const incident = body.record || body
    const incident_id = incident.id
    
    // 1. Validation
    const validationError = validateOrRespond(incident, {
        id: { type: 'uuid', required: true },
        cluster_id: { type: 'uuid', required: true }
    }, corsHeaders)
    if (validationError) return validationError

    const summary = incident.summary || 'Unknown incident'

    // 2. Auth & Rate Limiting (Using internal secret if triggered by webhook, else JWT)
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

    const redis = createRedisClient()
    
    console.log(`[AIRE] Diagnosing incident ${incident_id}: ${summary}`);

    let update: any = {
      status: 'diagnosed',
      diagnosed_at: new Date().toISOString(),
      pattern_confidence: 0
    };

    let bestMatch = null;
    let matchMethod = 'none';

    // --- TIER 1: Keyword Matching ---
    const { data: patterns } = await supabase.from('incident_patterns').select('*')
    const sourceText = `${summary} ${JSON.stringify(incident.log_excerpts || '')}`.toLowerCase();

    let maxConfidence = 0;
    for (const pattern of patterns || []) {
      const keywords = pattern.matching_criteria?.keywords || [];
      let hits = 0;
      keywords.forEach((kw: string) => { if (sourceText.includes(kw.toLowerCase())) hits++ });
      const confidence = keywords.length > 0 ? hits / keywords.length : 0;
      
      if (confidence > maxConfidence && confidence >= 0.65) {
        maxConfidence = confidence;
        bestMatch = pattern;
        matchMethod = 'keyword';
      }
    }

    // --- TIER 2: Semantic Matching (Fallback) ---
    if (!bestMatch && OPENAI_API_KEY) {
      try {
        const hash = btoa(summary).substring(0, 16);
        const cacheKey = `aire:emb:${hash}`;
        const cachedEmb = await redis.get(cacheKey);
        let embedding = cachedEmb ? JSON.parse(cachedEmb) : null

        if (!embedding) {
          const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              input: summary.slice(0, 512),
              model: 'text-embedding-3-small'
            })
          })
          const result = await res.json()
          if (!result.error) {
            embedding = result.data[0].embedding
            await redis.set(cacheKey, JSON.stringify(embedding), 86400)
          }
        }

        if (embedding) {
          const { data: matches, error: rpcErr } = await supabase.rpc('match_incident_patterns', {
            query_embedding: embedding,
            match_threshold: 0.75,
            match_count: 1
          })

          if (!rpcErr && matches && matches.length > 0 && matches[0].similarity > 0.80) {
            bestMatch = matches[0]
            maxConfidence = matches[0].similarity * 0.90
            matchMethod = 'semantic'
          }
        }
      } catch (semErr: any) {
        console.warn(`[AIRE] Semantic matching failed: ${semErr.message}`)
      }
    }

    // --- TIER 3: LLM Diagnosis (if Tier 1 and 2 failed) ---
    if (!bestMatch && ANTHROPIC_API_KEY) {
      try {
        const llmDiagnosis = await llmDiagnose(incident, summary, redis)
        if (llmDiagnosis) {
          update.root_cause = llmDiagnosis.root_cause
          update.immediate_action = llmDiagnosis.immediate_action
          update.permanent_fix = llmDiagnosis.permanent_fix
          update.pattern_confidence = llmDiagnosis.confidence
          update.matched_pattern = llmDiagnosis.pattern_type
          matchMethod = 'llm'
        }
      } catch (llmErr: any) {
        console.warn(`[AIRE] LLM diagnosis failed: ${llmErr.message}`)
      }
    }

    // --- Apply Results ---
    if (bestMatch) {
      update.matched_pattern = bestMatch.name;
      update.pattern_confidence = maxConfidence;
      update.root_cause = bestMatch.diagnosis_template || bestMatch.description;
      update.immediate_action = bestMatch.immediate_action || bestMatch.remediation_type || 'Check logs for details.';
      update.permanent_fix = 'Review resource limits and deployment strategy.';
    } else if (!update.root_cause) {
      update.root_cause = 'Anomaly detected but no known pattern matched.';
      update.immediate_action = 'Investigate pod status and events.';
    }

    await supabase.from('incidents').update(update).eq('id', incident_id)

    // --- Trigger Notification ---
    const { data: cluster } = await supabase.from('clusters').select('org_id, name').eq('id', incident.cluster_id).single()
    if (cluster) {
      const { data: owner } = await supabase.from('org_members').select('user_id').eq('org_id', cluster.org_id).eq('role', 'owner').single()
      if (owner) {
        const { data: userRecord } = await supabase.auth.admin.getUserById(owner.user_id)
        if (userRecord?.user) {
            fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                },
                body: JSON.stringify({
                    type: 'incident_detected',
                    org_id: cluster.org_id,
                    cluster_id: cluster.id,
                    recipient_email: userRecord.user.email,
                    recipient_name: userRecord.user.user_metadata?.full_name || 'Owner',
                    payload: {
                        cluster_name: cluster.name,
                        incident_id: incident_id,
                        pattern_display: bestMatch?.name || 'Unknown Anomaly',
                        confidence: maxConfidence,
                        severity: incident.severity || 'medium',
                        affected_resource: incident.affected_resource,
                        root_cause: update.root_cause,
                        immediate_action: update.immediate_action,
                        dashboard_url: `${Deno.env.get('APP_URL')}/dashboard?tab=incidents&id=${incident_id}`
                    }
                })
            }).catch(e => console.error("[AIRE] Notification failed:", e.message))
        }
      }
    }

    return new Response(JSON.stringify({ success: true, method: matchMethod }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    console.error(`[AIRE] Error:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
