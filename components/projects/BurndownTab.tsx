'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { useFormatHours } from '@/lib/useFormatHours';

export function BurndownTab({ projectId, token }: { projectId: number; token: string }) {
  const decimalHoursToHMS = useFormatHours();
  const [data, setData] = useState<{
    startDate: string;
    endDate: string;
    today: string;
    totalEstimatedHours: number;
    series: { date: string; worked: number; cumulative: number; remaining: number; ideal: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState<'burndown' | 'burnup'>('burndown');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${getApiUrl()}/api/projects/${projectId}/burndown`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        const json = await res.json();
        setData(json.data);
      } catch {
        setError('Failed to load burndown data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, token]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">Loading chart…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  const { series, totalEstimatedHours, endDate, today } = data;

  // Trim series to only include dates up to today for rendering
  const visibleSeries = series.filter(s => s.date <= today);
  const allSeries = series; // full to show ideal line to end date

  if (allSeries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-10 text-center">
        <p className="text-4xl mb-3">📉</p>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">No data yet</h3>
        <p className="text-gray-500 dark:text-gray-400">Log time entries to see the burndown chart.</p>
      </div>
    );
  }

  // SVG chart dimensions
  const W = 800, H = 320, PAD = { top: 20, right: 30, bottom: 50, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const n = allSeries.length;
  const maxY = Math.max(totalEstimatedHours, visibleSeries.reduce((m, s) => Math.max(m, s.cumulative), 0)) * 1.05;

  const xScale = (i: number) => (i / Math.max(n - 1, 1)) * chartW;
  const yScale = (v: number) => chartH - (v / (maxY || 1)) * chartH;

  // Build polyline points
  const idealPoints = allSeries.map((s, i) => `${xScale(i)},${yScale(s.ideal)}`).join(' ');
  const burndownPoints = visibleSeries.map((s, i) => `${xScale(i)},${yScale(s.remaining)}`).join(' ');
  const burnupPoints = visibleSeries.map((s, i) => `${xScale(i)},${yScale(s.cumulative)}`).join(' ');

  // X axis: pick ~6 evenly-spaced labels
  const tickStep = Math.max(1, Math.floor(n / 6));
  const xTicks = allSeries.filter((_, i) => i % tickStep === 0 || i === n - 1);

  // Y axis: 5 ticks
  const yTicks = Array.from({ length: 6 }, (_, i) => Math.round((maxY / 5) * i));

  const workedTotal = visibleSeries[visibleSeries.length - 1]?.cumulative || 0;
  const remainingTotal = Math.max(0, totalEstimatedHours - workedTotal);
  const completionPct = totalEstimatedHours > 0 ? Math.round((workedTotal / totalEstimatedHours) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(data.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' → '}
              {new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setChartMode('burndown')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                chartMode === 'burndown'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              📉 Burndown
            </button>
            <button
              onClick={() => setChartMode('burnup')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                chartMode === 'burnup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              📈 Burnup
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Estimated', value: decimalHoursToHMS(totalEstimatedHours), color: 'text-gray-700 dark:text-gray-200' },
            { label: 'Worked', value: decimalHoursToHMS(workedTotal), color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Remaining', value: decimalHoursToHMS(remainingTotal), color: remainingTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400' },
            { label: 'Complete', value: `${completionPct}%`, color: completionPct >= 100 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400' },
          ].map(st => (
            <div key={st.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${st.color}`}>{st.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{st.label}</div>
            </div>
          ))}
        </div>

        {/* SVG Chart */}
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ maxHeight: 360 }}
          >
            <g transform={`translate(${PAD.left},${PAD.top})`}>
              {/* Grid lines + Y axis */}
              {yTicks.map((v, i) => (
                <g key={i}>
                  <line x1={0} y1={yScale(v)} x2={chartW} y2={yScale(v)} stroke="#e5e7eb" strokeDasharray="4,3" />
                  <text x={-8} y={yScale(v) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">{v}h</text>
                </g>
              ))}

              {/* Today marker */}
              {(() => {
                const todayIdx = allSeries.findIndex(s => s.date >= today);
                if (todayIdx < 0) return null;
                const tx = xScale(todayIdx);
                return (
                  <g>
                    <line x1={tx} y1={0} x2={tx} y2={chartH} stroke="#3b82f6" strokeDasharray="4,3" strokeWidth={1.5} />
                    <text x={tx + 4} y={12} fontSize={10} fill="#3b82f6">Today</text>
                  </g>
                );
              })()}

              {/* Ideal line */}
              <polyline
                points={idealPoints}
                fill="none"
                stroke="#d1d5db"
                strokeWidth={2}
                strokeDasharray="6,4"
              />

              {/* Actual line */}
              <polyline
                points={chartMode === 'burndown' ? burndownPoints : burnupPoints}
                fill="none"
                stroke={chartMode === 'burndown' ? '#ef4444' : '#22c55e'}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />

              {/* Data dots on actual line */}
              {visibleSeries.map((s, i) => {
                const val = chartMode === 'burndown' ? s.remaining : s.cumulative;
                return (
                  <circle
                    key={`${s.date}-${i}`}
                    cx={xScale(i)}
                    cy={yScale(val)}
                    r={3}
                    fill={chartMode === 'burndown' ? '#ef4444' : '#22c55e'}
                  />
                );
              })}

              {/* X axis */}
              <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#e5e7eb" />
              {xTicks.map((s, tickIdx) => {
                const idx = allSeries.indexOf(s);
                const x = xScale(idx);
                const label = new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <text key={`${s.date}-${tickIdx}`} x={x} y={chartH + 16} textAnchor="middle" fontSize={10} fill="#9ca3af">
                    {label}
                  </text>
                );
              })}

              {/* Y axis line */}
              <line x1={0} y1={0} x2={0} y2={chartH} stroke="#e5e7eb" />
            </g>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#d1d5db" strokeWidth="2" strokeDasharray="5,3"/></svg>
            <span className="text-gray-500 dark:text-gray-400">Ideal</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke={chartMode === 'burndown' ? '#ef4444' : '#22c55e'} strokeWidth="2.5"/></svg>
            <span className="text-gray-500 dark:text-gray-400">{chartMode === 'burndown' ? 'Remaining hours' : 'Worked hours'}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
            <span className="text-gray-500 dark:text-gray-400">Today</span>
          </div>
        </div>
      </div>

      {/* Daily log table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4 text-right">Hours logged</th>
                <th className="pb-2 pr-4 text-right">Cumulative</th>
                <th className="pb-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visibleSeries.filter(s => s.worked > 0).map((s, i) => (
                <tr key={`${s.date}-${i}`}>
                  <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                    {new Date(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </td>
                  <td className="py-2 pr-4 text-right font-medium text-gray-900 dark:text-white">{decimalHoursToHMS(s.worked)}</td>
                  <td className="py-2 pr-4 text-right text-blue-600 dark:text-blue-400">{decimalHoursToHMS(s.cumulative)}</td>
                  <td className="py-2 text-right text-amber-600 dark:text-amber-400">{decimalHoursToHMS(s.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleSeries.filter(s => s.worked > 0).length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">No time entries logged yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
