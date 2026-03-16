import { useEffect, useCallback, createContext, useContext } from 'react';
import { useUser, useAuth as useClerkAuth } from '@clerk/react';
import { errorTracker } from '../lib/errorTracker';
import { analytics } from '../lib/analytics';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const { isLoaded, user: clerkUser } = useUser();
    const { signOut: clerkSignOut } = useClerkAuth();

    useEffect(() => {
        if (isLoaded) {
            if (clerkUser) {
                errorTracker.setUser({ id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress });
                analytics.identify(clerkUser.id, {
                    email: clerkUser.primaryEmailAddress?.emailAddress,
                });
            } else {
                errorTracker.setUser(null);
                analytics.reset();
            }
        }
    }, [isLoaded, clerkUser]);

    const signOut = useCallback(async () => {
        await clerkSignOut();
        errorTracker.setUser(null);
        analytics.reset();
    }, [clerkSignOut]);

    const value = {
        user: clerkUser,
        loading: !isLoaded,
        isAuthenticated: !!clerkUser,
        signOut,
        signIn: () => Promise.resolve(),
        signUp: () => Promise.resolve(),
        signInWithGithub: () => Promise.resolve(),
        resetPassword: () => Promise.resolve(),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
