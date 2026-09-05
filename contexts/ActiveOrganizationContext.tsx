'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { organizationsApi, type Organization } from '@/lib/api/organizations';

const STORAGE_KEY = 'pm.activeOrganizationId';

type ActiveOrganizationContextValue = {
  organizations: Organization[];
  activeOrganizationId: number | null;
  activeOrganization: Organization | null;
  setActiveOrganizationId: (id: number | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ActiveOrganizationContext = createContext<ActiveOrganizationContextValue | null>(null);

export function ActiveOrganizationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) {
      setOrganizations([]);
      setActiveIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { organizations: orgs } = await organizationsApi.getAll(token);
      setOrganizations(orgs);
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      const storedId = stored ? Number(stored) : NaN;
      const validStored = orgs.some((o) => o.Id === storedId);
      if (validStored) {
        setActiveIdState(storedId);
      } else if (orgs.length === 1) {
        setActiveIdState(orgs[0].Id);
        window.localStorage.setItem(STORAGE_KEY, String(orgs[0].Id));
      } else if (orgs.length > 0) {
        setActiveIdState(orgs[0].Id);
        window.localStorage.setItem(STORAGE_KEY, String(orgs[0].Id));
      } else {
        setActiveIdState(null);
      }
    } catch {
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveOrganizationId = useCallback((id: number | null) => {
    setActiveIdState(id);
    if (typeof window !== 'undefined') {
      if (id == null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  const activeOrganization = useMemo(
    () => organizations.find((o) => o.Id === activeOrganizationId) ?? null,
    [organizations, activeOrganizationId]
  );

  const value = useMemo(
    () => ({
      organizations,
      activeOrganizationId,
      activeOrganization,
      setActiveOrganizationId,
      loading,
      refresh,
    }),
    [organizations, activeOrganizationId, activeOrganization, setActiveOrganizationId, loading, refresh]
  );

  return (
    <ActiveOrganizationContext.Provider value={value}>{children}</ActiveOrganizationContext.Provider>
  );
}

export function useActiveOrganization(): ActiveOrganizationContextValue {
  const ctx = useContext(ActiveOrganizationContext);
  if (!ctx) {
    throw new Error('useActiveOrganization must be used within ActiveOrganizationProvider');
  }
  return ctx;
}
