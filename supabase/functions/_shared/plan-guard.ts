/**
 * plan-guard.ts — Plan Limit Enforcement
 *
 * Non-bypassable plan enforcement at the Edge Function layer.
 * Every resource-creating function must call assertCanDeploy() before provisioning.
 *
 * Plan limits are defined here, not in the database, to prevent
 * users from modifying their own limits via SQL injection.
 */

export const PLAN_LIMITS = {
  free: {
    max_live_environments: 1,
    max_nodes_total: 3,
    max_deployments_per_day: 5,
    features: new Set([
      'coie_read',
      'aire_detect',
      'basic_logs',
    ]),
  },
  pro: {
    max_live_environments: 10,
    max_nodes_total: 50,
    max_deployments_per_day: -1,
    features: new Set([
      'coie_read', 'coie_fix',
      'aire_detect', 'aire_remediate',
      'custom_domain', 'preview_environments', 'full_logs',
    ]),
  },
  team: {
    max_live_environments: 50,
    max_nodes_total: 200,
    max_deployments_per_day: -1,
    features: new Set([
      'everything', 'compliance_export', 'slack_alerts',
      'audit_log_api', 'sso',
    ]),
  },
  enterprise: {
    max_live_environments: -1,
    max_nodes_total: -1,
    max_deployments_per_day: -1,
    features: new Set([
      'everything', 'on_premise', 'sla', 'custom_msa',
    ]),
  },
} as const;

type PlanName = keyof typeof PLAN_LIMITS;

export class PlanLimitError extends Error {
  upgradeUrl: string;
  currentPlan: string;
  requiredPlan: string;
  code = 'PLAN_LIMIT_EXCEEDED' as const;

  constructor(message: string, currentPlan: string, requiredPlan: string) {
    super(message);
    this.upgradeUrl = 'https://autostack.io/pricing';
    this.currentPlan = currentPlan;
    this.requiredPlan = requiredPlan;
  }
}

/**
 * Asserts that the org's plan allows deploying another environment.
 * Throws PlanLimitError if the limit is reached.
 */
export async function assertCanDeploy(supabase: any, orgId: string): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single();

  if (!org) throw new Error('Organization not found');

  const plan = (org.plan ?? 'free') as PlanName;
  const limits = PLAN_LIMITS[plan];

  if (!limits) throw new Error(`Unknown plan: ${plan}`);

  // Count live environments
  const { count } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('provisioning_status', 'live');

  const liveCount = count ?? 0;

  if (limits.max_live_environments !== -1 && liveCount >= limits.max_live_environments) {
    const nextPlan = plan === 'free' ? 'pro' : plan === 'pro' ? 'team' : 'enterprise';
    throw new PlanLimitError(
      `${capitalize(plan)} plan allows ${limits.max_live_environments} live environment${limits.max_live_environments === 1 ? '' : 's'}. ` +
      `You currently have ${liveCount}. Upgrade to ${capitalize(nextPlan)} for more.`,
      plan,
      nextPlan
    );
  }
}

/**
 * Checks if a feature is available on the org's plan.
 */
export async function assertFeatureAvailable(
  supabase: any,
  orgId: string,
  feature: string
): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single();

  if (!org) throw new Error('Organization not found');

  const plan = (org.plan ?? 'free') as PlanName;
  const limits = PLAN_LIMITS[plan];

  if (limits.features.has('everything')) return; // Team+ gets everything

  if (!limits.features.has(feature)) {
    throw new PlanLimitError(
      `The "${feature}" feature requires a higher plan.`,
      plan,
      'pro'
    );
  }
}

/**
 * Converts a PlanLimitError to a structured 403 Response.
 */
export function planLimitResponse(err: PlanLimitError, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: err.message,
      code: err.code,
      upgrade_url: err.upgradeUrl,
      current_plan: err.currentPlan,
      required_plan: err.requiredPlan,
    }),
    {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
