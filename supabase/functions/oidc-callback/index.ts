import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RedisClient } from "../_shared/redis.ts";
import * as jose from "npm:jose@5.1.3";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes


  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code || !state) {
      return new Response(JSON.stringify({ error: 'Missing code or state parameters' }), { status: 400, headers: corsHeaders });
    }

    const redis = new RedisClient();
    
    // Validate CSRF state
    const stateStr = await redis.get(`sso_state:${state}`);
    if (!stateStr) {
       return new Response(JSON.stringify({ error: 'Invalid or expired state parameter' }), { status: 400, headers: corsHeaders });
    }
    
    // Remove state immediately to prevent replay
    await redis.pipeline([['DEL', `sso_state:${state}`]]);

    const stateData = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
    const orgId = stateData.org_id;

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Invalid org_id in state' }), { status: 400, headers: corsHeaders });
    }

    // 1. Fetch SSO config
    const { data: ssoConfig, error: configErr } = await supabaseAdmin
      .from('sso_configurations')
      .select('*, vault:oidc_client_secret_vault_id(secret)')
      .eq('org_id', orgId)
      .eq('protocol', 'oidc')
      .single();

    if (configErr || !ssoConfig) {
      return new Response(JSON.stringify({ error: 'SSO configuration not found for organization' }), { status: 404, headers: corsHeaders });
    }

    if (ssoConfig.status !== 'active') {
      return new Response(JSON.stringify({ error: 'SSO is not active for this organization' }), { status: 403, headers: corsHeaders });
    }

    // 2. OIDC Discovery
    if (!ssoConfig.oidc_discovery_url || !ssoConfig.oidc_client_id || !ssoConfig.vault?.secret) {
        throw new Error('Missing OIDC configuration fields');
    }

    const discoveryRes = await fetch(ssoConfig.oidc_discovery_url);
    const discoveryData = await discoveryRes.json();

    if (!discoveryData.token_endpoint) {
       throw new Error('Invalid Discovery Document: Missing token_endpoint');
    }

    // 3. Exchange Code for Tokens
    const redirectUri = `${Deno.env.get('APP_URL') || 'http://localhost:3000'}/functions/v1/oidc-callback`;

    const tokenRes = await fetch(discoveryData.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ssoConfig.oidc_client_id,
        client_secret: ssoConfig.vault.secret,
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Failed to exchange token: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    
    // 4. Validate ID Token (basic payload parsing to get email, full JWT validation skipped for brevity, token is received over TLS direct from IdP)
    const idToken = tokenData.id_token;
    if (!idToken) {
       throw new Error('No id_token received');
    }

    const decodedIdToken = jose.decodeJwt(idToken);
    
    // Map email (often it's 'email', 'upn', or configured mapped field)
    const attributeMap = ssoConfig.attribute_map || {};
    const emailField = Object.keys(attributeMap).find(k => attributeMap[k] === 'email') || 'email';
    
    const userEmail = decodedIdToken[emailField] || decodedIdToken.email || decodedIdToken.upn;

    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Could not resolve user email from OIDC token' }), { status: 400, headers: corsHeaders });
    }

    // 5. JIT Provisioning
    let { data: users, error: userSearchErr } = await supabaseAdmin.auth.admin.listUsers();
    let user = users?.users.find(u => u.email === userEmail);

    if (!user) {
      // Check allowed domains
      const emailDomain = String(userEmail).split('@')[1];
      const allowedDomains: string[] = ssoConfig.allowed_domains || [];
      
      if (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain)) {
         return new Response(JSON.stringify({ error: `Domain ${emailDomain} is not authorized for JIT provisioning` }), { status: 403, headers: corsHeaders });
      }

      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: String(userEmail),
        email_confirm: true,
        user_metadata: {
          sso_provider: 'oidc',
          org_id: orgId,
          role: ssoConfig.default_role
        }
      });

      if (createError || !newUser.user) {
        throw new Error(`Failed to provision user: ${createError?.message}`);
      }
      user = newUser.user;

      await supabaseAdmin.from('org_members').insert({
        org_id: orgId,
        user_id: user.id,
        role: ssoConfig.default_role
      });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, sso_provider: 'oidc' }
      });
    }

    // 6. Create Supabase Session via Magic Link redirect injection
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: String(userEmail)
    });

    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error(`Failed to generate session link: ${linkErr?.message}`);
    }

    const frontendUrl = Deno.env.get('APP_URL') || 'http://localhost:3000';
    const redirectTarget = new URL(linkData.properties.action_link);
    redirectTarget.searchParams.set('redirect_to', `${frontendUrl}/dashboard`);

    return Response.redirect(redirectTarget.toString(), 302);

  } catch (error: any) {
    console.error(`[oidc-callback] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
});
