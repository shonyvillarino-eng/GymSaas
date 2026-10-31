import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserRole } from '@gym-saas/shared';
import { api } from './api';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  gymId: string | null;
  gymName: string | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<SessionUser | null>;
  updateUser: (changes: Partial<Pick<SessionUser, 'fullName'>>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: SessionUser }>('/auth/me');
      setUser(result.user);
      return result.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((changes: Partial<Pick<SessionUser, 'fullName'>>) => {
    setUser((current) => current ? { ...current, ...changes } : current);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh, updateUser }), [user, loading, login, logout, refresh, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
