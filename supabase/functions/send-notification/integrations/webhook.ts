// Custom Webhook Integration
// Forwards AutoStack events to user-defined HTTPS endpoints with HMAC signing

import { createHmac } from "https://deno.land/std@0.192.0/node/crypto.ts";

export interface WebhookConfig {
  url: string;
  secret_vault_id: string; // HMAC secret stored in Vault
  events: string[]; // Event filters: ['deployment.live', 'incident.detected', etc.]
  headers?: Record<string, string>; // Optional custom headers
}

export interface WebhookPayload {
  id: string; // Unique event ID for idempotency
  event: string;
  created_at: string;
  org_id: string;
  data: Record<string, any>;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: 'success' | 'failed';
  response_code?: number;
  duration_ms: number;
  error?: string;
  timestamp: string;
}

export async function sendWebhook(
  config: WebhookConfig,
  event: any,
  secret: string
): Promise<{ success: boolean; error?: string; delivery: WebhookDelivery }> {
  const startTime = Date.now();
  const deliveryId = crypto.randomUUID();

  try {
    const { type, data, org_id } = event;

    // Check if event matches filters
    if (!matchesEventFilter(type, config.events)) {
      return {
        success: true,
        delivery: {
          id: deliveryId,
          event: type,
          status: 'success',
          duration_ms: 0,
          timestamp: new Date().toISOString()
        }
      };
    }

    const payload: WebhookPayload = {
      id: deliveryId,
      event: type,
      created_at: new Date().toISOString(),
      org_id,
      data
    };

    const body = JSON.stringify(payload);
    const signature = generateSignature(body, secret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-AutoStack-Signature': `sha256=${signature}`,
      'X-AutoStack-Delivery': deliveryId,
      'User-Agent': 'AutoStack-Webhook/1.0',
      ...config.headers
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return {
      success: true,
      delivery: {
        id: deliveryId,
        event: type,
        status: 'success',
        response_code: response.status,
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Webhook] Delivery failed:', error);

    return {
      success: false,
      error: error.message,
      delivery: {
        id: deliveryId,
        event: event.type,
        status: 'failed',
        duration_ms: duration,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    };
  }
}

function matchesEventFilter(eventType: string, filters: string[]): boolean {
  if (filters.length === 0) return true;

  for (const filter of filters) {
    // Support wildcard matching: 'incident.*' matches 'incident.detected', 'incident.resolved'
    if (filter.endsWith('.*')) {
      const prefix = filter.slice(0, -2);
      if (eventType.startsWith(prefix + '.')) return true;
    } else if (filter === eventType) {
      return true;
    }
  }

  return false;
}

function generateSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

export async function testWebhookConnection(
  config: WebhookConfig,
  secret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const testPayload: WebhookPayload = {
      id: crypto.randomUUID(),
      event: 'test.connection',
      created_at: new Date().toISOString(),
      org_id: 'test',
      data: {
        message: 'This is a test webhook from AutoStack. If you receive this, the integration is working correctly.'
      }
    };

    const body = JSON.stringify(testPayload);
    const signature = generateSignature(body, secret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-AutoStack-Signature': `sha256=${signature}`,
      'X-AutoStack-Delivery': testPayload.id,
      'User-Agent': 'AutoStack-Webhook/1.0',
      ...config.headers
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Retry logic for failed webhooks
export async function retryWebhook(
  config: WebhookConfig,
  event: any,
  secret: string,
  attempt: number = 1
): Promise<{ success: boolean; error?: string }> {
  const maxAttempts = 3;
  const retryDelays = [0, 5 * 60 * 1000, 30 * 60 * 1000]; // 0, 5min, 30min

  for (let i = attempt; i <= maxAttempts; i++) {
    if (i > 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelays[i - 1]));
    }

    const result = await sendWebhook(config, event, secret);
    
    if (result.success) {
      return { success: true };
    }

    if (i === maxAttempts) {
      return { success: false, error: `Failed after ${maxAttempts} attempts: ${result.error}` };
    }
  }

  return { success: false, error: 'Unexpected retry failure' };
}

export const webhookModule = {
  name: 'webhook',
  send: sendWebhook,
  test: testWebhookConnection,
  retry: retryWebhook,
  configSchema: {
    url: { type: 'string', required: true, pattern: '^https://' },
    secret_vault_id: { type: 'string', required: true, sensitive: true },
    events: { type: 'array', items: { type: 'string' }, default: [] },
    headers: { type: 'object', required: false }
  }
};
