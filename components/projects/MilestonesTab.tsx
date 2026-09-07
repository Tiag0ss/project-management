'use client';

import React, { useEffect, useState } from 'react';
import { ProjectMilestone, SaveProjectMilestoneData, projectMilestonesApi } from '@/lib/api/projectMilestones';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { useColorVision } from '@/hooks/useColorVision';

interface MilestoneFormData {
  name: string;
  description: string;
  dueDate: string;
  milestoneTypeId: number | null;
  isCompleted: boolean;
  sortOrder: number;
}

export function MilestonesTab({
  projectId,
  organizationId,
  token,
  canManage,
}: {
  projectId: number;
  organizationId: number;
  token: string;
  canManage: boolean;
}) {
  const { pillStyle } = useColorVision();
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [milestoneTypes, setMilestoneTypes] = useState<StatusValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ProjectMilestone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMilestone | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<MilestoneFormData>({
    name: '',
    description: '',
    dueDate: '',
    milestoneTypeId: null,
    isCompleted: false,
    sortOrder: 0,
  });

  useEffect(() => {
    void loadData();
  }, [projectId, organizationId]);

  const getDefaultMilestoneTypeId = (types: StatusValue[]) => {
    const defaultType = types.find((typeOption) => Number(typeOption.IsDefault || 0) === 1);
    if (defaultType) return Number(defaultType.Id);
    return types.length > 0 ? Number(types[0].Id) : null;
  };

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [typesRes, milestonesRes] = await Promise.all([
        statusValuesApi.getMilestoneTypes(organizationId, token),
        projectMilestonesApi.getByProject(projectId, token),
      ]);
      setMilestoneTypes(typesRes.types || []);
      setMilestones(milestonesRes.milestones || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load milestones');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingMilestone(null);
    setFormData({
      name: '',
      description: '',
      dueDate: '',
      milestoneTypeId: getDefaultMilestoneTypeId(milestoneTypes),
      isCompleted: false,
      sortOrder: milestones.length,
    });
    setShowModal(true);
  };

  const openEditModal = (milestone: ProjectMilestone) => {
    setEditingMilestone(milestone);
    setFormData({
      name: milestone.Name || '',
      description: String(milestone.Description || ''),
      dueDate: milestone.DueDate ? String(milestone.DueDate).split('T')[0] : '',
      milestoneTypeId: milestone.MilestoneTypeId ? Number(milestone.MilestoneTypeId) : null,
      isCompleted: Number(milestone.IsCompleted || 0) === 1,
      sortOrder: Number(milestone.SortOrder || 0),
    });
    setShowModal(true);
  };

  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Milestone name is required');
      return;
    }

    const payload: SaveProjectMilestoneData = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      dueDate: formData.dueDate || undefined,
      milestoneTypeId: formData.milestoneTypeId,
      isCompleted: formData.isCompleted,
      sortOrder: formData.sortOrder,
    };

    setIsSaving(true);
    setError('');
    try {
      if (editingMilestone) {
        await projectMilestonesApi.update(editingMilestone.Id, payload, token);
      } else {
        await projectMilestonesApi.create({ ...payload, projectId }, token);
      }
      setShowModal(false);
      setEditingMilestone(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save milestone');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMilestone = async () => {
    if (!deleteTarget) return;
    try {
      await projectMilestonesApi.delete(deleteTarget.Id, token);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete milestone');
    }
  };

  if (isLoading) {
    return <div>Loading milestones...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="mb-6 flex items-center justify-end">
        {canManage && (
          <button
            onClick={openCreateModal}
            className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            New Milestone
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Milestone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                {canManage && (
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {milestones.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No milestones defined for this project.
                  </td>
                </tr>
              ) : (
                milestones.map((milestone) => (
                  <tr key={milestone.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{milestone.Name}</div>
                      {milestone.Description && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">{milestone.Description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {milestone.MilestoneTypeName ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={pillStyle(milestone.MilestoneTypeColor, { alpha: '20' })}
                        >
                          {milestone.MilestoneTypeName}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {milestone.DueDate ? new Date(milestone.DueDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {Number(milestone.IsCompleted || 0) === 1 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Completed</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Open</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(milestone)}
                            title="Edit milestone"
                            aria-label="Edit milestone"
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(milestone)}
                            title="Delete milestone"
                            aria-label="Delete milestone"
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editingMilestone ? 'Edit Milestone' : 'New Milestone'}</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">×</button>
              </div>

              <form onSubmit={handleSaveMilestone} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
                  <select
                    value={formData.milestoneTypeId ?? ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, milestoneTypeId: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">No type</option>
                    {milestoneTypes.map((typeOption) => (
                      <option key={typeOption.Id} value={typeOption.Id}>
                        {typeOption.TypeName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sort Order</label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: Number(e.target.value || 0) }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 md:mt-8">
                    <input
                      type="checkbox"
                      checked={formData.isCompleted}
                      onChange={(e) => setFormData((prev) => ({ ...prev, isCompleted: e.target.checked }))}
                      className="rounded"
                    />
                    Mark as completed
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    {isSaving ? 'Saving...' : editingMilestone ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete milestone</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete milestone "{deleteTarget.Name}"?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteMilestone()}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
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
