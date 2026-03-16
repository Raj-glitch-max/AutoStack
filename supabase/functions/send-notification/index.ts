import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRedisClient } from '../_shared/redis.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const NOTIFICATION_SECRET = Deno.env.get('NOTIFICATION_SECRET')
const APP_URL = Deno.env.get('APP_URL') || 'https://autostack.io'

interface NotificationRequest {
  type: string;
  org_id: string;
  cluster_id?: string;
  recipient_email: string;
  recipient_name: string;
  payload: any;
}

// HMAC Token Generator for Unsubscribe
async function generateUnsubscribeToken(userId: string, prefType: string) {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'fallback-secret'
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${userId}:${prefType}`))
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // 1. Auth Check (Internal Secret or Service Role)
    const authHeader = req.headers.get('Authorization')
    const providedSecret = authHeader?.replace('Bearer ', '')
    if (providedSecret !== NOTIFICATION_SECRET && providedSecret !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const { type, org_id, cluster_id, recipient_email, recipient_name, payload }: NotificationRequest = await req.json()

    const redis = createRedisClient()

    // 2. Quota Check
    const today = new Date().toISOString().split('T')[0]
    const quotaKey = `email:quota:${today}`
    const currentQuota = await redis.incr(quotaKey)
    if (currentQuota === 1) await redis.expire(quotaKey, 86400)
    if (currentQuota > 100) {
      console.warn(`[Notif] Quota exceeded: ${currentQuota}/100`)
      return new Response(JSON.stringify({ success: false, reason: 'quota_exceeded' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Cooldown Check
    const throttleTypes = ['incident_detected', 'score_changed', 'agent_disconnected', 'finding_critical']
    if (throttleTypes.includes(type)) {
      const cooldownKey = `notif:cooldown:${org_id}:${cluster_id || 'global'}:${type}`
      const active = await redis.get(cooldownKey)
      if (active) return new Response(JSON.stringify({ success: false, reason: 'cooldown_active' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
      await redis.set(cooldownKey, "1", 1800)
    }

    // 4. Slack Delivery
    try {
      const { data: slackIntegration } = await supabase
        .from('integrations')
        .select('config')
        .eq('org_id', org_id)
        .eq('name', 'slack')
        .eq('status', 'connected')
        .single()
      
      if (slackIntegration?.config?.webhook_url) {
        await sendToSlack(slackIntegration.config.webhook_url, type, payload)
      }
    } catch (slackErr: any) {
      console.error("[Notif] Slack delivery failed:", slackErr.message)
    }

    // 5. Prefs Check
    const typeToPrefMap: Record<string, string> = {
      incident_detected: 'event_incident',
      score_changed: 'event_score_change',
      agent_disconnected: 'event_incident',
      incident_resolved: 'event_incident',
      finding_critical: 'event_incident',
      weekly_digest: 'event_weekly_digest'
    }

    const prefCol = typeToPrefMap[type]
    if (prefCol) {
      const { data: owner } = await supabase.from('org_members').select('user_id').eq('org_id', org_id).eq('role', 'owner').single()
      if (owner) {
        const { data: prefs } = await supabase.from('notification_prefs').select(prefCol).eq('user_id', owner.user_id).single()
        if (prefs && prefs[prefCol] === false) {
           return new Response(JSON.stringify({ success: false, reason: 'pref_disabled' }), {
               headers: { ...corsHeaders, 'Content-Type': 'application/json' }
           })
        }
      }
    }

    // 6. Build Email
    const { subject, html } = await buildEmail(type, payload, recipient_name, org_id)

    // 7. Resend Delivery
    if (RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'AutoStack <alerts@notifications.autostack.io>',
            to: recipient_email,
            subject,
            html
          })
        })

        if (!res.ok) {
            const resErr = await res.json()
            throw new Error(`Resend failed: ${resErr.message}`)
        }

        const resData = await res.json()
        return new Response(JSON.stringify({ success: true, email_id: resData.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } else {
        console.warn("[Notif] RESEND_API_KEY not set. Skipping email.")
        return new Response(JSON.stringify({ success: true, warning: 'email_skipped' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

  } catch (err: unknown) {
    const error = err as Error
    console.error("[Notif] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// --- Template Library ---

async function buildEmail(type: string, payload: any, name: string, org_id: string) {
    const unsubToken = await generateUnsubscribeToken(payload.user_id || org_id, 'event_incident')
    const footer = `<p style="font-size: 12px; color: #666; margin-top: 40px;">
        AutoStack Monitoring | <a href="${APP_URL}/unsubscribe?token=${unsubToken}&type=event_incident">Unsubscribe</a>
    </p>`

    switch (type) {
        case 'welcome':
            return {
                subject: `Welcome to AutoStack, ${name}! 🚀`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #6366f1;">Welcome to AutoStack!</h2>
                        <p>Hi ${name},</p>
                        <p>Your organization <strong>${payload.org_name}</strong> is ready. Here's what you can do next:</p>
                        <ol style="line-height: 2;">
                            <li><strong>Connect your AWS account</strong> — We'll need an IAM role to provision infrastructure.</li>
                            <li><strong>Connect your GitHub repository</strong> — AutoStack will analyze your code and generate Kubernetes manifests.</li>
                            <li><strong>Click Deploy</strong> — We handle VPC, EKS, ALB, and everything in between.</li>
                        </ol>
                        <br/>
                        <a href="${APP_URL}/onboarding" style="background: #6366f1; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Get Started →</a>
                        <p style="margin-top: 20px; color: #666;">Your 14-day Pro trial has started. No credit card required.</p>
                        ${footer}
                    </div>
                `
            }

        case 'incident_detected':
            return {
                subject: `🚨 AutoStack: ${payload.severity?.toUpperCase() || 'HIGH'} severity incident — ${payload.pattern_display || 'Issue detected'}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #ef4444;">🚨 Incident Detected</h2>
                        <p>AIRE has diagnosed an incident in your cluster.</p>
                        <div style="background: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
                            <p style="margin: 0; font-weight: bold; color: #991b1b;">${payload.pattern_display || payload.summary}</p>
                            <p style="margin: 8px 0 0 0; color: #7f1d1d;">Confidence: ${Math.round((payload.confidence || 0) * 100)}%</p>
                        </div>
                        <h3 style="color: #1f2937;">Root Cause</h3>
                        <p>${payload.root_cause || 'See dashboard for details.'}</p>
                        <h3 style="color: #1f2937;">Immediate Action</h3>
                        <p>${payload.immediate_action || 'Check the affected resource.'}</p>
                        <br/>
                        <a href="${APP_URL}/dashboard/incidents" style="background: #ef4444; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">View Incident →</a>
                        ${footer}
                    </div>
                `
            }

        case 'finding_critical':
            return {
                subject: `⚠️ AutoStack: Critical finding${(payload.findings?.length || 0) > 1 ? 's' : ''} detected`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #f59e0b;">⚠️ COIE Critical Finding</h2>
                        <p>The Cloud Operations Intelligence Engine found <strong>${payload.findings?.length || 1}</strong> critical issue(s) in your cluster.</p>
                        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            ${(payload.findings || []).map((f: any) => `
                                <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #fef3c7;">
                                    <p style="margin: 0; font-weight: bold; color: #92400e;">${f.title}</p>
                                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #78350f;">${f.resource} — ${f.description}</p>
                                </div>
                            `).join('')}
                            <p style="margin: 8px 0 0 0; font-weight: bold;">Health Score: ${payload.health_score}/100</p>
                        </div>
                        <br/>
                        <a href="${APP_URL}/dashboard/infrastructure" style="background: #f59e0b; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Review Findings →</a>
                        ${footer}
                    </div>
                `
            }

        case 'score_changed':
            return {
                subject: `📊 AutoStack: Health score changed to ${payload.new_score}/100`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #3b82f6;">📊 Health Score Update</h2>
                        <p>Your cluster health score has changed.</p>
                        <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <span style="font-size: 36px; font-weight: bold; color: ${(payload.new_score || 0) >= 80 ? '#10b981' : (payload.new_score || 0) >= 50 ? '#f59e0b' : '#ef4444'};">${payload.new_score}</span>
                            <span style="font-size: 18px; color: #6b7280;">/100</span>
                            <p style="margin: 8px 0 0 0; color: #4b5563;">Previous: ${payload.old_score || 'N/A'}</p>
                        </div>
                        <br/>
                        <a href="${APP_URL}/dashboard" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard →</a>
                        ${footer}
                    </div>
                `
            }

        case 'agent_disconnected':
            return {
                subject: `🔴 AutoStack: Agent disconnected from cluster`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #ef4444;">🔴 Agent Disconnected</h2>
                        <p>The AutoStack agent in your cluster has stopped sending heartbeats.</p>
                        <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0;"><strong>Cluster:</strong> ${payload.cluster_name || 'Unknown'}</p>
                            <p style="margin: 8px 0 0 0;"><strong>Last heartbeat:</strong> ${payload.last_heartbeat || 'Unknown'}</p>
                        </div>
                        <p>Without the agent, AutoStack cannot collect metrics, detect incidents, or run COIE checks. Please verify the agent pod is running:</p>
                        <pre style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 13px;">kubectl get pods -n autostack-system</pre>
                        <br/>
                        <a href="${APP_URL}/dashboard/infrastructure" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Infrastructure →</a>
                        ${footer}
                    </div>
                `
            }

        case 'invite_member':
            return {
                subject: `You've been invited to join ${payload.org_name} on AutoStack`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #6366f1;">You're Invited! 🎉</h2>
                        <p>You have been invited to join <strong>${payload.org_name}</strong> on AutoStack.</p>
                        <div style="background: #eef2ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0;"><strong>Role:</strong> ${payload.role || 'Member'}</p>
                            <p style="margin: 8px 0 0 0;"><strong>Organization:</strong> ${payload.org_name}</p>
                        </div>
                        <br/>
                        <a href="${APP_URL}/signup?invite=${payload.token}" style="background: #6366f1; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Accept Invitation →</a>
                        <p style="margin-top: 20px; color: #666;">This invitation expires in 7 days.</p>
                        ${footer}
                    </div>
                `
            }

        case 'deploy_success':
            return {
                subject: `🚀 AutoStack: Your project ${payload.project_name} is LIVE!`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #10b981;">🎉 Deployment Successful</h2>
                        <p>Your project <strong>${payload.project_name}</strong> has been successfully deployed to your <strong>${payload.provider}</strong> account.</p>
                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Environment:</strong> ${payload.environment}</p>
                            <p><strong>Region:</strong> ${payload.region}</p>
                            <p><strong>Monthly Cost (Est):</strong> $${payload.cost_estimate}</p>
                        </div>
                        <br/>
                        <a href="${payload.live_url}" style="background: #10b981; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Visit Your App →</a>
                        <p style="margin-top: 20px;">
                            <a href="${payload.dashboard_url}" style="color: #6366f1; text-decoration: none;">View Infra in Dashboard</a>
                        </p>
                        ${footer}
                    </div>
                `
            }

        case 'cost_savings_found':
            return {
                subject: `💰 AutoStack: We found $${payload.total_savings}/mo in potential savings`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #3b82f6;">💰 Cost Optimization Alert</h2>
                        <p>COIE has analyzed your environments and identified <strong>${payload.opportunity_count}</strong> opportunities to reduce your AWS bill.</p>
                        <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="font-size: 24px; margin: 0; font-weight: bold; color: #1d4ed8;">$${payload.total_savings}/month</p>
                            <p style="margin: 5px 0 0 0; color: #1e40af;">Total projected savings</p>
                        </div>
                        <h3>Top Opportunities</h3>
                        <ul style="padding-left: 20px;">
                            ${payload.opportunities.map((o: any) => `<li><strong>${o.resource}:</strong> ${o.description} (Save $${o.savings}/mo)</li>`).join('')}
                        </ul>
                        <br/>
                        <a href="${payload.dashboard_url}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review & Fix in Dashboard →</a>
                        ${footer}
                    </div>
                `
            }

        default:
            return {
                subject: `AutoStack Update: ${type.replace(/_/g, ' ')}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px;">
                        <h2 style="color: #6366f1;">AutoStack Update</h2>
                        <p>New update for your AutoStack account: <strong>${type.replace(/_/g, ' ')}</strong></p>
                        ${payload.summary ? `<p>${payload.summary}</p>` : ''}
                        <br/>
                        <a href="${APP_URL}/dashboard" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard →</a>
                        ${footer}
                    </div>
                `
            }
    }
}

async function sendToSlack(webhookUrl: string, type: string, payload: any) {
    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: `🚀 AutoStack: ${type.replace(/_/g, ' ').toUpperCase()}` }
        },
        {
            type: "section",
            text: { type: "mrkdwn", text: `*Cluster:* ${payload.cluster_name || 'N/A'}\n*Summary:* ${payload.summary || payload.pattern_display || 'New event detected.'}` }
        },
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: { type: "plain_text", text: "View Details →" },
                    url: payload.dashboard_url || `${APP_URL}/dashboard`
                }
            ]
        }
    ]

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
    })
}
