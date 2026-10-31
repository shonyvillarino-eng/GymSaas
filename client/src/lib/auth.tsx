import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserRole } from '@gym-saas/shared';

import i18n, { type SupportedLanguage } from '../i18n';
import { api } from './api';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  gymId: string | null;
  gymName: string | null;
}

interface PreferenceResponse {
  language: SupportedLanguage | null;
  effectiveLanguage: SupportedLanguage;
  gymLanguage: SupportedLanguage | null;
  gymLocale: string | null;
  locale?: string;
  theme?: 'light' | 'dark' | 'system';
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  language: SupportedLanguage;
  gymLanguage: SupportedLanguage | null;
  locale: string | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<SessionUser | null>;
  updateUser: (changes: Partial<Pick<SessionUser, 'fullName'>>) => void;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<SupportedLanguage>('es');
  const [gymLanguage, setGymLanguage] = useState<SupportedLanguage | null>(null);
  const [locale, setLocale] = useState<string | null>(null);

  /**
   * Resolves the language with the documented priority:
   * personal preference > gym default > Spanish.
   *
   * The server computes `effectiveLanguage`; the client only applies it, so the
   * same rule holds on every device and after signing in again.
   */
  const loadPreferences = useCallback(async () => {
    try {
      const result = await api<{ data: PreferenceResponse }>('/users/me/preferences');
      const effective = result.data.effectiveLanguage ?? 'es';
      await i18n.changeLanguage(effective);
      setLanguageState(effective);
      setGymLanguage(result.data.gymLanguage ?? null);
      setLocale(result.data.locale ?? result.data.gymLocale ?? null);
      if (typeof document !== 'undefined') document.documentElement.lang = effective;
    } catch {
      // Preferences are non-critical: keep the current (Spanish by default).
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: SessionUser }>('/auth/me');
      setUser(result.user);
      await loadPreferences();
      return result.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadPreferences]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(result.user);
    await loadPreferences();
    return result.user;
  }, [loadPreferences]);

  const logout = useCallback(async () => {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setLanguageState('es');
      setGymLanguage(null);
      setLocale(null);
      await i18n.changeLanguage('es');
      if (typeof document !== 'undefined') document.documentElement.lang = 'es';
    }
  }, []);

  const updateUser = useCallback((changes: Partial<Pick<SessionUser, 'fullName'>>) => {
    setUser((current) => current ? { ...current, ...changes } : current);
  }, []);

  /** Applies the personal language immediately, then persists it. */
  const setLanguage = useCallback(async (next: SupportedLanguage) => {
    const previous = language;
    setLanguageState(next);
    await i18n.changeLanguage(next);
    if (typeof document !== 'undefined') document.documentElement.lang = next;
    try {
      await api<{ data: PreferenceResponse }>('/users/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ language: next }),
      });
    } catch (error) {
      setLanguageState(previous);
      await i18n.changeLanguage(previous);
      if (typeof document !== 'undefined') document.documentElement.lang = previous;
      throw error;
    }
  }, [language]);

  const value = useMemo(
    () => ({ user, loading, language, gymLanguage, locale, login, logout, refresh, updateUser, setLanguage }),
    [user, loading, language, gymLanguage, locale, login, logout, refresh, updateUser, setLanguage],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
