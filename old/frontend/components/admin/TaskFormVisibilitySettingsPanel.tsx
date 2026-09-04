'use client';

import React, { useEffect, useState } from 'react';
import TaskFormVisibilityEditor from '@/components/old/admin/TaskFormVisibilityEditor';
import { taskFieldVisibilityApi, TaskFieldVisibilitySource } from '@/lib/api/taskFieldVisibility';
import {
  TaskFieldVisibilityConfig,
  createDefaultTaskFieldVisibility,
} from '@/lib/taskFieldVisibility';
import { useToast } from '@/contexts/ToastContext';

interface TaskFormVisibilitySettingsPanelProps {
  mode: 'global' | 'organization' | 'user';
  token: string;
  organizationId?: number;
  canManage?: boolean;
  onRequestSyncConfirm?: (onConfirm: () => void) => void;
  onRequestResetConfirm?: (onConfirm: () => void) => void;
}

const SOURCE_LABEL: Record<TaskFieldVisibilitySource, string> = {
  user: 'Your personal override',
  organization: 'Organization default',
  global: 'Global default',
};

export default function TaskFormVisibilitySettingsPanel({
  mode,
  token,
  organizationId,
  canManage = true,
  onRequestSyncConfirm,
  onRequestResetConfirm,
}: TaskFormVisibilitySettingsPanelProps) {
  const { showToast } = useToast();
  const [config, setConfig] = useState<TaskFieldVisibilityConfig>(createDefaultTaskFieldVisibility());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [source, setSource] = useState<TaskFieldVisibilitySource | undefined>();
  const [hasUserOverride, setHasUserOverride] = useState(false);

  const applyResult = (data: {
    fields: Record<string, boolean>;
    tabs: Record<string, boolean>;
    source?: TaskFieldVisibilitySource;
    hasUserOverride?: boolean;
  }) => {
    setConfig({ fields: data.fields, tabs: data.tabs });
    setSource(data.source);
    setHasUserOverride(Boolean(data.hasUserOverride));
  };

  const load = async () => {
    setLoading(true);
    try {
      const result =
        mode === 'global'
          ? await taskFieldVisibilityApi.getGlobal(token)
          : mode === 'organization'
            ? await taskFieldVisibilityApi.getOrganization(organizationId!, token)
            : await taskFieldVisibilityApi.getMine(organizationId!, token);
      if (result.success && result.data) {
        applyResult(result.data);
      } else {
        showToast({ type: 'error', message: result.message || 'Failed to load task form visibility' });
      }
    } catch {
      showToast({ type: 'error', message: 'Failed to load task form visibility' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token, organizationId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result =
        mode === 'global'
          ? await taskFieldVisibilityApi.updateGlobal(token, config)
          : mode === 'organization'
            ? await taskFieldVisibilityApi.updateOrganization(organizationId!, token, config)
            : await taskFieldVisibilityApi.updateMine(organizationId!, token, config);
      if (result.success && result.data) {
        applyResult(result.data);
        showToast({ type: 'success', message: result.message || 'Task form visibility saved' });
      } else {
        showToast({ type: 'error', message: result.message || 'Failed to save' });
      }
    } catch {
      showToast({ type: 'error', message: 'Failed to save task form visibility' });
    } finally {
      setSaving(false);
    }
  };

  const runSync = async () => {
    if (!organizationId) return;
    setSyncing(true);
    try {
      const result = await taskFieldVisibilityApi.syncOrganizationFromGlobal(organizationId, token);
      if (result.success && result.data) {
        applyResult(result.data);
        showToast({ type: 'success', message: result.message || 'Synced from global template' });
      } else {
        showToast({ type: 'error', message: result.message || 'Failed to sync' });
      }
    } catch {
      showToast({ type: 'error', message: 'Failed to sync from global' });
    } finally {
      setSyncing(false);
    }
  };

  const runReset = async () => {
    if (!organizationId) return;
    setSyncing(true);
    try {
      const result = await taskFieldVisibilityApi.clearMine(organizationId, token);
      if (result.success && result.data) {
        applyResult(result.data);
        showToast({ type: 'success', message: result.message || 'Using organization or global defaults' });
      } else {
        showToast({ type: 'error', message: result.message || 'Failed to reset' });
      }
    } catch {
      showToast({ type: 'error', message: 'Failed to clear personal override' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncClick = () => {
    if (onRequestSyncConfirm) {
      onRequestSyncConfirm(() => {
        void runSync();
      });
      return;
    }
    void runSync();
  };

  const handleResetClick = () => {
    if (onRequestResetConfirm) {
      onRequestResetConfirm(() => {
        void runReset();
      });
      return;
    }
    void runReset();
  };

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading task form visibility…</div>;
  }

  const title =
    mode === 'global'
      ? 'Task Form (global template)'
      : mode === 'organization'
        ? 'Task Form'
        : 'Task Form (personal)';

  const description =
    mode === 'global'
      ? 'Choose which parts of the task modal are visible by default. New organizations copy this template; Sync from global overwrites an org copy.'
      : mode === 'organization'
        ? 'Choose which parts of the task modal are visible for this organization. Sync from global overwrites this with the global template. Users may still set a personal override in My Profile.'
        : 'Personal layout for the task modal in this organization. If you have not saved an override, the organization default is used (or the global default when the organization has none).';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
          {mode === 'user' && source && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Currently applying: <span className="font-medium text-gray-700 dark:text-gray-200">{SOURCE_LABEL[source]}</span>
              {!hasUserOverride && ' — save to create your personal override.'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'organization' && canManage && (
            <button
              type="button"
              onClick={handleSyncClick}
              disabled={syncing || saving}
              className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync from global'}
            </button>
          )}
          {mode === 'user' && hasUserOverride && (
            <button
              type="button"
              onClick={handleResetClick}
              disabled={syncing || saving}
              className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 disabled:opacity-50"
            >
              {syncing ? 'Resetting…' : 'Use organization default'}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || syncing}
              className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : mode === 'user' ? 'Save personal override' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <TaskFormVisibilityEditor value={config} onChange={setConfig} disabled={!canManage || saving || syncing} />
    </div>
  );
}
