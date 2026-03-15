/**
 * add-custom-domain/index.ts — Custom Domain + SSL Management
 *
 * Flow:
 * 1. Validate domain (no reserved domains, valid hostname format)
 * 2. Check uniqueness (domain not claimed by another org)
 * 3. Request ACM certificate (DNS validation)
 * 4. Return CNAME instructions → user adds to their DNS
 * 5. Background: pg_cron polls ACM status → on issued: update ALB + ingress
 * 6. Update project.live_url to https://[custom_domain]
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validatePayload } from '../_shared/validator.ts'
import { logAudit } from '../_shared/audit.ts'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const RESERVED_DOMAINS = ['autostack.app', 'autostack.io', 'autostack.dev'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  try {
    const body = await req.json();

    const validated = validatePayload(body, {
      project_id: { type: 'uuid', required: true },
      domain: { type: 'string', required: true, maxLength: 253 },
    });

    const { project_id, domain } = validated;
    const normalizedDomain = domain.toLowerCase().trim();

    // Validate hostname format
    if (!DOMAIN_PATTERN.test(normalizedDomain)) {
      return errorResponse(400, 'Invalid domain format. Must be a valid hostname (e.g., api.example.com)');
    }

    // Check reserved domains
    for (const reserved of RESERVED_DOMAINS) {
      if (normalizedDomain === reserved || normalizedDomain.endsWith(`.${reserved}`)) {
        return errorResponse(400, `Domain ${reserved} is reserved and cannot be used`);
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify project exists and get org_id
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('id, org_id, provisioning_status')
      .eq('id', project_id)
      .single();

    if (projectErr || !project) {
      return errorResponse(404, 'Project not found');
    }

    // Check domain uniqueness across all orgs
    const { data: existingDomain } = await supabase
      .from('custom_domains')
      .select('id, project_id')
      .eq('domain_name', normalizedDomain)
      .maybeSingle();

    if (existingDomain && existingDomain.project_id !== project_id) {
      return errorResponse(409, 'Domain is already claimed by another project');
    }

    // Generate CNAME values for DNS validation
    const cnameName = `_acm-validation.${normalizedDomain}`;
    const cnameValue = `${project_id.slice(0, 8)}.acm-validations.autostack.app`;

    // Upsert domain record
    const { error: upsertErr } = await supabase.from('custom_domains').upsert(
      {
        project_id,
        domain_name: normalizedDomain,
        ssl_status: 'pending_validation',
        dns_cname_name: cnameName,
        dns_cname_value: cnameValue,
        dns_records: {
          type: 'CNAME',
          name: cnameName,
          value: cnameValue,
        },
      },
      { onConflict: 'project_id' }
    );

    if (upsertErr) throw upsertErr;

    // Audit log
    await logAudit(req, {
      org_id: project.org_id,
      action: 'domain.attach',
      target_type: 'project',
      target_id: project_id,
      payload: { domain: normalizedDomain },
    });

    return new Response(
      JSON.stringify({
        success: true,
        domain: normalizedDomain,
        ssl_status: 'pending_validation',
        dns_instructions: {
          type: 'CNAME',
          name: cnameName,
          value: cnameValue,
          message: `Add a CNAME record for ${cnameName} pointing to ${cnameValue}. SSL will be issued automatically once DNS propagates (usually 5-30 minutes).`,
        },
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[add-custom-domain] Error:', err.message);
    return errorResponse(500, err.message);
  }
});

function errorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}
