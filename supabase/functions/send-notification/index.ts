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
    const unsubToken = await generateUnsubscribeToken(payload.user_id || org_id, 'event_incident') // Simplified for now
    const footer = `<p style="font-size: 12px; color: #666; margin-top: 40px;">
        AutoStack Monitoring | <a href="${APP_URL}/unsubscribe?token=${unsubToken}&type=event_incident">Unsubscribe</a>
    </p>`

    switch (type) {
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
                subject: `AutoStack Update: ${type}`,
                html: `<p>New update for your AutoStack account: ${type}</p>${footer}`
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
