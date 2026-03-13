// Sentry error tracking integration
// ⚠️ COST GUARDRAIL: Sentry free tier = 5K errors/mo
// Only captures unhandled exceptions + explicit captureException calls

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

let sentryLoaded = false;

async function ensureLoaded() {
    if (sentryLoaded || !SENTRY_DSN) return;
    try {
        const Sentry = await import('@sentry/react');
        Sentry.init({
            dsn: SENTRY_DSN,
            environment: import.meta.env.MODE,
            tracesSampleRate: 0.1,  // cost guardrail: 10% of transactions
            replaysOnErrorSampleRate: 0, // cost guardrail: no replays
            beforeSend(event) {
                // Strip PII from error events
                if (event.user) { delete event.user.ip_address; }
                return event;
            },
        });
        window.__sentry = Sentry;
        sentryLoaded = true;
    } catch {
        // Sentry not installed — error tracking silently disabled
    }
}

export const errorTracker = {
    async init() {
        await ensureLoaded();
    },
    async captureException(error, context = {}) {
        await ensureLoaded();
        window.__sentry?.captureException(error, { extra: context });
    },
    async setUser(user) {
        await ensureLoaded();
        window.__sentry?.setUser(user ? { id: user.id, email: user.email } : null);
    },
};
