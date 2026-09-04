'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import Navbar from '@/components/old/Navbar';
import ScrollToTopButton from '@/components/old/ScrollToTopButton';
import TaskDetailModal from '@/components/old/TaskDetailModal';
import { projectsApi, Project } from '@/lib/api/projects';
import { tasksApi, Task } from '@/lib/api/tasks';

interface Notification {
  Id: number;
  UserId: number;
  Type: string;
  Title: string;
  Message: string;
  Link: string | null;
  RelatedTaskId?: number | null;
  RelatedProjectId?: number | null;
  IsRead: number;
  CreatedAt: string;
}

export default function NotificationsPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [taskModalState, setTaskModalState] = useState<{
    show: boolean;
    isLoading: boolean;
    project: Project | null;
    task: Task | null;
    tasks: Task[];
    error: string;
  }>({
    show: false,
    isLoading: false,
    project: null,
    task: null,
    tasks: [],
    error: '',
  });

  // Check authentication - only redirect if not loading and no token
  useEffect(() => {
    if (!authLoading && !token) {
      router.push(oldPath('/login'));
    }
  }, [authLoading, token, router]);

  // Load notifications when authenticated
  useEffect(() => {
    if (token && user) {
      loadNotifications();
    }
  }, [token, user]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const url = filter === 'unread' 
        ? `${getApiUrl()}/api/notifications/unread`
        : `${getApiUrl()}/api/notifications`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && user) {
      loadNotifications();
    }
  }, [filter]);

  const markAsRead = async (id: number) => {
    try {
      await fetch(`${getApiUrl()}/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.Id === id ? { ...n, IsRead: 1 } : n));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${getApiUrl()}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, IsRead: 1 })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const deleteNotification = async (id: number) => {
    try {
      await fetch(`${getApiUrl()}/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.filter(n => n.Id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const closeTaskDetails = () => {
    setTaskModalState({
      show: false,
      isLoading: false,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });
  };

  const openTaskDetails = async (projectId: number, taskId: number) => {
    if (!token) return;

    setTaskModalState({
      show: true,
      isLoading: true,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });

    try {
      const [projectRes, tasksRes] = await Promise.all([
        projectsApi.getById(projectId, token),
        tasksApi.getByProject(projectId, token),
      ]);

      const project = projectRes?.project || null;
      const projectTasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : [];
      const activeTask = projectTasks.find((entry) => Number(entry.Id) === Number(taskId)) || null;

      if (!project || !activeTask) {
        throw new Error('Task no longer exists in this project');
      }

      setTaskModalState({
        show: true,
        isLoading: false,
        project,
        task: activeTask,
        tasks: projectTasks,
        error: '',
      });
    } catch (err: any) {
      setTaskModalState({
        show: true,
        isLoading: false,
        project: null,
        task: null,
        tasks: [],
        error: err?.message || 'Failed to open task detail',
      });
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.IsRead) {
      markAsRead(notification.Id);
    }
    if (notification.RelatedTaskId && notification.RelatedProjectId) {
      openTaskDetails(Number(notification.RelatedProjectId), Number(notification.RelatedTaskId));
      return;
    }
    if (notification.Link) {
      router.push(notification.Link);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_assigned': return '📋';
      case 'ticket_created': return '🎫';
      case 'ticket_assigned': return '🎯';
      case 'ticket_developer': return '👨‍💻';
      case 'ticket_status': return '✅';
      case 'ticket_comment': return '💬';
      case 'comment': return '💬';
      case 'deadline': return '⏰';
      case 'mention': return '@';
      default: return '🔔';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const unreadCount = notifications.filter(n => !n.IsRead).length;

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Notifications</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shrink-0"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <span className="text-6xl">🔔</span>
            <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">No notifications</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {filter === 'unread' ? "You don't have any unread notifications" : "You don't have any notifications yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(notification => (
              <div
                key={notification.Id}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow ${
                  !notification.IsRead ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0">
                      <span className="text-3xl">{getNotificationIcon(notification.Type)}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                            {notification.Title}
                            {!notification.IsRead && (
                              <span className="ml-2 inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                            )}
                          </h3>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            {notification.Message}
                          </p>
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                            {formatDate(notification.CreatedAt)}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {notification.Link && (
                            <button
                              onClick={() => handleNotificationClick(notification)}
                              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                              title="View notification"
                              aria-label="View notification"
                            >
                              👁️
                            </button>
                          )}
                          {!notification.IsRead && (
                            <button
                              onClick={() => markAsRead(notification.Id)}
                              className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                              title="Mark as read"
                              aria-label="Mark as read"
                            >
                              ✓
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.Id)}
                            className="px-3 py-1.5 text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-md transition-colors"
                            title="Delete notification"
                            aria-label="Delete notification"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

      {taskModalState.show && (
        <>
          {taskModalState.isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 text-gray-700 dark:text-gray-300">
                Loading task details...
              </div>
            </div>
          )}

          {!taskModalState.isLoading && taskModalState.error && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="text-sm text-red-600 dark:text-red-400 mb-4">{taskModalState.error}</div>
                <div className="flex justify-end">
                  <button
                    onClick={closeTaskDetails}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {!taskModalState.isLoading && !taskModalState.error && taskModalState.project && taskModalState.task && token && (
            <TaskDetailModal
              projectId={Number(taskModalState.project.Id)}
              organizationId={Number(taskModalState.project.OrganizationId)}
              task={taskModalState.task}
              project={taskModalState.project}
              tasks={taskModalState.tasks}
              onOpenTask={(targetTask) => {
                const fullTask = taskModalState.tasks.find((entry) => Number(entry.Id) === Number(targetTask.Id)) || targetTask;
                setTaskModalState((prev) => ({ ...prev, task: fullTask }));
              }}
              onClose={closeTaskDetails}
              onSaved={async () => {
                if (!taskModalState.project || !taskModalState.task) return;
                await openTaskDetails(Number(taskModalState.project.Id), Number(taskModalState.task.Id));
              }}
              token={token}
            />
          )}
        </>
      )}

      <ScrollToTopButton />
    </>
  );
}
