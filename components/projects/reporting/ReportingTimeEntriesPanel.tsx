'use client';

import { stripHtml } from '@/lib/stripHtml';

type HoursFmt = (hours: number) => string;

export function ReportingTimeEntriesPanel({
  timeEntries,
  isLoading,
  totalWorkedHours,
  decimalHoursToHMS,
}: {
  timeEntries: any[];
  isLoading: boolean;
  totalWorkedHours: number;
  decimalHoursToHMS: HoursFmt;
}) {
  return (
<div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
  <div className="p-6">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recorded Time Entries</h2>
      <div className="text-right">
        <div className="text-sm text-gray-500 dark:text-gray-400">Total Worked</div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
          {decimalHoursToHMS(totalWorkedHours)}
        </div>
      </div>
    </div>

    {isLoading ? (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading time entries...</div>
    ) : timeEntries.length === 0 ? (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">No time entries found</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Task
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Hours
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {timeEntries.map((entry: any, idx: number) => {
              const date = new Date(entry.WorkDate);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              
              return (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {entry.TaskName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {entry.Username || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {dayName}, {dateStr}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                    {entry.StartTime || '-'} - {entry.EndTime || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {stripHtml(entry.Description) || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                    {decimalHoursToHMS(parseFloat(entry.Hours))}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                Total:
              </td>
              <td className="px-4 py-3 text-sm font-bold text-right text-gray-900 dark:text-gray-100">
                {decimalHoursToHMS(totalWorkedHours)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    )}
  </div>
</div>
  );
}
