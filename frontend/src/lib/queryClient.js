/**
 * queryClient.js — TanStack Query Configuration
 *
 * Cache-first data loading with smart defaults:
 * - 30s stale time (tab switches within 30s use cache)
 * - 5min garbage collection (unmounted data survives re-navigation)
 * - 2 retries with exponential backoff
 * - Refetch on window focus (user returns to tab)
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      refetchOnWindowFocus: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Consistent query key structure — prevents stale cache bugs.
 * Every hook must use these keys or extend them.
 */
export const QUERY_KEYS = {
  // List queries (cluster-scoped)
  deployments: (clusterId) => ['deployments', clusterId],
  findings: (clusterId) => ['findings', clusterId],
  incidents: (clusterId) => ['incidents', clusterId],
  metrics: (clusterId, range) => ['metrics', clusterId, range],
  costFindings: (clusterId) => ['findings', clusterId, 'cost'],
  pipelines: (clusterId) => ['pipelines', clusterId],
  scores: (clusterId) => ['scores', clusterId],

  // Single item queries
  cluster: (clusterId) => ['cluster', clusterId],
  project: (projectId) => ['project', projectId],
  deployment: (deploymentId) => ['deployment', deploymentId],

  // Settings queries (org-scoped)
  credentials: (orgId) => ['credentials', orgId],
  integrations: (orgId) => ['integrations', orgId],
  team: (orgId) => ['team', orgId],
  envVars: (projectId) => ['envVars', projectId],
};
