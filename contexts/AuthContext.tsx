'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, User, LoginCredentials, RegisterData } from '@/lib/api/auth';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Function to update token
  const updateToken = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('authToken', newToken);
  };

  // Function to refresh token
  const refreshToken = async () => {
    const currentToken = localStorage.getItem('authToken');
    if (!currentToken) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.token) {
          updateToken(data.token);
        }
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
  };

  useEffect(() => {
    // Check if system needs installation
    const checkInstall = async () => {
      try {
        const response = await fetch(
          `${getApiUrl()}/api/install/check`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.needsInstall && !window.location.pathname.startsWith('/install')) {
            window.location.href = '/install';
            return;
          }
        }
      } catch (err) {
        // If check fails, continue normally
      }

      // Load token and user from localStorage on mount
      const storedToken = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('authUser');

      if (storedToken && storedUser) {
        // Decode token and check if it's expired before restoring session
        try {
          const payload = JSON.parse(atob(storedToken.split('.')[1]));
          const isExpired = payload.exp && payload.exp * 1000 < Date.now();
          if (isExpired) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/install'];
            const isPublicPath = publicPaths.some(p => window.location.pathname.startsWith(p));
            if (!isPublicPath) {
              window.location.href = '/login';
              return;
            }
          } else {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        } catch {
          // If token is malformed, clear it
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
        }
      }

      setIsLoading(false);
    };

    checkInstall();
  }, []);

  // Periodic token refresh check (every 30 minutes if user is logged in)
  useEffect(() => {
    if (!token) return;

    const refreshInterval = setInterval(() => {
      refreshToken();
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(refreshInterval);
  }, [token]);

  // Check for auto-refreshed token in API responses, and handle 401 (token expired)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      const newToken = response.headers.get('X-New-Token');
      if (newToken) {
        updateToken(newToken);
      }

      // If the server returns 401 and the user was logged in, the token expired
      if (response.status === 401) {
        const hasStoredToken = localStorage.getItem('authToken');
        if (hasStoredToken) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          setToken(null);
          setUser(null);

          const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/install'];
          const isPublicPath = publicPaths.some(p => window.location.pathname.startsWith(p));
          if (!isPublicPath) {
            window.location.href = '/login';
          }
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authApi.login(credentials);
      
      if (response.success && response.token && response.user) {
        setToken(response.token);
        setUser(response.user);
        
        localStorage.setItem('authToken', response.token);
        localStorage.setItem('authUser', JSON.stringify(response.user));
      }
    } catch (error) {
      throw error;
    }
  };

  const register = async (userData: RegisterData) => {
    try {
      await authApi.register(userData);
      // Auto-login after registration
      await login({ username: userData.username, password: userData.password });
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  const updateUser = (updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem('authUser', JSON.stringify(updated));
      return updated;
    });
  };

  // Check if user is a customer user (has CustomerId set)
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
