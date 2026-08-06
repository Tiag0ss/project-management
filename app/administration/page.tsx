'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import UsersManagement from '@/components/admin/UsersManagement';
import RolePermissionsManagement from '@/components/admin/RolePermissionsManagement';
import SystemSettings from '@/components/admin/SystemSettings';
import ActivityLogsManagement from '@/components/admin/ActivityLogsManagement';
import FrontpageEditor from '@/components/admin/FrontpageEditor';
import HolidaysManagement from '@/components/admin/HolidaysManagement';
import CustomFieldsManagement from '@/components/admin/CustomFieldsManagement';
import CustomTablesManagement from '@/components/admin/CustomTablesManagement';
import ApiTokensManagement from '@/components/admin/ApiTokensManagement';
import TaskFormVisibilitySettingsPanel from '@/components/admin/TaskFormVisibilitySettingsPanel';
import { useUrlTab } from '@/hooks/useUrlTab';

type AdminTab = 'users' | 'permissions' | 'settings' | 'task-form' | 'custom-fields' | 'custom-tables' | 'holidays' | 'logs' | 'frontpage' | 'api-tokens';
const ADMIN_TABS = [
  'users',
  'permissions',
  'settings',
  'task-form',
  'custom-fields',
  'custom-tables',
  'holidays',
  'logs',
  'frontpage',
  'api-tokens',
] as const;

export default function AdministrationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-gray-700 dark:text-gray-200">Loading…</div>
        </div>
      }
    >
      <AdministrationPageContent />
    </Suspense>
  );
}

function AdministrationPageContent() {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useUrlTab<AdminTab>(ADMIN_TABS, 'users');
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-600 dark:text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user || !user.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />

      <div className="flex flex-col md:flex-row w-full mx-auto min-h-[calc(100vh-64px)]">
        {/* Mobile tabs */}
        <div className="md:hidden sticky top-16 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex overflow-x-auto px-2 py-2 gap-1" aria-label="Administration tabs">
            {([
              { id: 'users' as const, label: 'Users', icon: '👥' },
              { id: 'permissions' as const, label: 'Permissions', icon: '🔐' },
              { id: 'settings' as const, label: 'Settings', icon: '⚙️' },
              { id: 'task-form' as const, label: 'Task Form', icon: '📝' },
              { id: 'custom-fields' as const, label: 'Fields', icon: '🧩' },
              { id: 'custom-tables' as const, label: 'Tables', icon: '🗃️' },
              { id: 'holidays' as const, label: 'Holidays', icon: '📅' },
              { id: 'logs' as const, label: 'Logs', icon: '📋' },
              { id: 'frontpage' as const, label: 'Frontpage', icon: '🏠' },
              { id: 'api-tokens' as const, label: 'API', icon: '🔑' },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar */}
        <aside className="hidden md:flex w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col shrink-0">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Administration</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Manage system settings and configurations</p>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'users'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">👥</span>
              <span className="font-medium">Users</span>
            </button>

            <button
              onClick={() => setActiveTab('permissions')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'permissions'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🔐</span>
              <span className="font-medium">Role Permissions</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">⚙️</span>
              <span className="font-medium">System Settings</span>
            </button>

            <button
              onClick={() => setActiveTab('task-form')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'task-form'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">📝</span>
              <span className="font-medium">Task Form</span>
            </button>

            <button
              onClick={() => setActiveTab('custom-fields')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'custom-fields'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🧩</span>
              <span className="font-medium">Custom Fields</span>
            </button>

            <button
              onClick={() => setActiveTab('custom-tables')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'custom-tables'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🗃️</span>
              <span className="font-medium">Custom Tables</span>
            </button>

            <button
              onClick={() => setActiveTab('holidays')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'holidays'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">📅</span>
              <span className="font-medium">Holidays</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'logs'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">📋</span>
              <span className="font-medium">Activity Logs</span>
            </button>

            <button
              onClick={() => setActiveTab('frontpage')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'frontpage'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🏠</span>
              <span className="font-medium">Frontpage</span>
            </button>

            <button
              onClick={() => setActiveTab('api-tokens')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'api-tokens'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🔑</span>
              <span className="font-medium">API Tokens</span>
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main ref={scrollContainerRef} className="flex-1 overflow-auto min-w-0">
          <div className="p-4 sm:p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">{activeTab === 'users' && <UsersManagement />}
          
          {activeTab === 'permissions' && <RolePermissionsManagement />}
          
          {activeTab === 'settings' && <SystemSettings />}

          {activeTab === 'task-form' && token && (
            <div className="p-6">
              <TaskFormVisibilitySettingsPanel mode="global" token={token} canManage />
            </div>
          )}

          {activeTab === 'custom-fields' && <CustomFieldsManagement />}

          {activeTab === 'custom-tables' && <CustomTablesManagement />}

          {activeTab === 'holidays' && <HolidaysManagement />}
          
          {activeTab === 'logs' && <ActivityLogsManagement />}
          
          {activeTab === 'frontpage' && <FrontpageEditor />}

          {activeTab === 'api-tokens' && <ApiTokensManagement mode="admin" />}
            </div>
          </div>
        </main>
      </div>

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />
    </div>
  );
}
