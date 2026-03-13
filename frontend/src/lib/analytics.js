// PostHog analytics integration
// ⚠️ COST GUARDRAIL: PostHog free tier = 1M events/mo
// Only track meaningful actions, not page views

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

let posthogLoaded = false;

async function ensureLoaded() {
    if (posthogLoaded || !POSTHOG_KEY) return;
    try {
        const posthog = (await import('posthog-js')).default;
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            autocapture: false,       // cost guardrail: manual tracking only
            capture_pageview: false,  // cost guardrail: no automatic pageviews
            persistence: 'localStorage',
        });
        window.__posthog = posthog;
        posthogLoaded = true;
    } catch {
        // PostHog not installed — analytics silently disabled
    }
}

export const analytics = {
    async identify(userId, properties = {}) {
        await ensureLoaded();
        window.__posthog?.identify(userId, properties);
    },
    async track(event, properties = {}) {
        await ensureLoaded();
        window.__posthog?.capture(event, properties);
    },
    async reset() {
        await ensureLoaded();
        window.__posthog?.reset();
    },
};
