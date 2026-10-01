import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onUnauthorized, tokenStore } from '@/core/api/httpClient';
import { authService } from './authService';
import type { CurrentUser, LoginRequest } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (req: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Restore an existing session (e.g. page refresh) by asking the server who we are.
  useEffect(() => {
    onUnauthorized(clearSession);
    if (!tokenStore.get()) {
      setStatus('anonymous');
      return () => onUnauthorized(null);
    }
    authService
      .me()
      .then((me) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(clearSession);
    return () => onUnauthorized(null);
  }, [clearSession]);

  const login = useCallback(async (req: LoginRequest) => {
    const res = await authService.login(req);
    tokenStore.set(res.accessToken);
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Use inside authenticated screens only. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser called without an authenticated user');
  return user;
}
