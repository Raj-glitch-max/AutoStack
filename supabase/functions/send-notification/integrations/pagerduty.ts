// PagerDuty Events API v2 Integration
// Sends AIRE incidents, COIE findings, and deployment failures to PagerDuty

export interface PagerDutyConfig {
  routing_key: string;
  alert_rules: {
    critical_incidents: boolean;
    high_incidents: boolean;
    medium_incidents: boolean;
    deployment_failures: boolean;
    coie_critical: boolean;
  };
}

export interface PagerDutyEvent {
  routing_key: string;
  event_action: 'trigger' | 'acknowledge' | 'resolve';
  dedup_key: string;
  payload: {
    summary: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    source: string;
    timestamp: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details: Record<string, any>;
  };
  links?: Array<{ href: string; text: string }>;
  images?: Array<{ src: string; alt: string }>;
}

export async function sendPagerDutyAlert(
  config: PagerDutyConfig,
  event: any
): Promise<{ success: boolean; error?: string }> {
  try {
    // Map event type to PagerDuty event
    const pdEvent = mapEventToPagerDuty(config, event);
    
    if (!pdEvent) {
      // Event filtered by alert rules
      return { success: true };
    }

    // Send to PagerDuty Events API v2
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.pagerduty+json;version=2'
      },
      body: JSON.stringify(pdEvent)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PagerDuty API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return { success: true };
  } catch (error: any) {
    console.error('[PagerDuty] Send failed:', error);
    return { success: false, error: error.message };
  }
}

function mapEventToPagerDuty(config: PagerDutyConfig, event: any): PagerDutyEvent | null {
  const { type, data } = event;

  // Check alert rules
  if (type === 'incident.detected') {
    const severity = data.severity;
    if (severity === 'critical' && !config.alert_rules.critical_incidents) return null;
    if (severity === 'high' && !config.alert_rules.high_incidents) return null;
    if (severity === 'medium' && !config.alert_rules.medium_incidents) return null;

    return {
      routing_key: config.routing_key,
      event_action: 'trigger',
      dedup_key: `autostack-incident-${data.id}`,
      payload: {
        summary: `${data.pattern}: ${data.title}`,
        severity: mapSeverity(severity),
        source: 'AutoStack AIRE',
        timestamp: new Date().toISOString(),
        component: data.affected_resource || 'unknown',
        group: data.environment || 'unknown',
        class: data.pattern,
        custom_details: {
          root_cause: data.root_cause,
          immediate_action: data.immediate_action,
          dashboard_url: `https://autostack.io/incidents/${data.id}`,
          cluster: data.cluster_id,
          namespace: data.namespace
        }
      },
      links: [{
        href: `https://autostack.io/incidents/${data.id}`,
        text: 'View in AutoStack'
      }]
    };
  }

  if (type === 'incident.resolved') {
    return {
      routing_key: config.routing_key,
      event_action: 'resolve',
      dedup_key: `autostack-incident-${data.id}`,
      payload: {
        summary: 'Incident resolved',
        severity: 'info',
        source: 'AutoStack AIRE',
        timestamp: new Date().toISOString(),
        custom_details: {}
      }
    };
  }

  if (type === 'deployment.failed' && config.alert_rules.deployment_failures) {
    return {
      routing_key: config.routing_key,
      event_action: 'trigger',
      dedup_key: `autostack-deployment-${data.id}`,
      payload: {
        summary: `Deployment failed: ${data.environment}`,
        severity: 'error',
        source: 'AutoStack Deploy',
        timestamp: new Date().toISOString(),
        component: data.environment,
        custom_details: {
          error: data.error_message,
          commit: data.commit_sha,
          dashboard_url: `https://autostack.io/deployments/${data.id}`
        }
      },
      links: [{
        href: `https://autostack.io/deployments/${data.id}`,
        text: 'View Deployment'
      }]
    };
  }

  if (type === 'finding.opened' && config.alert_rules.coie_critical) {
    if (data.severity !== 'critical') return null;

    return {
      routing_key: config.routing_key,
      event_action: 'trigger',
      dedup_key: `autostack-finding-${data.id}`,
      payload: {
        summary: `Cost optimization: ${data.title}`,
        severity: 'warning', // Cost alerts are warnings, not critical pages
        source: 'AutoStack COIE',
        timestamp: new Date().toISOString(),
        custom_details: {
          potential_savings: data.potential_savings,
          recommendation: data.recommendation,
          dashboard_url: `https://autostack.io/cost/${data.id}`
        }
      },
      links: [{
        href: `https://autostack.io/cost/${data.id}`,
        text: 'View Finding'
      }]
    };
  }

  return null;
}

function mapSeverity(severity: string): 'critical' | 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'critical': return 'critical';
    case 'high': return 'error';
    case 'medium': return 'warning';
    default: return 'info';
  }
}

export async function testPagerDutyConnection(config: PagerDutyConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const testEvent: PagerDutyEvent = {
      routing_key: config.routing_key,
      event_action: 'trigger',
      dedup_key: `autostack-test-${Date.now()}`,
      payload: {
        summary: 'AutoStack Integration Test',
        severity: 'info',
        source: 'AutoStack',
        timestamp: new Date().toISOString(),
        custom_details: {
          message: 'This is a test alert from AutoStack. If you see this, the integration is working correctly.'
        }
      }
    };

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.pagerduty+json;version=2'
      },
      body: JSON.stringify(testEvent)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `PagerDuty API error: ${response.status} - ${errorText}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const pagerdutyModule = {
  name: 'pagerduty',
  send: sendPagerDutyAlert,
  test: testPagerDutyConnection,
  configSchema: {
    routing_key: { type: 'string', required: true },
    alert_rules: {
      type: 'object',
      properties: {
        critical_incidents: { type: 'boolean', default: true },
        high_incidents: { type: 'boolean', default: true },
        medium_incidents: { type: 'boolean', default: false },
        deployment_failures: { type: 'boolean', default: false },
        coie_critical: { type: 'boolean', default: false }
      }
    }
  }
};
