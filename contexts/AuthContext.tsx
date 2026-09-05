'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, User, LoginCredentials, RegisterData } from '@/lib/api/auth';
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  clearStoredSession,
  isAuthFailureStatus,
  isPublicAuthPath,
  persistStoredSession,
  readStoredSession,
} from '@/lib/auth/session';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isCustomerUser: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

let authFailureInProgress = false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitializedRef = useRef(false);
  const hasHydratedSessionRef = useRef(false);

  // Paint with cached session immediately so AppShell does not flash a blank "Loading…" screen.
  useLayoutEffect(() => {
    if (hasHydratedSessionRef.current) return;
    hasHydratedSessionRef.current = true;
    const session = readStoredSession();
    if (!session) return;
    setToken(session.token);
    setUser(session.user);
  }, []);

  const clearAuthState = useCallback(() => {
    clearStoredSession();
    setToken(null);
    setUser(null);
  }, []);

  const redirectToLoginIfNeeded = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (isPublicAuthPath(window.location.pathname)) {
      return;
    }
    if (authFailureInProgress) {
      return;
    }
    authFailureInProgress = true;
    router.replace('/login');
    window.setTimeout(() => {
      authFailureInProgress = false;
    }, 1500);
  }, [router]);

  const handleInvalidSession = useCallback(() => {
    clearAuthState();
    redirectToLoginIfNeeded();
  }, [clearAuthState, redirectToLoginIfNeeded]);

  const updateToken = useCallback((newToken: string) => {
    setToken(newToken);
    localStorage.setItem(AUTH_TOKEN_KEY, newToken);
  }, []);

  const validateSessionWithServer = useCallback(async (currentToken: string): Promise<string | null> => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data?.success && typeof data.token === 'string' && data.token.length > 0) {
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const refreshToken = useCallback(async () => {
    const currentToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!currentToken) {
      return;
    }

    const refreshedToken = await validateSessionWithServer(currentToken);
    if (refreshedToken) {
      updateToken(refreshedToken);
      return;
    }

    handleInvalidSession();
  }, [handleInvalidSession, updateToken, validateSessionWithServer]);

  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    const initializeAuth = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/install/check`);
        if (response.ok) {
          const data = await response.json();
          if (data.needsInstall && !window.location.pathname.startsWith('/install')) {
            router.replace('/install');
            return;
          }
        }
      } catch {
        // Continue when install check is unavailable.
      }

      const session = readStoredSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      const refreshedToken = await validateSessionWithServer(session.token);
      if (!refreshedToken) {
        clearAuthState();
        redirectToLoginIfNeeded();
        setIsLoading(false);
        return;
      }

      setToken(refreshedToken);
      setUser(session.user);
      persistStoredSession(refreshedToken, session.user);
      setIsLoading(false);
    };

    void initializeAuth();
  }, [clearAuthState, redirectToLoginIfNeeded, router, validateSessionWithServer]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const refreshInterval = window.setInterval(() => {
      void refreshToken();
    }, 30 * 60 * 1000);

    return () => window.clearInterval(refreshInterval);
  }, [token, refreshToken]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      const newToken = response.headers.get('X-New-Token');
      if (newToken) {
        updateToken(newToken);
      }

      const hadStoredToken = Boolean(localStorage.getItem(AUTH_TOKEN_KEY));
      if (!hadStoredToken) {
        return response;
      }

      if (response.status === 401 || response.status === 403) {
        let message = '';
        try {
          const payload = await response.clone().json() as { message?: string };
          message = typeof payload?.message === 'string' ? payload.message : '';
        } catch {
          message = '';
        }

        if (isAuthFailureStatus(response.status, message)) {
          handleInvalidSession();
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [handleInvalidSession, updateToken]);

  const login = async (credentials: LoginCredentials) => {
    const response = await authApi.login(credentials);

    if (response.success && response.token && response.user) {
      setToken(response.token);
      setUser(response.user);
      persistStoredSession(response.token, response.user);
      authFailureInProgress = false;
    }
  };

  const register = async (userData: RegisterData) => {
    await authApi.register(userData);
    await login({ username: userData.username, password: userData.password });
  };

  const logout = () => {
    authFailureInProgress = false;
    clearAuthState();
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) {
        return prev;
      }
      const updated = { ...prev, ...updates };
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const isCustomerUser = Boolean(user?.customerId);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isCustomerUser, login, register, logout, refreshToken, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
