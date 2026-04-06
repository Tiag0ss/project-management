'use client';

import { getApiUrl } from '@/lib/api/config';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

const decimalHoursToHMS = (hours: number): string => {
  const totalSeconds = Math.round(Math.abs(hours) * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const sign = hours < 0 ? '-' : '';
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

interface AllocationDayRow {
  date: string;
  hours: number;
  startTime: string;
  endTime: string;
}

interface AllocationHeaderDetail {
  Id: number;
  TaskId: number;
  UserId: number;
  AllocationMode: 'parallel' | 'sequential' | string;
  SplitOrder: number | null;
  PlannedHours: number | null;
  HoursPerDay: number | null;
  PlannedStartDate: string | null;
  PlannedEndDate: string | null;
}

interface AllocationDetailResponse {
  success: boolean;
  header: AllocationHeaderDetail;
  task: {
    Id: number;
    TaskName: string;
    ProjectId: number;
    ProjectName: string;
    OrganizationId: number;
  };
  user: {
    Id: number;
    Username: string;
    FirstName: string;
    LastName: string;
  };
  allocations: Array<{
    Id: number;
    AllocationDate: string;
    AllocatedHours: number;
    StartTime: string;
    EndTime: string;
    IsManual: number;
  }>;
}

interface AllocationHeaderDetailModalProps {
  isOpen: boolean;
  headerId: number | null;
  token: string | null;
  canEdit: boolean;
  onClose: () => void;
  onOpenTaskDetails?: (taskId: number) => Promise<void> | void;
  onDeleteAllAllocations?: (params: { headerId: number; taskId: number }) => Promise<void> | void;
  onSaveReplan?: (params: {
    headerId: number;
    taskId: number;
    userId: number;
    startDate: string;
    totalHours: number;
    hoursPerDay: number;
    header: AllocationHeaderDetail;
  }) => Promise<void> | void;
}

export default function AllocationHeaderDetailModal({
  isOpen,
  headerId,
  token,
  canEdit,
  onClose,
  onOpenTaskDetails,
  onDeleteAllAllocations,
  onSaveReplan,
}: AllocationHeaderDetailModalProps) {
  const normalizedHeaderId = useMemo(() => (headerId && Number.isFinite(headerId) && headerId > 0 ? headerId : null), [headerId]);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [header, setHeader] = useState<AllocationHeaderDetail | null>(null);
  const [taskInfo, setTaskInfo] = useState<AllocationDetailResponse['task'] | null>(null);
  const [userInfo, setUserInfo] = useState<AllocationDetailResponse['user'] | null>(null);

  const [startDate, setStartDate] = useState('');
  const [totalHours, setTotalHours] = useState('0');
  const [hoursPerDay, setHoursPerDay] = useState('8');
  const [dayRows, setDayRows] = useState<AllocationDayRow[]>([]);

  const groupedDayRows = useMemo(() => {
    const groups = new Map<string, { date: string; hours: number; startTime: string; endTime: string; slotCount: number }>();

    for (const row of dayRows) {
      const existing = groups.get(row.date);
      if (existing) {
        existing.hours += Number(row.hours || 0);
        existing.startTime = existing.startTime < row.startTime ? existing.startTime : row.startTime;
        existing.endTime = existing.endTime > row.endTime ? existing.endTime : row.endTime;
        existing.slotCount += 1;
      } else {
        groups.set(row.date, {
          date: row.date,
          hours: Number(row.hours || 0),
          startTime: row.startTime,
          endTime: row.endTime,
          slotCount: 1,
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [dayRows]);

  const loadDetail = useCallback(async () => {
    if (!isOpen || !token || !normalizedHeaderId) {
      return;
    }

    setIsLoadingData(true);
    setError('');

    try {
      const response = await fetch(`${getApiUrl()}/api/task-allocations/header/${normalizedHeaderId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to load allocation details');
      }

      const payload = data as AllocationDetailResponse;
      const initialRows = (payload.allocations || [])
        .map((allocation) => ({
          date: String(allocation.AllocationDate || '').split('T')[0],
          hours: Number(allocation.AllocatedHours || 0),
          startTime: String(allocation.StartTime || '09:00').slice(0, 5),
          endTime: String(allocation.EndTime || '17:00').slice(0, 5),
        }))
        .filter((allocation) => allocation.date && Number.isFinite(allocation.hours) && allocation.hours > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      const fallbackStartDate = initialRows.length > 0
        ? initialRows[0].date
        : (payload.header.PlannedStartDate || new Date().toISOString().split('T')[0]);

      const computedTotalHours = initialRows.reduce((sum, allocation) => sum + allocation.hours, 0);
      const storedHoursPerDay = Number(payload.header.HoursPerDay || 0);
      const averageHoursPerDay = initialRows.length > 0 ? computedTotalHours / initialRows.length : 0;

      setHeader(payload.header);
      setTaskInfo(payload.task);
      setUserInfo(payload.user);
      setDayRows(initialRows);
      setStartDate(fallbackStartDate);
      setTotalHours((payload.header.PlannedHours && payload.header.PlannedHours > 0
        ? Number(payload.header.PlannedHours)
        : computedTotalHours
      ).toString());
      setHoursPerDay((storedHoursPerDay > 0 ? storedHoursPerDay : (averageHoursPerDay > 0 ? averageHoursPerDay : 8)).toFixed(2).replace(/\.00$/, ''));
    } catch (err: any) {
      setError(err?.message || 'Failed to load allocation details');
      setHeader(null);
      setTaskInfo(null);
      setUserInfo(null);
      setDayRows([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [isOpen, normalizedHeaderId, token]);

  useEffect(() => {
    if (isOpen) {
      void loadDetail();
      return;
    }

    setError('');
    setShowDeleteConfirm(false);
    setHeader(null);
    setTaskInfo(null);
    setUserInfo(null);
    setDayRows([]);
    setStartDate('');
    setTotalHours('0');
    setHoursPerDay('8');
  }, [isOpen, loadDetail]);

  const deleteAllAllocations = async () => {
    if (!token || !normalizedHeaderId || !taskInfo?.Id || !onDeleteAllAllocations) {
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      await onDeleteAllAllocations({ headerId: normalizedHeaderId, taskId: Number(taskInfo.Id) });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete allocation slice');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const saveChanges = async () => {
    if (!token || !header || !normalizedHeaderId || !taskInfo || !userInfo || !onSaveReplan) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setError('Start date is required.');
      return;
    }

    const total = Number(totalHours || 0);
    if (!Number.isFinite(total) || total <= 0) {
      setError('Total hours must be greater than 0.');
      return;
    }

    const normalizedHoursPerDay = Number(hoursPerDay || 0);
    if (!Number.isFinite(normalizedHoursPerDay) || normalizedHoursPerDay <= 0) {
      setError('Hours per day must be greater than 0.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSaveReplan({
        headerId: normalizedHeaderId,
        taskId: taskInfo.Id,
        userId: userInfo.Id,
        startDate,
        totalHours: total,
        hoursPerDay: normalizedHoursPerDay,
        header,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to replan allocation');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !normalizedHeaderId) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[160] p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Allocation Details</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Edit start date, total hours, and daily allocation without leaving Planning.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
            aria-label="Close allocation details"
            title="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {isLoadingData ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">Loading allocation details...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Task</p>
                  <p className="font-medium text-gray-900 dark:text-white">{taskInfo?.TaskName || '-'}</p>
                  <p className="text-gray-600 dark:text-gray-400">{taskInfo?.ProjectName || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">User</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {userInfo ? `${userInfo.FirstName} ${userInfo.LastName}`.trim() || userInfo.Username : '-'}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">{userInfo?.Username || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Header</p>
                  <p className="font-medium text-gray-900 dark:text-white">#{header?.Id || '-'}</p>
                  <p className="text-gray-600 dark:text-gray-400">Mode: {header?.AllocationMode || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={totalHours}
                    onChange={(event) => setTotalHours(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hours / Day</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={hoursPerDay}
                    onChange={(event) => setHoursPerDay(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex items-end">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    New daily allocations will be recalculated when you save.
                  </div>
                </div>
              </div>
 
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Daily Allocations</h4>
                </div>
                <div data-grid-enhancer-ignore="true" className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Hours</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Start</th>
                        <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">End</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {groupedDayRows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            No daily allocations yet.
                          </td>
                        </tr>
                      )}
                      {groupedDayRows.map((row) => (
                        <tr key={row.date}>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{row.date}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{decimalHoursToHMS(row.hours)}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{row.startTime}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                            {row.endTime}
                            {row.slotCount > 1 && (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({row.slotCount} blocks)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  {taskInfo?.Id && onOpenTaskDetails && (
                    <button
                      type="button"
                      onClick={() => void onOpenTaskDetails(taskInfo.Id)}
                      className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100"
                    >
                      Open task details
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isDeleting}
                    className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100"
                  >
                    Close
                  </button>

                  {canEdit && onDeleteAllAllocations && (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isSaving || isDeleting}
                      className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 disabled:opacity-60"
                    >
                      Delete all allocations
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isSaving || isDeleting || !canEdit}
                    onClick={saveChanges}
                    className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Saving...' : 'Save Allocation'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {showDeleteConfirm && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[170] p-4"
            onClick={(event) => {
              event.stopPropagation();
              if (!isDeleting) {
                setShowDeleteConfirm(false);
              }
            }}
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-6">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">Delete all allocations?</h4>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  This will remove every allocation in this header slice and cannot be undone.
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { void deleteAllAllocations(); }}
                    disabled={isDeleting}
                    className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
