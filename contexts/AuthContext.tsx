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
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
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

  // Check for auto-refreshed token in API responses
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Intercept fetch to check for X-New-Token header
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      const newToken = response.headers.get('X-New-Token');
      if (newToken) {
        updateToken(newToken);
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

  // Check if user is a customer user (has CustomerId set)
  const isCustomerUser = Boolean(user?.customerId);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isCustomerUser, login, register, logout, refreshToken }}>
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
