import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { errorTracker } from '../lib/errorTracker';
import { analytics } from '../lib/analytics';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Restore session on mount
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setUser(s?.user ?? null);
            setLoading(false);
        });

        // Listen for auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            setUser(s?.user ?? null);
            // Wire Sentry + PostHog on every auth state change
            if (s?.user) {
                errorTracker.setUser({ id: s.user.id, email: s.user.email });
                analytics.identify(s.user.id, {
                    email: s.user.email,
                    org_id: s.user.user_metadata?.org_id,
                });
            } else {
                errorTracker.setUser(null);
                analytics.reset();
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = useCallback(async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }, []);

    const signUp = useCallback(async (email, password, metadata = {}) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: metadata },
        });
        if (error) throw error;
        return data;
    }, []);

    const signInWithGithub = useCallback(async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: { redirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        return data;
    }, []);

    const signOut = useCallback(async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        errorTracker.setUser(null);
        analytics.reset();
    }, []);

    const resetPassword = useCallback(async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
    }, []);

    const value = {
        user,
        session,
        loading,
        isAuthenticated: !!session,
        signIn,
        signUp,
        signInWithGithub,
        signOut,
        resetPassword,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
