// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║   AUTOSTACK — COST OPTIMIZER (LLM-POWERED)                                  ║
// ║   Generates 3 infrastructure options with intelligent tradeoff analysis     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, corsResponse, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { AppClassification } from '../_shared/app-classifier.ts'
import { AWSService, CostEstimate, calculateMonthlyCost } from '../_shared/cost-calculator.ts'

export interface InfrastructureOption {
  id: 'cheapest' | 'balanced' | 'performance'
  label: string
  description: string
  service: AWSService
  cost: CostEstimate
  tradeoffs: string[]
  recommended: boolean
  llmNote?: string
  cpu: number
  memory: number
}

export interface InfrastructureOptions {
  options: InfrastructureOption[]
  defaultChoice: string
  analysisNotes: string[]
  llmAnalysisUsed: boolean
}

// ---------------------------------------------------------------------------
// Service Selection Logic
// ---------------------------------------------------------------------------

function selectCheapestService(classification: AppClassification): AWSService {
  if (classification.appType === 'static-site') return 'cloudfront_s3'
  if (classification.appType === 'worker' || classification.appType === 'scheduled') {
    return 'ecs_fargate_no_alb'
  }

  // For API apps: App Runner is almost always cheapest due to scale-to-zero
  if (!classification.isStateful && !classification.hasWebsockets) {
    return 'app_runner'
  }

  // For stateful apps: ECS Fargate with Spot (70% discount on compute)
  return 'ecs_fargate_spot'
}

function selectBalancedService(classification: AppClassification): AWSService {
  if (classification.appType === 'static-site') return 'cloudfront_s3'
  if (classification.appType === 'worker') return 'ecs_fargate_no_alb'
  
  // Balanced is always ECS Fargate (production-grade, moderate cost)
  return 'ecs_fargate'
}

function selectPerformanceService(classification: AppClassification): AWSService {
  if (classification.appType === 'static-site') return 'cloudfront_s3'
  
  // Only step up to EKS if app is already complex
  if (classification.estimatedCPU >= 2000 || classification.hasQueue || classification.hasDatabase) {
    // Check if K8s configs exist
    if (classification.tier === 'enterprise') {
      return 'eks_fargate'
    }
  }
  
  // Otherwise, stay on ECS Fargate with more resources
  return 'ecs_fargate'
}

// ---------------------------------------------------------------------------
// LLM Cost Analysis (NVIDIA API)
// ---------------------------------------------------------------------------

async function getLLMCostAdvice(
  classification: AppClassification,
  options: InfrastructureOption[]
): Promise<{ cheapestNote: string; balancedNote: string }> {
  
  const apiKey = Deno.env.get('NVIDIA_API_KEY')
  if (!apiKey) {
    console.warn('[OPTIMIZE] NVIDIA_API_KEY not set, skipping LLM analysis')
    return { cheapestNote: '', balancedNote: '' }
  }

  const prompt = `You are a cloud cost optimization expert. Analyze this application and provide brief, actionable insights.

Application:
- Framework: ${classification.framework}
- Type: ${classification.appType}
- Has Database: ${classification.hasDatabase}
- Has Queue: ${classification.hasQueue}
- Has WebSockets: ${classification.hasWebsockets}
- Is Stateful: ${classification.isStateful}
- CPU: ${classification.estimatedCPU}m
- Memory: ${classification.estimatedMemory}MB

Infrastructure Options:
1. Cheapest: ${options[0].service} - ${options[0].cost.displayPrice}
2. Balanced: ${options[1].service} - ${options[1].cost.displayPrice}

Provide TWO brief insights (max 15 words each):
1. One insight for the cheapest option (potential limitation or benefit)
2. One insight for the balanced option (when to choose it)

Respond in JSON format:
{
  "cheapest": "brief insight here",
  "balanced": "brief insight here"
}`

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      console.error('[OPTIMIZE] LLM API error:', response.status)
      return { cheapestNote: '', balancedNote: '' }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    
    // Try to parse JSON response
    try {
      const parsed = JSON.parse(content)
      return {
        cheapestNote: parsed.cheapest || '',
        balancedNote: parsed.balanced || '',
      }
    } catch {
      // If not valid JSON, extract insights from text
      const lines = content.split('\n').filter((l: string) => l.trim())
      return {
        cheapestNote: lines[0]?.substring(0, 100) || '',
        balancedNote: lines[1]?.substring(0, 100) || '',
      }
    }
  } catch (error) {
    console.error('[OPTIMIZE] LLM analysis failed:', error)
    return { cheapestNote: '', balancedNote: '' }
  }
}

// ---------------------------------------------------------------------------
// Generate Infrastructure Options
// ---------------------------------------------------------------------------

export async function generateInfrastructureOptions(
  classification: AppClassification,
  orgBudgetPreference: 'cheapest' | 'balanced' | 'performance' | null = null
): Promise<InfrastructureOptions> {

  const options: InfrastructureOption[] = []

  // Option 1: Cheapest viable option
  const cheapestService = selectCheapestService(classification)
  const cheapestCPU = classification.estimatedCPU
  const cheapestMemory = classification.estimatedMemory
  const cheapestCost = calculateMonthlyCost(cheapestService, cheapestCPU, cheapestMemory)

  options.push({
    id: 'cheapest',
    label: 'Cost-optimized',
    description: getCheapestDescription(cheapestService),
    service: cheapestService,
    cost: cheapestCost,
    cpu: cheapestCPU,
    memory: cheapestMemory,
    tradeoffs: getCheapestTradeoffs(cheapestService, classification),
    recommended: orgBudgetPreference === 'cheapest' || orgBudgetPreference === null,
  })

  // Option 2: Balanced (usually ECS Fargate)
  const balancedService = selectBalancedService(classification)
  const balancedCPU = Math.round(classification.estimatedCPU * 1.5)
  const balancedMemory = Math.round(classification.estimatedMemory * 1.5)
  const balancedCost = calculateMonthlyCost(balancedService, balancedCPU, balancedMemory)

  options.push({
    id: 'balanced',
    label: 'Balanced',
    description: getBalancedDescription(balancedService),
    service: balancedService,
    cost: balancedCost,
    cpu: balancedCPU,
    memory: balancedMemory,
    tradeoffs: getBalancedTradeoffs(balancedService),
    recommended: orgBudgetPreference === 'balanced',
  })

  // Option 3: Performance (more resources, same service or step up)
  const perfService = selectPerformanceService(classification)
  const perfCPU = classification.estimatedCPU * 2
  const perfMemory = classification.estimatedMemory * 2
  const perfCost = calculateMonthlyCost(perfService, perfCPU, perfMemory)

  options.push({
    id: 'performance',
    label: 'Performance',
    description: getPerformanceDescription(perfService),
    service: perfService,
    cost: perfCost,
    cpu: perfCPU,
    memory: perfMemory,
    tradeoffs: getPerformanceTradeoffs(perfService),
    recommended: orgBudgetPreference === 'performance',
  })

  // LLM analysis for non-obvious optimizations (only if complex app)
  let llmAnalysisUsed = false
  if (classification.hasDatabase || classification.hasQueue || classification.hasWebsockets) {
    const llmAdvice = await getLLMCostAdvice(classification, options)
    if (llmAdvice.cheapestNote) {
      options[0].llmNote = llmAdvice.cheapestNote
      llmAnalysisUsed = true
    }
    if (llmAdvice.balancedNote) {
      options[1].llmNote = llmAdvice.balancedNote
      llmAnalysisUsed = true
    }
  }

  return {
    options,
    defaultChoice: orgBudgetPreference || 'cheapest',
    analysisNotes: generateAnalysisNotes(classification),
    llmAnalysisUsed,
  }
}

// ---------------------------------------------------------------------------
// Description Generators
// ---------------------------------------------------------------------------

function getCheapestDescription(service: AWSService): string {
  switch (service) {
    case 'app_runner':
      return 'AWS App Runner — Scales to zero when idle, perfect for low-traffic apps'
    case 'ecs_fargate_spot':
      return 'ECS Fargate Spot — 70% discount on compute, ideal for fault-tolerant workloads'
    case 'ecs_fargate_no_alb':
      return 'ECS Fargate (worker) — No load balancer overhead, for background jobs'
    case 'cloudfront_s3':
      return 'S3 + CloudFront — Global CDN for static sites, pay only for traffic'
    default:
      return 'Cost-optimized infrastructure'
  }
}

function getBalancedDescription(service: AWSService): string {
  switch (service) {
    case 'ecs_fargate':
      return 'ECS Fargate — Production-grade reliability, moderate cost, full autoscaling'
    case 'cloudfront_s3':
      return 'S3 + CloudFront — Global CDN for static sites'
    default:
      return 'Balanced infrastructure'
  }
}

function getPerformanceDescription(service: AWSService): string {
  switch (service) {
    case 'eks_fargate':
      return 'EKS Fargate — Full Kubernetes orchestration for complex workloads'
    case 'ecs_fargate':
      return 'ECS Fargate (high-spec) — Double resources for peak traffic handling'
    default:
      return 'Performance-optimized infrastructure'
  }
}

// ---------------------------------------------------------------------------
// Tradeoff Generators
// ---------------------------------------------------------------------------

function getCheapestTradeoffs(service: AWSService, classification: AppClassification): string[] {
  switch (service) {
    case 'app_runner':
      return [
        'Cold starts after idle periods (~2-3 seconds)',
        'Limited to 4 vCPU / 12GB max',
        'Best for < 1000 req/min traffic',
      ]
    case 'ecs_fargate_spot':
      return [
        'Instances can be interrupted (2-min warning)',
        'Not suitable for stateful workloads',
        '70% cost savings vs on-demand',
      ]
    case 'ecs_fargate_no_alb':
      return [
        'No public HTTPS endpoint',
        'Ideal for workers and scheduled jobs',
        'Lower cost without load balancer',
      ]
    case 'cloudfront_s3':
      return [
        'Static files only (no server-side logic)',
        'Global edge caching included',
        'Extremely low cost at scale',
      ]
    default:
      return ['Cost-optimized configuration']
  }
}

function getBalancedTradeoffs(service: AWSService): string[] {
  switch (service) {
    case 'ecs_fargate':
      return [
        'Always-on (no cold starts)',
        'Full autoscaling from 1-100+ tasks',
        'Higher base cost than App Runner',
      ]
    default:
      return ['Balanced configuration']
  }
}

function getPerformanceTradeoffs(service: AWSService): string[] {
  switch (service) {
    case 'eks_fargate':
      return [
        'Full Kubernetes API access',
        'Complex to debug and operate',
        'Highest cost ($73/mo control plane + nodes)',
      ]
    case 'ecs_fargate':
      return [
        'More CPU/memory headroom',
        'Handles traffic spikes better',
        'Higher cost than balanced option',
      ]
    default:
      return ['Performance-optimized configuration']
  }
}

// ---------------------------------------------------------------------------
// Analysis Notes
// ---------------------------------------------------------------------------

function generateAnalysisNotes(classification: AppClassification): string[] {
  const notes: string[] = []

  if (classification.hasDatabase) {
    notes.push('Database detected — ensure connection pooling is configured')
  }

  if (classification.hasWebsockets) {
    notes.push('WebSockets require sticky sessions — App Runner not recommended')
  }

  if (classification.hasQueue) {
    notes.push('Queue system detected — consider separate worker service')
  }

  if (classification.isStateful) {
    notes.push('Stateful app — avoid Spot instances to prevent session loss')
  }

  if (classification.estimatedCPU < 512) {
    notes.push('Low CPU requirements — App Runner or Fargate Spot recommended')
  }

  if (classification.appType === 'static-site') {
    notes.push('Static site — S3 + CloudFront is the most cost-effective option')
  }

  return notes
}

// ---------------------------------------------------------------------------
// HTTP Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Auth
    const authHeader = req.headers.get('Authorization')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    )
    if (authError || !user) return errorResponse(401, 'Unauthorized')

    const body = await req.json()
    const { classification, org_budget_preference } = body

    if (!classification) {
      return errorResponse(400, 'Missing classification data')
    }

    // Generate infrastructure options
    const options = await generateInfrastructureOptions(
      classification,
      org_budget_preference || null
    )

    return jsonResponse({
      success: true,
      ...options,
    })

  } catch (error) {
    console.error('[OPTIMIZE] Error:', error)
    return errorResponse(500, (error as Error).message)
  }
})
