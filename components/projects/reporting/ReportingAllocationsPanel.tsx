'use client';

type HoursFmt = (hours: number) => string;

export function ReportingAllocationsPanel({
  allocations,
  isLoading,
  totalAllocatedHours,
  decimalHoursToHMS,
}: {
  allocations: any[];
  isLoading: boolean;
  totalAllocatedHours: number;
  decimalHoursToHMS: HoursFmt;
}) {
  return (
<div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
  <div className="p-6">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Planned Allocations</h2>
      <div className="text-right">
        <div className="text-sm text-gray-500 dark:text-gray-400">Total Allocated</div>
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {decimalHoursToHMS(totalAllocatedHours)}
        </div>
      </div>
    </div>

    {isLoading ? (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading allocations...</div>
    ) : allocations.length === 0 ? (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">No allocations found</div>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Slice
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Hours
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {allocations.map((allocation: any, idx: number) => {
              const date = new Date(allocation.AllocationDate);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const headerId = Number(allocation.TaskAllocationHeaderId || 0);
              const splitOrder = allocation.SplitOrder === null || allocation.SplitOrder === undefined
                ? null
                : Number(allocation.SplitOrder);
              
              return (
                <tr key={`${allocation.TaskId}-${allocation.UserId}-${allocation.AllocationDate}-${headerId}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {allocation.TaskName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {allocation.Username || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {dayName}, {dateStr}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {headerId > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium">
                        H#{headerId}{splitOrder !== null ? ` · S${splitOrder}` : ''}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                    {allocation.StartTime || '-'} - {allocation.EndTime || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                    {decimalHoursToHMS(parseFloat(allocation.AllocatedHours))}
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
                {decimalHoursToHMS(totalAllocatedHours)}
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
