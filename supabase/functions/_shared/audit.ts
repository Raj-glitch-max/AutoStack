import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * audit.ts - Unified Audit Logging for AutoStack
 * Ensures all high-stakes actions are recorded for compliance and security.
 */

type AuditAction =
  | 'infra.provision'
  | 'infra.provision.preview'
  | 'infra.teardown'
  | 'domain.attach'
  | 'billing.update'
  | 'auth.change';

interface AuditLogOptions {
  org_id: string;
  action: AuditAction;
  target_type: 'project' | 'organization' | 'cluster';
  target_id: string;
  payload?: Record<string, any>;
}

/**
 * Records an audit log entry in the database.
 * Uses service role to ensure records cannot be tampered with by clients.
 */
export async function logAudit(req: Request, options: AuditLogOptions) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const { error } = await supabase.from('audit_logs').insert({
    org_id: options.org_id,
    action: options.action,
    target_type: options.target_type,
    target_id: options.target_id,
    payload: {
        ...options.payload,
        metadata: {
            ip,
            ua: userAgent,
            path: new URL(req.url).pathname
        }
    }
  })

  if (error) {
    console.error(`[Audit] Failed to record action ${options.action}:`, error);
  }
}
