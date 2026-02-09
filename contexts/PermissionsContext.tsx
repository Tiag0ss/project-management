'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getUserPermissions, UserPermissions } from '@/lib/api/rolePermissions';

interface PermissionsContextType {
  permissions: UserPermissions | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = async () => {
    if (!user || !token) {
      setPermissions(null);
      setIsLoading(false);
      return;
    }

    // Admins have all permissions
    if (user.isAdmin) {
      setPermissions({
        canViewDashboard: true,
        canViewPlanning: true,
        canViewProjects: true,
        canManageProjects: true,
        canCreateProjects: true,
        canDeleteProjects: true,
        canViewTasks: true,
        canManageTasks: true,
        canCreateTasks: true,
        canDeleteTasks: true,
        canAssignTasks: true,
        canManageTimeEntries: true,
        canViewReports: true,
        canManageOrganizations: true,
        canViewCustomers: true,
        canManageCustomers: true,
        canCreateCustomers: true,
        canDeleteCustomers: true,
        canManageUsers: true,
        canManageTickets: true,
        canCreateTickets: true,
        canDeleteTickets: true,
        canAssignTickets: true,
        canCreateTaskFromTicket: true,
        canPlanTasks: true,
        canViewOthersPlanning: true,
      });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const userPermissions = await getUserPermissions(token, user.id);
      setPermissions(userPermissions);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      // Default to no permissions on error
      setPermissions({
        canViewDashboard: false,
        canViewPlanning: false,
        canViewProjects: false,
        canManageProjects: false,
        canCreateProjects: false,
        canDeleteProjects: false,
        canViewTasks: false,
        canManageTasks: false,
        canCreateTasks: false,
        canDeleteTasks: false,
        canAssignTasks: false,
        canManageTimeEntries: false,
        canViewReports: false,
        canManageOrganizations: false,
        canViewCustomers: false,
        canManageCustomers: false,
        canCreateCustomers: false,
        canDeleteCustomers: false,
        canManageUsers: false,
        canManageTickets: false,
        canCreateTickets: false,
        canDeleteTickets: false,
        canAssignTickets: false,
        canCreateTaskFromTicket: false,
        canPlanTasks: false,
        canViewOthersPlanning: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [user, token]);

  return (
    <PermissionsContext.Provider value={{ permissions, isLoading, refetch: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
