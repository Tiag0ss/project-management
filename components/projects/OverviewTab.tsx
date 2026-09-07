'use client';

import { useEffect, useMemo, useState } from 'react';
import { Project } from '@/lib/api/projects';
import { Task } from '@/lib/api/tasks';
import { projectMilestonesApi, ProjectMilestone } from '@/lib/api/projectMilestones';
import ProjectExpensesSection from '@/components/ProjectExpensesSection';
import { TaskAnalyticsCharts } from '@/components/reporting/TaskAnalyticsCharts';
import { buildTaskAnalytics } from '@/lib/reporting/taskAnalytics';
import { useFormatHours } from '@/lib/useFormatHours';
import { useColorVision } from '@/hooks/useColorVision';
import type { Sprint } from '@/components/projects/sprints/types';

export function OverviewTab({
  project,
  tasks,
  tickets,
  internalTicketsEnabled,
  canViewBudgetInfo,
  token,
  onViewTasks,
}: {
  project: Project;
  tasks: Task[];
  tickets: any[];
  internalTicketsEnabled: boolean;
  canViewBudgetInfo: boolean;
  token: string;
  onViewTasks?: () => void;
}) {
  const decimalHoursToHMS = useFormatHours();
  const { pillStyle, backgroundStyle } = useColorVision();
  const taskAnalytics = useMemo(() => buildTaskAnalytics(tasks), [tasks]);
  // Calculate task statistics (all tasks including subtasks)
  const parentTasks = tasks.filter(t => !t.ParentTaskId);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => 
    t.StatusIsClosed === 1
  ).length;
  const inProgressTasks = tasks.filter(t => 
    t.StatusIsClosed !== 1 && t.StatusIsCancelled !== 1 && t.Status !== null && t.StatusName?.toLowerCase() !== 'to do'
  ).length;
  const todoTasks = totalTasks - completedTasks - inProgressTasks;
  
  // Calculate hours (only leaf tasks - tasks without children)
  const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
  const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));
  const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + (parseFloat(String(t.EstimatedHours || 0))), 0);
  
  // Progress percentage
  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // Ticket statistics
  const totalTickets = tickets.length;
  const resolvedTickets = tickets.filter(t => t.StatusIsClosed === 1).length;
  const unresolvedTickets = totalTickets - resolvedTickets;
  
  // Overdue tasks (all tasks with due date in the past and not completed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueTasks = tasks.filter(t => {
    if (!t.DueDate) return false;
    if (t.StatusIsClosed === 1 || t.StatusIsCancelled === 1) return false;
    const dueDate = new Date(t.DueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });
  
  // Upcoming tasks (due in next 7 days)
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const upcomingTasks = tasks.filter(t => {
    if (!t.DueDate) return false;
    if (t.StatusIsClosed === 1 || t.StatusIsCancelled === 1) return false;
    const dueDate = new Date(t.DueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate >= today && dueDate <= nextWeek;
  });
  
  // Unassigned tasks (all tasks)
  const unassignedTasks = tasks.filter(t => !t.AssignedTo);

  const OVERVIEW_API_URL = process.env.NEXT_PUBLIC_API_URL || '';
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [overviewSprints, setOverviewSprints] = useState<Sprint[]>([]);

  useEffect(() => {
    if (!token || !project.Id) return;
    const load = async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          projectMilestonesApi.getByProject(Number(project.Id), token),
          fetch(`${OVERVIEW_API_URL}/api/sprints/project/${project.Id}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setMilestones(mRes.milestones || []);
        if (sRes.ok) {
          const sd = await sRes.json();
          setOverviewSprints(sd.sprints || []);
        }
      } catch {
        // silently fail
      }
    };
    load();
  }, [project.Id, token]);

  // Milestone computations
  const overdueMilestones = milestones.filter(m => {
    if (m.IsCompleted) return false;
    if (!m.DueDate) return false;
    const due = new Date(m.DueDate); due.setHours(0, 0, 0, 0);
    return due < today;
  });
  const next30 = new Date(today); next30.setDate(next30.getDate() + 30);
  const upcomingMilestones = milestones.filter(m => {
    if (m.IsCompleted) return false;
    if (!m.DueDate) return false;
    const due = new Date(m.DueDate); due.setHours(0, 0, 0, 0);
    return due >= today && due <= next30;
  });
  const completedMilestones = milestones.filter(m => m.IsCompleted);

  // Sprint computations
  const activeSprints = overviewSprints.filter((s) => s.Status === 'active');
  const plannedSprints = overviewSprints.filter((s) => s.Status === 'planned');
  const rag = {
    status: project.HealthStatus || 'green',
    reasons: Array.isArray(project.HealthReasons) ? project.HealthReasons : [],
  };

  return (
    <div className="space-y-6">

      {/* Description only — title / org / status / Global|Hobby live in the sticky page header */}
      {project.Description ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="h-1 w-full" style={backgroundStyle(project.StatusColor || '#6366f1')} />
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: project.Description }} />
        </div>
      ) : null}

      {/* ── RAG Health Badge ── */}
      {(() => {
        const ragMap = {
          red:   { dot: '#ef4444', bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-800',     text: 'text-red-700 dark:text-red-300',     label: 'Red — Immediate action required' },
          amber: { dot: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', label: 'Amber — Needs attention' },
          green: { dot: '#22c55e', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-300', label: 'Green — On track' },
        };
        const rc = ragMap[rag.status];
        return (
          <div className={`${rc.bg} border ${rc.border} rounded-xl px-5 py-4 flex items-center gap-4`}>
            <span className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm" style={{ background: rc.dot }} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${rc.text}`}>{rc.label}</p>
              <p className={`text-xs mt-0.5 opacity-80 ${rc.text}`}>{rag.reasons.length > 0 ? rag.reasons.join(' · ') : 'No issues detected'}</p>
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">Project Health</span>
          </div>
        );
      })()}

      {/* ── Progress Ring + Task Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* SVG Progress Ring */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 flex flex-col items-center justify-center">
          {(() => {
            const R = 52; const sz = 140; const cx = sz / 2;
            const circ = 2 * Math.PI * R;
            const offset = circ * (1 - progressPercentage / 100);
            const ringColor = progressPercentage === 100 ? '#22c55e' : progressPercentage >= 50 ? '#3b82f6' : '#f59e0b';
            return (
              <div className="relative inline-flex items-center justify-center mb-4">
                <svg width={sz} height={sz} className="-rotate-90">
                  <circle cx={cx} cy={cx} r={R} fill="none" strokeWidth={10} stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                  <circle cx={cx} cy={cx} r={R} fill="none" strokeWidth={10} stroke={ringColor}
                    strokeLinecap="round"
                    strokeDasharray={`${circ} ${circ}`}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{progressPercentage}%</span>
                </div>
              </div>
            );
          })()}
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Overall Completion</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{completedTasks} of {totalTasks} tasks done</p>
        </div>

        {/* Segmented status bar + counts */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-5">Task Status</h2>
          {totalTasks > 0 ? (
            <div className="flex rounded-lg overflow-hidden h-4 mb-6 gap-0.5">
              {completedTasks > 0 && (
                <div className="bg-green-500 transition-all" style={{ width: `${(completedTasks / totalTasks) * 100}%` }} title={`Done: ${completedTasks}`} />
              )}
              {inProgressTasks > 0 && (
                <div className="bg-blue-500 transition-all" style={{ width: `${(inProgressTasks / totalTasks) * 100}%` }} title={`In Progress: ${inProgressTasks}`} />
              )}
              {todoTasks > 0 && (
                <div className="bg-gray-300 dark:bg-gray-600 transition-all" style={{ width: `${(todoTasks / totalTasks) * 100}%` }} title={`To Do: ${todoTasks}`} />
              )}
            </div>
          ) : (
            <div className="h-4 rounded-lg bg-gray-100 dark:bg-gray-700 mb-6" />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="text-2xl font-bold text-gray-400 dark:text-gray-500">{todoTasks}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">To Do</div>
            </div>
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgressTasks}</div>
              <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">In Progress</div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{completedTasks}</div>
              <div className="text-xs text-green-500 dark:text-green-400 mt-0.5">Completed</div>
            </div>
          </div>
        </div>
      </div>

      <TaskAnalyticsCharts
        data={taskAnalytics}
        onViewAll={onViewTasks}
        fourthCard={(() => {
        const avatarColors = ['bg-blue-500','bg-purple-500','bg-green-500','bg-amber-500','bg-pink-500','bg-indigo-500','bg-teal-500','bg-rose-500'];
        const assignedTasks = parentTasks.filter(t => t.AssignedTo);
        const teamMembers = Array.from(new Set(assignedTasks.map(t => t.AssignedTo)))
          .map(userId => {
            const memberTasks = assignedTasks.filter(t => t.AssignedTo === userId);
            const firstTask = memberTasks[0];
            const name = firstTask.AssigneeName || 'Unknown';
            const completed = memberTasks.filter(t => t.StatusIsClosed === 1).length;
            const inProgress = memberTasks.filter(t =>
              t.StatusIsClosed !== 1 && t.StatusIsCancelled !== 1 && t.Status !== null && t.StatusName?.toLowerCase() !== 'to do'
            ).length;
            const totalHours = memberTasks.reduce((sum, t) => sum + (parseFloat(String(t.EstimatedHours || 0))), 0);
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
            const avatarColor = avatarColors[Math.abs(hash) % avatarColors.length];
            return { userId, name, taskCount: memberTasks.length, completed, inProgress, totalHours: Number(totalHours) || 0, avatarColor };
          })
          .sort((a, b) => b.taskCount - a.taskCount);

        if (teamMembers.length === 0) {
          return (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col min-h-[220px]">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Team Members</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 py-10 text-center flex-1">No assigned team members.</p>
            </div>
          );
        }
        return (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col min-h-[220px]">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Team Members</h3>
            <div className="space-y-2 overflow-y-auto max-h-[280px] pr-1">
              {teamMembers.map(member => {
                const completionRate = member.taskCount > 0 ? Math.round((member.completed / member.taskCount) * 100) : 0;
                return (
                  <div key={member.userId} className="flex items-start gap-3 p-2.5 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
                    <div className={`w-8 h-8 ${member.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{member.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{decimalHoursToHMS(member.totalHours)} · {member.taskCount} task{member.taskCount !== 1 ? 's' : ''}</p>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 mb-1">
                        <div className={`h-1.5 rounded-full transition-all ${completionRate === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${completionRate}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                        <span>{member.inProgress} active</span>
                        <span>{completionRate}% done</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      />

      {/* ── Key Metrics Strip ── */}
      <div className={`grid grid-cols-2 ${internalTicketsEnabled ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
        {project.StartDate && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Start</span>
            </div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{new Date(project.StartDate).toLocaleDateString()}</div>
          </div>
        )}
        {project.EndDate && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">End</span>
            </div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{new Date(project.EndDate).toLocaleDateString()}</div>
            {(() => {
              const diff = Math.ceil((new Date(project.EndDate).getTime() - today.getTime()) / 86400000);
              if (diff > 0) return <div className="text-xs text-gray-400 mt-0.5">{diff}d remaining</div>;
              if (diff === 0) return <div className="text-xs text-amber-500 mt-0.5">Due today</div>;
              return <div className="text-xs text-red-500 mt-0.5">{Math.abs(diff)}d overdue</div>;
            })()}
          </div>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Hours</span>
          </div>
          <div className="text-sm font-bold text-gray-900 dark:text-white">{decimalHoursToHMS(totalEstimatedHours)}</div>
          <div className="text-xs text-gray-400 mt-0.5">Estimated</div>
        </div>
        {internalTicketsEnabled && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Tickets</span>
            </div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{totalTickets}</div>
            <div className="text-xs text-gray-400 mt-0.5">{unresolvedTickets} pending</div>
          </div>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Team</span>
          </div>
          <div className="text-sm font-bold text-gray-900 dark:text-white">{new Set(tasks.filter(t => t.AssignedTo).map(t => t.AssignedTo)).size}</div>
          <div className="text-xs text-gray-400 mt-0.5">Members</div>
        </div>
      </div>

      {/* ── Project Timeline Bar ── */}
      {project.StartDate && project.EndDate && (() => {
        const start = new Date(project.StartDate);
        const end = new Date(project.EndDate);
        const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
        const elapsedDays = Math.ceil((today.getTime() - start.getTime()) / 86400000);
        const clampedPct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
        const isOverdue = today > end && !project.StatusIsClosed && !project.StatusIsCancelled;
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Project Timeline</h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isOverdue ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                {isOverdue
                  ? `${Math.abs(Math.ceil((today.getTime() - end.getTime()) / 86400000))}d overdue`
                  : `${clampedPct}% elapsed`}
              </span>
            </div>
            <div className="relative h-5 w-full">
              <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 rounded-full" />
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${isOverdue ? 'bg-red-400' : 'bg-blue-500'}`}
                style={{ width: `${clampedPct}%` }}
              />
              {clampedPct > 2 && clampedPct < 98 && (
                <div className="absolute top-1 bottom-1 w-0.5 bg-white dark:bg-gray-300 rounded shadow"
                  style={{ left: `${clampedPct}%`, transform: 'translateX(-50%)' }} />
              )}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
              <span>{new Date(project.StartDate).toLocaleDateString()}</span>
              <span className="font-medium text-gray-600 dark:text-gray-300">{Math.max(0, elapsedDays)}d / {totalDays}d</span>
              <span>{new Date(project.EndDate).toLocaleDateString()}</span>
            </div>
          </div>
        );
      })()}

      {/* ── Budget Tracking ── */}
      {canViewBudgetInfo && project.Budget !== null && project.Budget !== undefined && project.Budget > 0 && (() => {
        const budgetSpent = Number(project.BudgetSpent || 0);
        const budgetTotal = Number(project.Budget);
        const budgetType = project.BudgetType === 'hours' ? 'hours' : 'monetary';
        const budgetUnit = budgetType === 'hours' ? 'h' : '$';
        const budgetRemaining = budgetTotal - budgetSpent;
        const budgetPct = Math.min(100, Math.round((budgetSpent / budgetTotal) * 100));
        const barColor = budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-green-500';
        const textColor = budgetPct >= 100 ? 'text-red-600 dark:text-red-400' : budgetPct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">{budgetType === 'hours' ? 'Budget (Hours)' : 'Budget'}</h2>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>Spent: <span className={`font-semibold ${textColor}`}>{budgetType === 'hours' ? decimalHoursToHMS(budgetSpent) : `${budgetUnit}${budgetSpent.toFixed(2)}`}</span></span>
                <span className="font-semibold">{budgetPct}%</span>
                <span>Total: <span className="font-semibold text-gray-900 dark:text-white">{budgetType === 'hours' ? decimalHoursToHMS(budgetTotal) : `${budgetUnit}${budgetTotal.toFixed(2)}`}</span></span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
                <div className={`${barColor} h-3 rounded-full transition-all`} style={{ width: `${budgetPct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">Total</div>
                <div className="text-base font-bold text-gray-900 dark:text-white">{budgetType === 'hours' ? decimalHoursToHMS(budgetTotal) : `${budgetUnit}${budgetTotal.toFixed(2)}`}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">Spent</div>
                <div className={`text-base font-bold ${textColor}`}>{budgetType === 'hours' ? decimalHoursToHMS(budgetSpent) : `${budgetUnit}${budgetSpent.toFixed(2)}`}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl">
                <div className="text-xs text-gray-400 mb-1">Remaining</div>
                <div className={`text-base font-bold ${budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{budgetType === 'hours' ? decimalHoursToHMS(budgetRemaining) : `${budgetUnit}${budgetRemaining.toFixed(2)}`}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {token && (
        <ProjectExpensesSection
          projectId={project.Id}
          token={token}
          canViewBudgetInfo={canViewBudgetInfo}
        />
      )}

      {/* ── Requires Attention ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-5">
          Requires Attention
        </h2>
        {overdueTasks.length === 0 && upcomingTasks.length === 0 && unassignedTasks.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <svg className="w-8 h-8 mx-auto mb-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">All good! No items require attention.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdueTasks.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">Overdue Tasks</span>
                </div>
                <span className="text-sm font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2.5 py-0.5 rounded-full">
                  {overdueTasks.length}
                </span>
              </div>
            )}
            {upcomingTasks.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">Due This Week</span>
                </div>
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2.5 py-0.5 rounded-full">
                  {upcomingTasks.length}
                </span>
              </div>
            )}
            {unassignedTasks.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-sm font-medium">Unassigned</span>
                </div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 rounded-full">
                  {unassignedTasks.length}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Overdue + Upcoming task lists ── */}
      {(overdueTasks.length > 0 || upcomingTasks.length > 0) && (
        <div className={`grid grid-cols-1 ${overdueTasks.length > 0 && upcomingTasks.length > 0 ? 'lg:grid-cols-2' : ''} gap-6`}>
          {overdueTasks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/20 flex items-center justify-between">
                <h2 className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Overdue Tasks
                </h2>
                <span className="text-xs font-bold bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">{overdueTasks.length}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-72 overflow-y-auto">
                {overdueTasks.slice(0, 10).map(task => {
                  const daysOverdue = Math.floor((today.getTime() - new Date(task.DueDate!).getTime()) / 86400000);
                  return (
                    <div key={task.Id} className="px-5 py-3 flex items-center gap-3 hover:bg-red-50/60 dark:hover:bg-red-900/10 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.TaskName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-red-500 font-semibold">{daysOverdue}d overdue</span>
                          {task.AssigneeName && <span className="text-xs text-gray-400">· {task.AssigneeName}</span>}
                        </div>
                      </div>
                      {task.PriorityName && (
                        <span className="px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0"
                          style={pillStyle(task.PriorityColor, { alpha: '22' })}>
                          {task.PriorityName}
                        </span>
                      )}
                    </div>
                  );
                })}
                {overdueTasks.length > 10 && (
                  <div className="px-5 py-3 text-xs text-gray-400 text-center">+{overdueTasks.length - 10} more</div>
                )}
              </div>
            </div>
          )}

          {upcomingTasks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between">
                <h2 className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Due This Week
                </h2>
                <span className="text-xs font-bold bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">{upcomingTasks.length}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-72 overflow-y-auto">
                {upcomingTasks.slice(0, 10).map(task => {
                  const daysUntil = Math.ceil((new Date(task.DueDate!).getTime() - today.getTime()) / 86400000);
                  return (
                    <div key={task.Id} className="px-5 py-3 flex items-center gap-3 hover:bg-amber-50/60 dark:hover:bg-amber-900/10 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.TaskName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">Due in {daysUntil}d</span>
                          {task.AssigneeName && <span className="text-xs text-gray-400">· {task.AssigneeName}</span>}
                        </div>
                      </div>
                      {task.StatusName && (
                        <span className="px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0"
                          style={pillStyle(task.StatusColor, { alpha: '22' })}>
                          {task.StatusName}
                        </span>
                      )}
                    </div>
                  );
                })}
                {upcomingTasks.length > 10 && (
                  <div className="px-5 py-3 text-xs text-gray-400 text-center">+{upcomingTasks.length - 10} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Unassigned Tasks Card ── */}
      {unassignedTasks.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/20 flex items-center justify-between">
            <h2 className="font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Unassigned Tasks
            </h2>
            <span className="text-xs font-bold bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">{unassignedTasks.length}</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-60 overflow-y-auto">
            {unassignedTasks.slice(0, 10).map(task => (
              <div key={task.Id} className="px-5 py-3 flex items-center gap-3 hover:bg-orange-50/60 dark:hover:bg-orange-900/10 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.TaskName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.EstimatedHours ? <span className="text-xs text-gray-500">⏱ {task.EstimatedHours}h</span> : null}
                    {task.PriorityName && <span className="text-xs text-gray-400">· {task.PriorityName}</span>}
                  </div>
                </div>
                {task.StatusName && (
                  <span className="px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0"
                    style={pillStyle(task.StatusColor, { alpha: '22' })}>
                    {task.StatusName}
                  </span>
                )}
              </div>
            ))}
            {unassignedTasks.length > 10 && (
              <div className="px-5 py-3 text-xs text-gray-400 text-center">+{unassignedTasks.length - 10} more</div>
            )}
          </div>
        </div>
      )}

      {/* ── Milestones ── */}
      {milestones.length > 0 && (
        <div className={`grid grid-cols-1 ${overdueMilestones.length > 0 && upcomingMilestones.length > 0 ? 'lg:grid-cols-2' : ''} gap-6`}>
          {overdueMilestones.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/20 flex items-center justify-between">
                <h2 className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  Overdue Milestones
                </h2>
                <span className="text-xs font-bold bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">{overdueMilestones.length}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-60 overflow-y-auto">
                {overdueMilestones.map(m => {
                  const daysOverdue = Math.floor((today.getTime() - new Date(m.DueDate!).getTime()) / 86400000);
                  return (
                    <div key={m.Id} className="px-5 py-3 flex items-center gap-3 hover:bg-red-50/60 dark:hover:bg-red-900/10 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.Name}</p>
                        <p className="text-xs text-red-500 font-semibold mt-0.5">{daysOverdue}d overdue · {new Date(m.DueDate!).toLocaleDateString()}</p>
                      </div>
                      {m.MilestoneTypeName && (
                        <span className="px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0"
                          style={pillStyle(m.MilestoneTypeColor, { alpha: '22' })}>
                          {m.MilestoneTypeName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {upcomingMilestones.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between">
                <h2 className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  Upcoming Milestones
                </h2>
                <span className="text-xs font-bold bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">{upcomingMilestones.length}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-60 overflow-y-auto">
                {upcomingMilestones.map(m => {
                  const daysUntil = Math.ceil((new Date(m.DueDate!).getTime() - today.getTime()) / 86400000);
                  return (
                    <div key={m.Id} className="px-5 py-3 flex items-center gap-3 hover:bg-amber-50/60 dark:hover:bg-amber-900/10 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.Name}</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">Due in {daysUntil}d · {new Date(m.DueDate!).toLocaleDateString()}</p>
                      </div>
                      {m.MilestoneTypeName && (
                        <span className="px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0"
                          style={pillStyle(m.MilestoneTypeColor, { alpha: '22' })}>
                          {m.MilestoneTypeName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {overdueMilestones.length === 0 && upcomingMilestones.length === 0 && completedMilestones.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 flex items-center gap-3 text-green-600 dark:text-green-400">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">All {completedMilestones.length} milestone{completedMilestones.length !== 1 ? 's' : ''} completed</span>
            </div>
          )}
        </div>
      )}

      {/* ── Sprints ── */}
      {overviewSprints.filter((s: any) => s.Status === 'active' || s.Status === 'planned').length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Sprints
            </h2>
            <div className="flex items-center gap-2">
              {activeSprints.length > 0 && (
                <span className="text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">{activeSprints.length} Active</span>
              )}
              {plannedSprints.length > 0 && (
                <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">{plannedSprints.length} Planned</span>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-72 overflow-y-auto">
            {overviewSprints.filter((s: any) => s.Status === 'active' || s.Status === 'planned').slice(0, 8).map((sprint: any) => {
              const completionPct = sprint.TotalTasks > 0 ? Math.round((sprint.CompletedTasks / sprint.TotalTasks) * 100) : 0;
              const statusColors: Record<string, string> = {
                active: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
                planned: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
              };
              const statusLabel: Record<string, string> = { active: 'Active', planned: 'Planned' };
              return (
                <div key={sprint.Id} className="px-5 py-4 hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{sprint.Name}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[sprint.Status] || ''}`}>
                          {statusLabel[sprint.Status] || sprint.Status}
                        </span>
                      </div>
                      {sprint.Goal && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">{sprint.Goal}</p>}
                      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mb-2">
                        {sprint.StartDate && <span>📅 {sprint.StartDate.split('T')[0]} → {sprint.EndDate ? sprint.EndDate.split('T')[0] : '?'}</span>}
                        <span>{sprint.CompletedTasks}/{sprint.TotalTasks} tasks</span>
                        {Number(sprint.TotalStoryPoints) > 0 && <span>⚡ {sprint.CompletedStoryPoints}/{sprint.TotalStoryPoints} pts</span>}
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${completionPct === 100 ? 'bg-green-500' : sprint.Status === 'active' ? 'bg-indigo-500' : 'bg-blue-400'}`}
                          style={{ width: `${completionPct}%` }} />
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className={`text-lg font-bold ${completionPct === 100 ? 'text-green-600 dark:text-green-400' : 'text-indigo-600 dark:text-indigo-400'}`}>{completionPct}%</div>
                      <div className="text-xs text-gray-400">done</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
