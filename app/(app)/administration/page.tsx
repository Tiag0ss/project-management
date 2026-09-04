/* Migrated into AppShell — Navbar removed; chrome from app/(app)/layout */
'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageTabs from '@/components/PageTabs';
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

type AdminTab =
  | 'users'
  | 'permissions'
  | 'settings'
  | 'task-form'
  | 'custom-fields'
  | 'custom-tables'
  | 'holidays'
  | 'logs'
  | 'frontpage'
  | 'api-tokens';

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

const ADMIN_TAB_LABELS: { id: AdminTab; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'permissions', label: 'Role Permissions' },
  { id: 'settings', label: 'System Settings' },
  { id: 'task-form', label: 'Task Form' },
  { id: 'custom-fields', label: 'Custom Fields' },
  { id: 'custom-tables', label: 'Custom Tables' },
  { id: 'holidays', label: 'Holidays' },
  { id: 'logs', label: 'Activity Logs' },
  { id: 'frontpage', label: 'Frontpage' },
  { id: 'api-tokens', label: 'API Tokens' },
];

export default function AdministrationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full items-center justify-center py-12 text-[var(--pm-muted)]">Loading…</div>
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
      <div className="flex w-full items-center justify-center py-12 text-[var(--pm-muted)]">Loading...</div>
    );
  }

  if (!user || !user.isAdmin) {
    return null;
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--pm-text)]">Administration</h1>
        <p className="text-sm text-[var(--pm-muted)]">Manage system settings and configurations</p>
      </div>

      <PageTabs
        tabs={ADMIN_TAB_LABELS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as AdminTab)}
      />

      <main ref={scrollContainerRef} className="min-w-0">
        <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] shadow-sm">
          {activeTab === 'users' && <UsersManagement />}
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
      </main>

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />
    </div>
  );
}
