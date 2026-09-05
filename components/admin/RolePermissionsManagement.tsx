'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getRolePermissions, updateRolePermission, RolePermission } from '@/lib/api/rolePermissions';
import { useToast } from '@/contexts/ToastContext';

const ROLE_NAMES = ['Developer', 'Support', 'Manager'] as const;

const PERMISSION_CATEGORIES = [
  {
    name: 'View Permissions',
    permissions: [
      'CanViewDashboard',
      'CanViewPlanning',
      'CanViewProjects',
      'CanViewTasks',
      'CanViewReports',
      'CanViewBudgetInfo',
    ],
  },
  {
    name: 'Project Management',
    permissions: ['CanManageProjects', 'CanCreateProjects', 'CanDeleteProjects'],
  },
  {
    name: 'Task Management',
    permissions: [
      'CanManageTasks',
      'CanCreateTasks',
      'CanDeleteTasks',
      'CanAssignTasks',
      'CanPlanTasks',
      'CanViewOthersPlanning',
    ],
  },
  {
    name: 'Time Tracking',
    permissions: ['CanManageTimeEntries'],
  },
  {
    name: 'Administration',
    permissions: ['CanManageOrganizations', 'CanManageUsers'],
  },
  {
    name: 'Customer Management',
    permissions: [
      'CanViewCustomers',
      'CanManageCustomers',
      'CanCreateCustomers',
      'CanDeleteCustomers',
    ],
  },
  {
    name: 'Ticket Management',
    permissions: [
      'CanManageTickets',
      'CanCreateTickets',
      'CanDeleteTickets',
      'CanAssignTickets',
      'CanCreateTaskFromTicket',
    ],
  },
  {
    name: 'Expense Management',
    permissions: [
      'CanViewExpenses',
      'CanCreateExpenses',
      'CanManageExpenses',
      'CanApproveExpenses',
    ],
  },
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  CanViewDashboard: 'View Dashboard',
  CanViewPlanning: 'View Planning',
  CanViewProjects: 'View Projects',
  CanManageProjects: 'Manage Projects',
  CanCreateProjects: 'Create Projects',
  CanDeleteProjects: 'Delete Projects',
  CanViewTasks: 'View Tasks',
  CanManageTasks: 'Manage Tasks',
  CanCreateTasks: 'Create Tasks',
  CanDeleteTasks: 'Delete Tasks',
  CanAssignTasks: 'Assign Tasks',
  CanManageTimeEntries: 'Manage Time Entries',
  CanViewReports: 'View Reports',
  CanViewBudgetInfo: 'View Budget Info',
  CanManageOrganizations: 'Manage Organizations',
  CanViewCustomers: 'View Customers',
  CanManageCustomers: 'Manage Customers',
  CanCreateCustomers: 'Create Customers',
  CanDeleteCustomers: 'Delete Customers',
  CanManageUsers: 'Manage Users',
  CanManageTickets: 'Manage Tickets',
  CanCreateTickets: 'Create Tickets',
  CanDeleteTickets: 'Delete Tickets',
  CanAssignTickets: 'Assign Tickets',
  CanCreateTaskFromTicket: 'Create Task from Ticket',
  CanPlanTasks: 'Plan Tasks',
  CanViewOthersPlanning: "View Others' Planning",
  CanViewExpenses: 'View Expenses',
  CanCreateExpenses: 'Create Expenses',
  CanManageExpenses: 'Manage Expenses',
  CanApproveExpenses: 'Approve Expenses',
};

export type RolePermissionsActionsState = {
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
};

type RolePermissionsManagementProps = {
  /** Use `none` when the parent owns PageStickyActions (Administration). */
  actionsPlacement?: 'embedded' | 'none';
  onActionsStateChange?: (state: RolePermissionsActionsState | null) => void;
};

export default function RolePermissionsManagement({
  actionsPlacement = 'embedded',
  onActionsStateChange,
}: RolePermissionsManagementProps) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('Developer');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadPermissions();
     
  }, [token]);

  const loadPermissions = async () => {
    if (!token) return;

    setIsLoading(true);
    setError('');

    try {
      const data = await getRolePermissions(token);
      setPermissions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentRolePermissions = (): RolePermission | null => {
    return permissions.find((p) => p.RoleName === selectedRole) || null;
  };

  const handlePermissionChange = (permissionKey: string, value: boolean) => {
    setPermissions((prev) => {
      const existing = prev.find((p) => p.RoleName === selectedRole);

      if (existing) {
        return prev.map((p) =>
          p.RoleName === selectedRole ? { ...p, [permissionKey]: value } : p
        );
      }

      const newPermission: RolePermission = {
        Id: 0,
        RoleName: selectedRole,
        CanViewDashboard: false,
        CanViewPlanning: false,
        CanViewProjects: false,
        CanManageProjects: false,
        CanCreateProjects: false,
        CanDeleteProjects: false,
        CanViewTasks: false,
        CanManageTasks: false,
        CanCreateTasks: false,
        CanDeleteTasks: false,
        CanAssignTasks: false,
        CanManageTimeEntries: false,
        CanViewReports: false,
        CanViewBudgetInfo: false,
        CanManageOrganizations: false,
        CanViewCustomers: false,
        CanManageCustomers: false,
        CanCreateCustomers: false,
        CanDeleteCustomers: false,
        CanManageUsers: false,
        CanManageTickets: false,
        CanCreateTickets: false,
        CanDeleteTickets: false,
        CanAssignTickets: false,
        CanCreateTaskFromTicket: false,
        CanPlanTasks: false,
        CanViewOthersPlanning: false,
        CanViewExpenses: false,
        CanCreateExpenses: false,
        CanManageExpenses: false,
        CanApproveExpenses: false,
        [permissionKey]: value,
      } as RolePermission;
      return [...prev, newPermission];
    });
  };

  const handleSave = async () => {
    if (!token) return;

    const currentPerms = getCurrentRolePermissions();
    if (!currentPerms) return;

    setIsSaving(true);
    setError('');

    try {
      await updateRolePermission(token, selectedRole, {
        CanViewDashboard: currentPerms.CanViewDashboard,
        CanViewPlanning: currentPerms.CanViewPlanning,
        CanViewProjects: currentPerms.CanViewProjects,
        CanManageProjects: currentPerms.CanManageProjects,
        CanCreateProjects: currentPerms.CanCreateProjects,
        CanDeleteProjects: currentPerms.CanDeleteProjects,
        CanViewTasks: currentPerms.CanViewTasks,
        CanManageTasks: currentPerms.CanManageTasks,
        CanCreateTasks: currentPerms.CanCreateTasks,
        CanDeleteTasks: currentPerms.CanDeleteTasks,
        CanAssignTasks: currentPerms.CanAssignTasks,
        CanManageTimeEntries: currentPerms.CanManageTimeEntries,
        CanViewReports: currentPerms.CanViewReports,
        CanViewBudgetInfo: currentPerms.CanViewBudgetInfo,
        CanManageOrganizations: currentPerms.CanManageOrganizations,
        CanManageUsers: currentPerms.CanManageUsers,
        CanViewCustomers: currentPerms.CanViewCustomers,
        CanManageCustomers: currentPerms.CanManageCustomers,
        CanCreateCustomers: currentPerms.CanCreateCustomers,
        CanDeleteCustomers: currentPerms.CanDeleteCustomers,
        CanManageTickets: currentPerms.CanManageTickets,
        CanCreateTickets: currentPerms.CanCreateTickets,
        CanDeleteTickets: currentPerms.CanDeleteTickets,
        CanAssignTickets: currentPerms.CanAssignTickets,
        CanCreateTaskFromTicket: currentPerms.CanCreateTaskFromTicket,
        CanPlanTasks: currentPerms.CanPlanTasks,
        CanViewOthersPlanning: currentPerms.CanViewOthersPlanning,
        CanViewExpenses: currentPerms.CanViewExpenses,
        CanCreateExpenses: currentPerms.CanCreateExpenses,
        CanManageExpenses: currentPerms.CanManageExpenses,
        CanApproveExpenses: currentPerms.CanApproveExpenses,
      });

      await loadPermissions();
      showToast({ type: 'success', title: 'Permissions Saved', message: 'Permissions saved successfully' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!onActionsStateChange) return;
    if (isLoading) {
      onActionsStateChange(null);
      return;
    }
    onActionsStateChange({
      saving: isSaving,
      canSave: !!getCurrentRolePermissions(),
      onSave: () => {
        void handleSave();
      },
    });
    return () => onActionsStateChange(null);
     
  }, [isLoading, isSaving, selectedRole, permissions]);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--pm-muted)]">
        Loading permissions…
      </div>
    );
  }

  const currentPerms = getCurrentRolePermissions();
  const showEmbeddedActions = actionsPlacement === 'embedded';

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--pm-muted)]">
          Configure what each role can do. Permissions from multiple roles are combined.
        </p>
        <div className="inline-flex items-center rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-0.5">
          {ROLE_NAMES.map((roleName) => (
            <button
              key={roleName}
              type="button"
              onClick={() => setSelectedRole(roleName)}
              className={`h-8 rounded px-3 text-sm font-medium transition-colors ${
                selectedRole === roleName
                  ? 'bg-[var(--pm-accent)] text-[var(--pm-bg)]'
                  : 'text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]'
              }`}
            >
              {roleName}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {PERMISSION_CATEGORIES.map((category) => (
          <div
            key={category.name}
            className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)]"
          >
            <div className="border-b border-[var(--pm-border)] px-3 py-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                {category.name}
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2 lg:grid-cols-3">
              {category.permissions.map((key) => {
                const label = PERMISSION_LABELS[key];
                const isChecked = currentPerms ? !!(currentPerms as Record<string, unknown>)[key] : false;

                return (
                  <label
                    key={key}
                    htmlFor={`${selectedRole}-${key}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--pm-panel)]"
                  >
                    <input
                      type="checkbox"
                      id={`${selectedRole}-${key}`}
                      checked={isChecked}
                      onChange={(e) => handlePermissionChange(key, e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                    />
                    <span className="text-sm text-[var(--pm-text)]">{label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--pm-muted)]">
        Admins always have all permissions. Changes apply immediately after saving.
      </p>

      {showEmbeddedActions && (
        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-t border-[var(--pm-border)] bg-[var(--pm-panel)] px-4 py-3 sm:-mx-6 sm:px-6">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !currentPerms}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
