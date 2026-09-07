'use client';

import React, { useEffect, useState } from 'react';
import { Project, CreateProjectData, UpdateProjectData, projectsApi } from '@/lib/api/projects';
import { Organization, organizationsApi } from '@/lib/api/organizations';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { CustomFieldValues, extractCustomFieldValues } from '@/lib/customFields';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import { getApiUrl } from '@/lib/api/config';
import { SearchableSelect } from '@/components/projects/ProjectInlineFields';

export function EditProjectModal({
  project,
  onClose,
  onSaved,
  token,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<CreateProjectData>({
    organizationId: project.OrganizationId,
    projectName: project.ProjectName,
    description: project.Description || '',
    status: project.Status,
    startDate: project.StartDate ? project.StartDate.split('T')[0] : '',
    endDate: project.EndDate ? project.EndDate.split('T')[0] : '',
    jiraBoardId: project.JiraBoardId || undefined,
    gitHubOwner: project.GitHubOwner || undefined,
    gitHubRepo: project.GitHubRepo || undefined,
    giteaOwner: project.GiteaOwner || undefined,
    giteaRepo: project.GiteaRepo || undefined,
    budget: project.Budget ?? undefined,
    budgetType: project.BudgetType === 'hours' ? 'hours' : 'monetary',
    customerId: project.CustomerId || undefined,
    isGlobal: !!project.IsGlobal,
    isHobby: project.IsHobby || false,
    isVisibleToCustomer: !!project.IsVisibleToCustomer,
    applicationIds: project.ApplicationIds || [],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  const [availableApplications, setAvailableApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldValues>(() => extractCustomFieldValues(project));

  useEffect(() => {
    loadOrganizations();
    loadCustomers();
    loadProjectStatuses();
    loadJiraIntegration();
    loadApplicationsList();
    // Clear any previous errors when modal opens
    setError('');
  }, []);

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      // Filter to only organizations where user has admin/owner role
      const adminOrgs = response.organizations.filter(
        org => org.Role === 'Owner' || org.Role === 'Admin'
      );
      setOrganizations(adminOrgs);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      setError(err.message || 'Failed to load organizations');
    }
  };

  const loadApplicationsList = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/applications?organizationId=${project.OrganizationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableApplications(data.applications || []);
      }
    } catch {
      setAvailableApplications([]);
    }
  };

  const loadCustomers = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/customers?organizationId=${project.OrganizationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.data || []);
      }
    } catch (err: any) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadProjectStatuses = async () => {
    try {
      const response = await statusValuesApi.getProjectStatuses(project.OrganizationId, token);
      setProjectStatuses(response.statuses);
    } catch (err: any) {
      console.error('Failed to load project statuses:', err);
    }
  };

  const loadJiraIntegration = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${project.OrganizationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.integration && data.integration.IsEnabled && data.integration.JiraProjectsUrl) {
          setJiraIntegration(data.integration);
        } else {
          setJiraIntegration(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Jira integration:', err);
      setJiraIntegration(null);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check if organization changed
    if (formData.organizationId !== project.OrganizationId) {
      setShowTransferConfirm(true);
      return;
    }

    await saveProject();
  };

  const saveProject = async () => {
    setIsLoading(true);
    try {
      if (formData.isGlobal && formData.customerId) {
        throw new Error('Global projects cannot be associated with a customer');
      }

      // If organization changed, use transfer endpoint
      if (formData.organizationId !== project.OrganizationId) {
        console.log('Transferring project to org:', formData.organizationId);
        await projectsApi.transfer(project.Id, formData.organizationId, token);
      }
      
      // Always exclude organizationId from update call - build new object explicitly
      // Convert empty strings to null for date fields (MySQL requires null, not undefined)
      const updateData: UpdateProjectData = {
        projectName: formData.projectName,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        jiraBoardId: formData.jiraBoardId || null,
        gitHubOwner: formData.gitHubOwner || null,
        gitHubRepo: formData.gitHubRepo || null,
        giteaOwner: formData.giteaOwner || null,
        giteaRepo: formData.giteaRepo || null,
        budget: formData.budget != null ? formData.budget : null,
        budgetType: formData.budgetType || 'monetary',
        customerId: formData.isGlobal ? null : (formData.customerId || null),
        isGlobal: !!formData.isGlobal,
        isHobby: formData.isHobby || false,
        isVisibleToCustomer: formData.isGlobal ? false : (formData.isVisibleToCustomer || false),
        applicationIds: formData.applicationIds || [],
        customFields,
      };
      console.log('Updating project with data:', updateData);
      await projectsApi.update(project.Id, updateData, token);
      onSaved();
    } catch (err: any) {
      console.error('Save project error:', err);
      setError(err.message || 'Failed to update project');
    } finally {
      setIsLoading(false);
      setShowTransferConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Project</h2>
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

          {showTransferConfirm && (
            <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-800 rounded">
              <h3 className="font-bold text-yellow-800 dark:text-yellow-400 mb-2">
                Confirm Organization Transfer
              </h3>
              <p className="text-yellow-700 dark:text-yellow-400 text-sm mb-4">
                You are about to transfer this project to a different organization. This action will affect access permissions and project visibility.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferConfirm(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProject}
                  disabled={isLoading}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded-lg text-sm"
                >
                  {isLoading ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Organization *
              </label>
              <SearchableSelect
                value={formData.organizationId}
                onChange={(value) => setFormData({ ...formData, organizationId: value || 0 })}
                options={organizations.map(org => ({
                  id: org.Id,
                  label: `${org.Name} (${org.Role})`
                }))}
                placeholder="Select Organization"
                emptyMessage="No organizations available"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only organizations where you have Admin or Owner role are shown
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Name *
              </label>
              <input
                type="text"
                value={formData.projectName}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Budget Type
              </label>
              <select
                value={formData.budgetType || 'monetary'}
                onChange={(e) => setFormData({ ...formData, budgetType: e.target.value === 'hours' ? 'hours' : 'monetary' })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="monetary">Monetary</option>
                <option value="hours">Total Hours</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Budget
              </label>
              <div className="relative">
                {formData.budgetType !== 'hours' && (
                  <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400">$</span>
                )}
                <input
                  type="number"
                  min="0"
                  step={formData.budgetType === 'hours' ? '0.5' : '0.01'}
                  value={formData.budget ?? ''}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
                  className={`w-full ${formData.budgetType === 'hours' ? 'pl-4' : 'pl-7'} pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                  placeholder={formData.budgetType === 'hours' ? '0.0' : '0.00'}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formData.budgetType === 'hours'
                  ? 'Optional project budget in total planned hours'
                  : 'Optional project budget in currency units'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                value={formData.status || ''}
                onChange={(e) => setFormData({ ...formData, status: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {projectStatuses.length > 0 ? (
                  projectStatuses.sort((a, b) => a.SortOrder - b.SortOrder).map((status) => (
                    <option key={status.Id} value={status.Id}>
                      {status.StatusName}
                    </option>
                  ))
                ) : (
                  <option value="">No statuses available</option>
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {availableApplications.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Applications
                </label>
                <SearchableMultiSelect
                  values={formData.applicationIds || []}
                  onChange={(values) => setFormData({ ...formData, applicationIds: values as number[] })}
                  options={availableApplications.map(app => ({
                    value: app.Id,
                    label: app.Name
                  }))}
                  placeholder="Select applications..."
                />
              </div>
            )}

            {jiraIntegration && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                  </svg>
                  <label className="block text-sm font-medium text-blue-700 dark:text-blue-300">
                    Jira Board ID
                  </label>
                </div>
                <input
                  type="text"
                  value={formData.jiraBoardId || ''}
                  onChange={(e) => setFormData({ ...formData, jiraBoardId: e.target.value || undefined })}
                  className="w-full px-4 py-2 border border-blue-300 dark:border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., 123 (from board URL)"
                />
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Associate this project with a Jira board. Find the Board ID in your Jira board URL: /boards/123
                </p>
              </div>
            )}
          <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-300 dark:border-gray-700">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Git / VCS repositories
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Configure repository URL and GitHub / Gitea / Bitbucket credentials on each{' '}
              <strong>Application</strong>, then link applications to this project. Issue import uses the
              selected application&apos;s repository.
            </p>
          </div>


            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Customer
              </label>
              <select
                value={formData.customerId || ''}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value ? parseInt(e.target.value) : undefined })}
                disabled={!!formData.isGlobal}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">No customer</option>
                {customers.map((c) => (
                  <option key={c.Id} value={c.Id}>{c.Name}</option>
                ))}
              </select>
              {formData.isGlobal && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Global projects cannot have a customer association
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <input
                  type="checkbox"
                  id="editIsGlobal"
                  checked={!!formData.isGlobal}
                  onChange={(e) => setFormData({
                    ...formData,
                    isGlobal: e.target.checked,
                    customerId: e.target.checked ? undefined : formData.customerId,
                    isVisibleToCustomer: e.target.checked ? false : formData.isVisibleToCustomer,
                  })}
                  className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:border-blue-600"
                />
                <div>
                  <label htmlFor="editIsGlobal" className="block text-sm font-medium text-blue-700 dark:text-blue-300 cursor-pointer">
                    🌐 Global Project
                  </label>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Global projects are not associated with a specific customer
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <input
                  type="checkbox"
                  id="editIsHobby"
                  checked={formData.isHobby || false}
                  onChange={(e) => setFormData({ ...formData, isHobby: e.target.checked })}
                  className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 dark:bg-gray-700 dark:border-purple-600"
                />
                <div>
                  <label htmlFor="editIsHobby" className="block text-sm font-medium text-purple-700 dark:text-purple-300 cursor-pointer">
                    🎨 Hobby Project
                  </label>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    Hobby projects are scheduled outside of regular work hours
                  </p>
                </div>
              </div>
            </div>

            {formData.customerId && !formData.isGlobal && (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <input
                  type="checkbox"
                  id="editIsVisibleToCustomer"
                  checked={formData.isVisibleToCustomer || false}
                  onChange={(e) => setFormData({ ...formData, isVisibleToCustomer: e.target.checked })}
                  className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-green-500 dark:bg-gray-700 dark:border-green-600"
                />
                <div>
                  <label htmlFor="editIsVisibleToCustomer" className="block text-sm font-medium text-green-700 dark:text-green-300 cursor-pointer">
                    👁 Visible to Customer
                  </label>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    When enabled, the customer can see this project in their portal
                  </p>
                </div>
              </div>
            )}

            <CustomFieldsFormSection
              tableName="Projects"
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
