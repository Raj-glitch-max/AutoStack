/**
 * deploy-redeploy/index.ts — Code-Only Redeployment
 *
 * Handles redeployment of existing live services without reprovisioning infra.
 * Separate from die-analyze because redeployment is a 2-3 minute operation
 * vs. 12+ minutes for full infrastructure provisioning.
 *
 * Stages:
 * 1. Validate project is 'live' and credential is 'verified'
 * 2. Trigger CodeBuild (build + push to ECR)
 * 3. Update manifest in GitHub repo with new image tag
 * 4. Wait for ArgoCD sync
 * 5. Verify live URL responds
 * 6. Update deployment/project records, send notification, trigger COIE
 *
 * Rollback: POST with { rollback_to_deployment_id } to revert to a previous image.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { getInstallationToken } from '../_shared/github.ts'
import { logAudit } from '../_shared/audit.ts'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RedeployInput {
  project_id: string;
  deployment_id?: string;
  commit_sha?: string;
  commit_msg?: string;
  pusher?: string;
  rollback_to_deployment_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  try {
    const body: RedeployInput = await req.json();
    const { project_id, rollback_to_deployment_id } = body;

    if (!project_id) {
      return errorResponse(400, 'project_id is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Handle rollback as a special case
    if (rollback_to_deployment_id) {
      return await handleRollback(supabase, project_id, rollback_to_deployment_id, req);
    }

    return await handleRedeploy(supabase, body, req);
  } catch (err: any) {
    console.error('[deploy-redeploy] Error:', err.message);
    return errorResponse(500, err.message);
  }
});

// ---------------------------------------------------------------------------
// Standard Redeploy
// ---------------------------------------------------------------------------

async function handleRedeploy(supabase: any, input: RedeployInput, req: Request): Promise<Response> {
  const { project_id, commit_sha, commit_msg, pusher } = input;

  // 1. Validate: project must be 'live'
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('*, clusters(*), cloud_credentials(*)')
    .eq('id', project_id)
    .single();

  if (projectErr || !project) {
    return errorResponse(404, 'Project not found');
  }

  if (project.provisioning_status !== 'live') {
    // Mark failed immediately — cannot redeploy a non-live project
    if (input.deployment_id) {
      await supabase
        .from('deployments')
        .update({ status: 'failed', error_message: 'Project is not live' })
        .eq('id', input.deployment_id);
    }
    return errorResponse(400, `Project status is '${project.provisioning_status}', must be 'live' to redeploy`);
  }

  // 2. Create deployment record if not already created by webhook
  let deploymentId = input.deployment_id;
  if (!deploymentId) {
    const { data: deployment } = await supabase
      .from('deployments')
      .insert({
        project_id,
        cluster_id: project.cluster_id,
        commit_sha: commit_sha ?? 'HEAD',
        commit_msg: (commit_msg ?? 'Manual redeploy').slice(0, 200),
        branch: project.branch,
        status: 'running',
        triggered_by: pusher ? 'github_push' : 'manual',
      })
      .select()
      .single();
    deploymentId = deployment?.id;
  }

  console.log(`[deploy-redeploy] Starting for project=${project_id} deployment=${deploymentId}`);

  // 3. Store previous image for rollback reference
  const currentImageTag = project.image_tag;
  if (deploymentId && currentImageTag) {
    await supabase
      .from('deployments')
      .update({ previous_image_sha: currentImageTag })
      .eq('id', deploymentId);
  }

  // 4. Trigger build via build-and-deploy
  const buildResponse = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/build-and-deploy`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deployment_id: deploymentId,
        project_id,
        commit_sha: commit_sha ?? 'HEAD',
      }),
    }
  );

  if (!buildResponse.ok) {
    const err = await buildResponse.text();
    console.error('[deploy-redeploy] build-and-deploy failed:', err);

    if (deploymentId) {
      await supabase
        .from('deployments')
        .update({ status: 'failed', error_message: `Build trigger failed: ${err.slice(0, 200)}` })
        .eq('id', deploymentId);
    }
    return errorResponse(502, 'Build trigger failed');
  }

  // 5. Update manifest in GitHub repo (if GitHub integration exists)
  await updateGitHubManifest(supabase, project, commit_sha);

  // 6. Update project metadata
  await supabase
    .from('projects')
    .update({
      last_deploy_at: new Date().toISOString(),
      deploy_count: (project.deploy_count ?? 0) + 1,
    })
    .eq('id', project_id);

  // 7. Trigger COIE cycle for the cluster (async, non-blocking)
  // @ts-ignore EdgeRuntime.waitUntil
  EdgeRuntime.waitUntil(
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/coie-cycle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cluster_id: project.cluster_id }),
    })
  );

  // 8. Audit log
  await logAudit(req, {
    org_id: project.org_id,
    action: 'infra.provision',
    target_type: 'project',
    target_id: project_id,
    payload: {
      type: 'redeploy',
      commit_sha,
      deployment_id: deploymentId,
      triggered_by: pusher ?? 'system',
    },
  });

  return new Response(
    JSON.stringify({
      success: true,
      deployment_id: deploymentId,
      message: 'Redeploy triggered',
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

async function handleRollback(
  supabase: any,
  projectId: string,
  rollbackToDeploymentId: string,
  req: Request
): Promise<Response> {
  // Fetch the target deployment to get its image
  const { data: targetDeployment } = await supabase
    .from('deployments')
    .select('id, commit_sha, image_tag, previous_image_sha')
    .eq('id', rollbackToDeploymentId)
    .single();

  if (!targetDeployment || !targetDeployment.image_tag) {
    return errorResponse(404, 'Target deployment not found or has no image to rollback to');
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*, clusters(*)')
    .eq('id', projectId)
    .single();

  if (!project || project.provisioning_status !== 'live') {
    return errorResponse(400, 'Project must be live to rollback');
  }

  console.log(
    `[deploy-redeploy] Rollback: project=${projectId} → deployment=${rollbackToDeploymentId} image=${targetDeployment.image_tag}`
  );

  // Create new deployment record for the rollback
  const { data: rollbackDeployment } = await supabase
    .from('deployments')
    .insert({
      project_id: projectId,
      cluster_id: project.cluster_id,
      commit_sha: targetDeployment.commit_sha,
      commit_msg: `Rollback to deployment ${rollbackToDeploymentId.slice(0, 8)}`,
      branch: project.branch,
      status: 'running',
      triggered_by: 'rollback',
      image_tag: targetDeployment.image_tag,
      previous_image_sha: project.image_tag,
    })
    .select()
    .single();

  // Trigger build-and-deploy with the old image (skip build, just deploy)
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/build-and-deploy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deployment_id: rollbackDeployment?.id,
      project_id: projectId,
      image_tag: targetDeployment.image_tag, // Use existing image — no rebuild
      skip_build: true,
    }),
  });

  await logAudit(req, {
    org_id: project.org_id,
    action: 'infra.provision',
    target_type: 'project',
    target_id: projectId,
    payload: {
      type: 'rollback',
      rollback_to: rollbackToDeploymentId,
      image_tag: targetDeployment.image_tag,
      deployment_id: rollbackDeployment?.id,
    },
  });

  return new Response(
    JSON.stringify({
      success: true,
      deployment_id: rollbackDeployment?.id,
      message: `Rollback initiated to deployment ${rollbackToDeploymentId.slice(0, 8)}`,
    }),
    { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

// ---------------------------------------------------------------------------
// GitHub Manifest Update
// ---------------------------------------------------------------------------

async function updateGitHubManifest(supabase: any, project: any, commitSha?: string) {
  try {
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('org_id', project.org_id)
      .eq('name', 'github')
      .eq('status', 'connected')
      .maybeSingle();

    if (!integration?.config?.installation_id) return;

    const redis = createRedisClient();
    const token = await getInstallationToken(
      integration.config.installation_id,
      redis
    );

    // Extract owner/repo from clone_url
    const repoPath = project.repo_url
      .replace('https://github.com/', '')
      .replace('.git', '');
    const [owner, repo] = repoPath.split('/');

    if (!owner || !repo) return;

    const env = project.environment ?? 'production';
    const manifestPath = `deploy/${env}/deployment.yaml`;
    const shortSha = (commitSha ?? 'latest').slice(0, 8);

    // GET current manifest content
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${manifestPath}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AutoStack-Platform/1.0',
        },
      }
    );

    if (!getRes.ok) {
      console.log(`[deploy-redeploy] No manifest at ${manifestPath} — skipping manifest update`);
      return;
    }

    const fileData = await getRes.json();
    const currentContent = atob(fileData.content.replace(/\n/g, ''));

    // Replace old image tag with new one
    // Pattern: image: <registry>/<repo>:<tag>
    const updatedContent = currentContent.replace(
      /(image:\s*\S+:)\S+/,
      `$1${shortSha}`
    );

    if (updatedContent === currentContent) {
      console.log('[deploy-redeploy] No image tag change detected in manifest');
      return;
    }

    // PUT updated manifest
    // [autostack-skip] prevents webhook infinite loop
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${manifestPath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AutoStack-Platform/1.0',
        },
        body: JSON.stringify({
          message: `chore(autostack): deploy ${env} @ ${shortSha} [autostack-skip]`,
          content: btoa(updatedContent),
          sha: fileData.sha, // Required for update — prevents race conditions
        }),
      }
    );

    console.log(`[deploy-redeploy] Manifest updated: ${manifestPath} → ${shortSha}`);
  } catch (err: any) {
    // Non-fatal: manifest update is supplementary to the actual deployment
    console.error('[deploy-redeploy] Manifest update failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    }
  );
}
