'use client';

import { useEffect, useState } from 'react';
import { taskFieldVisibilityApi } from '@/lib/api/taskFieldVisibility';
import {
  TaskFieldVisibilityConfig,
  createDefaultTaskFieldVisibility,
  isTaskFieldVisible,
  isTaskTabVisible,
  TaskFormFieldKey,
  TaskFormTabKey,
} from '@/lib/taskFieldVisibility';

export function useTaskFieldVisibility(organizationId: number | null | undefined, token: string | null | undefined) {
  const [config, setConfig] = useState<TaskFieldVisibilityConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId || !token) {
      setConfig(createDefaultTaskFieldVisibility());
      return;
    }

    let cancelled = false;
    setLoading(true);
    taskFieldVisibilityApi
      .getEffective(organizationId, token)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setConfig({ fields: result.data.fields, tabs: result.data.tabs });
        } else {
          setConfig(createDefaultTaskFieldVisibility());
        }
      })
      .catch(() => {
        if (!cancelled) setConfig(createDefaultTaskFieldVisibility());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, token]);

  return {
    config: config ?? createDefaultTaskFieldVisibility(),
    loading,
    isFieldVisible: (key: TaskFormFieldKey | string) => isTaskFieldVisible(config, key),
    isTabVisible: (key: TaskFormTabKey | string) => isTaskTabVisible(config, key),
  };
}
