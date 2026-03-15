/**
 * deploy-preview/index.ts — Preview Environment Deployment
 *
 * Deploys a preview environment within an existing staging cluster's namespace.
 * Key difference from full deploy: no new VPC/cluster — namespace-only.
 *
 * Flow:
 * 1. Validate the preview project and find its staging cluster
 * 2. Trigger CodeBuild for the image
 * 3. Create K8s namespace + Deployment (1 replica) + Service + Ingress
 * 4. Post deployment status back to GitHub commit
 * 5. Update project status
 *
 * Called by: github-webhook (on PR open/synchronize)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { getInstallationToken } from '../_shared/github.ts'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  try {
    const { project_id, commit_sha } = await req.json();

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: 'project_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Fetch the preview project with its staging cluster info
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*, clusters(*)')
      .eq('id', project_id)
      .single();

    if (projectErr || !project) {
      return new Response(
        JSON.stringify({ error: 'Preview project not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Update status to provisioning
    await supabase
      .from('projects')
      .update({
        provisioning_status: 'provisioning',
        die_stage: 'building',
        auto_destroy_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', project_id);

    // Broadcast progress event
    await supabase.from('infrastructure_events').insert({
      project_id,
      stage: 'preview_build',
      status: 'running',
      message: `Building preview image from ${commit_sha?.slice(0, 8) ?? 'latest'}...`,
    });

    // 3. Create deployment record
    const { data: deployment } = await supabase
      .from('deployments')
      .insert({
        project_id,
        cluster_id: project.cluster_id,
        commit_sha: commit_sha ?? 'HEAD',
        commit_msg: `Preview deploy for PR #${project.pr_number}`,
        branch: project.branch,
        status: 'running',
        triggered_by: 'github_pr',
      })
      .select()
      .single();

    // 4. Trigger the actual build (CodeBuild)
    // In production this calls AWS CodeBuild; here we delegate to build-and-deploy
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/build-and-deploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deployment_id: deployment?.id,
        project_id,
        commit_sha,
        is_preview: true,
        namespace: `pr-${project.pr_number}`,
        replicas: 1, // Previews always run 1 replica
      }),
    });

    // 5. Post deployment status to GitHub (pending)
    await postGitHubDeploymentStatus(
      supabase,
      project,
      commit_sha,
      'pending',
      `Preview deploying for PR #${project.pr_number}...`
    );

    // 6. Broadcast success event
    await supabase.from('infrastructure_events').insert({
      project_id,
      stage: 'preview_build',
      status: 'completed',
      message: 'Preview build triggered successfully',
    });

    return new Response(
      JSON.stringify({
        success: true,
        deployment_id: deployment?.id,
        message: `Preview deployment started for PR #${project.pr_number}`,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[deploy-preview] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ---------------------------------------------------------------------------
// GitHub Deployment Status API
// ---------------------------------------------------------------------------

async function postGitHubDeploymentStatus(
  supabase: any,
  project: any,
  sha: string,
  state: 'pending' | 'success' | 'failure',
  description: string
) {
  try {
    // Get the org's GitHub integration to find installation_id
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
    // e.g., https://github.com/owner/repo.git → owner/repo
    const repoPath = project.repo_url
      .replace('https://github.com/', '')
      .replace('.git', '');
    const [owner, repo] = repoPath.split('/');

    if (!owner || !repo || !sha) return;

    const previewUrl = project.live_url ?? `https://pr-${project.pr_number}.preview.autostack.app`;

    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AutoStack-Platform/1.0',
        },
        body: JSON.stringify({
          state,
          target_url: previewUrl,
          description: description.slice(0, 140), // GitHub max 140 chars
          context: 'AutoStack / preview',
        }),
      }
    );
  } catch (err: any) {
    // Non-fatal: status posting is informational
    console.error('[deploy-preview] GitHub status post failed:', err.message);
  }
}
