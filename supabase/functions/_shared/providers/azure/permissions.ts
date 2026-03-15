// supabase/functions/_shared/providers/azure/permissions.ts

// The exact Azure RBAC roles a user must assign to their App Registration (Service Principal)
// before bringing it to AutoStack.

export const REQUIRED_AZURE_ROLES = [
  {
    role: 'Contributor',
    description: 'Manage all resources within the given Subscription (AKS, VNet, ACR)',
  },
  {
    role: 'User Access Administrator',
    description: 'Required if AutoStack needs to manage Managed Identities for AKS node pools',
  }
];

export const REQUIRED_AZURE_PROVIDERS = [
  'Microsoft.ContainerService',
  'Microsoft.Network',
  'Microsoft.ContainerRegistry'
];
