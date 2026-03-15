// supabase/functions/_shared/providers/gcp/index.ts

import {
  CloudProvider,
  ValidationResult,
  VPCParams,
  ClusterParams,
  BuildParams,
  TeardownResult,
  NormalizedMetrics,
  InfrastructurePlan,
} from '../interface.ts';
import { validateGCPCredentials } from './auth.ts';
import { GCP_PRICING, GCP_SIZE_CONFIGS } from './pricing.ts';

/**
 * GCP Provider implementation.
 * Abstracts Google Cloud (VPC, GKE, Artifact Registry, Cloud Build) provisioning operations.
 */
export class GCPProvider implements CloudProvider {
  readonly name = 'gcp';
  private credentialsStr: string;

  constructor(credentials: Record<string, string>) {
    // Expect the full JSON contents as a string under the 'service_account_json' key
    this.credentialsStr = credentials.service_account_json || '{}';
  }

  async validateCredentials(creds: Record<string, string>): Promise<ValidationResult> {
    const credsStr = creds.service_account_json || '{}';
    return await validateGCPCredentials(credsStr);
  }

  async createVPC(params: VPCParams): Promise<string> {
    // GCP VPCs are global. Subnets are regional.
    // Real implementation would call Google Compute API.
    return `projects/${params.projectId}/global/networks/autostack-vpc`;
  }

  async createSubnets(vpcId: string, params: VPCParams): Promise<string[]> {
    return [
      `projects/${params.projectId}/regions/${params.region}/subnetworks/autostack-subnet-1`,
      `projects/${params.projectId}/regions/${params.region}/subnetworks/autostack-subnet-2`,
    ];
  }

  async createCluster(params: ClusterParams): Promise<string> {
    // Real implementation would call GKE API.
    return `projects/${params.projectId}/locations/${params.region}/clusters/autostack-gke`;
  }

  async createRegistry(projectId: string, region: string, name: string): Promise<string> {
    // Real implementation would call Artifact Registry API.
    return `${region}-docker.pkg.dev/${projectId}/${name}`;
  }

  async createLoadBalancer(clusterId: string, params: any): Promise<string> {
    return `${clusterId}-lb.gcp.autostack.internal`;
  }

  async buildAndPushImage(params: BuildParams): Promise<string> {
    // Replaces CodeBuild with Google Cloud Build
    const imageUri = `${params.registryUrl}/${params.projectId}:${params.imageTag}`;
    return imageUri;
  }

  async applyManifests(clusterId: string, manifests: string[]): Promise<void> {
    // Connect to GKE cluster and apply K8s manifests
  }

  async teardown(projectId: string, rollbackData: Record<string, string>): Promise<TeardownResult> {
    return { deleted: [], failed: [], orphaned: [] };
  }

  async getClusterMetrics(clusterId: string): Promise<NormalizedMetrics> {
    return {
      cpuUtilization: 0,
      memoryUtilization: 0,
      activeNodes: 0,
      runningPods: 0,
    };
  }

  estimateMonthlyCost(size: string, region: string): InfrastructurePlan {
    const sizeConfig = GCP_SIZE_CONFIGS[size as keyof typeof GCP_SIZE_CONFIGS] || GCP_SIZE_CONFIGS.small;
    const instancePrice = GCP_PRICING.compute[sizeConfig.nodeInstance as keyof typeof GCP_PRICING.compute]?.hourly || 0.05;
    
    const computeCost = instancePrice * 24 * 30 * sizeConfig.nodeCount;
    const gkeFee = GCP_PRICING.gke.standard_cluster_monthly;
    const natFee = GCP_PRICING.networking.cloud_nat_monthly;
    const lbFee = GCP_PRICING.networking.load_balancer_monthly;
    
    return {
      monthlyTotal: computeCost + gkeFee + natFee + lbFee,
      currency: 'USD',
      breakdown: {
        compute: computeCost,
        controlPlane: gkeFee,
        networking: natFee + lbFee,
      },
    };
  }
}
