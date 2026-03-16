import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts'

// ---------------------------------------------------------------------------
// Incident Pattern Library — 10 patterns with multi-keyword confidence scoring
// ---------------------------------------------------------------------------

interface PatternMatch {
  id: string
  confidence: number
  root_cause: string
  immediate_action: string
  permanent_fix: string
  remediation_type: 'restart' | 'patch_manifest' | 'manual'
}

interface Pattern {
  id: string
  keywords: string[]
  weight_map: Record<string, number>
  root_cause: string
  immediate_action: string
  permanent_fix: string
  remediation_type: 'restart' | 'patch_manifest' | 'manual'
}

const PATTERNS: Pattern[] = [
  {
    id: 'OOM_KILL',
    keywords: ['oomkilled', 'exit code 137', 'out of memory', 'memory limit', 'oom killer', 'killed process'],
    weight_map: { 'oomkilled': 0.35, 'exit code 137': 0.30, 'out of memory': 0.20, 'memory limit': 0.10, 'oom killer': 0.30, 'killed process': 0.05 },
    root_cause: 'Container was killed by the Linux OOM killer because it exceeded its configured memory limit.',
    immediate_action: 'Restart the affected pod. Monitor memory usage for the next 30 minutes to confirm stability.',
    permanent_fix: 'Increase the memory limit in the Deployment manifest. Investigate potential memory leaks using profiling tools.',
    remediation_type: 'patch_manifest'
  },
  {
    id: 'CRASH_LOOP',
    keywords: ['crashloopbackoff', 'back-off restarting', 'container exited', 'exit code 1', 'restart count exceeded', 'backoff'],
    weight_map: { 'crashloopbackoff': 0.40, 'back-off restarting': 0.25, 'container exited': 0.10, 'exit code 1': 0.15, 'restart count exceeded': 0.05, 'backoff': 0.05 },
    root_cause: 'Container is repeatedly crashing on startup, entering CrashLoopBackOff state. The application fails to start successfully.',
    immediate_action: 'Check container logs with kubectl logs to identify the startup failure. Look for missing env vars, config files, or dependency issues.',
    permanent_fix: 'Fix the underlying application error. Common causes: missing environment variables, incorrect entrypoint, database connection failures, or permission issues.',
    remediation_type: 'manual'
  },
  {
    id: 'IMAGE_PULL_FAILURE',
    keywords: ['imagepullbackoff', 'errimagepull', 'failed to pull image', 'unauthorized', 'manifest unknown', 'image not found'],
    weight_map: { 'imagepullbackoff': 0.35, 'errimagepull': 0.25, 'failed to pull image': 0.20, 'unauthorized': 0.10, 'manifest unknown': 0.05, 'image not found': 0.05 },
    root_cause: 'Kubernetes cannot pull the container image from the registry. The image may not exist, or registry credentials may be missing.',
    immediate_action: 'Verify the image tag exists in the registry. Check imagePullSecrets in the pod spec.',
    permanent_fix: 'Ensure the correct image tag is deployed. Set up proper registry credentials as a Kubernetes Secret and reference it in the ServiceAccount or Pod spec.',
    remediation_type: 'manual'
  },
  {
    id: 'HEALTH_CHECK_FAILURE',
    keywords: ['unhealthy', 'liveness probe failed', 'readiness probe failed', 'probe failed', 'connection refused', 'health check'],
    weight_map: { 'unhealthy': 0.15, 'liveness probe failed': 0.30, 'readiness probe failed': 0.25, 'probe failed': 0.15, 'connection refused': 0.10, 'health check': 0.05 },
    root_cause: 'Pod is failing health checks. The application is not responding to liveness or readiness probes on the configured endpoint.',
    immediate_action: 'Check if the health endpoint is configured correctly in the Deployment. Verify the application is listening on the expected port.',
    permanent_fix: 'Adjust probe configuration: increase initialDelaySeconds if the app needs more time to start, or fix the health endpoint to return 200.',
    remediation_type: 'patch_manifest'
  },
  {
    id: 'SCHEDULING_FAILURE',
    keywords: ['failedscheduling', 'insufficient cpu', 'insufficient memory', 'no nodes available', 'unschedulable', 'taints'],
    weight_map: { 'failedscheduling': 0.30, 'insufficient cpu': 0.25, 'insufficient memory': 0.20, 'no nodes available': 0.15, 'unschedulable': 0.05, 'taints': 0.05 },
    root_cause: 'Kubernetes cannot schedule the pod because no node has enough available resources (CPU or memory) to satisfy the request.',
    immediate_action: 'Check cluster capacity with kubectl top nodes. Consider scaling up the node group or reducing resource requests.',
    permanent_fix: 'Add Cluster Autoscaler or Karpenter to automatically provision additional nodes when demand increases. Review if resource requests are over-provisioned.',
    remediation_type: 'manual'
  },
  {
    id: 'VOLUME_MOUNT_FAILURE',
    keywords: ['failedmount', 'unable to attach', 'volume not found', 'pvc pending', 'attach volume', 'mount failed'],
    weight_map: { 'failedmount': 0.30, 'unable to attach': 0.20, 'volume not found': 0.20, 'pvc pending': 0.15, 'attach volume': 0.10, 'mount failed': 0.05 },
    root_cause: 'Pod cannot start because a required persistent volume cannot be mounted. The PVC may be pending, the volume may not exist, or it may be attached to another node.',
    immediate_action: 'Check PVC status with kubectl get pvc. If pending, verify the StorageClass exists and has available capacity.',
    permanent_fix: 'Ensure the StorageClass supports dynamic provisioning. For EBS volumes, verify the CSI driver is installed and the AZ matches.',
    remediation_type: 'manual'
  },
  {
    id: 'EVICTION',
    keywords: ['evicted', 'ephemeral-storage exceeded', 'disk pressure', 'node pressure', 'eviction', 'nodeshutdown'],
    weight_map: { 'evicted': 0.30, 'ephemeral-storage exceeded': 0.25, 'disk pressure': 0.20, 'node pressure': 0.15, 'eviction': 0.05, 'nodeshutdown': 0.05 },
    root_cause: 'Pod was evicted from the node due to resource pressure (disk, memory, or node shutdown). The kubelet terminated the pod to protect node stability.',
    immediate_action: 'Pod should auto-reschedule to a healthy node. If not, manually delete the pod to trigger rescheduling.',
    permanent_fix: 'Set ephemeral-storage limits in the pod spec. Add monitoring for node disk usage. Consider larger instance types or additional nodes.',
    remediation_type: 'restart'
  },
  {
    id: 'DNS_FAILURE',
    keywords: ['dns', 'name resolution', 'could not resolve', 'nxdomain', 'coredns', 'service discovery'],
    weight_map: { 'dns': 0.15, 'name resolution': 0.25, 'could not resolve': 0.25, 'nxdomain': 0.15, 'coredns': 0.15, 'service discovery': 0.05 },
    root_cause: 'Application cannot resolve DNS names. CoreDNS may be misconfigured, overloaded, or the target service does not exist in the cluster.',
    immediate_action: 'Verify CoreDNS pods are running: kubectl get pods -n kube-system -l k8s-app=kube-dns. Check if the target service exists.',
    permanent_fix: 'Scale CoreDNS if overloaded. Verify the ndots setting in pod DNS config. Check NetworkPolicies are not blocking DNS traffic on port 53.',
    remediation_type: 'manual'
  },
  {
    id: 'TLS_CERTIFICATE_ERROR',
    keywords: ['certificate expired', 'tls handshake', 'x509', 'cert-manager', 'certificate not ready', 'ssl'],
    weight_map: { 'certificate expired': 0.30, 'tls handshake': 0.20, 'x509': 0.20, 'cert-manager': 0.15, 'certificate not ready': 0.10, 'ssl': 0.05 },
    root_cause: 'TLS certificate has expired or is not yet issued. HTTPS traffic to the application will fail until the certificate is valid.',
    immediate_action: 'Check cert-manager Certificate resources: kubectl get certificates -A. Look for NotReady status.',
    permanent_fix: 'Ensure cert-manager is running and the ClusterIssuer is properly configured. Verify DNS records point to the correct ALB/ingress IP.',
    remediation_type: 'manual'
  },
  {
    id: 'NETWORK_POLICY_BLOCK',
    keywords: ['connection timed out', 'connection refused', 'network policy', 'egress denied', 'ingress denied', 'calico'],
    weight_map: { 'connection timed out': 0.15, 'connection refused': 0.10, 'network policy': 0.30, 'egress denied': 0.20, 'ingress denied': 0.15, 'calico': 0.10 },
    root_cause: 'Network traffic is being blocked by a NetworkPolicy. The pod cannot reach the target service or external endpoint.',
    immediate_action: 'Review NetworkPolicies in the pod namespace: kubectl get networkpolicy -n <namespace>. Temporarily delete the policy to confirm it is the cause.',
    permanent_fix: 'Update the NetworkPolicy to allow the required ingress/egress traffic. Use labels to scope policies precisely.',
    remediation_type: 'patch_manifest'
  }
]

// ---------------------------------------------------------------------------
// PII Sanitization — strip sensitive data before LLM processing
// ---------------------------------------------------------------------------

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,                        // emails
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                                                 // IPv4
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,                                               // AWS access keys
  /\b(?:sk-|pk_live_|pk_test_|rk_live_|rk_test_)[a-zA-Z0-9]{20,}\b/g,            // API keys
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,         // UUIDs (partial redact)
]

function sanitizePII(text: string): string {
  let sanitized = text
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }
  return sanitized
}

// ---------------------------------------------------------------------------
// Tier 1: Multi-keyword confidence scoring
// ---------------------------------------------------------------------------

function matchTier1(incident: { summary: string; log_excerpts?: string[] }): PatternMatch | null {
  const text = `${incident.summary} ${(incident.log_excerpts || []).join(' ')}`.toLowerCase()

  let bestMatch: PatternMatch | null = null
  let bestConfidence = 0

  for (const pattern of PATTERNS) {
    let confidence = 0
    let matchedCount = 0

    for (const keyword of pattern.keywords) {
      if (text.includes(keyword)) {
        matchedCount++
        confidence += pattern.weight_map[keyword] || (1 / pattern.keywords.length)
      }
    }

    // Require at least 1 keyword match and meaningful confidence
    if (matchedCount > 0 && confidence > bestConfidence) {
      bestConfidence = confidence
      bestMatch = {
        id: pattern.id,
        confidence: Math.min(confidence, 0.95), // Cap at 0.95 for Tier 1
        root_cause: pattern.root_cause,
        immediate_action: pattern.immediate_action,
        permanent_fix: pattern.permanent_fix,
        remediation_type: pattern.remediation_type
      }
    }
  }

  return bestMatch
}

// ---------------------------------------------------------------------------
// Tier 2: OpenAI embedding + pgvector semantic search (fallback)
// ---------------------------------------------------------------------------

async function matchTier2(
  supabase: ReturnType<typeof createClient>,
  incidentSummary: string
): Promise<PatternMatch | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.warn('[AIRE] OPENAI_API_KEY not set — skipping Tier 2 semantic matching')
    return null
  }

  try {
    const cleanSummary = sanitizePII(incidentSummary).slice(0, 512)

    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: cleanSummary
      })
    })

    if (!embeddingRes.ok) {
      const errBody = await embeddingRes.text()
      console.error('[AIRE] OpenAI embedding API error:', errBody)
      return null
    }

    const { data } = await embeddingRes.json()
    const embedding = data[0].embedding

    // pgvector similarity search via RPC
    const { data: matches, error: matchErr } = await supabase.rpc('match_incident_patterns', {
      query_embedding: embedding,
      match_threshold: 0.75,
      match_count: 1
    })

    if (matchErr || !matches || matches.length === 0) {
      console.log('[AIRE] Tier 2: no semantic match found')
      return null
    }

    const match = matches[0]
    return {
      id: match.pattern_id,
      confidence: Math.round(match.similarity * 100) / 100,
      root_cause: match.root_cause || 'Matched via semantic similarity.',
      immediate_action: match.immediate_action || 'Investigate the affected resource.',
      permanent_fix: match.permanent_fix || 'Apply the recommended remediation.',
      remediation_type: match.remediation_type || 'manual'
    }
  } catch (err) {
    console.error('[AIRE] Tier 2 error (graceful fallback):', (err as Error).message)
    return null
  }
}

// ---------------------------------------------------------------------------
// Generic fallback diagnosis — used when neither tier matches
// ---------------------------------------------------------------------------

function genericDiagnosis(incident: { summary: string; severity?: string }): PatternMatch {
  return {
    id: 'GENERIC_FAILURE',
    confidence: 0.30,
    root_cause: `Automated analysis did not match a known failure pattern. Summary: "${incident.summary.slice(0, 200)}"`,
    immediate_action: 'Manually investigate the affected resource. Check pod logs and events for additional context.',
    permanent_fix: 'If this failure recurs, create a custom incident pattern in the AutoStack dashboard to enable automatic detection.',
    remediation_type: 'manual'
  }
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
    const incident = body.record || body
    const incident_id = incident.id

    if (!incident_id) {
      return jsonResponse({ error: 'Missing incident ID' }, 400)
    }

    console.log(`[AIRE] Processing incident ${incident_id}`)

    // Auth: internal secret only (this is triggered by DB webhook, not users)
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const isInternal = token === Deno.env.get('INTERNAL_SECRET') ||
                       token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!isInternal) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    // Fetch full incident data if we only received an ID
    let fullIncident = incident
    if (!incident.summary) {
      const { data, error } = await supabase.from('incidents').select('*').eq('id', incident_id).single()
      if (error || !data) {
        console.error(`[AIRE] Incident not found: ${incident_id}`)
        return jsonResponse({ error: 'Incident not found' }, 404)
      }
      fullIncident = data
    }

    // Tier 1: Pattern matching with confidence scoring
    let match = matchTier1(fullIncident)
    let matchMethod = 'tier1_pattern'

    // Tier 2: OpenAI semantic search (if Tier 1 confidence < 0.65)
    if (!match || match.confidence < 0.65) {
      console.log(`[AIRE] Tier 1 confidence ${match?.confidence ?? 0} < 0.65 — attempting Tier 2 semantic match`)
      const tier2Match = await matchTier2(supabase, fullIncident.summary || '')
      if (tier2Match && (!match || tier2Match.confidence > match.confidence)) {
        match = tier2Match
        matchMethod = 'tier2_semantic'
      }
    }

    // Fallback: generic diagnosis (no field is left null)
    if (!match) {
      match = genericDiagnosis(fullIncident)
      matchMethod = 'generic_fallback'
    }

    // Update incident row — ALL fields populated, nothing stays null
    const update = {
      matched_pattern: match.id,
      pattern_confidence: match.confidence,
      root_cause: match.root_cause,
      immediate_action: match.immediate_action,
      permanent_fix: match.permanent_fix,
      remediation_type: match.remediation_type,
      status: 'diagnosed',
      diagnosed_at: new Date().toISOString()
    }

    const { error: upErr } = await supabase.from('incidents').update(update).eq('id', incident_id)
    if (upErr) throw upErr

    console.log(`[AIRE] Diagnosed ${incident_id}: ${match.id} (${matchMethod}, confidence: ${match.confidence})`)

    // Fire-and-forget notification for incident diagnosis
    const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
    fetch(notificationUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'incident_detected',
        org_id: fullIncident.org_id,
        cluster_id: fullIncident.cluster_id || fullIncident.environment_id,
        recipient_email: '', // send-notification looks up the org owner
        recipient_name: '',
        payload: {
          incident_id,
          severity: fullIncident.severity,
          summary: fullIncident.summary,
          pattern_display: match.id.replace(/_/g, ' '),
          confidence: match.confidence,
          root_cause: match.root_cause,
          immediate_action: match.immediate_action
        }
      })
    }).catch(err => console.error('[AIRE] Notification failed (non-fatal):', err.message))

    return jsonResponse({
      success: true,
      method: matchMethod,
      pattern: match.id,
      confidence: match.confidence
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error(`[AIRE] Error:`, error.message)
    return jsonResponse({ error: error.message }, 500)
  }
})
