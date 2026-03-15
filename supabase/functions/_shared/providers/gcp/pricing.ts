// supabase/functions/_shared/providers/gcp/pricing.ts

// Prices as of Q1 2026 — us-central1 region
// Source: https://cloud.google.com/compute/vm-instance-pricing
export const GCP_PRICING = {
  gke: {
    standard_cluster_monthly: 73.00,   // Cluster management fee
    autopilot_per_pod_vcpu_hr: 0.0445,
    autopilot_per_pod_gb_hr:   0.00445,
  },
  compute: {
    'e2-medium':     { hourly: 0.0335,  vcpu: 1, ram_gb: 4  },
    'e2-standard-2': { hourly: 0.067,   vcpu: 2, ram_gb: 8  },
    'e2-standard-4': { hourly: 0.134,   vcpu: 4, ram_gb: 16 },
    'n2-standard-2': { hourly: 0.0971,  vcpu: 2, ram_gb: 8  },
    'n2-standard-4': { hourly: 0.1942,  vcpu: 4, ram_gb: 16 },
  },
  networking: {
    cloud_nat_monthly: 14.40,           // Cloud NAT gateway
    load_balancer_monthly: 18.00,       // Forwarding rule
    data_egress_per_gb: 0.08,
  },
  artifact_registry: {
    storage_per_gb_monthly: 0.10,
    data_transfer_per_gb: 0.08,
  }
};

export const GCP_SIZE_CONFIGS = {
  small:  { nodeInstance: 'e2-standard-2', nodeCount: 2, minReplicas: 1, maxReplicas: 3 },
  medium: { nodeInstance: 'e2-standard-4', nodeCount: 3, minReplicas: 2, maxReplicas: 6 },
  large:  { nodeInstance: 'n2-standard-4', nodeCount: 5, minReplicas: 3, maxReplicas: 10 },
};
