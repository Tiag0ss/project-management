'use client';

import Link from 'next/link';

export type ChartSlice = { key: string; label: string; value: number; color: string };
export type CompareRow = { key: string; label: string; current: number; previous: number };
export type NamedHours = { id?: number; name: string; hours: number };
export type SimpleBar = { key: string; label: string; value: number; color?: string };
export type TrendPoint = { date: string; green: number; amber: number; red: number };

function ChartCard({
  title,
  empty,
  children,
  hint,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {empty ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">No data for this period.</p>
      ) : (
        children
      )}
      {hint ? <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

function Donut({ slices, centerLabel }: { slices: ChartSlice[]; centerLabel: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 160;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-gray-100 dark:stroke-gray-700"
          strokeWidth={stroke}
        />
        {total > 0 &&
          slices.map((slice) => {
            const length = (slice.value / total) * circumference;
            const node = (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += length;
            return node;
          })}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-900 dark:fill-white"
          style={{ fontSize: 22, fontWeight: 600 }}
        >
          {total}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          className="fill-gray-500 dark:fill-gray-400"
          style={{ fontSize: 11 }}
        >
          {centerLabel}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: slice.color }} />
            {slice.label}:{' '}
            <span className="font-medium text-gray-900 dark:text-white">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompareBars({ rows, valueSuffix = '' }: { rows: CompareRow[]; valueSuffix?: string }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.current, row.previous]));
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{row.label}</span>
            <span>
              {Number(row.current).toFixed(1)}
              {valueSuffix} / prev {Number(row.previous).toFixed(1)}
              {valueSuffix}
            </span>
          </div>
          <div className="space-y-1">
            <div className="h-3 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded bg-blue-600"
                style={{ width: `${Math.min(100, (row.current / max) * 100)}%` }}
              />
            </div>
            <div className="h-3 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded bg-gray-400 dark:bg-gray-500"
                style={{ width: `${Math.min(100, (row.previous / max) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-blue-600" /> This period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-gray-400" /> Previous
        </span>
      </div>
    </div>
  );
}

function HBars({ rows, formatValue }: { rows: NamedHours[]; formatValue: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.hours));
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id ?? row.name} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 items-center">
          <div>
            <div className="text-xs text-gray-700 dark:text-gray-300 truncate mb-0.5" title={row.name}>
              {row.id ? (
                <Link
                  href={`/projects/${row.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {row.name}
                </Link>
              ) : (
                row.name
              )}
            </div>
            <div className="h-2.5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded bg-indigo-500"
                style={{ width: `${Math.min(100, (row.hours / max) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-right text-gray-600 dark:text-gray-400">{formatValue(row.hours)}</div>
        </div>
      ))}
    </div>
  );
}

function VBars({ rows }: { rows: SimpleBar[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="flex items-end gap-4 h-36 px-2">
      {rows.map((row) => (
        <div key={row.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{row.value}</span>
          <div
            className="w-full max-w-[3rem] rounded-t"
            style={{
              height: `${Math.max(4, (row.value / max) * 100)}%`,
              background: row.color || '#2563eb',
            }}
          />
          <span className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-tight">
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendLines({ points }: { points: TrendPoint[] }) {
  const width = 320;
  const height = 140;
  const pad = { top: 10, right: 8, bottom: 24, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.green + p.amber + p.red));
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const path = (key: 'green' | 'amber' | 'red') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad.left + i * step} ${y(p[key])}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
        <path d={path('green')} fill="none" stroke="#16a34a" strokeWidth="2" />
        <path d={path('amber')} fill="none" stroke="#d97706" strokeWidth="2" />
        <path d={path('red')} fill="none" stroke="#dc2626" strokeWidth="2" />
        {points.map((p, i) => (
          <text
            key={p.date}
            x={pad.left + i * step}
            y={height - 6}
            textAnchor="middle"
            className="fill-gray-500"
            style={{ fontSize: 9 }}
          >
            {p.date.slice(5)}
          </text>
        ))}
      </svg>
      <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-600" /> Green
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-600" /> Amber
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-600" /> Red
        </span>
      </div>
    </div>
  );
}

export type OrganizationChartsData = {
  rag?: ChartSlice[];
  hoursCompare?: CompareRow[];
  topProjects?: NamedHours[];
  throughput?: SimpleBar[];
  openVsOverdue?: SimpleBar[];
  taskHours?: ChartSlice[];
  schedule?: ChartSlice[];
  ragTrend?: TrendPoint[];
};

export function OrganizationCharts({
  charts,
  formatHours,
}: {
  charts: OrganizationChartsData | null | undefined;
  formatHours: (n: number) => string;
}) {
  if (!charts) return null;

  const rag = charts.rag || [];
  const hoursCompare = charts.hoursCompare || [];
  const topProjects = charts.topProjects || [];
  const throughput = charts.throughput || [];
  const openVsOverdue = charts.openVsOverdue || [];
  const taskHours = charts.taskHours || [];
  const schedule = charts.schedule || [];
  const ragTrend = charts.ragTrend || [];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Charts</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Project health (RAG)" empty={rag.every((s) => s.value === 0)}>
          <Donut slices={rag} centerLabel="projects" />
        </ChartCard>
        <ChartCard
          title="Planned vs logged hours"
          empty={hoursCompare.every((r) => r.current === 0 && r.previous === 0)}
        >
          <CompareBars rows={hoursCompare} valueSuffix="h" />
        </ChartCard>
        <ChartCard title="Top projects by logged hours" empty={topProjects.length === 0}>
          <HBars rows={topProjects} formatValue={formatHours} />
        </ChartCard>
        <ChartCard title="Throughput (tasks closed)" empty={throughput.every((r) => r.value === 0)}>
          <VBars
            rows={throughput.map((row, index) => ({
              ...row,
              color: index === 0 ? '#2563eb' : '#9ca3af',
            }))}
          />
        </ChartCard>
        <ChartCard title="Open vs overdue tasks" empty={openVsOverdue.every((r) => r.value === 0)}>
          <VBars rows={openVsOverdue} />
        </ChartCard>
        <ChartCard title="Leaf tasks with / without estimate" empty={taskHours.every((s) => s.value === 0)}>
          <Donut slices={taskHours} centerLabel="leaf" />
        </ChartCard>
        <ChartCard title="Scheduled vs unscheduled leaf tasks" empty={schedule.every((s) => s.value === 0)}>
          <Donut slices={schedule} centerLabel="leaf" />
        </ChartCard>
        <ChartCard
          title="RAG trend (health snapshots)"
          empty={ragTrend.length === 0}
          hint={
            ragTrend.length === 0
              ? 'Trend needs weekly snapshots. Empty until the snapshot job has run at least once.'
              : undefined
          }
        >
          {ragTrend.length > 0 ? <TrendLines points={ragTrend} /> : null}
        </ChartCard>
      </div>
    </section>
  );
}
