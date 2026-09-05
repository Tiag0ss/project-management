'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import PageTabs from '@/components/PageTabs';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import { useToast } from '@/contexts/ToastContext';

type VcsProvider = 'github' | 'gitea' | 'bitbucket';

type VcsRow = {
  Id: number;
  Name: string;
  IsEnabled: number;
  IsDefault: number;
  GitHubUrl?: string;
  GiteaUrl?: string;
  BitbucketUrl?: string;
  BitbucketUsername?: string | null;
};

type JiraIntegration = {
  OrganizationId: number;
  IsEnabled: number;
  JiraUrl: string;
  JiraEmail: string;
  JiraProjectKey?: string;
  JiraTicketsJqlFilter?: string;
  HideIntegratedJiraTicketsByDefault?: number;
  JiraProjectsUrl?: string;
  JiraProjectsEmail?: string;
};

const PROVIDER_API: Record<VcsProvider, string> = {
  github: 'github-integrations',
  gitea: 'gitea-integrations',
  bitbucket: 'bitbucket-integrations',
};

function urlOf(row: VcsRow): string {
  return row.GitHubUrl || row.GiteaUrl || row.BitbucketUrl || '';
}

export default function OrganizationIntegrationsPanel({
  orgId,
  token,
}: {
  orgId: number;
  token: string;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'jira' | VcsProvider>('jira');
  const [jira, setJira] = useState<JiraIntegration | null>(null);
  const [vcsRows, setVcsRows] = useState<Record<VcsProvider, VcsRow[]>>({
    github: [],
    gitea: [],
    bitbucket: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  // Jira form
  const [jiraForm, setJiraForm] = useState({
    isEnabled: true,
    jiraUrl: '',
    jiraEmail: '',
    jiraProjectKey: '',
    jiraTicketsJqlFilter: '',
    hideIntegratedJiraTicketsByDefault: false,
    jiraProjectsUrl: '',
    jiraProjectsEmail: '',
  });
  const jiraTokenRef = useRef<HTMLInputElement>(null);
  const jiraProjectsTokenRef = useRef<HTMLInputElement>(null);
  const [jiraSaving, setJiraSaving] = useState(false);
  const [showJiraForm, setShowJiraForm] = useState(false);

  // VCS form
  const [vcsFormOpen, setVcsFormOpen] = useState(false);
  const [editingVcs, setEditingVcs] = useState<VcsRow | null>(null);
  const [vcsForm, setVcsForm] = useState({
    name: '',
    isEnabled: true,
    isDefault: false,
    url: '',
    username: '',
  });
  const vcsTokenRef = useRef<HTMLInputElement>(null);
  const [vcsSaving, setVcsSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [jiraRes, ghRes, gtRes, bbRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/jira-integrations/organization/${orgId}`, { headers }),
        fetch(`${getApiUrl()}/api/github-integrations/organization/${orgId}`, { headers }),
        fetch(`${getApiUrl()}/api/gitea-integrations/organization/${orgId}`, { headers }),
        fetch(`${getApiUrl()}/api/bitbucket-integrations/organization/${orgId}`, { headers }),
      ]);

      if (jiraRes.ok) {
        const data = await jiraRes.json();
        const integration = data.integration || null;
        setJira(integration);
        if (integration) {
          setJiraForm({
            isEnabled: integration.IsEnabled === 1,
            jiraUrl: integration.JiraUrl || '',
            jiraEmail: integration.JiraEmail || '',
            jiraProjectKey: integration.JiraProjectKey || '',
            jiraTicketsJqlFilter: integration.JiraTicketsJqlFilter || '',
            hideIntegratedJiraTicketsByDefault: integration.HideIntegratedJiraTicketsByDefault === 1,
            jiraProjectsUrl: integration.JiraProjectsUrl || '',
            jiraProjectsEmail: integration.JiraProjectsEmail || '',
          });
        }
      }

      const parseList = async (res: Response) => {
        if (!res.ok) return [];
        const data = await res.json();
        return (data.integrations || (data.integration ? [data.integration] : [])) as VcsRow[];
      };

      setVcsRows({
        github: await parseList(ghRes),
        gitea: await parseList(gtRes),
        bitbucket: await parseList(bbRes),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, [orgId, token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openVcsCreate = () => {
    setEditingVcs(null);
    setVcsForm({ name: '', isEnabled: true, isDefault: vcsRows[tab as VcsProvider]?.length === 0, url: '', username: '' });
    clearPasswordInput(vcsTokenRef);
    setVcsFormOpen(true);
  };

  const openVcsEdit = (row: VcsRow) => {
    setEditingVcs(row);
    setVcsForm({
      name: row.Name || '',
      isEnabled: row.IsEnabled === 1,
      isDefault: row.IsDefault === 1,
      url: urlOf(row),
      username: row.BitbucketUsername || '',
    });
    clearPasswordInput(vcsTokenRef);
    setVcsFormOpen(true);
  };

  const saveVcs = async () => {
    if (tab === 'jira') return;
    const provider = tab as VcsProvider;
    const tokenValue = readPasswordInput(vcsTokenRef);
    if (!vcsForm.url.trim()) {
      setDialog({ type: 'alert', title: 'Validation', message: 'URL is required' });
      return;
    }
    if (!editingVcs && !tokenValue) {
      setDialog({ type: 'alert', title: 'Validation', message: 'Access token is required' });
      return;
    }

    setVcsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: vcsForm.name.trim(),
        isEnabled: vcsForm.isEnabled,
        isDefault: vcsForm.isDefault,
      };
      if (provider === 'github') {
        body.gitHubUrl = vcsForm.url.trim();
        if (tokenValue) body.gitHubToken = tokenValue;
      } else if (provider === 'gitea') {
        body.giteaUrl = vcsForm.url.trim();
        if (tokenValue) body.giteaToken = tokenValue;
      } else {
        body.bitbucketUrl = vcsForm.url.trim();
        body.bitbucketUsername = vcsForm.username.trim() || null;
        if (tokenValue) body.bitbucketToken = tokenValue;
      }

      const res = editingVcs
        ? await fetch(`${getApiUrl()}/api/${PROVIDER_API[provider]}/${editingVcs.Id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`${getApiUrl()}/api/${PROVIDER_API[provider]}/organization/${orgId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Save failed');
      }

      showToast({ type: 'success', title: 'Saved', message: 'Integration saved successfully' });
      setVcsFormOpen(false);
      await loadAll();
    } catch (err: any) {
      setDialog({ type: 'alert', title: 'Error', message: err.message || 'Save failed' });
    } finally {
      setVcsSaving(false);
    }
  };

  const deleteVcs = (row: VcsRow) => {
    if (tab === 'jira') return;
    const provider = tab as VcsProvider;
    setDialog({
      type: 'confirm',
      title: 'Delete integration',
      message: `Delete "${row.Name}"? Applications using it will be unlinked.`,
      onConfirm: async () => {
        const res = await fetch(`${getApiUrl()}/api/${PROVIDER_API[provider]}/${row.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setDialog({ type: 'alert', title: 'Error', message: err.message || 'Delete failed' });
          return;
        }
        showToast({ type: 'success', title: 'Deleted', message: 'Integration deleted' });
        await loadAll();
      },
    });
  };

  const saveJira = async () => {
    const jiraApiToken = readPasswordInput(jiraTokenRef);
    const jiraProjectsApiToken = readPasswordInput(jiraProjectsTokenRef);
    setJiraSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${orgId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isEnabled: jiraForm.isEnabled,
          jiraUrl: jiraForm.jiraUrl,
          jiraEmail: jiraForm.jiraEmail,
          jiraApiToken: jiraApiToken || undefined,
          jiraProjectKey: jiraForm.jiraProjectKey,
          jiraTicketsJqlFilter: jiraForm.jiraTicketsJqlFilter,
          hideIntegratedJiraTicketsByDefault: jiraForm.hideIntegratedJiraTicketsByDefault,
          jiraProjectsUrl: jiraForm.jiraProjectsUrl || null,
          jiraProjectsEmail: jiraForm.jiraProjectsEmail || null,
          jiraProjectsApiToken: jiraProjectsApiToken || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save Jira integration');
      }
      showToast({ type: 'success', title: 'Saved', message: 'Jira integration saved' });
      setShowJiraForm(false);
      clearPasswordInput(jiraTokenRef);
      clearPasswordInput(jiraProjectsTokenRef);
      await loadAll();
    } catch (err: any) {
      setDialog({ type: 'alert', title: 'Error', message: err.message || 'Save failed' });
    } finally {
      setJiraSaving(false);
    }
  };

  const deleteJira = () => {
    setDialog({
      type: 'confirm',
      title: 'Remove Jira integration',
      message: 'Delete the Jira integration for this organization?',
      onConfirm: async () => {
        const res = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${orgId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setDialog({ type: 'alert', title: 'Error', message: err.message || 'Delete failed' });
          return;
        }
        setJira(null);
        showToast({ type: 'success', title: 'Deleted', message: 'Jira integration removed' });
        await loadAll();
      },
    });
  };

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading integrations...</div>;
  }

  const currentVcs = tab === 'jira' ? [] : vcsRows[tab];

  return (
    <div className="space-y-3">
      <PageTabs
        tabs={[
          { id: 'jira', label: 'Jira' },
          { id: 'github', label: 'GitHub' },
          { id: 'gitea', label: 'Gitea' },
          { id: 'bitbucket', label: 'Bitbucket' },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {error && (
        <div className="rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {tab === 'jira' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              One Jira configuration per organization (tickets + optional projects instance).
            </p>
            <div className="flex gap-2">
              {jira && (
                <button
                  type="button"
                  onClick={deleteJira}
                  className="h-9 rounded-lg border border-red-300 px-3 text-sm text-red-600 dark:border-red-800 dark:text-red-400"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  clearPasswordInput(jiraTokenRef);
                  clearPasswordInput(jiraProjectsTokenRef);
                  setShowJiraForm(true);
                }}
                className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
              >
                {jira ? 'Edit Jira' : 'Configure Jira'}
              </button>
            </div>
          </div>

          {!jira ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              No Jira integration configured.
            </div>
          ) : (
            <div className="overflow-hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Tickets URL</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Project key</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Base JQL</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Hide integrated</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Projects URL</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2.5 text-sm text-gray-900 dark:text-white">{jira.JiraUrl}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">{jira.JiraEmail}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">{jira.JiraProjectKey || '—'}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300" title={jira.JiraTicketsJqlFilter || ''}>
                      {jira.JiraTicketsJqlFilter || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                      {jira.HideIntegratedJiraTicketsByDefault ? 'Yes' : 'No'}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">{jira.JiraProjectsUrl || '—'}</td>
                    <td className="px-3 py-2.5 text-sm">
                      {jira.IsEnabled ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Enabled
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          Disabled
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Multiple {tab} instances per organization. Link each Application to one instance.
            </p>
            <button
              type="button"
              onClick={openVcsCreate}
              className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add {tab === 'github' ? 'GitHub' : tab === 'gitea' ? 'Gitea' : 'Bitbucket'}
            </button>
          </div>

          {currentVcs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              No {tab} integrations yet.
            </div>
          ) : (
            <div className="overflow-hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">URL</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Flags</th>
                    <th className="relative px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {currentVcs.map((row) => (
                    <tr key={row.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-white">{row.Name}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">{urlOf(row)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.IsEnabled === 1 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Enabled
                            </span>
                          )}
                          {row.IsDefault === 1 && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              Default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openVcsEdit(row)}
                            className="rounded p-1.5 text-gray-400 hover:text-blue-600"
                            title="Edit"
                            aria-label="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteVcs(row)}
                            className="rounded p-1.5 text-gray-400 hover:text-red-600"
                            title="Delete"
                            aria-label="Delete"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showJiraForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {jira ? 'Edit Jira integration' : 'Configure Jira'}
                </h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  One configuration per organization
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowJiraForm(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto px-6 py-5">
              <section className="space-y-4">
                <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Tickets</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Credentials used for ticket search and import
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Jira URL <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="url"
                      value={jiraForm.jiraUrl}
                      onChange={(e) => setJiraForm((f) => ({ ...f, jiraUrl: e.target.value }))}
                      placeholder="https://your-domain.atlassian.net"
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Email <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="email"
                      value={jiraForm.jiraEmail}
                      onChange={(e) => setJiraForm((f) => ({ ...f, jiraEmail: e.target.value }))}
                      placeholder="your-email@company.com"
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Project key</span>
                    <input
                      value={jiraForm.jiraProjectKey}
                      onChange={(e) => setJiraForm((f) => ({ ...f, jiraProjectKey: e.target.value }))}
                      placeholder="PROJ"
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      API token {jira ? <span className="font-normal text-gray-500">(leave blank to keep)</span> : <span className="text-red-500">*</span>}
                    </span>
                    <PasswordInput
                      ref={jiraTokenRef}
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Base JQL filter</span>
                    <textarea
                      value={jiraForm.jiraTicketsJqlFilter}
                      onChange={(e) => setJiraForm((f) => ({ ...f, jiraTicketsJqlFilter: e.target.value }))}
                      placeholder='e.g. status NOT IN (Done, Cancelled) AND labels = "support"'
                      rows={3}
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      Applied when importing Jira tickets into projects
                    </span>
                  </label>
                  <label className="inline-flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={jiraForm.hideIntegratedJiraTicketsByDefault}
                      onChange={(e) =>
                        setJiraForm((f) => ({ ...f, hideIntegratedJiraTicketsByDefault: e.target.checked }))
                      }
                    />
                    <span>Hide already integrated tickets by default in import</span>
                  </label>
                </div>
              </section>

              <section className="space-y-4">
                <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Projects / Kanban</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Optional second instance for boards (leave empty to reuse tickets credentials)
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Projects URL</span>
                    <input
                      type="url"
                      value={jiraForm.jiraProjectsUrl}
                      onChange={(e) => setJiraForm((f) => ({ ...f, jiraProjectsUrl: e.target.value }))}
                      placeholder="https://your-projects-domain.atlassian.net"
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Projects email</span>
                    <input
                      type="email"
                      value={jiraForm.jiraProjectsEmail}
                      onChange={(e) => setJiraForm((f) => ({ ...f, jiraProjectsEmail: e.target.value }))}
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Projects API token{' '}
                      <span className="font-normal text-gray-500">
                        {jira?.JiraProjectsUrl ? '(leave blank to keep)' : '(optional)'}
                      </span>
                    </span>
                    <PasswordInput
                      ref={jiraProjectsTokenRef}
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </label>
                </div>
              </section>

              <label className="inline-flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={jiraForm.isEnabled}
                  onChange={(e) => setJiraForm((f) => ({ ...f, isEnabled: e.target.checked }))}
                />
                Integration enabled
              </label>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => setShowJiraForm(false)}
                className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={jiraSaving}
                onClick={saveJira}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {jiraSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {vcsFormOpen && tab !== 'jira' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingVcs ? 'Edit' : 'Add'} {tab === 'github' ? 'GitHub' : tab === 'gitea' ? 'Gitea' : 'Bitbucket'}
            </h3>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">Name</span>
              <input
                value={vcsForm.name}
                onChange={(e) => setVcsForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Production GitHub"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">URL</span>
              <input
                value={vcsForm.url}
                onChange={(e) => setVcsForm((f) => ({ ...f, url: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>
            {tab === 'bitbucket' && (
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">Username / Atlassian email</span>
                <input
                  value={vcsForm.username}
                  onChange={(e) => setVcsForm((f) => ({ ...f, username: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">
                Token {editingVcs ? '(leave blank to keep)' : ''}
              </span>
              <PasswordInput
                ref={vcsTokenRef}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={vcsForm.isEnabled}
                onChange={(e) => setVcsForm((f) => ({ ...f, isEnabled: e.target.checked }))}
              />
              Enabled
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={vcsForm.isDefault}
                onChange={(e) => setVcsForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              Default for this organization
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setVcsFormOpen(false)} className="h-10 rounded-lg border px-4 text-sm">
                Cancel
              </button>
              <button
                type="button"
                disabled={vcsSaving}
                onClick={saveVcs}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm text-white disabled:opacity-50"
              >
                {vcsSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmAlertModal
        isOpen={!!dialog}
        type={dialog?.type || 'alert'}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          dialog?.onConfirm?.();
          setDialog(null);
        }}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}
