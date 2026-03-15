import { CORS_HEADERS } from '../_shared/cors.ts'
/**
 * github-webhook/index.ts — GitHub Webhook Event Handler
 *
 * Security-critical: publicly accessible, HMAC-verified.
 * Handles: push, pull_request, workflow_run, installation events.
 *
 * Key properties:
 * - HMAC signature verification (constant-time) before any processing
 * - Delivery ID idempotency via Redis (prevents duplicate processing on retries)
 * - [autostack-skip] loop prevention (ignores commits made by AutoStack itself)
 * - Returns 200 for all processed events (prevents GitHub from retrying)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { rateLimitCheck, rateLimitResponse } from '../_shared/rate-limiter.ts'

const GITHUB_WEBHOOK_SECRET = Deno.env.get('GITHUB_WEBHOOK_SECRET')

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Hub-Signature-256, X-GitHub-Event, X-GitHub-Delivery',
}

// ---------------------------------------------------------------------------
// HMAC Signature Verification (constant-time)
// ---------------------------------------------------------------------------

async function verifyHMAC(body: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !GITHUB_WEBHOOK_SECRET) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(GITHUB_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body)
  );

  const expected = 'sha256=' + Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (signatureHeader.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signatureHeader.length; i++) {
    diff |= signatureHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Idempotency: process each delivery exactly once
// ---------------------------------------------------------------------------

async function isAlreadyProcessed(redis: ReturnType<typeof createRedisClient>, deliveryId: string): Promise<boolean> {
  const key = `github:delivery:${deliveryId}`;
  const existing = await redis.get(key);
  if (existing) return true;
  // RULE B5: 1-hour TTL (GitHub stops retrying after ~1 hour)
  await redis.set(key, '1', 3600);
  return false;
}

// ---------------------------------------------------------------------------
// Helper: JSON response with CORS
// ---------------------------------------------------------------------------

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  // Read body as text FIRST — required for HMAC verification before parsing
  const bodyText = await req.text();

  // STEP 1: Verify HMAC signature
  const signature = req.headers.get('x-hub-signature-256');
  const isValid = await verifyHMAC(bodyText, signature);
  if (!isValid) {
    console.error('[github-webhook] Invalid HMAC signature');
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  const redis = createRedisClient();

  // Rate limiting (by source IP)
  const sourceIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rlResult = await rateLimitCheck(redis, 'github-webhook', sourceIp);
  if (!rlResult.pass) {
    return rateLimitResponse('github-webhook', rlResult.resetIn, CORS_HEADERS);
  }

  const event = req.headers.get('x-github-event');
  const deliveryId = req.headers.get('x-github-delivery');

  // STEP 2: Idempotency check
  if (deliveryId && await isAlreadyProcessed(redis, deliveryId)) {
    return jsonResponse({ status: 'already_processed' });
  }

  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  console.log(`[github-webhook] event=${event} delivery=${deliveryId}`);

  // STEP 3: Route to handler
  try {
    switch (event) {
      case 'push':
        await handlePush(supabase, payload);
        break;

      case 'pull_request':
        await handlePullRequest(supabase, payload);
        break;

      case 'workflow_run':
        await handleWorkflowRun(supabase, payload);
        break;

      case 'installation':
      case 'installation_repositories':
        await handleInstallation(supabase, payload);
        break;

      default:
        console.log(`[github-webhook] Unhandled event: ${event}`);
    }

    return jsonResponse({ status: 'ok', event });
  } catch (err: any) {
    console.error(`[github-webhook] Handler error (${event}):`, err);
    // Return 500 for unexpected errors — GitHub will retry
    return jsonResponse({ error: err.message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handlePush(supabase: any, payload: any) {
  const repoUrl = payload.repository.clone_url;
  const branch = payload.ref.replace('refs/heads/', '');
  const commitSha = payload.after;
  const commitMsg = payload.head_commit?.message ?? '';
  const pusher = payload.pusher?.name ?? 'unknown';

  // Loop prevention: skip commits made by AutoStack itself
  if (commitMsg.includes('[autostack-skip]') || commitMsg.startsWith('chore(autostack):')) {
    console.log('[github-webhook] Skipping AutoStack-generated commit');
    return;
  }

  // Find matching live project for this repo + branch
  const { data: project } = await supabase
    .from('projects')
    .select('id, cluster_id, name, environment, provisioning_status, cloud_credential_id')
    .eq('repo_url', repoUrl)
    .eq('branch', branch)
    .eq('provisioning_status', 'live')
    .maybeSingle();

  if (!project) return; // No matching project — silently ignore

  // Create deployment record
  const { data: deployment } = await supabase
    .from('deployments')
    .insert({
      project_id: project.id,
      cluster_id: project.cluster_id,
      commit_sha: commitSha,
      commit_msg: commitMsg.slice(0, 200),
      branch,
      status: 'running',
      triggered_by: 'github_push',
    })
    .select()
    .single();

  if (!deployment) {
    console.error('[github-webhook] Failed to create deployment record');
    return;
  }

  // Trigger redeploy asynchronously — webhook must return quickly
  // @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
  EdgeRuntime.waitUntil(
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/deploy-redeploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: project.id,
        deployment_id: deployment.id,
        commit_sha: commitSha,
        commit_msg: commitMsg.slice(0, 200),
        pusher,
      }),
    })
  );
}

async function handlePullRequest(supabase: any, payload: any) {
  const { action, pull_request, repository } = payload;
  const prNumber = pull_request.number;
  const prBranch = pull_request.head.ref;
  const repoUrl = repository.clone_url;

  if (action === 'opened' || action === 'synchronize') {
    // Find the staging project for this repo (to clone cluster/credentials)
    const { data: stagingProject } = await supabase
      .from('projects')
      .select('id, cluster_id, cloud_credential_id, name, org_id')
      .eq('repo_url', repoUrl)
      .eq('environment', 'staging')
      .eq('provisioning_status', 'live')
      .maybeSingle();

    if (!stagingProject) {
      console.log(`[github-webhook] No staging environment for ${repoUrl} — skipping preview`);
      return;
    }

    const previewEnvName = `pr-${prNumber}`;

    // Check if preview already exists
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('repo_url', repoUrl)
      .eq('environment', previewEnvName)
      .maybeSingle();

    if (!existing) {
      // Create new preview environment record
      const { data: preview } = await supabase
        .from('projects')
        .insert({
          org_id: stagingProject.org_id,
          cluster_id: stagingProject.cluster_id,
          cloud_credential_id: stagingProject.cloud_credential_id,
          name: `${stagingProject.name}-pr-${prNumber}`,
          repo_url: repoUrl,
          branch: prBranch,
          environment: previewEnvName,
          pr_number: prNumber,
          pr_branch: prBranch,
          pr_title: pull_request.title,
          auto_destroy_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          provisioning_status: 'pending',
        })
        .select()
        .single();

      if (preview) {
        // Trigger preview build (namespace-only, no new cluster)
        // @ts-ignore EdgeRuntime.waitUntil
        EdgeRuntime.waitUntil(
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/deploy-preview`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              project_id: preview.id,
              commit_sha: pull_request.head.sha,
            }),
          })
        );
      }
    } else {
      // Update existing preview with new commit
      // @ts-ignore EdgeRuntime.waitUntil
      EdgeRuntime.waitUntil(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/deploy-redeploy`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: existing.id,
            commit_sha: pull_request.head.sha,
          }),
        })
      );
    }
  }

  if (action === 'closed') {
    // Destroy preview on PR close/merge
    const { data: preview } = await supabase
      .from('projects')
      .select('id')
      .eq('repo_url', repoUrl)
      .eq('environment', `pr-${prNumber}`)
      .maybeSingle();

    if (preview) {
      // @ts-ignore EdgeRuntime.waitUntil
      EdgeRuntime.waitUntil(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/infra-teardown`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ project_id: preview.id }),
        })
      );
    }
  }
}

async function handleWorkflowRun(supabase: any, payload: any) {
  if (payload.action !== 'completed') return;

  const run = payload.workflow_run;

  // Find matching project for pipeline tracking
  const { data: project } = await supabase
    .from('projects')
    .select('id, cluster_id')
    .eq('repo_url', payload.repository.clone_url)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) return;

  await supabase.from('pipelines').upsert({
    project_id: project.id,
    cluster_id: project.cluster_id,
    github_run_id: String(run.id),
    branch: run.head_branch,
    commit_sha: run.head_sha,
    status: run.conclusion, // 'success' | 'failure' | 'cancelled' | 'skipped'
    duration_ms: new Date(run.updated_at).getTime() - new Date(run.created_at).getTime(),
    started_at: run.created_at,
    completed_at: run.updated_at,
  }, { onConflict: 'github_run_id' });
}

async function handleInstallation(supabase: any, payload: any) {
  const action = payload.action;
  const installationId = String(payload.installation.id);
  const accountLogin = payload.installation.account?.login;

  console.log(`[github-webhook] Installation ${action}: ${accountLogin} (${installationId})`);

  if (action === 'deleted' || action === 'suspend') {
    // GitHub App was removed — mark integration as disconnected
    await supabase
      .from('integrations')
      .update({ status: 'disconnected' })
      .eq('config->>installation_id', installationId);
  }

  // 'created' is handled by github-app-callback (OAuth flow).
  // 'new_permissions_accepted' is informational — no action needed.
}
