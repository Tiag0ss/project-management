'use client';

import { useState } from 'react';

type HoursFmt = (hours: number) => string;

export function ReportingByUserPanel({
  userStats,
  isLoading,
  decimalHoursToHMS,
}: {
  userStats: any[];
  isLoading: boolean;
  decimalHoursToHMS: HoursFmt;
}) {
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());

  const toggleUserExpand = (userId: number) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
<div className="space-y-6">
  {/* User Summary Cards */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {isLoading ? (
      <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
        Loading user statistics...
      </div>
    ) : userStats.length === 0 ? (
      <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
        No user data available for this project.
      </div>
    ) : (
      userStats.map((user) => {
        const efficiency = user.TotalAllocated > 0 
          ? Math.round((user.TotalWorked / user.TotalAllocated) * 100) 
          : 0;
        
        return (
          <div key={user.UserId} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            {/* User Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                    {user.Username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{user.Username}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user.TasksWorked} task{user.TasksWorked !== 1 ? 's' : ''} worked
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleUserExpand(user.UserId)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <svg className={`w-5 h-5 transition-transform ${expandedUsers.has(user.UserId) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Stats */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {decimalHoursToHMS(user.TotalAllocated)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Allocated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {decimalHoursToHMS(user.TotalWorked)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Worked</div>
                </div>
              </div>
              
              {/* Progress bar */}
              {user.TotalAllocated > 0 && (
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-gray-500 dark:text-gray-400">Progress</span>
                    <span className={`font-medium ${efficiency > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                      {efficiency}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        efficiency > 100 ? 'bg-red-500' : efficiency > 80 ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, efficiency)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Expanded Details */}
            {expandedUsers.has(user.UserId) && (
              <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Time Entries</h4>
                {user.TimeEntries.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No time entries recorded.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {user.TimeEntries.slice(0, 10).map((entry: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-gray-900 dark:text-white">{entry.TaskName}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(entry.WorkDate).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="font-medium text-green-600 dark:text-green-400 ml-2">
                          {decimalHoursToHMS(parseFloat(entry.Hours))}
                        </div>
                      </div>
                    ))}
                    {user.TimeEntries.length > 10 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2">
                        +{user.TimeEntries.length - 10} more entries
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })
    )}
  </div>

  {/* Summary Table */}
  {!isLoading && userStats.length > 0 && (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">User Summary</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Allocated</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Worked</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Difference</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Efficiency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {userStats.map((user) => {
              const diff = user.TotalWorked - user.TotalAllocated;
              const efficiency = user.TotalAllocated > 0 
                ? Math.round((user.TotalWorked / user.TotalAllocated) * 100) 
                : 0;
              
              return (
                <tr key={user.UserId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {user.Username}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600 dark:text-blue-400">
                    {decimalHoursToHMS(user.TotalAllocated)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">
                    {decimalHoursToHMS(user.TotalWorked)}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${
                    diff > 0 ? 'text-red-600 dark:text-red-400' : diff < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {diff > 0 ? '+' : ''}{decimalHoursToHMS(diff)}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${
                    efficiency > 100 ? 'text-red-600 dark:text-red-400' : efficiency > 80 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    {efficiency}%
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">Total</td>
              <td className="px-4 py-3 text-sm text-right font-bold text-blue-600 dark:text-blue-400">
                {decimalHoursToHMS(userStats.reduce((sum, u) => sum + u.TotalAllocated, 0))}
              </td>
              <td className="px-4 py-3 text-sm text-right font-bold text-green-600 dark:text-green-400">
                {decimalHoursToHMS(userStats.reduce((sum, u) => sum + u.TotalWorked, 0))}
              </td>
              <td className="px-4 py-3 text-sm text-right font-bold text-gray-600 dark:text-gray-400">
                {decimalHoursToHMS(userStats.reduce((sum, u) => sum + u.TotalWorked, 0) - userStats.reduce((sum, u) => sum + u.TotalAllocated, 0))}
              </td>
              <td className="px-4 py-3 text-sm text-right font-bold text-gray-600 dark:text-gray-400">
                {userStats.reduce((sum, u) => sum + u.TotalAllocated, 0) > 0 
                  ? Math.round((userStats.reduce((sum, u) => sum + u.TotalWorked, 0) / userStats.reduce((sum, u) => sum + u.TotalAllocated, 0)) * 100)
                  : 0}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )}
</div>
  );
}
