// ⚠️ COST GUARDRAIL — READ BEFORE MODIFYING
// All hooks must clean up subscriptions on unmount (provided by react-query + supabase)
// All realtime channels use eventsPerSecond: 10 (set in supabase client)
// Pagination max: 50 rows per query to limit bandwidth

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * useSupabaseQuery refactored for TanStack Query
 * Returns { data, isLoading, isError, error, refetch }.
 */
export function useSupabaseQuery(table, { filters = {}, orderBy = 'created_at', ascending = false, limit = 50, realtime = false } = {}) {
    const queryClient = useQueryClient();
    const filterKey = JSON.stringify(filters);

    const query = useQuery({
        queryKey: [table, filters, orderBy, ascending, limit],
        queryFn: async () => {
            let q = supabase.from(table).select('*');
            Object.entries(filters).forEach(([key, value]) => {
                q = q.eq(key, value);
            });
            q = q.order(orderBy, { ascending }).limit(limit);
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        }
    });

    // Realtime integration with React Query
    useEffect(() => {
        if (!realtime) return;

        const channel = supabase
            .channel(`${table}_changes_${filterKey}`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
                // Invalidate and refetch on any change
                // This ensures consistency without complex manual state merging
                queryClient.invalidateQueries({ queryKey: [table] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [table, filterKey, realtime, queryClient]);

    return {
        data: query.data || [],
        loading: query.isLoading, // mapping for backward compatibility
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch
    };
}

/**
 * Fetch a single row by ID.
 */
export function useSupabaseRow(table, id) {
    const query = useQuery({
        queryKey: [table, id],
        queryFn: async () => {
            if (!id) return null;
            const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
            if (error) throw error;
            return data;
        },
        enabled: !!id
    });

    return {
        data: query.data,
        loading: query.isLoading,
        error: query.error
    };
}

/**
 * Generic Insert Mutation
 */
export function useSupabaseInsert(table) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (row) => {
            const { data, error } = await supabase.from(table).insert(row).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [table] });
        }
    });

    return {
        mutate: mutation.mutateAsync,
        loading: mutation.isPending,
        error: mutation.error
    };
}

/**
 * Generic Update Mutation
 */
export function useSupabaseUpdate(table) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ id, updates }) => {
            const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: [table] });
            queryClient.invalidateQueries({ queryKey: [table, data.id] });
        }
    });

    // Wrapped to match previous signature mutate(id, updates)
    const mutate = (id, updates) => mutation.mutateAsync({ id, updates });

    return {
        mutate,
        loading: mutation.isPending,
        error: mutation.error
    };
}

// ─── Domain-Specific Hooks (Preserving API) ───

export function useClusters() {
    return useSupabaseQuery('clusters', { orderBy: 'created_at', realtime: true });
}

export function useProjects(clusterId) {
    return useSupabaseQuery('projects', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'created_at',
        realtime: true,
    });
}

export function useDeployments(clusterId) {
    return useSupabaseQuery('deployments', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'started_at',
        limit: 20,
    });
}

export function usePipelines(clusterId) {
    return useSupabaseQuery('pipelines', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'started_at',
        limit: 20,
    });
}

export function useFindings(clusterId) {
    return useSupabaseQuery('findings', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'first_seen_at',
        realtime: true,
    });
}

export function useIncidents(clusterId) {
    return useSupabaseQuery('incidents', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'detected_at',
        realtime: true,
    });
}

export function useClusterScores(clusterId) {
    return useSupabaseQuery('cluster_scores', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'evaluated_at',
        limit: 30,
    });
}

export function useClusterMetrics(clusterId) {
    return useSupabaseQuery('cluster_metrics', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'sampled_at',
        limit: 24,
    });
}

export function usePlaybooks(clusterId) {
    return useSupabaseQuery('playbooks', {
        filters: clusterId ? { cluster_id: clusterId } : {},
        orderBy: 'created_at',
    });
}

export function useIntegrations() {
    return useSupabaseQuery('integrations', { orderBy: 'name', ascending: true });
}

export function useAuditLog() {
    return useSupabaseQuery('audit_log', { orderBy: 'created_at', limit: 50 });
}
