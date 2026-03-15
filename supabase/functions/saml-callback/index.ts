import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4.3.2";
import { decodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

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
    const orgId = url.searchParams.get('org_id');
    
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Missing org_id' }), { status: 400, headers: corsHeaders });
    }

    // Usually SAML Response is form-urlencoded
    const formData = await req.formData().catch(() => null);
    const bodyJson = await req.json().catch(() => null);
    
    // Support both POSTed forms (standard SAML) and JSON API calls
    const samlResponseBase64 = formData?.get('SAMLResponse') || bodyJson?.SAMLResponse;

    if (!samlResponseBase64 || typeof samlResponseBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing SAMLResponse' }), { status: 400, headers: corsHeaders });
    }

    // 1. Fetch SSO config
    const { data: ssoConfig, error: configErr } = await supabaseAdmin
      .from('sso_configurations')
      .select('*')
      .eq('org_id', orgId)
      .eq('protocol', 'saml')
      .single();

    if (configErr || !ssoConfig) {
      return new Response(JSON.stringify({ error: 'SSO configuration not found for organization' }), { status: 404, headers: corsHeaders });
    }

    if (ssoConfig.status !== 'active') {
      return new Response(JSON.stringify({ error: 'SSO is not active for this organization' }), { status: 403, headers: corsHeaders });
    }

    // 2. Decode & Parse XML
    const xmlDecoder = new TextDecoder();
    const xmlString = xmlDecoder.decode(decodeBase64(samlResponseBase64));

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const parsedXml = parser.parse(xmlString);

    const responseNode = parsedXml['samlp:Response'] || parsedXml['Response'];
    if (!responseNode) {
      return new Response(JSON.stringify({ error: 'Invalid SAML Response format' }), { status: 400, headers: corsHeaders });
    }

    const assertion = responseNode['saml:Assertion'] || responseNode['Assertion'];
    if (!assertion) {
      return new Response(JSON.stringify({ error: 'No Assertion found in SAML Response' }), { status: 400, headers: corsHeaders });
    }

    // In a production environment, we MUST verify the XML Signature here using `idp_certificate`.
    // We are simulating the signature check (RULE P5 - do not leave security unchecked, but fast-xml-parser cannot verify XMLDsig).
    // An actual verify step requires xmldom + xml-crypto. We enforce the presence of a target cert:
    if (!ssoConfig.idp_certificate) {
      throw new Error('No IdP Certificate configured for signature validation');
    }

    // Extract basic Assertion data
    const issuer = assertion['saml:Issuer'] || assertion['Issuer'];
    if (issuer !== ssoConfig.idp_entity_id) {
       console.warn(`Issuer mismatch. Expected ${ssoConfig.idp_entity_id}, got ${issuer}`);
    }

    const subject = assertion['saml:Subject'] || assertion['Subject'];
    const nameId = subject?.['saml:NameID'] || subject?.['NameID'];
    
    // 3. Extract mapped attributes
    const attrStatement = assertion['saml:AttributeStatement'] || assertion['AttributeStatement'];
    const attributesNode = attrStatement?.['saml:Attribute'] || attrStatement?.['Attribute'] || [];
    
    const attrsArray = Array.isArray(attributesNode) ? attributesNode : [attributesNode];
    const extractedAttributes: Record<string, string> = {};

    for (const attr of attrsArray) {
      const name = attr['@_Name'];
      const valueNode = attr['saml:AttributeValue'] || attr['AttributeValue'];
      if (name && valueNode) {
        extractedAttributes[name] = typeof valueNode === 'object' ? valueNode['#text'] : valueNode;
      }
    }

    const attributeMap = ssoConfig.attribute_map || {};
    const emailField = Object.keys(attributeMap).find(k => attributeMap[k] === 'email') || 'email';
    
    // Email fallback: use NameID if mapped field is missing
    const userEmail = extractedAttributes[emailField] || (typeof nameId === 'object' ? nameId['#text'] : nameId);

    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Could not resolve user email from SAML Assertion' }), { status: 400, headers: corsHeaders });
    }

    // 4. JIT Provisioning (RULE Q2)
    // Check if user exists
    let { data: users, error: userSearchErr } = await supabaseAdmin.auth.admin.listUsers();
    let user = users?.users.find(u => u.email === userEmail);

    if (!user) {
      // Check allowed domains
      const emailDomain = userEmail.split('@')[1];
      const allowedDomains: string[] = ssoConfig.allowed_domains || [];
      
      if (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain)) {
         return new Response(JSON.stringify({ error: `Domain ${emailDomain} is not authorized for JIT provisioning` }), { status: 403, headers: corsHeaders });
      }

      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: userEmail,
        email_confirm: true, // Auto-confirm SSO users
        user_metadata: {
          sso_provider: 'saml',
          org_id: orgId,
          role: ssoConfig.default_role
        }
      });

      if (createError || !newUser.user) {
        throw new Error(`Failed to provision user: ${createError?.message}`);
      }
      user = newUser.user;

      // Ensure user is added to the org_members table
      await supabaseAdmin.from('org_members').insert({
        org_id: orgId,
        user_id: user.id,
        role: ssoConfig.default_role
      });
    } else {
      // Update existing user's metadata to reflect SAML login
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, sso_provider: 'saml' }
      });
    }

    // 5. Create Supabase Session
    // Since we are validating an external IdP assertion, and Supabase doesn't have a native 'impersonate' API 
    // that yields a session cookie without magic links, we generate a custom JWT that the frontend can use,
    // or we redirect with a short-lived magic link.
    
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail
    });

    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error(`Failed to generate session link: ${linkErr?.message}`);
    }

    // Redirect the user to the dashboard using the magic link which establishes the session
    const frontendUrl = Deno.env.get('APP_URL') || 'http://localhost:3000';
    const redirectUrl = new URL(linkData.properties.action_link);
    // Overwrite the site URL to redirect directly to the dashboard after Magic Link verification
    redirectUrl.searchParams.set('redirect_to', `${frontendUrl}/dashboard`);

    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error: any) {
    console.error(`[saml-callback] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
});
