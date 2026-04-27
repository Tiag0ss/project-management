'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { usersApi, User } from '@/lib/api/users';
import { getCustomers } from '@/lib/api/customers';
import { getApiUrl } from '@/lib/api/config';
import { COUNTRY_OPTIONS, getCountryName } from '@/lib/constants/countries';
import SearchableSelect from '@/components/SearchableSelect';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues, extractCustomFieldValues } from '@/lib/customFields';

interface CustomerOption {
  Id: number;
  Name: string;
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { user, token } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const closeConfirmModal = () => {
    setModalMessage(null);
  };

  const handleModalConfirm = () => {
    if (modalMessage?.onConfirm) {
      modalMessage.onConfirm();
    }
    closeConfirmModal();
  };

  useEffect(() => {
    if (user && token) {
      loadUsers();
      loadCustomers();
    }
  }, [user, token]);

  const loadUsers = async () => {
    if (!token) return;
    
    try {
      setIsLoadingUsers(true);
      const response = await usersApi.getAll(token);
      setUsers(response.users);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadCustomers = async () => {
    if (!token) return;
    
    try {
      const customerList = await getCustomers(token);
      setCustomers(customerList.map(c => ({ Id: c.Id, Name: c.Name })));
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleResetPassword = (user: User) => {
    setEditingUser(user);
    setShowPasswordModal(true);
  };

  const handleDeleteUser = async (id: number) => {
    if (!token) return;
    
    showConfirm(
      'Delete User',
      'Are you sure you want to delete this user? This action cannot be undone.',
      async () => {
        try {
          await usersApi.delete(id, token);
          await loadUsers();
        } catch (err: any) {
          setError(err.message || 'Failed to delete user');
        }
      }
    );
  };

  const handleModalClose = () => {
    setShowEditModal(false);
    setShowPasswordModal(false);
    setShowCreateModal(false);
    setEditingUser(null);
  };

  const handleUserSaved = () => {
    handleModalClose();
    loadUsers();
  };

  const handleViewDetails = (userId: number) => {
    router.push(`/users/${userId}`);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    if (!normalizedSearch) return true;

    const fullName = `${u.FirstName || ''} ${u.LastName || ''}`.trim().toLowerCase();
    const customerName = (u.CustomerName || '').toLowerCase();
    const countryName = getCountryName(u.CountryCode).toLowerCase();
    const countryCode = (u.CountryCode || '').toLowerCase();
    const jiraId = (u.JiraId || '').toLowerCase();

    return (
      u.Username.toLowerCase().includes(normalizedSearch) ||
      (u.Email || '').toLowerCase().includes(normalizedSearch) ||
      fullName.includes(normalizedSearch) ||
      customerName.includes(normalizedSearch) ||
      countryName.includes(normalizedSearch) ||
      countryCode.includes(normalizedSearch) ||
      jiraId.includes(normalizedSearch)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const pagedUsers = filteredUsers.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          User Management
        </h2>
        {(user?.isAdmin || permissions?.canManageUsers) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create User
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="w-full md:max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by username, email, name, customer, country, or Jira ID"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {isLoadingUsers ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-xl text-gray-600 dark:text-gray-400">Loading users...</div>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Jira ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Team Leader
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Country
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {pagedUsers.map((u) => (
                <tr key={u.Id} className={(u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'customer' ? 'bg-orange-50/30 dark:bg-orange-900/10' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm font-medium ${
                        (u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'customer'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
                          : (u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'fictitious'
                          ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                      }`}>
                        {(u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'customer' ? '👤' : (u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'fictitious' ? '🧪' : '🏢'}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {u.Username}
                        </div>
                        {(u.FirstName || u.LastName) && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {u.FirstName} {u.LastName}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {u.Email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {u.JiraId || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'customer' ? (
                      <div>
                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                          Customer
                        </span>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {u.CustomerName}
                        </div>
                      </div>
                    ) : (u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'fictitious' ? (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        Fictitious
                      </span>
                    ) : (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        Internal
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'customer' ? (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {!!u.IsAdmin && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Admin
                          </span>
                        )}
                        {!!u.IsDeveloper && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            Developer
                          </span>
                        )}
                        {!!u.IsSupport && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                            Support
                          </span>
                        )}
                        {!!u.IsManager && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
                            Manager
                          </span>
                        )}
                        {!u.IsAdmin && !u.IsDeveloper && !u.IsSupport && !u.IsManager && (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {u.TeamLeaderName ? (
                      <span className="inline-flex items-center gap-1">
                        <span>👤</span>
                        <span>{u.TeamLeaderName}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {u.CountryCode ? (
                      <div>
                        <span>{getCountryName(u.CountryCode)} ({u.CountryCode})</span>
                        {u.RegionCode && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{u.RegionCode}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      u.IsActive 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {u.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(u.CreatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center justify-end gap-1 min-w-[220px]">
                      <button
                        onClick={() => handleViewDetails(u.Id)}
                        title="View user details"
                        aria-label="View user details"
                        className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEditUser(u)}
                        title="Edit user"
                        aria-label="Edit user"
                        className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        title="Reset password"
                        aria-label="Reset password"
                        className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a4 4 0 11-7.75 1.5L3 12.75V15h2.25v2.25H7.5V15h2.25l1.5-1.5A4 4 0 0115 7z" />
                        </svg>
                      </button>
                      {u.Id !== user?.id && (
                        <button
                          onClick={() => handleDeleteUser(u.Id)}
                          title="Delete user"
                          aria-label="Delete user"
                          className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoadingUsers && (
        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
          <div>
            Showing {filteredUsers.length === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + pageSize, filteredUsers.length)} of {filteredUsers.length} users
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage <= 1}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Previous
            </button>
            <span>Page {safeCurrentPage} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={handleModalClose}
          onUserCreated={handleUserSaved}
          token={token!}
          customers={customers}
          allUsers={users}
        />
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={handleModalClose}
          onUserUpdated={handleUserSaved}
          token={token!}
          customers={customers}
          allUsers={users}
        />
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && editingUser && (
        <ResetPasswordModal
          user={editingUser}
          onClose={handleModalClose}
          onPasswordReset={handleModalClose}
          token={token!}
        />
      )}
      
      {/* Confirm Modal */}
      {modalMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {modalMessage.title}
                  </h3>
                  <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                    {modalMessage.message}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={closeConfirmModal}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModalConfirm}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Create User Modal Component
function CreateUserModal({ 
  onClose, 
  onUserCreated, 
  token,
  customers,
  allUsers
}: { 
  onClose: () => void; 
  onUserCreated: () => void; 
  token: string;
  customers: CustomerOption[];
  allUsers: User[];
}) {
  const countryOptions = COUNTRY_OPTIONS.map((country) => ({
    value: country.code,
    label: `${country.name} (${country.code})`
  }));
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    userType: 'internal' as 'internal' | 'customer' | 'fictitious',
    password: '',
    firstName: '',
    lastName: '',
    isAdmin: false,
    isDeveloper: false,
    isSupport: false,
    isManager: false,
    isActive: true,
    customerId: '',
    teamLeaderId: '',
    countryCode: '',
    regionCode: '',
    jiraId: '',
    workHoursMonday: '8',
    workHoursTuesday: '8',
    workHoursWednesday: '8',
    workHoursThursday: '8',
    workHoursFriday: '8',
    workHoursSaturday: '0',
    workHoursSunday: '0',
    hourlyRate: '',
    annualVacationDays: '22',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableRegions, setAvailableRegions] = useState<{ code: string; name: string }[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldValues>({});

  const loadAvailableRegions = async (cc: string) => {
    if (!token || !cc) { setAvailableRegions([]); return; }
    try {
      const res = await fetch(`${getApiUrl()}/api/holidays/regions/${cc}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableRegions(data.regions || []);
      } else {
        setAvailableRegions([]);
      }
    } catch {
      setAvailableRegions([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (formData.userType === 'customer' && !formData.customerId) {
      setError('Please select a customer for Customer User type');
      setIsLoading(false);
      return;
    }

    try {
      await usersApi.create({
        username: formData.username,
        email: formData.email || undefined,
        userType: formData.userType,
        password: formData.userType === 'fictitious' ? undefined : formData.password,
        firstName: formData.firstName || undefined,
        lastName: formData.lastName || undefined,
        isAdmin: formData.isAdmin,
        isDeveloper: formData.isDeveloper,
        isSupport: formData.isSupport,
        isManager: formData.isManager,
        isActive: formData.isActive,
        customerId: formData.customerId ? parseInt(formData.customerId) : undefined,
        teamLeaderId: formData.teamLeaderId ? parseInt(formData.teamLeaderId) : null,
        countryCode: formData.countryCode || null,
        regionCode: formData.regionCode || null,
        jiraId: formData.jiraId || null,
        workHoursMonday: parseFloat(formData.workHoursMonday),
        workHoursTuesday: parseFloat(formData.workHoursTuesday),
        workHoursWednesday: parseFloat(formData.workHoursWednesday),
        workHoursThursday: parseFloat(formData.workHoursThursday),
        workHoursFriday: parseFloat(formData.workHoursFriday),
        workHoursSaturday: parseFloat(formData.workHoursSaturday),
        workHoursSunday: parseFloat(formData.workHoursSunday),
        hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : null,
        annualVacationDays: parseFloat(formData.annualVacationDays || '0') || 0,
        customFields,
      }, token);
      onUserCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create User</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Username *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email {formData.userType !== 'fictitious' ? '*' : '(Optional)'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required={formData.userType !== 'fictitious'}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                User Type *
              </label>
              <select
                value={formData.userType}
                onChange={(e) => {
                  const nextType = e.target.value as 'internal' | 'customer' | 'fictitious';
                  setFormData({
                    ...formData,
                    userType: nextType,
                    customerId: nextType === 'customer' ? formData.customerId : ''
                  });
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="internal">Internal User</option>
                <option value="customer">Customer User</option>
                <option value="fictitious">Fictitious User</option>
              </select>
              {formData.userType === 'fictitious' && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Fictitious users are resources for planning and do not receive email alerts.
                </p>
              )}
            </div>

            {formData.userType !== 'fictitious' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            ) : (
              <div className="p-3 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300">
                Password is not required for fictitious users.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Jira ID
              </label>
              <input
                type="text"
                value={formData.jiraId}
                onChange={(e) => setFormData({ ...formData, jiraId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Customer {formData.userType === 'customer' ? '*' : '(Optional)'}
              </label>
              <select
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                required={formData.userType === 'customer'}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">No customer</option>
                {customers.map((c) => (
                  <option key={c.Id} value={c.Id}>{c.Name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Hourly Rate
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(for budget calculations)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  className="w-full pl-7 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Annual Vacation Days
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={formData.annualVacationDays}
                onChange={(e) => setFormData({ ...formData, annualVacationDays: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Roles
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isAdmin}
                    onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Admin</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isDeveloper}
                    onChange={(e) => setFormData({ ...formData, isDeveloper: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Developer</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isSupport}
                    onChange={(e) => setFormData({ ...formData, isSupport: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Support</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isManager}
                    onChange={(e) => setFormData({ ...formData, isManager: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Manager</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Team Leader
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(approves time entries)</span>
              </label>
              <select
                value={formData.teamLeaderId}
                onChange={(e) => setFormData({ ...formData, teamLeaderId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">No team leader</option>
                {allUsers.filter(u => (u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'internal').map(u => (
                  <option key={u.Id} value={u.Id}>
                    {u.FirstName && u.LastName ? `${u.FirstName} ${u.LastName} (@${u.Username})` : u.Username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Country
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(used for holiday calendar)</span>
              </label>
              <SearchableSelect
                value={formData.countryCode}
                onChange={(value) => {
                  setFormData({ ...formData, countryCode: value, regionCode: '' });
                  loadAvailableRegions(value);
                }}
                options={countryOptions}
                placeholder="Country"
                emptyText="No country selected"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Region / Subdivision
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(regional holidays)</span>
              </label>
              {availableRegions.length > 0 ? (
                <select
                  value={formData.regionCode}
                  onChange={(e) => setFormData({ ...formData, regionCode: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">— National (no region) —</option>
                  {availableRegions.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                  {formData.countryCode ? 'No regional holidays configured for this country' : 'Select a country first'}
                </p>
              )}
            </div>

            <CustomFieldsFormSection
              tableName="Users"
              token={token}
              values={customFields}
              onChange={setCustomFields}
            />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Edit User Modal Component
function EditUserModal({ 
  user, 
  onClose, 
  onUserUpdated, 
  token,
  customers,
  allUsers
}: { 
  user: User; 
  onClose: () => void; 
  onUserUpdated: () => void; 
  token: string;
  customers: CustomerOption[];
  allUsers: User[];
}) {
  const countryOptions = COUNTRY_OPTIONS.map((country) => ({
    value: country.code,
    label: `${country.name} (${country.code})`
  }));
  const [formData, setFormData] = useState({
    username: user.Username,
    email: user.Email,
    userType: (user.UserType as 'internal' | 'customer' | 'fictitious') || (user.CustomerId ? 'customer' : 'internal'),
    firstName: user.FirstName || '',
    lastName: user.LastName || '',
    isAdmin: !!user.IsAdmin,
    isDeveloper: !!user.IsDeveloper,
    isSupport: !!user.IsSupport,
    isManager: !!user.IsManager,
    isActive: !!user.IsActive,
    customerId: user.CustomerId?.toString() || '',
    teamLeaderId: user.TeamLeaderId?.toString() || '',
    countryCode: user.CountryCode || '',
    regionCode: user.RegionCode || '',
    jiraId: user.JiraId || '',
    workHoursMonday: user.WorkHoursMonday?.toString() || '8',
    workHoursTuesday: user.WorkHoursTuesday?.toString() || '8',
    workHoursWednesday: user.WorkHoursWednesday?.toString() || '8',
    workHoursThursday: user.WorkHoursThursday?.toString() || '8',
    workHoursFriday: user.WorkHoursFriday?.toString() || '8',
    workHoursSaturday: user.WorkHoursSaturday?.toString() || '0',
    workHoursSunday: user.WorkHoursSunday?.toString() || '0',
    hourlyRate: user.HourlyRate?.toString() || '',
    annualVacationDays: user.AnnualVacationDays?.toString() || '22',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableRegions, setAvailableRegions] = useState<{ code: string; name: string }[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldValues>(() => extractCustomFieldValues(user));

  const loadAvailableRegions = async (cc: string) => {
    if (!token || !cc) { setAvailableRegions([]); return; }
    try {
      const res = await fetch(`${getApiUrl()}/api/holidays/regions/${cc}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableRegions(data.regions || []);
      } else {
        setAvailableRegions([]);
      }
    } catch {
      setAvailableRegions([]);
    }
  };

  useEffect(() => { loadAvailableRegions(user.CountryCode || ''); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (formData.userType === 'customer' && !formData.customerId) {
      setError('Please select a customer for Customer User type');
      setIsLoading(false);
      return;
    }

    try {
      await usersApi.update(user.Id, {
        username: formData.username,
        email: formData.email || undefined,
        userType: formData.userType,
        firstName: formData.firstName || undefined,
        lastName: formData.lastName || undefined,
        isAdmin: formData.isAdmin,
        isDeveloper: formData.isDeveloper,
        isSupport: formData.isSupport,
        isManager: formData.isManager,
        isActive: formData.isActive,
        customerId: formData.customerId ? parseInt(formData.customerId) : undefined,
        teamLeaderId: formData.teamLeaderId ? parseInt(formData.teamLeaderId) : null,
        countryCode: formData.countryCode || null,
        regionCode: formData.regionCode || null,
        jiraId: formData.jiraId || null,
        workHoursMonday: parseFloat(formData.workHoursMonday),
        workHoursTuesday: parseFloat(formData.workHoursTuesday),
        workHoursWednesday: parseFloat(formData.workHoursWednesday),
        workHoursThursday: parseFloat(formData.workHoursThursday),
        workHoursFriday: parseFloat(formData.workHoursFriday),
        workHoursSaturday: parseFloat(formData.workHoursSaturday),
        workHoursSunday: parseFloat(formData.workHoursSunday),
        hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : null,
        annualVacationDays: parseFloat(formData.annualVacationDays || '0') || 0,
        customFields,
      }, token);
      onUserUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit User</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Username *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email {formData.userType !== 'fictitious' ? '*' : '(Optional)'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required={formData.userType !== 'fictitious'}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                User Type *
              </label>
              <select
                value={formData.userType}
                onChange={(e) => {
                  const nextType = e.target.value as 'internal' | 'customer' | 'fictitious';
                  setFormData({
                    ...formData,
                    userType: nextType,
                    customerId: nextType === 'customer' ? formData.customerId : ''
                  });
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="internal">Internal User</option>
                <option value="customer">Customer User</option>
                <option value="fictitious">Fictitious User</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Jira ID
              </label>
              <input
                type="text"
                value={formData.jiraId}
                onChange={(e) => setFormData({ ...formData, jiraId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Customer {formData.userType === 'customer' ? '*' : '(Optional)'}
              </label>
              <select
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                required={formData.userType === 'customer'}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">No customer</option>
                {customers.map((c) => (
                  <option key={c.Id} value={c.Id}>{c.Name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Hourly Rate
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(for budget calculations)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  className="w-full pl-7 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Annual Vacation Days
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={formData.annualVacationDays}
                onChange={(e) => setFormData({ ...formData, annualVacationDays: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Team Leader 
              </label>
              <select
                value={formData.teamLeaderId}
                onChange={(e) => setFormData({ ...formData, teamLeaderId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">No team leader</option>
                {allUsers.filter(u => (u.UserType || (u.CustomerId ? 'customer' : 'internal')) === 'internal' && u.Id !== user.Id).map(u => (
                  <option key={u.Id} value={u.Id}>
                    {u.FirstName && u.LastName ? `${u.FirstName} ${u.LastName} (@${u.Username})` : u.Username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Country
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(used for holiday calendar)</span>
              </label>
              <SearchableSelect
                value={formData.countryCode}
                onChange={(value) => {
                  setFormData({ ...formData, countryCode: value, regionCode: '' });
                  loadAvailableRegions(value);
                }}
                options={countryOptions}
                placeholder="Country"
                emptyText="No country selected"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Region / Subdivision
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(regional holidays)</span>
              </label>
              {availableRegions.length > 0 ? (
                <select
                  value={formData.regionCode}
                  onChange={(e) => setFormData({ ...formData, regionCode: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">— National (no region) —</option>
                  {availableRegions.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                  {formData.countryCode ? 'No regional holidays configured for this country' : 'Select a country first'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Roles
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isAdmin}
                    onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Admin</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isDeveloper}
                    onChange={(e) => setFormData({ ...formData, isDeveloper: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Developer</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isSupport}
                    onChange={(e) => setFormData({ ...formData, isSupport: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Support</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isManager}
                    onChange={(e) => setFormData({ ...formData, isManager: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Manager</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                </label>
              </div>
            </div>

            <CustomFieldsFormSection
              tableName="Users"
              token={token}
              values={customFields}
              onChange={setCustomFields}
            />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Reset Password Modal Component
function ResetPasswordModal({ 
  user, 
  onClose, 
  onPasswordReset, 
  token 
}: { 
  user: User; 
  onClose: () => void; 
  onPasswordReset: () => void; 
  token: string;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await usersApi.resetPassword(user.Id, newPassword, token);
      onPasswordReset();
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Reset Password</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Resetting password for: <span className="font-medium text-gray-900 dark:text-white">{user.Username}</span>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Password *
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
