'use client';

import Link from 'next/link';
import type {
  TaskAnalyticsData,
  TaskAnalyticsParentProgress,
  TaskAnalyticsSlice,
} from '@/lib/reporting/taskAnalytics';

function ChartCard({
  title,
  subtitle,
  empty,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col min-h-[220px]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      {empty ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-10 text-center flex-1">No tasks to show.</p>
      ) : (
        <div className="mt-3 flex-1">{children}</div>
      )}
    </div>
  );
}

function VBars({ rows }: { rows: TaskAnalyticsSlice[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="flex items-end gap-3 h-40 px-1">
      {rows.map((row) => (
        <div key={row.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-0">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{row.value}</span>
          <div
            className="w-full max-w-[2.75rem] rounded-t"
            style={{
              height: `${Math.max(6, (row.value / max) * 100)}%`,
              background: row.color || '#6b7280',
            }}
            title={`${row.label}: ${row.value}`}
          />
          <span className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-tight truncate w-full">
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function PercentBars({ rows }: { rows: TaskAnalyticsSlice[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = Math.round((row.value / total) * 100);
        return (
          <div key={row.key}>
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className="truncate text-gray-700 dark:text-gray-300" title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 font-medium text-gray-900 dark:text-white">{pct}%</span>
            </div>
            <div className="h-2.5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background: row.color || '#2563eb',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WorkloadBars({ rows }: { rows: TaskAnalyticsSlice[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 items-center">
          <div className="min-w-0">
            <div className="text-xs text-gray-700 dark:text-gray-300 truncate mb-0.5" title={row.label}>
              {row.label}
            </div>
            <div className="h-2.5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.min(100, (row.value / max) * 100)}%`,
                  background: row.color || '#4b5563',
                }}
              />
            </div>
          </div>
          <div className="text-xs text-right text-gray-600 dark:text-gray-400">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function ParentProgressBars({ rows }: { rows: TaskAnalyticsParentProgress[] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-green-500" /> Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-blue-500" /> In progress
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-gray-300 dark:bg-gray-600" /> To do
        </span>
      </div>
      {rows.map((row) => {
        const total = Math.max(1, row.done + row.inProgress + row.todo);
        return (
          <div key={row.id ?? row.label}>
            <div className="text-xs text-gray-700 dark:text-gray-300 truncate mb-1" title={row.label}>
              {row.label}
            </div>
            <div className="flex h-3 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
              {row.done > 0 && (
                <div
                  className="bg-green-500"
                  style={{ width: `${(row.done / total) * 100}%` }}
                  title={`Done: ${row.done}`}
                />
              )}
              {row.inProgress > 0 && (
                <div
                  className="bg-blue-500"
                  style={{ width: `${(row.inProgress / total) * 100}%` }}
                  title={`In progress: ${row.inProgress}`}
                />
              )}
              {row.todo > 0 && (
                <div
                  className="bg-gray-300 dark:bg-gray-500"
                  style={{ width: `${(row.todo / total) * 100}%` }}
                  title={`To do: ${row.todo}`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TaskAnalyticsCharts({
  data,
  viewAllHref,
  onViewAll,
  className,
}: {
  data: TaskAnalyticsData | null | undefined;
  viewAllHref?: string;
  onViewAll?: () => void;
  className?: string;
}) {
  if (!data) return null;

  const priority = data.priorityBreakdown || [];
  const types = data.typesOfWork || [];
  const workload = data.teamWorkload || [];
  const parents = data.parentProgress || [];
  const hasAny =
    priority.some((r) => r.value > 0) ||
    types.some((r) => r.value > 0) ||
    workload.some((r) => r.value > 0) ||
    parents.some((r) => r.done + r.inProgress + r.todo > 0);

  const viewAll =
    onViewAll || viewAllHref ? (
      onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          View all
        </button>
      ) : (
        <Link href={viewAllHref!} className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">
          View all
        </Link>
      )
    ) : null;

  return (
    <section className={className || 'space-y-3'}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Task analytics</h2>
        {viewAll}
      </div>
      {!hasAny ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No task data available.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title="Priority breakdown"
            subtitle="All tasks by priority"
            empty={priority.every((r) => r.value === 0)}
          >
            <VBars rows={priority} />
          </ChartCard>
          <ChartCard
            title="Types of work"
            subtitle="Share of tasks by type"
            empty={types.every((r) => r.value === 0)}
          >
            <PercentBars rows={types} />
          </ChartCard>
          <ChartCard
            title="Team workload"
            subtitle="Open tasks by assignee"
            empty={workload.every((r) => r.value === 0)}
          >
            <WorkloadBars rows={workload} />
          </ChartCard>
          <ChartCard
            title="Parent task progress"
            subtitle="Done / in progress / to do"
            empty={parents.length === 0}
          >
            <ParentProgressBars rows={parents} />
          </ChartCard>
        </div>
      )}
    </section>
  );
}
