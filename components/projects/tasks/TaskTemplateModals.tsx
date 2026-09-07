'use client';

import React, { useEffect, useState } from 'react';
import { Task } from '@/lib/api/tasks';
import { getApiUrl } from '@/lib/api/config';
import { useToast } from '@/contexts/ToastContext';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';

export function SaveTemplateModal({
  projectId: _projectId,
  organizationId,
  tasks,
  token,
  onClose,
}: {
  projectId: number;
  organizationId: number;
  tasks: Task[];
  token: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      // Build items array preserving parent-child relationships
      const taskIdToIndex: Record<number, number> = {};
      const items = tasks.map((t, i) => {
        taskIdToIndex[t.Id] = i;
        return {
          title: t.TaskName,
          description: t.Description || null,
          estimatedHours: t.EstimatedHours || null,
          priority: t.Priority || null,
          taskType: t.TaskType || null,
          sortOrder: i,
          parentIndex: null as number | null,
          _originalId: t.Id,
          _parentTaskId: t.ParentTaskId ?? null,
        };
      });
      // Resolve parent indices
      items.forEach(item => {
        if (item._parentTaskId !== null) {
          item.parentIndex = taskIdToIndex[item._parentTaskId] ?? null;
        }
      });

      const res = await fetch(`${getApiUrl()}/api/task-templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, name: name.trim(), description: description.trim() || null, items }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save template');
      }
      setSuccess(true);
      showToast({ type: 'success', title: 'Template Saved', message: `“${name.trim()}” has been saved as a template.` });
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          {success ? (
            <div className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Template Saved!</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                &ldquo;{name}&rdquo; has been saved as a template for this organization.
              </p>
              <button
                onClick={onClose}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">💾 Save as Template</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">×</button>
              </div>
              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {error}
                </div>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Save all {tasks.length} task{tasks.length !== 1 ? 's' : ''} as a reusable template for this organization.
              </p>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g., Standard Sprint, Bug Fix Workflow"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional description of when to use this template"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onClose} className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSaving || !name.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg transition-colors">
                    {isSaving ? 'Saving…' : 'Save Template'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ApplyTemplateModal ─────────────────────────────────────────────────────
export function ApplyTemplateModal({
  projectId,
  organizationId,
  token,
  onClose,
  onApplied,
}: {
  projectId: number;
  organizationId: number;
  token: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isDeletingTemplateId, setIsDeletingTemplateId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedPreviewItemIds, setSelectedPreviewItemIds] = useState<Set<number>>(new Set());
  const [templateToDelete, setTemplateToDelete] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${getApiUrl()}/api/task-templates?organizationId=${organizationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch { /* ignore */ }
      finally { setIsLoading(false); }
    };
    load();
  }, [organizationId, token]);

  const handleSelect = async (id: number) => {
    setSelectedId(id);
    setPreviewLoading(true);
    setPreview([]);
    try {
      const res = await fetch(`${getApiUrl()}/api/task-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setPreview(items);
        setSelectedPreviewItemIds(new Set(items.map((item: any) => Number(item.Id)).filter((itemId: number) => Number.isFinite(itemId))));
      }
    } catch { /* ignore */ }
    finally { setPreviewLoading(false); }
  };

  const togglePreviewItemSelection = (itemId: number) => {
    setSelectedPreviewItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAllPreviewItems = () => {
    setSelectedPreviewItemIds(
      new Set(preview.map((item) => Number(item.Id)).filter((itemId) => Number.isFinite(itemId)))
    );
  };

  const clearPreviewSelection = () => {
    setSelectedPreviewItemIds(new Set());
  };

  const handleApply = async () => {
    if (!selectedId) return;
    setIsApplying(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/task-templates/${selectedId}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, selectedItemIds: Array.from(selectedPreviewItemIds) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to apply template');
      }
      await res.json();
      onApplied();
    } catch (err: any) {
      setError(err.message || 'Failed to apply template');
      setIsApplying(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;

    setError('');
    setIsDeletingTemplateId(templateToDelete.id);
    try {
      const res = await fetch(`${getApiUrl()}/api/task-templates/${templateToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete template');
      }

      if (selectedId === templateToDelete.id) {
        setSelectedId(null);
        setPreview([]);
      }

      setTemplates((prev) => prev.filter((item) => item.Id !== templateToDelete.id));
      setTemplateToDelete(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    } finally {
      setIsDeletingTemplateId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">📥 Apply Task Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading templates…</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-gray-600 dark:text-gray-400">No templates saved for this organization yet.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Use &ldquo;Save as Template&rdquo; to create one from existing tasks.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div
                  key={t.Id}
                  onClick={() => handleSelect(t.Id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedId === t.Id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{t.Name}</h3>
                      {t.Description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t.Description}</p>}
                    </div>
                    <div className="ml-4 shrink-0 flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t.ItemCount} task{t.ItemCount !== 1 ? 's' : ''}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateToDelete({ id: t.Id, name: t.Name });
                        }}
                        disabled={isDeletingTemplateId === t.Id}
                        className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                        title="Delete template"
                        aria-label="Delete template"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7V5h6v2m-7 0l1 12h4l1-12M10 11v6m4-6v6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    By {t.FirstName} {t.LastName} · {new Date(t.CreatedAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {selectedId && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Select tasks to create:</h3>
                {!previewLoading && preview.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllPreviewItems}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearPreviewSelection}
                      className="text-xs text-gray-600 dark:text-gray-300 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              {previewLoading ? (
                <p className="text-sm text-gray-500">Loading preview…</p>
              ) : (
                <ul className="space-y-1 max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2">
                  {preview.map(item => (
                    <li key={item.Id} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedPreviewItemIds.has(Number(item.Id))}
                        onChange={() => togglePreviewItemSelection(Number(item.Id))}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{item.ParentItemId ? '↳' : '•'}</span>
                      <span style={{ paddingLeft: item.ParentItemId ? 12 : 0 }}>{item.Title}</span>
                      {item.EstimatedHours && <span className="text-xs text-gray-400">({item.EstimatedHours}h)</span>}
                    </li>
                  ))}
                </ul>
              )}
              {!previewLoading && preview.length > 0 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {selectedPreviewItemIds.size} of {preview.length} task{preview.length !== 1 ? 's' : ''} selected.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedId || isApplying || selectedPreviewItemIds.size === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {isApplying ? 'Creating tasks…' : 'Apply Template'}
          </button>
        </div>
      </div>

      <ConfirmAlertModal
        isOpen={!!templateToDelete}
        type="confirm"
        title="Delete Template"
        message={templateToDelete ? `Are you sure you want to delete \"${templateToDelete.name}\"?` : ''}
        onClose={() => setTemplateToDelete(null)}
        onConfirm={handleDeleteTemplate}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
}
