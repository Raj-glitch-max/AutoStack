import { CORS_HEADERS } from '../_shared/cors.ts'
/**
 * github-app-callback/index.ts — OAuth Callback for GitHub App Installation
 *
 * Called when a user completes the GitHub App installation flow.
 * Validates CSRF state, fetches installation details, and stores integration.
 *
 * Security:
 * - CSRF state validated with constant-time comparison
 * - State token consumed immediately (one-time use, 10-min TTL)
 * - Installation tokens cached in Redis only, never in the database
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { getInstallationToken, validateInstallState } from '../_shared/github.ts'
import { logAudit } from '../_shared/audit.ts'

const APP_URL = Deno.env.get('APP_URL')

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Hub-Signature-256, x-client-info, apikey",
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // CORS OPTIONS handler (Audit a1)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  const url = new URL(req.url);
  const installationId = url.searchParams.get('installation_id');
  const setupAction = url.searchParams.get('setup_action');
  const state = url.searchParams.get('state');

  if (!installationId || !state) {
    return new Response(JSON.stringify({ error: 'Missing installation_id or state' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }


  try {
    const redis = createRedisClient();

    // Decode state to extract org_id
    let orgId: string;
    try {
      const decoded = atob(state);
      orgId = decoded.split(':')[0];
    } catch {
      return new Response(JSON.stringify({ error: 'Malformed state parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // CSRF validation — constant-time comparison, one-time use
    const isValidState = await validateInstallState(redis, orgId, state);
    if (!isValidState) {
      return new Response(JSON.stringify({ error: 'Invalid or expired state' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Exchange for installation token (caches in Redis — RULE G2)
    const token = await getInstallationToken(installationId, redis);

    // Fetch installation details from GitHub
    const installRes = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AutoStack-Platform/1.0',
        },
      }
    );

    if (!installRes.ok) {
      const err = await installRes.json();
      throw new Error(`Failed to fetch installation details: ${err.message}`);
    }

    const installData = await installRes.json();

    // Upsert integration record — no tokens stored in DB
    const { error: upsertErr } = await supabase.from('integrations').upsert(
      {
        org_id: orgId,
        name: 'github',
        status: 'connected',
        config: {
          installation_id: installationId,
          account_login: installData.account?.login,
          account_type: installData.account?.type,
          app_id: installData.app_id,
          permissions: installData.permissions,
          repository_selection: installData.repository_selection,
        },
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,name' }
    );

    if (upsertErr) throw upsertErr;

    // Audit log
    await logAudit(req, {
      org_id: orgId,
      action: 'auth.change',
      target_type: 'organization',
      target_id: orgId,
      payload: {
        integration: 'github',
        installation_id: installationId,
        account_login: installData.account?.login,
      },
    });

    // Redirect to dashboard
    return Response.redirect(
      `${APP_URL}/dashboard?tab=settings&connected=github`,
      303
    );
  } catch (err: any) {
    console.error('[github-app-callback] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
});
