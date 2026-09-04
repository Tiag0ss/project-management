'use client';

import { useState, useEffect, useCallback } from 'react';
import { Expense, listExpenses } from '@/lib/api/expenses';
import { getApiUrl } from '@/lib/api/config';

const formatMoney = (value: number | string | null | undefined) => {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface Props {
  projectId: number;
  token: string;
  canViewBudgetInfo: boolean;
}

export default function ProjectExpensesSection({ projectId, token, canViewBudgetInfo }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const flagsRes = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const flags = flagsRes.ok ? await flagsRes.json() : {};
      if (flags.expensesEnabled !== true) {
        setEnabled(false);
        setExpenses([]);
        return;
      }
      setEnabled(true);
      const rows = await listExpenses(token, { projectId });
      setExpenses(rows);
    } catch {
      setEnabled(false);
      setExpenses([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) return null;

  const approvedTotal = expenses
    .filter((e) => e.ApprovalStatus === 'approved')
    .reduce((sum, e) => sum + Number(e.Amount || 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          Expenses
        </h2>
        <a
          href={`/expenses?projectId=${projectId}`}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Open expenses
        </a>
      </div>
      {canViewBudgetInfo && (
        <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">
          Approved expenses total:{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(approvedTotal)}</span>
        </div>
      )}
      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      ) : expenses.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">No expenses linked to this project.</div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {expenses.slice(0, 8).map((e) => (
            <li key={e.Id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 dark:text-white truncate">{e.Title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {String(e.ExpenseDate).slice(0, 10)} · {e.CategoryName} · {e.ApprovalStatus}
                </div>
              </div>
              <div className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                {formatMoney(e.Amount)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
