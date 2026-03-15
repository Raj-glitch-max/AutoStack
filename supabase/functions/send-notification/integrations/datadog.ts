// Datadog Metrics Export Integration
// Exports AutoStack cluster metrics to Datadog every 60 seconds

export interface DatadogConfig {
  api_key: string;
  app_key: string;
  site: 'US' | 'EU' | 'US3' | 'US5'; // datadoghq.com, datadoghq.eu, etc.
}

export interface DatadogMetric {
  metric: string;
  points: Array<{ timestamp: number; value: number }>;
  type: 'gauge' | 'count' | 'rate';
  tags: string[];
}

export async function exportMetricsToDatadog(
  config: DatadogConfig,
  metrics: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const ddMetrics = mapToDatadogMetrics(metrics);
    
    const apiUrl = getDatadogApiUrl(config.site);
    const response = await fetch(`${apiUrl}/api/v2/series`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.api_key
      },
      body: JSON.stringify({ series: ddMetrics })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Datadog API error: ${response.status} - ${errorText}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Datadog] Export failed:', error);
    return { success: false, error: error.message };
  }
}

function mapToDatadogMetrics(data: any): DatadogMetric[] {
  const timestamp = Math.floor(Date.now() / 1000);
  const { cluster, environment, provider, region } = data;
  
  const baseTags = [
    `environment:${environment}`,
    `cluster:${cluster}`,
    `provider:${provider}`,
    `region:${region}`,
    'autostack:true'
  ];

  return [
    // Cluster-level metrics
    {
      metric: 'autostack.cluster.health_score',
      points: [{ timestamp, value: data.health_score || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.cluster.cpu_pct',
      points: [{ timestamp, value: data.cpu_usage_pct || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.cluster.memory_pct',
      points: [{ timestamp, value: data.memory_usage_pct || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.cluster.node_count',
      points: [{ timestamp, value: data.node_count || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.cluster.pod_count',
      points: [{ timestamp, value: data.pod_count || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    
    // Cost metrics
    {
      metric: 'autostack.cost.estimated_monthly',
      points: [{ timestamp, value: data.estimated_monthly_cost || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.cost.potential_savings',
      points: [{ timestamp, value: data.potential_savings || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    
    // Deployment metrics
    {
      metric: 'autostack.deployments.count',
      points: [{ timestamp, value: data.deployments_24h || 0 }],
      type: 'count',
      tags: baseTags
    },
    {
      metric: 'autostack.deployments.success_rate',
      points: [{ timestamp, value: data.deployment_success_rate || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.deployments.avg_duration',
      points: [{ timestamp, value: data.avg_deployment_duration || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    
    // AIRE metrics
    {
      metric: 'autostack.incidents.active_count',
      points: [{ timestamp, value: data.active_incidents || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.incidents.resolved_today',
      points: [{ timestamp, value: data.resolved_incidents_today || 0 }],
      type: 'count',
      tags: baseTags
    },
    
    // COIE metrics
    {
      metric: 'autostack.findings.open_critical',
      points: [{ timestamp, value: data.open_critical_findings || 0 }],
      type: 'gauge',
      tags: baseTags
    },
    {
      metric: 'autostack.findings.open_high',
      points: [{ timestamp, value: data.open_high_findings || 0 }],
      type: 'gauge',
      tags: baseTags
    }
  ];
}

function getDatadogApiUrl(site: string): string {
  switch (site) {
    case 'EU': return 'https://api.datadoghq.eu';
    case 'US3': return 'https://api.us3.datadoghq.com';
    case 'US5': return 'https://api.us5.datadoghq.com';
    default: return 'https://api.datadoghq.com';
  }
}

export async function testDatadogConnection(config: DatadogConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const apiUrl = getDatadogApiUrl(config.site);
    
    // Validate API key by sending a test metric
    const testMetric: DatadogMetric = {
      metric: 'autostack.test.connection',
      points: [{ timestamp: Math.floor(Date.now() / 1000), value: 1 }],
      type: 'gauge',
      tags: ['test:true', 'autostack:true']
    };

    const response = await fetch(`${apiUrl}/api/v2/series`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.api_key
      },
      body: JSON.stringify({ series: [testMetric] })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Datadog API error: ${response.status} - ${errorText}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const datadogModule = {
  name: 'datadog',
  send: exportMetricsToDatadog,
  test: testDatadogConnection,
  configSchema: {
    api_key: { type: 'string', required: true, sensitive: true },
    app_key: { type: 'string', required: true, sensitive: true },
    site: { type: 'string', enum: ['US', 'EU', 'US3', 'US5'], default: 'US' }
  }
};
