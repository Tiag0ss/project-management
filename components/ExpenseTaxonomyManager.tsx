'use client';

import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api/config';
import {
  ExpenseCategory,
  ExpenseCategoryGroup,
  listExpenseCategories,
  listExpenseCategoryGroups,
} from '@/lib/api/expenses';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import PageTabs from '@/components/PageTabs';

interface Props {
  orgId: number;
  token: string;
  canManage: boolean;
}

export default function ExpenseTaxonomyManager({ orgId, token, canManage }: Props) {
  const [groups, setGroups] = useState<ExpenseCategoryGroup[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'groups' | 'categories'>('groups');
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExpenseCategoryGroup | null>(null);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [form, setForm] = useState({
    name: '',
    colorCode: '#3b82f6',
    sortOrder: 0,
    isDefault: false,
    groupId: 0,
    maxReimbursementAmount: '' as string,
  });
  const [dialog, setDialog] = useState<{
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [g, c] = await Promise.all([
        listExpenseCategoryGroups(token, orgId),
        listExpenseCategories(token, orgId),
      ]);
      setGroups(g);
      setCategories(c);
    } catch (err: any) {
      setError(err.message || 'Failed to load expense taxonomy');
    } finally {
      setIsLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingGroup(null);
    setEditingCategory(null);
    setForm({
      name: '',
      colorCode: '#3b82f6',
      sortOrder: 0,
      isDefault: false,
      groupId: groups[0]?.Id || 0,
      maxReimbursementAmount: '',
    });
    setShowForm(true);
  };

  const openEditGroup = (g: ExpenseCategoryGroup) => {
    setEditingGroup(g);
    setEditingCategory(null);
    setForm({
      name: g.GroupName,
      colorCode: g.ColorCode || '#3b82f6',
      sortOrder: g.SortOrder || 0,
      isDefault: !!g.IsDefault,
      groupId: g.Id,
      maxReimbursementAmount: '',
    });
    setMode('groups');
    setShowForm(true);
  };

  const openEditCategory = (c: ExpenseCategory) => {
    setEditingCategory(c);
    setEditingGroup(null);
    setForm({
      name: c.CategoryName,
      colorCode: c.ColorCode || '#3b82f6',
      sortOrder: c.SortOrder || 0,
      isDefault: !!c.IsDefault,
      groupId: c.GroupId,
      maxReimbursementAmount:
        c.MaxReimbursementAmount !== null && c.MaxReimbursementAmount !== undefined
          ? String(c.MaxReimbursementAmount)
          : '',
    });
    setMode('categories');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setDialog({ type: 'alert', title: 'Validation', message: 'Name is required' });
      return;
    }
    try {
      const maxReimbPayload =
        mode === 'categories'
          ? {
              maxReimbursementAmount:
                form.maxReimbursementAmount.trim() === '' ? null : Number(form.maxReimbursementAmount),
            }
          : {};
      if (mode === 'groups') {
        if (editingGroup) {
          const res = await fetch(`${getApiUrl()}/api/status-values/expense-category-group/${editingGroup.Id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupName: form.name.trim(),
              colorCode: form.colorCode,
              sortOrder: form.sortOrder,
              isDefault: form.isDefault,
            }),
          });
          if (!res.ok) throw new Error((await res.json()).message || 'Failed to update group');
        } else {
          const res = await fetch(`${getApiUrl()}/api/status-values/expense-category-group`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organizationId: orgId,
              groupName: form.name.trim(),
              colorCode: form.colorCode,
              sortOrder: form.sortOrder,
              isDefault: form.isDefault,
            }),
          });
          if (!res.ok) throw new Error((await res.json()).message || 'Failed to create group');
        }
      } else {
        if (!form.groupId) {
          setDialog({ type: 'alert', title: 'Validation', message: 'Group is required' });
          return;
        }
        if (editingCategory) {
          const res = await fetch(`${getApiUrl()}/api/status-values/expense-category/${editingCategory.Id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupId: form.groupId,
              categoryName: form.name.trim(),
              colorCode: form.colorCode,
              sortOrder: form.sortOrder,
              isDefault: form.isDefault,
              ...maxReimbPayload,
            }),
          });
          if (!res.ok) throw new Error((await res.json()).message || 'Failed to update category');
        } else {
          const res = await fetch(`${getApiUrl()}/api/status-values/expense-category`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organizationId: orgId,
              groupId: form.groupId,
              categoryName: form.name.trim(),
              colorCode: form.colorCode,
              sortOrder: form.sortOrder,
              isDefault: form.isDefault,
              ...maxReimbPayload,
            }),
          });
          if (!res.ok) throw new Error((await res.json()).message || 'Failed to create category');
        }
      }
      setShowForm(false);
      await load();
    } catch (err: any) {
      setDialog({ type: 'alert', title: 'Error', message: err.message || 'Save failed' });
    }
  };

  const handleDeleteGroup = (g: ExpenseCategoryGroup) => {
    setDialog({
      type: 'confirm',
      title: 'Delete group',
      message: `Delete group "${g.GroupName}"? It must have no categories.`,
      onConfirm: async () => {
        const res = await fetch(`${getApiUrl()}/api/status-values/expense-category-group/${g.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setDialog({ type: 'alert', title: 'Error', message: err.message || 'Delete failed' });
          return;
        }
        await load();
      },
    });
  };

  const handleDeleteCategory = (c: ExpenseCategory) => {
    setDialog({
      type: 'confirm',
      title: 'Delete category',
      message: `Delete category "${c.CategoryName}"?`,
      onConfirm: async () => {
        const res = await fetch(`${getApiUrl()}/api/status-values/expense-category/${c.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setDialog({ type: 'alert', title: 'Error', message: err.message || 'Delete failed' });
          return;
        }
        await load();
      },
    });
  };

  const editIcon = (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
  const deleteIcon = (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PageTabs
            tabs={[
              { id: 'groups', label: 'Expense Groups' },
              { id: 'categories', label: 'Expense Categories' },
            ]}
            activeId={mode}
            onChange={(id) => setMode(id as 'groups' | 'categories')}
          />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {mode === 'groups' ? 'New Group' : 'New Category'}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      ) : mode === 'groups' ? (
        groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            No expense groups yet.
          </div>
        ) : (
          <div className="overflow-hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Color
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Group
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Categories
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Order
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Flags
                  </th>
                  {canManage && (
                    <th scope="col" className="relative px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {groups.map((g) => (
                  <tr key={g.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-block h-5 w-5 rounded border border-gray-200 dark:border-gray-600"
                        style={{ backgroundColor: g.ColorCode || '#3b82f6' }}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-white">
                      {g.GroupName}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {g.CategoryCount ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {g.SortOrder}
                    </td>
                    <td className="px-3 py-2.5">
                      {g.IsDefault ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          Default
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Edit"
                            aria-label="Edit group"
                            onClick={() => openEditGroup(g)}
                            className="rounded p-1.5 text-gray-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {editIcon}
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label="Delete group"
                            onClick={() => handleDeleteGroup(g)}
                            className="rounded p-1.5 text-gray-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                          >
                            {deleteIcon}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          No expense categories yet.
        </div>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Color
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Group
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Max reimburse
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Order
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Flags
                </th>
                {canManage && (
                  <th scope="col" className="relative px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {categories.map((c) => (
                <tr key={c.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-block h-5 w-5 rounded border border-gray-200 dark:border-gray-600"
                      style={{ backgroundColor: c.ColorCode || '#3b82f6' }}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-white">
                    {c.CategoryName}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                    {c.GroupName || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {c.MaxReimbursementAmount !== null && c.MaxReimbursementAmount !== undefined
                      ? Number(c.MaxReimbursementAmount).toFixed(2)
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {c.SortOrder}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.IsDefault ? (
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        Default
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Edit"
                          aria-label="Edit category"
                          onClick={() => openEditCategory(c)}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {editIcon}
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label="Delete category"
                          onClick={() => handleDeleteCategory(c)}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                        >
                          {deleteIcon}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingGroup || editingCategory ? 'Edit' : 'New'} {mode === 'groups' ? 'Group' : 'Category'}
            </h3>
            {mode === 'categories' && (
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">Group</span>
                <select
                  value={form.groupId}
                  onChange={(e) => setForm((f) => ({ ...f, groupId: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value={0}>Select...</option>
                  {groups.map((g) => (
                    <option key={g.Id} value={g.Id}>{g.GroupName}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">Color</span>
              <input
                type="color"
                value={form.colorCode}
                onChange={(e) => setForm((f) => ({ ...f, colorCode: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 dark:border-gray-600"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 dark:text-gray-300">Sort order</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              Default
            </label>
            {mode === 'categories' && (
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">Max reimbursement (optional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maxReimbursementAmount}
                  onChange={(e) => setForm((f) => ({ ...f, maxReimbursementAmount: e.target.value }))}
                  placeholder="No cap"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Maximum amount that can be reimbursed per expense in this category.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                Cancel
              </button>
              <button type="button" onClick={handleSave} className="h-10 rounded-lg bg-blue-600 px-4 text-sm text-white">
                Save
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
