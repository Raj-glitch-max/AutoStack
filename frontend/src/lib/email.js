/**
 * AutoStack Email Service Wrapper (Resend)
 * ⚠️ COST GUARDRAIL: Rate limited to 10 emails/day on free tier
 */

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY;
const API_URL = 'https://api.resend.com/emails';

export const sendEmail = async ({ to, subject, html, text }) => {
    if (!RESEND_API_KEY) {
        console.warn('Email skipped: VITE_RESEND_API_KEY not configured');
        return { success: false, error: 'Missing API Key' };
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'AutoStack <alerts@updates.autostack.io>',
                to: Array.isArray(to) ? to : [to],
                subject,
                html: html || text,
                text: text || html,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to send email');
        }

        if (import.meta.env.DEV) console.log(`Email sent successfully: ${data.id}`);
        return { success: true, id: data.id };
    } catch (error) {
        console.error('Email service error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Common transactional templates
 */
export const EmailTemplates = {
    IncidentAlert: (clusterName, incidentTitle) => ({
        subject: `[AutoStack] Critical Incident: ${clusterName}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #ef4444;">Critical Incident Detected</h2>
                <p><strong>Cluster:</strong> ${clusterName}</p>
                <p><strong>Incident:</strong> ${incidentTitle}</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p>AIRE Engine is currently diagnosing the root cause. You will receive an update once a remediation playbook is ready.</p>
                <a href="${import.meta.env.VITE_APP_URL}/dashboard/overview" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Dashboard</a>
            </div>
        `
    }),
    InviteToOrg: (orgName, inviterName) => ({
        subject: `You've been invited to join ${orgName} on AutoStack`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2>Welcome to AutoStack</h2>
                <p><strong>${inviterName}</strong> has invited you to join the <strong>${orgName}</strong> organization.</p>
                <p>Accept the invitation to start managing Kubernetes clusters with intelligent automation.</p>
                <a href="${import.meta.env.VITE_APP_URL}/signup" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join Organization</a>
            </div>
        `
    })
};
