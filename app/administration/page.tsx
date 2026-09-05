/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageTabs from '@/components/PageTabs';
import PageStickyChrome from '@/components/PageStickyChrome';
import PageStickyActions, { pageActionButtonClass } from '@/components/PageStickyActions';
import UsersManagement from '@/components/admin/UsersManagement';
import RolePermissionsManagement, {
  type RolePermissionsActionsState,
} from '@/components/admin/RolePermissionsManagement';
import SystemSettings, {
  type SystemSettingsActionsState,
} from '@/components/admin/SystemSettings';
import ActivityLogsManagement from '@/components/admin/ActivityLogsManagement';
import FrontpageEditor from '@/components/admin/FrontpageEditor';
import HolidaysManagement from '@/components/admin/HolidaysManagement';
import CustomFieldsManagement from '@/components/admin/CustomFieldsManagement';
import CustomTablesManagement from '@/components/admin/CustomTablesManagement';
import ApiTokensManagement from '@/components/admin/ApiTokensManagement';
import TaskFormVisibilitySettingsPanel, {
  type TaskFormVisibilityActionsState,
} from '@/components/admin/TaskFormVisibilitySettingsPanel';
import OrganizationsManagement from '@/components/admin/OrganizationsManagement';
import { useUrlTab } from '@/hooks/useUrlTab';

type AdminTab =
  | 'users'
  | 'organizations'
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
  'organizations',
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
  { id: 'organizations', label: 'Organizations' },
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
  const [taskFormActions, setTaskFormActions] = useState<TaskFormVisibilityActionsState | null>(null);
  const [rolePermissionsActions, setRolePermissionsActions] =
    useState<RolePermissionsActionsState | null>(null);
  const [systemSettingsActions, setSystemSettingsActions] =
    useState<SystemSettingsActionsState | null>(null);
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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <PageStickyChrome>
        <div>
          <h1 className="text-xl font-semibold text-[var(--pm-text)]">Administration</h1>
          <p className="text-sm text-[var(--pm-muted)]">Manage system settings and configurations</p>
        </div>

        <PageTabs
          tabs={ADMIN_TAB_LABELS}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as AdminTab)}
        />
      </PageStickyChrome>

      <main ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-3">
        <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] shadow-sm">
          {activeTab === 'users' && <UsersManagement />}
          {activeTab === 'organizations' && <OrganizationsManagement />}
          {activeTab === 'permissions' && (
            <RolePermissionsManagement
              actionsPlacement="none"
              onActionsStateChange={setRolePermissionsActions}
            />
          )}
          {activeTab === 'settings' && (
            <SystemSettings
              actionsPlacement="none"
              onActionsStateChange={setSystemSettingsActions}
            />
          )}
          {activeTab === 'task-form' && token && (
            <div className="p-4 sm:p-6">
              <TaskFormVisibilitySettingsPanel
                mode="global"
                token={token}
                canManage
                actionsPlacement="none"
                onActionsStateChange={setTaskFormActions}
              />
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

      {activeTab === 'permissions' && rolePermissionsActions?.canSave && (
        <PageStickyActions>
          <button
            type="button"
            onClick={rolePermissionsActions.onSave}
            disabled={rolePermissionsActions.saving}
            className={pageActionButtonClass.primary}
          >
            {rolePermissionsActions.saving ? 'Saving…' : 'Save Changes'}
          </button>
        </PageStickyActions>
      )}

      {activeTab === 'settings' && systemSettingsActions?.canSave && (
        <PageStickyActions>
          {systemSettingsActions.showSyncAiViews && (
            <button
              type="button"
              onClick={systemSettingsActions.onSyncAiViews}
              disabled={systemSettingsActions.syncingAiViews || systemSettingsActions.saving}
              className={pageActionButtonClass.secondary}
            >
              {systemSettingsActions.syncingAiViews ? 'Syncing…' : 'Sync AI Views Now'}
            </button>
          )}
          <button
            type="button"
            onClick={systemSettingsActions.onSave}
            disabled={systemSettingsActions.saving}
            className={pageActionButtonClass.primary}
          >
            {systemSettingsActions.saving ? 'Saving…' : 'Save Settings'}
          </button>
        </PageStickyActions>
      )}

      {activeTab === 'task-form' && taskFormActions?.canManage && (
        <PageStickyActions>
          <button
            type="button"
            onClick={taskFormActions.onSave}
            disabled={taskFormActions.saving || taskFormActions.syncing}
            className={pageActionButtonClass.primary}
          >
            {taskFormActions.saving ? 'Saving…' : 'Save'}
          </button>
        </PageStickyActions>
      )}

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />
    </div>
  );
}
