// ⚠️ COST GUARDRAIL — READ BEFORE MODIFYING
// All hooks must clean up subscriptions on unmount
// All realtime channels use eventsPerSecond: 10 (set in supabase client)
// Pagination max: 50 rows per query to limit bandwidth

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetch rows from a Supabase table with optional filters, ordering, and realtime subscription.
 * Returns { data, loading, error, refetch }.
 */
export function useSupabaseQuery(table, { filters = {}, orderBy = 'created_at', ascending = false, limit = 50, realtime = false } = {}) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        let query = supabase.from(table).select('*');
        Object.entries(filters).forEach(([key, value]) => {
            query = query.eq(key, value);
        });
        query = query.order(orderBy, { ascending }).limit(limit);
        const { data: rows, error: err } = await query;
        if (err) { setError(err); } else { setData(rows || []); setError(null); }
        setLoading(false);
    }, [table, JSON.stringify(filters), orderBy, ascending, limit]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Realtime subscription — INSERT, UPDATE, DELETE refresh the query
    useEffect(() => {
        if (!realtime) return;
        const channel = supabase
            .channel(`${table}_changes`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, () => fetchData())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [table, realtime, fetchData]);

    return { data, loading, error, refetch: fetchData };
}

/**
 * Fetch a single row by ID.
 */
export function useSupabaseRow(table, id) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) { setLoading(false); return; }
        (async () => {
            setLoading(true);
            const { data: row, error: err } = await supabase.from(table).select('*').eq('id', id).single();
            if (err) { setError(err); } else { setData(row); setError(null); }
            setLoading(false);
        })();
    }, [table, id]);

    return { data, loading, error };
}

/**
 * Insert a row into a Supabase table.
 * Returns { mutate, loading, error }.
 */
export function useSupabaseInsert(table) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const mutate = useCallback(async (row) => {
        setLoading(true);
        setError(null);
        const { data, error: err } = await supabase.from(table).insert(row).select().single();
        setLoading(false);
        if (err) { setError(err); throw err; }
        return data;
    }, [table]);

    return { mutate, loading, error };
}

/**
 * Update a row in a Supabase table by ID.
 */
export function useSupabaseUpdate(table) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const mutate = useCallback(async (id, updates) => {
        setLoading(true);
        setError(null);
        const { data, error: err } = await supabase.from(table).update(updates).eq('id', id).select().single();
        setLoading(false);
        if (err) { setError(err); throw err; }
        return data;
    }, [table]);

    return { mutate, loading, error };
}

// ─── Domain-Specific Hooks ───

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
