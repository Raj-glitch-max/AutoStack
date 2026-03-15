// supabase/functions/_shared/providers/gcp/permissions.ts

// The exact IAM roles a user must assign to their Google Cloud Service Account
// before bringing it to AutoStack.

export const REQUIRED_GCP_ROLES = [
  {
    role: 'roles/container.admin',
    description: 'Manage GKE Clusters (create, update, teardown)',
  },
  {
    role: 'roles/compute.networkAdmin',
    description: 'Manage VPCs, Subnets, and Firewall Rules',
  },
  {
    role: 'roles/artifactregistry.admin',
    description: 'Create repositories and store Docker images',
  },
  {
    role: 'roles/iam.serviceAccountUser',
    description: 'Attach Service Accounts to GKE nodes and instances',
  },
  {
    role: 'roles/cloudbuild.builds.builder',
    description: 'Execute remote Docker builds via Cloud Build',
  },
  {
    role: 'roles/storage.admin',
    description: 'Manage GCS buckets for build artifacts',
  }
];

export const REQUIRED_GCP_ROLE_NAMES = REQUIRED_GCP_ROLES.map(r => r.role);
