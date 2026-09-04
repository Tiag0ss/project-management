'use client';

import React, { useEffect, useState } from 'react';
import TaskFormVisibilitySettingsPanel from '@/components/old/admin/TaskFormVisibilitySettingsPanel';
import ConfirmAlertModal from '@/components/old/ConfirmAlertModal';
import { organizationsApi, Organization } from '@/lib/api/organizations';

interface ProfileTaskFormVisibilityProps {
  token: string;
}

export default function ProfileTaskFormVisibility({ token }: ProfileTaskFormVisibilityProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingReset, setPendingReset] = useState<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingOrgs(true);
    setLoadError('');
    organizationsApi
      .getAll(token)
      .then((result) => {
        if (cancelled) return;
        const orgs = result.organizations || [];
        setOrganizations(orgs);
        if (orgs.length > 0) {
          setOrganizationId((prev) => prev ?? orgs[0].Id);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load organizations');
      })
      .finally(() => {
        if (!cancelled) setLoadingOrgs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loadingOrgs) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading organizations…</div>;
  }

  if (loadError) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
        {loadError}
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-sm text-gray-600 dark:text-gray-300">
        You are not a member of any organization, so there is no task form layout to customize.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Organization
        </label>
        <select
          value={organizationId ?? ''}
          onChange={(e) => setOrganizationId(Number(e.target.value))}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {organizations.map((org) => (
            <option key={org.Id} value={org.Id}>
              {org.Name}
              {org.Abbreviation ? ` (${org.Abbreviation})` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Personal overrides are per organization. Cascade: your override → organization → global.
        </p>
      </div>

      {organizationId && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <TaskFormVisibilitySettingsPanel
            mode="user"
            token={token}
            organizationId={organizationId}
            canManage
            onRequestResetConfirm={(onConfirm) => {
              setPendingReset(() => onConfirm);
              setResetConfirmOpen(true);
            }}
          />
        </div>
      )}

      <ConfirmAlertModal
        isOpen={resetConfirmOpen}
        type="confirm"
        title="Use organization default"
        message="This removes your personal task form override for this organization. The organization default will apply (or the global default if the organization has none)."
        onClose={() => {
          setResetConfirmOpen(false);
          setPendingReset(null);
        }}
        onConfirm={() => {
          const action = pendingReset;
          setResetConfirmOpen(false);
          setPendingReset(null);
          action?.();
        }}
        confirmLabel="Reset"
        confirmVariant="primary"
      />
    </div>
  );
}
