'use client';

import { useEffect, useState } from 'react';
import SearchableSelect from './SearchableSelect';

export interface CustomerFormValues {
  Name: string;
  ExternalName: string;
  Email: string;
  Phone: string;
  Address: string;
  Notes: string;
  OrganizationIds: number[];
  DefaultSupportUserId: number | null;
  CreateDefaultProject: boolean;
  DefaultProjectName: string;
}

interface CustomerModalOrganization {
  Id: number;
  Name: string;
}

interface CustomerModalSupportUser {
  Id: number;
  FirstName: string;
  LastName: string;
  Username: string;
}

interface CustomerFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialValues: CustomerFormValues;
  organizations: CustomerModalOrganization[];
  supportUsers: CustomerModalSupportUser[];
  internalTicketsEnabled: boolean;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: CustomerFormValues) => void | Promise<void>;
}

export default function CustomerFormModal({
  isOpen,
  mode,
  initialValues,
  organizations,
  supportUsers,
  internalTicketsEnabled,
  isSaving,
  error,
  onClose,
  onSubmit,
}: CustomerFormModalProps) {
  const [values, setValues] = useState<CustomerFormValues>(initialValues);

  useEffect(() => {
    if (isOpen) {
      setValues(initialValues);
    }
  }, [isOpen, initialValues]);

  if (!isOpen) return null;

  const handleOrganizationToggle = (orgId: number) => {
    setValues((prev) => ({
      ...prev,
      OrganizationIds: prev.OrganizationIds.includes(orgId)
        ? prev.OrganizationIds.filter((id) => id !== orgId)
        : [...prev.OrganizationIds, orgId],
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {mode === 'edit' ? 'Edit Customer' : 'Add Customer'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={values.Name}
                  onChange={(e) => setValues({ ...values, Name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  External Name
                </label>
                <input
                  type="text"
                  value={values.ExternalName}
                  onChange={(e) => setValues({ ...values, ExternalName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={values.Email}
                  onChange={(e) => setValues({ ...values, Email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={values.Phone}
                  onChange={(e) => setValues({ ...values, Phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Address
                </label>
                <textarea
                  value={values.Address}
                  onChange={(e) => setValues({ ...values, Address: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {internalTicketsEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Default Support User
                  </label>
                  <SearchableSelect
                    value={values.DefaultSupportUserId?.toString() || ''}
                    onChange={(value) => setValues({ ...values, DefaultSupportUserId: value ? parseInt(value, 10) : null })}
                    options={supportUsers.map((user) => ({
                      value: user.Id,
                      label: user.FirstName && user.LastName ? `${user.FirstName} ${user.LastName}` : user.Username
                    }))}
                    placeholder="Select Support User"
                    emptyText="No default support user"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    This user will be automatically assigned to tickets created by this customer
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={values.Notes}
                  onChange={(e) => setValues({ ...values, Notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {mode === 'create' && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={values.CreateDefaultProject}
                      onChange={(e) => setValues({ ...values, CreateDefaultProject: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Create default project
                    </span>
                  </label>
                  {values.CreateDefaultProject && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Project Name
                      </label>
                      <input
                        type="text"
                        value={values.DefaultProjectName}
                        onChange={(e) => setValues({ ...values, DefaultProjectName: e.target.value })}
                        placeholder={values.Name || 'Same as customer name'}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Leave empty to use customer name
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Organizations <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                  {organizations.map((organization) => (
                    <label
                      key={organization.Id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={values.OrganizationIds.includes(organization.Id)}
                        onChange={() => handleOrganizationToggle(organization.Id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">{organization.Name}</span>
                    </label>
                  ))}
                </div>
                {values.OrganizationIds.length === 0 && (
                  <p className="text-sm text-red-500 mt-1">Select at least one organization</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || values.OrganizationIds.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : mode === 'edit' ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
