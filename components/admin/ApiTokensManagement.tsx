'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface ApiToken {
  Id: number;
  UserId: number;
  Username?: string;
  Email?: string;
  TokenName: string;
  TokenPrefix: string;
  IsActive: number;
  LastUsedAt: string | null;
  ExpiresAt: string | null;
  CreatedAt: string;
}

interface NewTokenResult {
  id: number;
  tokenName: string;
  tokenPrefix: string;
  rawToken: string;
  expiresAt: string | null;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export type ApiTokensMode = 'self' | 'admin';

interface ApiTokensManagementProps {
  /** self = My Profile (own tokens only); admin = Administration (all users for admins) */
  mode?: ApiTokensMode;
}

export default function ApiTokensManagement({ mode = 'self' }: ApiTokensManagementProps) {
  const { token, user } = useAuth();
  const isAdminView = mode === 'admin' && !!user?.isAdmin;
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenExpiry, setNewTokenExpiry] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<NewTokenResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Confirm revoke/delete
  const [confirmAction, setConfirmAction] = useState<{
    type: 'revoke' | 'delete';
    tokenId: number;
    tokenName: string;
  } | null>(null);

  const loadTokens = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const qs = mode === 'self' ? '?mine=1' : '';
      const res = await fetch(`${API_URL}/api/api-tokens${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load tokens');
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch (err: any) {
      setError(err.message || 'Error loading API tokens');
    } finally {
      setIsLoading(false);
    }
  }, [token, mode]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    setIsCreating(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/api-tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenName: newTokenName.trim(),
          expiresAt: newTokenExpiry || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create token');
      setCreatedToken(data.token);
      setNewTokenName('');
      setNewTokenExpiry('');
      setShowCreateForm(false);
      loadTokens();
    } catch (err: any) {
      setError(err.message || 'Error creating token');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (tokenId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/api-tokens/${tokenId}/deactivate`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to revoke token');
      loadTokens();
    } catch (err: any) {
      setError(err.message || 'Error revoking token');
    } finally {
      setConfirmAction(null);
    }
  };

  const handleDelete = async (tokenId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/api-tokens/${tokenId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete token');
      loadTokens();
    } catch (err: any) {
      setError(err.message || 'Error deleting token');
    } finally {
      setConfirmAction(null);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const formatDate = (val: string | null) => {
    if (!val) return '—';
    return new Date(val).toLocaleString();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {isAdminView
            ? 'All users’ API tokens. Create below issues a token for your own account; revoke or delete any token as needed.'
            : 'Personal API tokens for IDE extensions, Outlook, and other integrations. Create tokens here — they authenticate as you.'}
        </p>
        <button
          onClick={() => { setShowCreateForm(true); setCreatedToken(null); setError(''); }}
          className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0 ml-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Token
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {/* New token revealed after creation */}
      {createdToken && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-400 dark:border-green-700 rounded-lg">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
            Token created! Copy it now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-200 break-all">
              {createdToken.rawToken}
            </code>
            <button
              onClick={() => handleCopy(createdToken.rawToken)}
              className="h-10 px-3 rounded-lg text-sm font-medium inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {copied ? (
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              )}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setCreatedToken(null)}
              className="h-10 px-3 rounded-lg text-sm inline-flex items-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">New API Token</h3>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token Name *
              </label>
              <input
                type="text"
                value={newTokenName}
                onChange={e => setNewTokenName(e.target.value)}
                placeholder="e.g., Outlook Add-in"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
              />
            </div>
            <div className="min-w-[180px]">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expires (optional)
              </label>
              <input
                type="date"
                value={newTokenExpiry}
                onChange={e => setNewTokenExpiry(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating || !newTokenName.trim()}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setNewTokenName(''); setNewTokenExpiry(''); }}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tokens table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No API tokens yet. Create one to get started.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {isAdminView && (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                )}
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Prefix
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Used
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Expires
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {tokens.map(t => (
                <tr key={t.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  {isAdminView && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      <div className="font-medium">{t.Username}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t.Email}</div>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {t.TokenName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                      {t.TokenPrefix}...
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      t.IsActive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      {t.IsActive ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(t.LastUsedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(t.ExpiresAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(t.CreatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {t.IsActive && (
                        <button
                          onClick={() => setConfirmAction({ type: 'revoke', tokenId: t.Id, tokenName: t.TokenName })}
                          title="Revoke token"
                          aria-label="Revoke token"
                          className="p-1.5 text-gray-400 rounded transition-colors hover:text-yellow-600 dark:hover:text-yellow-400"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmAction({ type: 'delete', tokenId: t.Id, tokenName: t.TokenName })}
                        title="Delete token"
                        aria-label="Delete token"
                        className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {confirmAction.type === 'revoke' ? 'Revoke Token' : 'Delete Token'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {confirmAction.type === 'revoke'
                ? `Are you sure you want to revoke "${confirmAction.tokenName}"? It will stop working immediately.`
                : `Are you sure you want to permanently delete "${confirmAction.tokenName}"? This cannot be undone.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  confirmAction.type === 'revoke'
                    ? handleRevoke(confirmAction.tokenId)
                    : handleDelete(confirmAction.tokenId)
                }
                className="h-10 px-4 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                {confirmAction.type === 'revoke' ? 'Revoke' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
