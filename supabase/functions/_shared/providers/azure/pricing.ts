// supabase/functions/_shared/providers/azure/pricing.ts

// Prices as of Q1 2026 — East US region
// Source: https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/
export const AZURE_PRICING = {
  aks: {
    standard_cluster_monthly: 73.00,   // Uptime SLA management fee
    free_cluster_monthly: 0,           // No SLA
  },
  compute: {
    'Standard_B2s':  { hourly: 0.0416,  vcpu: 2, ram_gb: 4  }, // Small
    'Standard_D2s_v3':{ hourly: 0.096,   vcpu: 2, ram_gb: 8  }, // Medium
    'Standard_D4s_v3':{ hourly: 0.192,   vcpu: 4, ram_gb: 16 }, // Large
  },
  networking: {
    nat_gateway_monthly: 32.85,         // Azure NAT Gateway
    load_balancer_monthly: 18.25,       // Standard Load Balancer base
    data_egress_per_gb: 0.087,
  },
  container_registry: {
    basic_monthly: 5.00,
    storage_per_gb_monthly: 0.10,
  }
};

export const AZURE_SIZE_CONFIGS = {
  small:  { nodeInstance: 'Standard_D2s_v3', nodeCount: 2, minReplicas: 1, maxReplicas: 3 },
  medium: { nodeInstance: 'Standard_D4s_v3', nodeCount: 3, minReplicas: 2, maxReplicas: 6 },
  large:  { nodeInstance: 'Standard_D8s_v3', nodeCount: 5, minReplicas: 3, maxReplicas: 10 },
};
