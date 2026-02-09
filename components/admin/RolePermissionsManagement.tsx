'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getRolePermissions, updateRolePermission, RolePermission } from '@/lib/api/rolePermissions';

const ROLE_NAMES = ['Developer', 'Support', 'Manager'];

const PERMISSION_CATEGORIES = [
  {
    name: 'View Permissions',
    permissions: [
      'CanViewDashboard',
      'CanViewPlanning',
      'CanViewProjects',
      'CanViewTasks',
      'CanViewReports',
    ]
  },
  {
    name: 'Project Management',
    permissions: [
      'CanManageProjects',
      'CanCreateProjects',
      'CanDeleteProjects',
    ]
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
    ]
  },
  {
    name: 'Time Tracking',
    permissions: [
      'CanManageTimeEntries',
    ]
  },
  {
    name: 'Administration',
    permissions: [
      'CanManageOrganizations',
      'CanManageUsers',
    ]
  },
  {
    name: 'Customer Management',
    permissions: [
      'CanViewCustomers',
      'CanManageCustomers',
      'CanCreateCustomers',
      'CanDeleteCustomers',
    ]
  },
  {
    name: 'Ticket Management',
    permissions: [
      'CanManageTickets',
      'CanCreateTickets',
      'CanDeleteTickets',
      'CanAssignTickets',
      'CanCreateTaskFromTicket',
    ]
  },
];

const PERMISSION_LABELS: { [key: string]: string } = {
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
};

export default function RolePermissionsManagement() {
  const { token } = useAuth();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('Developer');
  const [isSaving, setIsSaving] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: 'alert'; title: string; message: string } | null>(null);

  const showAlert = (title: string, message: string) => {
    setModalMessage({ type: 'alert', title, message });
  };

  useEffect(() => {
    loadPermissions();
  }, [token]);

  const loadPermissions = async () => {
    if (!token) return;

    setIsLoading(true);
    setError('');

    try {
      const data = await getRolePermissions(token);
      setPermissions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load permissions');
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentRolePermissions = (): RolePermission | null => {
    return permissions.find(p => p.RoleName === selectedRole) || null;
  };

  const handlePermissionChange = (permissionKey: string, value: boolean) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.RoleName === selectedRole);
      
      if (existing) {
        return prev.map(p => 
          p.RoleName === selectedRole 
            ? { ...p, [permissionKey]: value }
            : p
        );
      } else {
        // Create new permission entry for this role
        const newPermission: any = {
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
          [permissionKey]: value,
        };
        return [...prev, newPermission];
      }
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
      });

      await loadPermissions();
      showAlert('Success', 'Permissions saved successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600 dark:text-gray-400">Loading permissions...</div>
      </div>
    );
  }

  const currentPerms = getCurrentRolePermissions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Role Permissions
        </h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {/* Role Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Role
        </label>
        <div className="flex gap-2">
          {ROLE_NAMES.map(roleName => (
            <button
              key={roleName}
              onClick={() => setSelectedRole(roleName)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedRole === roleName
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {roleName}
            </button>
          ))}
        </div>
      </div>

      {/* Permissions by Category */}
      <div className="space-y-6">
        {PERMISSION_CATEGORIES.map((category) => (
          <div key={category.name} className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <span className="w-1 h-6 bg-blue-600 rounded mr-3"></span>
                {category.name}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.permissions.map((key) => {
                  const label = PERMISSION_LABELS[key];
                  const isChecked = currentPerms ? !!(currentPerms as any)[key] : false;
                  
                  return (
                    <div
                      key={key}
                      className="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        id={`${selectedRole}-${key}`}
                        checked={isChecked}
                        onChange={(e) => handlePermissionChange(key, e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <label
                        htmlFor={`${selectedRole}-${key}`}
                        className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        {label}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
          ℹ️ About Role Permissions
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
          <li>• Users can have multiple roles (Developer, Support, Manager)</li>
          <li>• Permissions are combined: if ANY role grants a permission, the user has it</li>
          <li>• Admins always have all permissions regardless of roles</li>
          <li>• Changes take effect immediately after saving</li>
        </ul>
      </div>

      {/* Modal de Alerta */}
      {modalMessage && modalMessage.type === 'alert' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {modalMessage.title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {modalMessage.message}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setModalMessage(null)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
