'use client';

import React, { useEffect, useState } from 'react';
import { Project, UpdateProjectData, projectsApi } from '@/lib/api/projects';
import { Organization, organizationsApi } from '@/lib/api/organizations';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { CustomFieldValues, extractCustomFieldValues } from '@/lib/customFields';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import { getApiUrl } from '@/lib/api/config';
import { useToast } from '@/contexts/ToastContext';

export function SettingsTab({
  project,
  token,
  onSaved,
  canViewBudgetInfo,
  hideInlineSave = false,
  onSavingChange,
}: {
  project: Project;
  token: string;
  onSaved: () => void;
  canViewBudgetInfo: boolean;
  hideInlineSave?: boolean;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    organizationId: project.OrganizationId,
    projectName: project.ProjectName,
    description: project.Description || '',
    status: project.Status,
    startDate: project.StartDate ? project.StartDate.split('T')[0] : '',
    endDate: project.EndDate ? project.EndDate.split('T')[0] : '',
    isHobby: project.IsHobby || false,
    isGlobal: !!project.IsGlobal,
    isVisibleToCustomer: !!project.IsVisibleToCustomer,
    jiraBoardId: project.JiraBoardId || '',
    gitHubOwner: project.GitHubOwner || '',
    gitHubRepo: project.GitHubRepo || '',
    giteaOwner: project.GiteaOwner || '',
    giteaRepo: project.GiteaRepo || '',
    budget: project.Budget !== null && project.Budget !== undefined ? String(project.Budget) : '',
    budgetType: project.BudgetType === 'hours' ? 'hours' : 'monetary',
    customerId: project.CustomerId || undefined,
    applicationIds: project.ApplicationIds || [] as number[],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  const [availableApplications, setAvailableApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [_success, setSuccess] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldValues>(() => extractCustomFieldValues(project));

  useEffect(() => {
    onSavingChange?.(isLoading);
    return () => onSavingChange?.(false);
  }, [isLoading, onSavingChange]);

  useEffect(() => {
    loadOrganizations();
    loadCustomers();
    loadProjectStatuses();
    loadJiraIntegration();
    loadApplicationsList();
  }, []);

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

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      const adminOrgs = response.organizations.filter(
        org => org.Role === 'Owner' || org.Role === 'Admin'
      );
      setOrganizations(adminOrgs);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
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
          setJiraIntegration({
            JiraUrl: data.integration.JiraProjectsUrl,
            JiraProjectKey: '' // Not needed for boards
          });
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
    setSuccess(false);

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
        await projectsApi.transfer(project.Id, formData.organizationId, token);
      }

      const updateData: UpdateProjectData = {
        projectName: formData.projectName,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        isHobby: formData.isHobby,
        isGlobal: formData.isGlobal,
        isVisibleToCustomer: formData.isGlobal ? false : formData.isVisibleToCustomer,
        jiraBoardId: formData.jiraBoardId || null,
        gitHubOwner: formData.gitHubOwner || null,
        gitHubRepo: formData.gitHubRepo || null,
        giteaOwner: formData.giteaOwner || null,
        giteaRepo: formData.giteaRepo || null,
        customerId: formData.isGlobal ? null : (formData.customerId || null),
        applicationIds: formData.applicationIds || [],
        customFields,
      };

      if (canViewBudgetInfo) {
        updateData.budget = formData.budget !== '' ? parseFloat(formData.budget) : null;
        updateData.budgetType = formData.budgetType === 'hours' ? 'hours' : 'monetary';
      }

      await projectsApi.update(project.Id, updateData, token);
      setSuccess(true);
      showToast({ type: 'success', title: 'Project Updated', message: 'Project updated successfully!' });
      setTimeout(() => {
        onSaved();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update project');
    } finally {
      setIsLoading(false);
      setShowTransferConfirm(false);
    }
  };

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">General Settings</h2>
        
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
              You are about to transfer this project to a different organization. This action will affect access permissions.
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

        <form id="project-settings-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Organization *
            </label>
            <select
              value={formData.organizationId}
              onChange={(e) => setFormData({ ...formData, organizationId: parseInt(e.target.value) })}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {organizations.map((org) => (
                <option key={org.Id} value={org.Id}>
                  {org.Name} ({org.Role})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Only organizations where you have Admin or Owner role are shown
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Customer
            </label>
            <select
              value={formData.customerId || ''}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value ? parseInt(e.target.value) : undefined })}
              disabled={formData.isGlobal}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.Id} value={c.Id}>{c.Name}</option>
              ))}
            </select>
            {formData.isGlobal && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Global projects cannot have a customer association
              </p>
            )}
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

          {canViewBudgetInfo && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Budget Type
                </label>
                <select
                  value={formData.budgetType}
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
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
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
            </>
          )}

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <input
                type="checkbox"
                id="isGlobal"
                checked={formData.isGlobal}
                onChange={(e) => setFormData({
                  ...formData,
                  isGlobal: e.target.checked,
                  customerId: e.target.checked ? undefined : formData.customerId,
                  isVisibleToCustomer: e.target.checked ? false : formData.isVisibleToCustomer,
                })}
                className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:border-blue-600"
              />
              <div>
                <label htmlFor="isGlobal" className="block text-sm font-medium text-blue-700 dark:text-blue-300 cursor-pointer">
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
                id="isHobby"
                checked={formData.isHobby}
                onChange={(e) => setFormData({ ...formData, isHobby: e.target.checked })}
                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
              />
              <label htmlFor="isHobby" className="block text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">Hobby Project</span>
                <span className="text-gray-500 dark:text-gray-400 ml-2">
                  (Uses hobby time slots instead of work hours)
                </span>
              </label>
            </div>
          </div>

          {formData.customerId && !formData.isGlobal && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <input
                type="checkbox"
                id="isVisibleToCustomer"
                checked={formData.isVisibleToCustomer}
                onChange={(e) => setFormData({ ...formData, isVisibleToCustomer: e.target.checked })}
                className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-green-500 dark:bg-gray-700 dark:border-green-600"
              />
              <div>
                <label htmlFor="isVisibleToCustomer" className="block text-sm font-medium text-green-700 dark:text-green-300 cursor-pointer">
                  👁 Visible to Customer
                </label>
                <p className="text-xs text-green-600 dark:text-green-400">
                  When enabled, the customer can see this project in their portal
                </p>
              </div>
            </div>
          )}

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
                value={formData.jiraBoardId}
                onChange={(e) => setFormData({ ...formData, jiraBoardId: e.target.value })}
                className="w-full px-4 py-2 border border-blue-300 dark:border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., 123 (from board URL)"
              />
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Associate this project with a Jira board. Find the Board ID in your Jira board URL: /boards/123
              </p>
              {formData.jiraBoardId && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, jiraBoardId: '' })}
                    className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                  >
                    Clear Board ID
                  </button>
                </div>
              )}
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

          <CustomFieldsFormSection
            tableName="Projects"
            token={token}
            values={customFields}
            onChange={setCustomFields}
          />

          {!hideInlineSave && (
            <button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium mt-4"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
