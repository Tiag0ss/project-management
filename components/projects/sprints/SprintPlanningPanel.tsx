'use client';

import { useEffect, useState } from 'react';
import { useColorVision } from '@/hooks/useColorVision';
import { getApiUrl } from '@/lib/api/config';
import type {
  Sprint,
  BacklogTask,
  VelocityTrendEntry,
  VelocitySummary,
  TaskFilterState,
} from '@/components/projects/sprints/types';

const EMPTY_FILTER: TaskFilterState = { search: '', status: '', priority: '', assignee: '' };

export function SprintPlanningPanel({
  projectId,
  token,
  sprints,
  backlog,
  velocityTrend,
  velocitySummary,
  createSprintSignal,
  onReload,
  onError,
}: {
  projectId: number;
  token: string;
  sprints: Sprint[];
  backlog: BacklogTask[];
  velocityTrend: VelocityTrendEntry[];
  velocitySummary: VelocitySummary | null;
  createSprintSignal: number;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { pillStyle } = useColorVision();
  const API_URL = getApiUrl();
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [expandedSprints, setExpandedSprints] = useState<Set<number>>(new Set());
  const [sprintTasks, setSprintTasks] = useState<Record<number, BacklogTask[]>>({});
  const [selectedBacklogTasks, setSelectedBacklogTasks] = useState<Set<number>>(new Set());
  const [assigningToSprint, setAssigningToSprint] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [sprintTaskFilter, setSprintTaskFilter] = useState<TaskFilterState>(EMPTY_FILTER);
  const [backlogFilter, setBacklogFilter] = useState<TaskFilterState>(EMPTY_FILTER);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());
  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', startDate: '', endDate: '', status: 'planned' as Sprint['Status'] });
  const [isSaving, setIsSaving] = useState(false);

  const loadSprintTasks = async (sprintId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/sprints/${sprintId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSprintTasks(prev => ({ ...prev, [sprintId]: data.tasks || [] }));
      }
    } catch { /* ignore */ }
  };

  const toggleSprintExpanded = (sprintId: number) => {
    setExpandedSprints(prev => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
        if (!sprintTasks[sprintId]) loadSprintTasks(sprintId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (createSprintSignal > 0) {
      setEditingSprint(null);
      setSprintForm({ name: '', goal: '', startDate: '', endDate: '', status: 'planned' });
      setShowSprintModal(true);
    }
  }, [createSprintSignal]);

  const openEditSprint = (sprint: Sprint) => {
    setEditingSprint(sprint);
    setSprintForm({
      name: sprint.Name,
      goal: sprint.Goal || '',
      startDate: sprint.StartDate ? sprint.StartDate.split('T')[0] : '',
      endDate: sprint.EndDate ? sprint.EndDate.split('T')[0] : '',
      status: sprint.Status,
    });
    setShowSprintModal(true);
  };

  const saveSprint = async () => {
    if (!sprintForm.name.trim()) return;
    setIsSaving(true);
    try {
      const url = editingSprint ? `${API_URL}/api/sprints/${editingSprint.Id}` : `${API_URL}/api/sprints`;
      const method = editingSprint ? 'PUT' : 'POST';
      const body = editingSprint
        ? { ...sprintForm }
        : { projectId, ...sprintForm };
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        onError(data.message || 'Failed to save sprint');
        return;
      }
      setShowSprintModal(false);
      await onReload();
    } catch {
      onError('Failed to save sprint');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSprint = (sprint: Sprint) => {
    setConfirmModal({
      message: `Delete sprint "${sprint.Name}"? Tasks will be moved to backlog.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch(`${API_URL}/api/sprints/${sprint.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        await onReload();
      },
    });
  };

  const assignTasksToSprint = async (sprintId: number) => {
    if (selectedBacklogTasks.size === 0) return;
    setAssigningToSprint(sprintId);
    try {
      await fetch(`${API_URL}/api/sprints/${sprintId}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: Array.from(selectedBacklogTasks) }),
      });
      setSelectedBacklogTasks(new Set());
      if (expandedSprints.has(sprintId)) {
        await loadSprintTasks(sprintId);
      }
      await onReload();
    } catch {
      onError('Failed to assign tasks');
    } finally {
      setAssigningToSprint(null);
    }
  };

  const removeTaskFromSprint = async (sprintId: number, taskId: number) => {
    await fetch(`${API_URL}/api/sprints/${sprintId}/tasks/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: [taskId] }),
    });
    setSprintTasks(prev => ({ ...prev, [sprintId]: (prev[sprintId] || []).filter(t => t.Id !== taskId) }));
    await onReload();
  };

  const sprintStatusBadge = (status: Sprint['Status']) => {
    const styles: Record<Sprint['Status'], string> = {
      planned: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
      active: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
      completed: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
      cancelled: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const fmtDate = (d: string | null | undefined) => (d ? String(d).split('T')[0] : null);
  const applyFilter = (tasks: BacklogTask[], f: TaskFilterState) =>
    tasks.filter(t => {
      if (f.search && !t.TaskName.toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.status && t.StatusName !== f.status) return false;
      if (f.priority && t.PriorityName !== f.priority) return false;
      if (f.assignee) {
        const name = t.FirstName ? `${t.FirstName} ${t.LastName}`.trim() : t.AssigneeName || '';
        if (name !== f.assignee) return false;
      }
      return true;
    });
  const allSprintTasksList = Object.values(sprintTasks).flat();
  const sprintTaskStatuses = [...new Set(allSprintTasksList.map(t => t.StatusName).filter(Boolean))];
  const sprintTaskPriorities = [...new Set(allSprintTasksList.map(t => t.PriorityName).filter(Boolean))];
  const sprintTaskAssignees = [...new Set(allSprintTasksList.map(t => t.FirstName ? `${t.FirstName} ${t.LastName}`.trim() : t.AssigneeName || '').filter(Boolean))];
  const backlogStatuses = [...new Set(backlog.map(t => t.StatusName).filter(Boolean))];
  const backlogPriorities = [...new Set(backlog.map(t => t.PriorityName).filter(Boolean))];
  const backlogAssignees = [...new Set(backlog.map(t => t.FirstName ? `${t.FirstName} ${t.LastName}`.trim() : t.AssigneeName || '').filter(Boolean))];
  const hasSprintTaskFilter = !!(sprintTaskFilter.search || sprintTaskFilter.status || sprintTaskFilter.priority || sprintTaskFilter.assignee);
  const hasBacklogFilter = !!(backlogFilter.search || backlogFilter.status || backlogFilter.priority || backlogFilter.assignee);

  const getDescendants = (taskId: number, tasks: BacklogTask[]): number[] => {
    const children = tasks.filter(t => t.ParentTaskId === taskId);
    return children.flatMap(c => [c.Id, ...getDescendants(c.Id, tasks)]);
  };
  const buildTaskRows = (tasks: BacklogTask[], filt: TaskFilterState): { task: BacklogTask; depth: number; hasChildren: boolean }[] => {
    const isFiltered = !!(filt.search || filt.status || filt.priority || filt.assignee);
    if (isFiltered) return applyFilter(tasks, filt).map(t => ({ task: t, depth: 0, hasChildren: false }));
    const taskIds = new Set(tasks.map(t => t.Id));
    const childMap = new Map<number, BacklogTask[]>();
    for (const t of tasks) {
      if (t.ParentTaskId && taskIds.has(t.ParentTaskId)) {
        if (!childMap.has(t.ParentTaskId)) childMap.set(t.ParentTaskId, []);
        childMap.get(t.ParentTaskId)!.push(t);
      }
    }
    const rows: { task: BacklogTask; depth: number; hasChildren: boolean }[] = [];
    const visit = (t: BacklogTask, depth: number) => {
      const children = childMap.get(t.Id) || [];
      rows.push({ task: t, depth, hasChildren: children.length > 0 });
      if (children.length > 0 && expandedTaskIds.has(t.Id)) children.forEach(c => visit(c, depth + 1));
    };
    tasks.filter(t => !t.ParentTaskId || !taskIds.has(t.ParentTaskId)).forEach(r => visit(r, 0));
    return rows;
  };
  const toggleBacklogTask = (taskId: number) => {
    const descendants = getDescendants(taskId, backlog);
    setSelectedBacklogTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
        descendants.forEach(id => next.delete(id));
      } else {
        next.add(taskId);
        descendants.forEach(id => next.add(id));
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {velocitySummary && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Recent</span>
            <span className="font-semibold text-gray-900 dark:text-white">{velocitySummary.recentAverage.toFixed(1)} SP</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Previous</span>
            <span className="font-semibold text-gray-900 dark:text-white">{velocitySummary.previousAverage.toFixed(1)} SP</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Trend</span>
            <span
              className={`font-semibold ${
                velocitySummary.trendDirection === 'up'
                  ? 'text-green-600 dark:text-green-400'
                  : velocitySummary.trendDirection === 'down'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-900 dark:text-white'
              }`}
            >
              {velocitySummary.trendDirection === 'up' ? '↑' : velocitySummary.trendDirection === 'down' ? '↓' : '→'}{' '}
              {velocitySummary.trendDelta.toFixed(1)} SP
            </span>
          </div>
        </div>
      )}

      {sprints.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide shrink-0">Filter tasks:</span>
            <input
              type="text"
              placeholder="Search tasks…"
              value={sprintTaskFilter.search}
              onChange={e => setSprintTaskFilter(f => ({ ...f, search: e.target.value }))}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 w-48"
            />
            <select value={sprintTaskFilter.status} onChange={e => setSprintTaskFilter(f => ({ ...f, status: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All statuses</option>
              {sprintTaskStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={sprintTaskFilter.priority} onChange={e => setSprintTaskFilter(f => ({ ...f, priority: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All priorities</option>
              {sprintTaskPriorities.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={sprintTaskFilter.assignee} onChange={e => setSprintTaskFilter(f => ({ ...f, assignee: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All assignees</option>
              {sprintTaskAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {hasSprintTaskFilter && (
              <button onClick={() => setSprintTaskFilter(EMPTY_FILTER)} className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">✕ Clear</button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {sprints.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-lg font-medium">No sprints yet</p>
            <p className="text-sm mt-1">Create your first sprint to start organizing work into iterations.</p>
          </div>
        )}
        {sprints.map(sprint => {
          const progress = sprint.TotalTasks > 0 ? Math.round((sprint.CompletedTasks / sprint.TotalTasks) * 100) : 0;
          const isExpanded = expandedSprints.has(sprint.Id);
          const tasks = sprintTasks[sprint.Id] || [];
          const sprintTrend = velocityTrend.find((entry) => entry.sprintId === sprint.Id);
          const topPerformer = sprintTrend?.teamBreakdown?.[0];
          return (
            <div key={sprint.Id} className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => toggleSprintExpanded(sprint.Id)}
                        className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left"
                      >
                        {isExpanded ? '▾' : '▸'} {sprint.Name}
                      </button>
                      {sprintStatusBadge(sprint.Status)}
                      {selectedBacklogTasks.size > 0 && (
                        <button
                          onClick={() => assignTasksToSprint(sprint.Id)}
                          disabled={assigningToSprint === sprint.Id}
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {assigningToSprint === sprint.Id ? 'Moving…' : `Move ${selectedBacklogTasks.size} task${selectedBacklogTasks.size !== 1 ? 's' : ''} here`}
                        </button>
                      )}
                    </div>
                    {sprint.Goal && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">"{sprint.Goal}"</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                      {sprint.StartDate && <span>📅 {sprint.StartDate.split('T')[0]} → {sprint.EndDate ? sprint.EndDate.split('T')[0] : '?'}</span>}
                      <span>📋 {sprint.TotalTasks} tasks ({sprint.CompletedTasks} done)</span>
                      <span>⏱ {Number(sprint.TotalEstimatedHours || 0).toFixed(1)}h estimated</span>
                      <span>🧩 {Number(sprint.CompletedStoryPoints || 0).toFixed(1)} / {Number(sprint.TotalStoryPoints || 0).toFixed(1)} SP</span>
                      {sprint.Velocity != null && <span>⚡ Velocity: {sprint.Velocity}</span>}
                      {topPerformer && <span>👥 Top: {topPerformer.fullName} ({topPerformer.completedStoryPoints.toFixed(1)} SP)</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEditSprint(sprint)} className="text-xs px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">✏️ Edit</button>
                    <button onClick={() => deleteSprint(sprint)} className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors">🗑</button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {tasks.length === 0 ? (
                    <p className="text-sm text-gray-400 px-4 py-3 italic">No tasks in this sprint.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">Task</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Status</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Priority</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Assignee</th>
                          <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden sm:table-cell">Est.</th>
                          <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Alloc.</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Planned</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Due</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {(() => {
                          const rows = buildTaskRows(tasks, sprintTaskFilter);
                          if (rows.length === 0) return (
                            <tr><td colSpan={9} className="px-4 py-4 text-center text-sm text-gray-400 italic">No tasks match the current filters.</td></tr>
                          );
                          return rows.map(({ task, depth, hasChildren }) => (
                            <tr key={task.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-4 py-2 text-gray-900 dark:text-white">
                                <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
                                  {hasChildren ? (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setExpandedTaskIds(prev => {
                                          const s = new Set(prev);
                                          if (s.has(task.Id)) s.delete(task.Id);
                                          else s.add(task.Id);
                                          return s;
                                        });
                                      }}
                                      className="mr-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs w-4 shrink-0"
                                    >
                                      {expandedTaskIds.has(task.Id) ? '▾' : '▸'}
                                    </button>
                                  ) : <span className="inline-block w-4 mr-1 shrink-0" />}
                                  {task.TaskName}
                                </div>
                              </td>
                              <td className="px-4 py-2 hidden md:table-cell">
                                <span className="text-xs px-2 py-0.5 rounded-full" style={pillStyle(task.StatusColor, { alpha: '22' })}>{task.StatusName}</span>
                              </td>
                              <td className="px-4 py-2 hidden lg:table-cell">
                                <span className="text-xs px-2 py-0.5 rounded-full" style={pillStyle(task.PriorityColor, { alpha: '22' })}>{task.PriorityName}</span>
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                {task.FirstName ? `${task.FirstName} ${task.LastName}` : task.AssigneeName || '—'}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                                {task.EstimatedHours != null ? `${Number(task.EstimatedHours).toFixed(1)}h` : '—'}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden xl:table-cell">
                                {task.TotalAllocatedHours ? `${Number(task.TotalAllocatedHours).toFixed(1)}h` : '—'}
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden xl:table-cell whitespace-nowrap">
                                {task.PlannedStartDate || task.PlannedEndDate
                                  ? `${fmtDate(task.PlannedStartDate) || '?'} → ${fmtDate(task.PlannedEndDate) || '?'}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden lg:table-cell whitespace-nowrap">
                                {fmtDate(task.DueDate) || '—'}
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  onClick={() => removeTaskFromSprint(sprint.Id, task.Id)}
                                  title="Remove from sprint"
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Backlog</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tasks not assigned to any sprint</p>
            </div>
            {selectedBacklogTasks.size > 0 && (
              <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">{selectedBacklogTasks.size} selected — click a sprint to assign</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Search backlog…"
              value={backlogFilter.search}
              onChange={e => setBacklogFilter(f => ({ ...f, search: e.target.value }))}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 w-44"
            />
            <select value={backlogFilter.status} onChange={e => setBacklogFilter(f => ({ ...f, status: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All statuses</option>
              {backlogStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={backlogFilter.priority} onChange={e => setBacklogFilter(f => ({ ...f, priority: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All priorities</option>
              {backlogPriorities.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={backlogFilter.assignee} onChange={e => setBacklogFilter(f => ({ ...f, assignee: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All assignees</option>
              {backlogAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {hasBacklogFilter && (
              <button onClick={() => setBacklogFilter(EMPTY_FILTER)} className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">✕ Clear</button>
            )}
          </div>
        </div>
        {backlog.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-8 text-center italic">All tasks are assigned to sprints.</p>
        ) : buildTaskRows(backlog, backlogFilter).length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-8 text-center italic">No backlog tasks match the current filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={buildTaskRows(backlog, backlogFilter).length > 0 && buildTaskRows(backlog, backlogFilter).every(({ task: t }) => selectedBacklogTasks.has(t.Id))}
                    onChange={e => setSelectedBacklogTasks(e.target.checked ? new Set(backlog.map(t => t.Id)) : new Set())}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">Task</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Status</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Priority</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Assignee</th>
                <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden sm:table-cell">Est.</th>
                <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Alloc.</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Planned</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {buildTaskRows(backlog, backlogFilter).map(({ task, depth, hasChildren }) => (
                <tr
                  key={task.Id}
                  className={`cursor-pointer transition-colors ${selectedBacklogTasks.has(task.Id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                  onClick={() => toggleBacklogTask(task.Id)}
                >
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selectedBacklogTasks.has(task.Id)} onChange={() => {}} className="rounded" />
                  </td>
                  <td className="px-4 py-2 text-gray-900 dark:text-white">
                    <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setExpandedTaskIds(prev => {
                              const s = new Set(prev);
                              if (s.has(task.Id)) s.delete(task.Id);
                              else s.add(task.Id);
                              return s;
                            });
                          }}
                          className="mr-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs w-4 shrink-0"
                        >
                          {expandedTaskIds.has(task.Id) ? '▾' : '▸'}
                        </button>
                      ) : <span className="inline-block w-4 mr-1 shrink-0" />}
                      {task.TaskName}
                    </div>
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={pillStyle(task.StatusColor, { alpha: '22' })}>{task.StatusName}</span>
                  </td>
                  <td className="px-4 py-2 hidden lg:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={pillStyle(task.PriorityColor, { alpha: '22' })}>{task.PriorityName}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                    {task.FirstName ? `${task.FirstName} ${task.LastName}` : task.AssigneeName || '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    {task.EstimatedHours != null ? `${Number(task.EstimatedHours).toFixed(1)}h` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden xl:table-cell">
                    {task.TotalAllocatedHours ? `${Number(task.TotalAllocatedHours).toFixed(1)}h` : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden xl:table-cell whitespace-nowrap">
                    {task.PlannedStartDate || task.PlannedEndDate
                      ? `${fmtDate(task.PlannedStartDate) || '?'} → ${fmtDate(task.PlannedEndDate) || '?'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden lg:table-cell whitespace-nowrap">
                    {fmtDate(task.DueDate) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showSprintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {editingSprint ? 'Edit Sprint' : 'New Sprint'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                  <input
                    type="text"
                    value={sprintForm.name}
                    onChange={e => setSprintForm({ ...sprintForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="Sprint 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal</label>
                  <textarea
                    value={sprintForm.goal}
                    onChange={e => setSprintForm({ ...sprintForm, goal: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="What is the main goal of this sprint?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={sprintForm.startDate}
                      onChange={e => setSprintForm({ ...sprintForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                    <input
                      type="date"
                      value={sprintForm.endDate}
                      onChange={e => setSprintForm({ ...sprintForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    value={sprintForm.status}
                    onChange={e => setSprintForm({ ...sprintForm, status: e.target.value as Sprint['Status'] })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowSprintModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSprint}
                  disabled={isSaving || !sprintForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Saving…' : editingSprint ? 'Save Changes' : 'Create Sprint'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <p className="text-gray-900 dark:text-white mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors">Cancel</button>
              <button onClick={confirmModal.onConfirm} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
