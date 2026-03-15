// supabase/functions/_shared/providers/interface.ts

export interface ValidationResult {
  success: boolean;
  errorCode?: string;    // human-readable error code
  friendlyError?: string; // error shown to user
  missingPermissions?: string[];
}

export interface VPCParams {
  projectId: string;
  region: string;
  cidr: string;          // e.g., '10.0.0.0/16'
  tags: Record<string, string>;  // RULE A4 — all resources tagged
}

export interface ClusterParams {
  projectId: string;
  region: string;
  vpcId: string;
  subnetIds: string[];
  nodeInstance: string;
  nodeCount: number;
  k8sVersion: string;
  tags: Record<string, string>;
}

export interface BuildParams {
  projectId: string;
  repoUrl: string;
  branch: string;
  commitSha: string;
  registryUrl: string;
  imageTag: string;
  buildEnvVars: Record<string, string>;
}

export interface TeardownResult {
  deleted: string[];     // resource IDs successfully deleted
  failed: string[];      // resource IDs that failed (with reason)
  orphaned: string[];    // resources found by tag but not in rollback_data
}

export interface NormalizedMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  activeNodes: number;
  runningPods: number;
}

export interface InfrastructurePlan {
  monthlyTotal: number;
  currency: string;
  breakdown: Record<string, number>; // e.g., { compute: 50, loadBalancer: 15 }
}

export interface CloudProvider {
  readonly name: 'aws' | 'gcp' | 'azure';

  // Validate credentials before provisioning
  validateCredentials(creds: Record<string, string>): Promise<ValidationResult>;

  // Provisioning — each returns the resource's canonical ID
  createVPC(params: VPCParams): Promise<string>;
  createSubnets(vpcId: string, params: VPCParams): Promise<string[]>;
  createCluster(params: ClusterParams): Promise<string>;
  createRegistry(projectId: string, region: string, name: string): Promise<string>;
  createLoadBalancer(clusterId: string, params: any): Promise<string>;

  // Build — returns pushed image URL
  buildAndPushImage(params: BuildParams): Promise<string>;

  // Deploy — applies K8s manifests
  applyManifests(clusterId: string, manifests: string[]): Promise<void>;

  // Cleanup — must be idempotent (RULE B3)
  teardown(projectId: string, rollbackData: Record<string, string>): Promise<TeardownResult>;

  // Monitoring — returns normalized metrics
  getClusterMetrics(clusterId: string): Promise<NormalizedMetrics>;

  // Cost estimation
  estimateMonthlyCost(size: string, region: string): InfrastructurePlan;
}
