'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import PageTabs from '@/components/PageTabs';
// Complete list of IANA timezones
const TIMEZONES = [
  { value: '', label: 'Use browser/system default' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  // Africa
  { value: 'Africa/Cairo', label: 'Africa/Cairo (EET)' },
  { value: 'Africa/Casablanca', label: 'Africa/Casablanca (WET)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (WAT)' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT)' },
  // America
  { value: 'America/Anchorage', label: 'America/Anchorage (AKST)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'America/Buenos Aires (ART)' },
  { value: 'America/Bogota', label: 'America/Bogota (COT)' },
  { value: 'America/Caracas', label: 'America/Caracas (VET)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST)' },
  { value: 'America/Denver', label: 'America/Denver (MST)' },
  { value: 'America/Halifax', label: 'America/Halifax (AST)' },
  { value: 'America/Lima', label: 'America/Lima (PET)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PST)' },
  { value: 'America/Mexico_City', label: 'America/Mexico City (CST)' },
  { value: 'America/New_York', label: 'America/New York (EST)' },
  { value: 'America/Phoenix', label: 'America/Phoenix (MST)' },
  { value: 'America/Santiago', label: 'America/Santiago (CLT)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao Paulo (BRT)' },
  { value: 'America/St_Johns', label: 'America/St Johns (NST)' },
  { value: 'America/Toronto', label: 'America/Toronto (EST)' },
  { value: 'America/Vancouver', label: 'America/Vancouver (PST)' },
  // Asia
  { value: 'Asia/Baghdad', label: 'Asia/Baghdad (AST)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (ICT)' },
  { value: 'Asia/Colombo', label: 'Asia/Colombo (IST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong Kong (HKT)' },
  { value: 'Asia/Istanbul', label: 'Asia/Istanbul (TRT)' },
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (WIB)' },
  { value: 'Asia/Jerusalem', label: 'Asia/Jerusalem (IST)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT)' },
  { value: 'Asia/Kathmandu', label: 'Asia/Kathmandu (NPT)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala Lumpur (MYT)' },
  { value: 'Asia/Manila', label: 'Asia/Manila (PHT)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (KST)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Asia/Taipei', label: 'Asia/Taipei (CST)' },
  { value: 'Asia/Tehran', label: 'Asia/Tehran (IRST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  // Atlantic
  { value: 'Atlantic/Azores', label: 'Atlantic/Azores (AZOT)' },
  { value: 'Atlantic/Reykjavik', label: 'Atlantic/Reykjavik (GMT)' },
  // Australia
  { value: 'Australia/Adelaide', label: 'Australia/Adelaide (ACST)' },
  { value: 'Australia/Brisbane', label: 'Australia/Brisbane (AEST)' },
  { value: 'Australia/Darwin', label: 'Australia/Darwin (ACST)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (AEST)' },
  { value: 'Australia/Perth', label: 'Australia/Perth (AWST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  // Europe
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (CET)' },
  { value: 'Europe/Athens', label: 'Europe/Athens (EET)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET)' },
  { value: 'Europe/Brussels', label: 'Europe/Brussels (CET)' },
  { value: 'Europe/Bucharest', label: 'Europe/Bucharest (EET)' },
  { value: 'Europe/Budapest', label: 'Europe/Budapest (CET)' },
  { value: 'Europe/Copenhagen', label: 'Europe/Copenhagen (CET)' },
  { value: 'Europe/Dublin', label: 'Europe/Dublin (GMT)' },
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki (EET)' },
  { value: 'Europe/Lisbon', label: 'Europe/Lisbon (WET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (CET)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (MSK)' },
  { value: 'Europe/Oslo', label: 'Europe/Oslo (CET)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Europe/Prague', label: 'Europe/Prague (CET)' },
  { value: 'Europe/Rome', label: 'Europe/Rome (CET)' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm (CET)' },
  { value: 'Europe/Vienna', label: 'Europe/Vienna (CET)' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw (CET)' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich (CET)' },
  // Indian
  { value: 'Indian/Mauritius', label: 'Indian/Mauritius (MUT)' },
  // Pacific
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST)' },
  { value: 'Pacific/Fiji', label: 'Pacific/Fiji (FJT)' },
  { value: 'Pacific/Guam', label: 'Pacific/Guam (ChST)' },
  { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu (HST)' },
  { value: 'Pacific/Samoa', label: 'Pacific/Samoa (SST)' },
];

interface SystemSettings {
  companyName?: string;
  companyLogoUrl?: string;
  faviconUrl?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
  smtpFromName?: string;
  smtpSecure?: string;
  outlookCalendarEnabled?: string;
  outlookTenantId?: string;
  outlookClientId?: string;
  outlookClientSecret?: string;
  outlookIncludeTeamEventsForManagers?: string;
  allowPublicRegistration?: string;
  publicRegistrationType?: string;
  defaultCustomerId?: string;
  defaultTimezone?: string;
  internalTicketsEnabled?: string;
  memosEnabled?: string;
  expensesEnabled?: string;
  autoApproveExpenses?: string;
  autoApproveTimeEntries?: string;
  autoApproveVacations?: string;
  autoApproveOutOfOffice?: string;
  frontpageEnabled?: string;
  aiAssistantEnabled?: string;
  aiProvider?: string;
  openAIApiKey?: string;
  openAIModel?: string;
  openAIBehavior?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  aiViewsAutoCreate?: string;
  aiViewSql_vAI_ProjectOpenTasks?: string;
  aiViewSql_vAI_UserOpenTasks?: string;
  aiViewSql_vAI_UserWorkloadBase?: string;
  aiViewSql_vAI_UserAllocations?: string;
}

interface Organization {
  Id: number;
  Name: string;
}

interface Customer {
  Id: number;
  Name: string;
}

type SettingsTab = 'branding' | 'email' | 'access' | 'features' | 'ai' | 'maintenance';

export type SystemSettingsActionsState = {
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  showSyncAiViews: boolean;
  syncingAiViews: boolean;
  onSyncAiViews: () => void;
};

type SystemSettingsProps = {
  /** Use `none` when the parent owns PageStickyActions (Administration). */
  actionsPlacement?: 'embedded' | 'none';
  onActionsStateChange?: (state: SystemSettingsActionsState | null) => void;
};

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'branding', label: 'Branding' },
  { id: 'email', label: 'Email (SMTP)' },
  { id: 'access', label: 'Access & Auth' },
  { id: 'features', label: 'Features' },
  { id: 'ai', label: 'AI' },
  { id: 'maintenance', label: 'Maintenance' },
];

export default function SystemSettings({
  actionsPlacement = 'embedded',
  onActionsStateChange,
}: SystemSettingsProps) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');
  const formRef = useRef<HTMLFormElement>(null);
  const [settings, setSettings] = useState<SystemSettings>({
    companyName: 'Project Management',
    companyLogoUrl: '',
    faviconUrl: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    smtpFrom: '',
    smtpFromName: '',
    smtpSecure: 'true',
    outlookCalendarEnabled: 'false',
    outlookTenantId: '',
    outlookClientId: '',
    outlookClientSecret: '',
    outlookIncludeTeamEventsForManagers: 'true',
    allowPublicRegistration: 'false',
    publicRegistrationType: 'internal',
    defaultCustomerId: '',
    defaultTimezone: '',
    internalTicketsEnabled: 'true',
    memosEnabled: 'true',
    expensesEnabled: 'false',
    autoApproveExpenses: 'false',
    autoApproveTimeEntries: 'false',
    autoApproveVacations: 'false',
    autoApproveOutOfOffice: 'false',
    frontpageEnabled: 'true',
    aiAssistantEnabled: 'false',
    aiProvider: 'openai',
    openAIApiKey: '',
    openAIModel: 'gpt-4o-mini',
    openAIBehavior: '',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2',
    aiViewsAutoCreate: 'true',
    aiViewSql_vAI_ProjectOpenTasks: '',
    aiViewSql_vAI_UserOpenTasks: '',
    aiViewSql_vAI_UserWorkloadBase: '',
    aiViewSql_vAI_UserAllocations: '',
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ created: number; skipped: number } | null>(null);
  const [migrationError, setMigrationError] = useState('');
  const [isSyncingAiViews, setIsSyncingAiViews] = useState(false);
  const smtpPasswordRef = useRef<HTMLInputElement>(null);
  const outlookClientSecretRef = useRef<HTMLInputElement>(null);
  const openAIApiKeyRef = useRef<HTMLInputElement>(null);
  const [aiViewsSyncMessage, setAiViewsSyncMessage] = useState('');
  const [aiViewsSyncError, setAiViewsSyncError] = useState('');
  const [isUploadingBranding, setIsUploadingBranding] = useState<'logo' | 'favicon' | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      loadSettings();
      loadOrganizations();
      loadCustomers();
    }
  }, [token]);

  const loadSettings = async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(
        `${getApiUrl()}/api/system-settings`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSettings({
          companyName: data.settings.companyName || 'Project Management',
          companyLogoUrl: data.settings.companyLogoUrl || '',
          faviconUrl: data.settings.faviconUrl || '',
          smtpHost: data.settings.smtpHost || '',
          smtpPort: data.settings.smtpPort || '587',
          smtpUser: data.settings.smtpUser || '',
          smtpPassword: data.settings.smtpPassword || '',
          smtpFrom: data.settings.smtpFrom || '',
          smtpFromName: data.settings.smtpFromName || '',
          smtpSecure: data.settings.smtpSecure || 'true',
          outlookCalendarEnabled: data.settings.outlookCalendarEnabled || 'false',
          outlookTenantId: data.settings.outlookTenantId || '',
          outlookClientId: data.settings.outlookClientId || '',
          outlookClientSecret: data.settings.outlookClientSecret || '',
          outlookIncludeTeamEventsForManagers: data.settings.outlookIncludeTeamEventsForManagers || 'true',
          allowPublicRegistration: data.settings.allowPublicRegistration || 'false',
          publicRegistrationType: data.settings.publicRegistrationType || 'internal',
          defaultCustomerId: data.settings.defaultCustomerId || '',
          defaultTimezone: data.settings.defaultTimezone || '',
          internalTicketsEnabled: data.settings.internalTicketsEnabled || 'true',
          memosEnabled: data.settings.memosEnabled || 'true',
          expensesEnabled: data.settings.expensesEnabled || 'false',
          autoApproveExpenses: data.settings.autoApproveExpenses || 'false',
          autoApproveTimeEntries: data.settings.autoApproveTimeEntries || 'false',
          autoApproveVacations: data.settings.autoApproveVacations || 'false',
          autoApproveOutOfOffice: data.settings.autoApproveOutOfOffice || 'false',
          frontpageEnabled: data.settings.frontpageEnabled !== undefined ? data.settings.frontpageEnabled : 'true',
          aiAssistantEnabled: data.settings.aiAssistantEnabled || 'false',
          aiProvider: data.settings.aiProvider === 'ollama' ? 'ollama' : 'openai',
          openAIApiKey: data.settings.openAIApiKey || '',
          openAIModel: data.settings.openAIModel || 'gpt-4o-mini',
          openAIBehavior: data.settings.openAIBehavior || '',
          ollamaBaseUrl: data.settings.ollamaBaseUrl || 'http://127.0.0.1:11434',
          ollamaModel: data.settings.ollamaModel || 'llama3.2',
          aiViewsAutoCreate: data.settings.aiViewsAutoCreate || 'true',
          aiViewSql_vAI_ProjectOpenTasks: data.settings.aiViewSql_vAI_ProjectOpenTasks || '',
          aiViewSql_vAI_UserOpenTasks: data.settings.aiViewSql_vAI_UserOpenTasks || '',
          aiViewSql_vAI_UserWorkloadBase: data.settings.aiViewSql_vAI_UserWorkloadBase || '',
          aiViewSql_vAI_UserAllocations: data.settings.aiViewSql_vAI_UserAllocations || '',
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrganizations = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organizations`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.organizations || []);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadCustomers = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/customers`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        setCustomers(result.data || []);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const handleMigrateSystemGroups = async () => {
    if (!token) return;
    setIsMigrating(true);
    setMigrationResult(null);
    setMigrationError('');
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organizations/admin/create-system-groups`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      const data = await response.json();
      if (response.ok && data.success) {
        setMigrationResult({ created: data.created, skipped: data.skipped });
      } else {
        setMigrationError(data.message || 'Migration failed');
      }
    } catch (err: any) {
      setMigrationError(err.message || 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSyncAiViews = async () => {
    if (!token) return;
    setIsSyncingAiViews(true);
    setAiViewsSyncMessage('');
    setAiViewsSyncError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/ai-assistant-views/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to sync AI views');
      }

      setAiViewsSyncMessage(`AI views synced (${data.synced || 0} view(s)).`);
    } catch (err: any) {
      setAiViewsSyncError(err.message || 'Failed to sync AI views');
    } finally {
      setIsSyncingAiViews(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      const settingsToSave: SystemSettings = { ...settings };
      const smtpPassword = readPasswordInput(smtpPasswordRef);
      const outlookClientSecret = readPasswordInput(outlookClientSecretRef);
      const openAIApiKey = readPasswordInput(openAIApiKeyRef);
      if (smtpPassword) settingsToSave.smtpPassword = smtpPassword;
      if (outlookClientSecret) settingsToSave.outlookClientSecret = outlookClientSecret;
      if (openAIApiKey) settingsToSave.openAIApiKey = openAIApiKey;

      const response = await fetch(
        `${getApiUrl()}/api/system-settings`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ settings: settingsToSave }),
        }
      );

      if (response.ok) {
        setSuccess('Settings saved successfully');
        showToast({ type: 'success', title: 'Settings Saved', message: 'Settings saved successfully' });
        clearPasswordInput(smtpPasswordRef);
        clearPasswordInput(outlookClientSecretRef);
        clearPasswordInput(openAIApiKeyRef);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save settings');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof SystemSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!onActionsStateChange) return;
    if (isLoading) {
      onActionsStateChange(null);
      return;
    }
    onActionsStateChange({
      saving: isSaving,
      canSave: activeTab !== 'maintenance',
      onSave: () => {
        formRef.current?.requestSubmit();
      },
      showSyncAiViews: activeTab === 'ai',
      syncingAiViews: isSyncingAiViews,
      onSyncAiViews: () => {
        void handleSyncAiViews();
      },
    });
    return () => onActionsStateChange(null);
  }, [onActionsStateChange, isLoading, isSaving, activeTab, isSyncingAiViews]);

  const handleBrandingUpload = async (kind: 'logo' | 'favicon', file: File | null) => {
    if (!token || !file) return;
    setIsUploadingBranding(kind);
    setError('');
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const response = await fetch(`${getApiUrl()}/api/system-settings/branding-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileData,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Upload failed');
      }
      const field = kind === 'logo' ? 'companyLogoUrl' : 'faviconUrl';
      handleChange(field, data.url || '');
      showToast({ type: 'success', message: data.message || 'Uploaded' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsUploadingBranding(null);
      if (kind === 'logo' && logoFileInputRef.current) logoFileInputRef.current.value = '';
      if (kind === 'favicon' && faviconFileInputRef.current) faviconFileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--pm-muted)]">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <p className="text-xs text-[var(--pm-muted)]">
        Configure branding, email, access, features, AI, and maintenance utilities.
      </p>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-green-400 bg-green-100 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
          {success}
        </div>
      )}

      <PageTabs
        tabs={SETTINGS_TABS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as SettingsTab)}
      />

      <form ref={formRef} id="system-settings-form" onSubmit={handleSubmit} className="space-y-3">

        
        {activeTab === 'branding' && (
          <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">Branding</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  Company Name
                </label>
                <input
                  type="text"
                  value={settings.companyName || ''}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  placeholder="Project Management"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  Company Logo URL
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={settings.companyLogoUrl || ''}
                  onChange={(e) => handleChange('companyLogoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png or /uploads/branding/…"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => handleBrandingUpload('logo', e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={isUploadingBranding === 'logo'}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
                  >
                    {isUploadingBranding === 'logo' ? 'Uploading…' : 'Upload logo'}
                  </button>
                  {settings.companyLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={settings.companyLogoUrl} alt="Logo preview" className="h-8 max-w-[120px] object-contain rounded border border-gray-200 dark:border-gray-600 bg-white" />
                  ) : null}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  Favicon URL
                </label>
                <input
                  type="text"
                  inputMode="url"
                  value={settings.faviconUrl || ''}
                  onChange={(e) => handleChange('faviconUrl', e.target.value)}
                  placeholder="https://example.com/favicon.ico or /uploads/branding/…"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={faviconFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                    className="hidden"
                    onChange={(e) => handleBrandingUpload('favicon', e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => faviconFileInputRef.current?.click()}
                    disabled={isUploadingBranding === 'favicon'}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
                  >
                    {isUploadingBranding === 'favicon' ? 'Uploading…' : 'Upload favicon'}
                  </button>
                  {settings.faviconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={settings.faviconUrl} alt="Favicon preview" className="h-8 w-8 object-contain rounded border border-gray-200 dark:border-gray-600 bg-white" />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        
        {activeTab === 'email' && (
          <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">SMTP Configuration</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={settings.smtpHost}
                  onChange={(e) => handleChange('smtpHost', e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  SMTP Port
                </label>
                <input
                  type="number"
                  value={settings.smtpPort}
                  onChange={(e) => handleChange('smtpPort', e.target.value)}
                  placeholder="587"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  SMTP User
                </label>
                <input
                  type="text"
                  value={settings.smtpUser}
                  onChange={(e) => handleChange('smtpUser', e.target.value)}
                  placeholder="user@example.com"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  SMTP Password
                </label>
                <PasswordInput
                  ref={smtpPasswordRef}
                  name="smtpPassword"
                  placeholder=""
                  autoComplete="new-password"
                  preventAutofill
                />
                <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                  Leave blank to keep the existing password. Only fill in to change it.
                </p>
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  From Email
                </label>
                <input
                  type="email"
                  value={settings.smtpFrom}
                  onChange={(e) => handleChange('smtpFrom', e.target.value)}
                  placeholder="noreply@example.com"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  From Name
                </label>
                <input
                  type="text"
                  value={settings.smtpFromName}
                  onChange={(e) => handleChange('smtpFromName', e.target.value)}
                  placeholder="Project Management System"
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                />
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                  Use TLS/SSL
                </label>
                <select
                  value={settings.smtpSecure}
                  onChange={(e) => handleChange('smtpSecure', e.target.value)}
                  className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                >
                  <option value="true">Yes (TLS/SSL)</option>
                  <option value="false">No (Plain)</option>
                </select>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">Outlook Calendar Integration</h3>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.outlookCalendarEnabled === 'true'}
                    onChange={(e) => handleChange('outlookCalendarEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">Enable Outlook Calendar Sync</div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      Adds Outlook events to the in-app calendar. Managers/admins can include team members in the same organization.
                    </div>
                  </div>
                </label>

                {settings.outlookCalendarEnabled === 'true' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-0 md:ml-8">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        Azure Tenant ID
                      </label>
                      <input
                        type="text"
                        value={settings.outlookTenantId || ''}
                        onChange={(e) => handleChange('outlookTenantId', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                    </div>

                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        Azure Client ID
                      </label>
                      <input
                        type="text"
                        value={settings.outlookClientId || ''}
                        onChange={(e) => handleChange('outlookClientId', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        Azure Client Secret
                      </label>
                      <PasswordInput
                        ref={outlookClientSecretRef}
                        name="outlookClientSecret"
                        placeholder=""
                        autoComplete="new-password"
                        preventAutofill
                      />
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        Leave empty and save to clear the stored Outlook client secret.
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={settings.outlookIncludeTeamEventsForManagers !== 'false'}
                          onChange={(e) => handleChange('outlookIncludeTeamEventsForManagers', e.target.checked ? 'true' : 'false')}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                        />
                        <div>
                          <div className="text-sm font-medium text-[var(--pm-text)]">Managers/Admins see team Outlook events</div>
                          <div className="text-[11px] text-[var(--pm-muted)]">
                            Uses users in the same organization with valid email addresses.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        
        {activeTab === 'access' && (
          <div className="space-y-3">
            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">Registration Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={settings.allowPublicRegistration === 'true'}
                      onChange={(e) => handleChange('allowPublicRegistration', e.target.checked ? 'true' : 'false')}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[var(--pm-text)]">
                        Allow Public Registration
                      </div>
                      <div className="text-[11px] text-[var(--pm-muted)]">
                        Allow users to register from the frontpage without an invitation
                      </div>
                    </div>
                  </label>
                </div>

                {settings.allowPublicRegistration === 'true' && (
                  <div className="ml-8 mt-4 space-y-4">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        Registration Type *
                      </label>
                      <select
                        value={settings.publicRegistrationType}
                        onChange={(e) => handleChange('publicRegistrationType', e.target.value)}
                        required={settings.allowPublicRegistration === 'true'}
                        className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      >
                        <option value="internal">Internal User</option>
                        <option value="customer">Customer User</option>
                      </select>
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        {settings.publicRegistrationType === 'internal'
                          ? 'New users will be created as internal users'
                          : 'New users will be created as customer users (linked to a specific customer)'}
                      </p>
                    </div>

                    {settings.publicRegistrationType === 'customer' && (
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                          Default Customer *
                        </label>
                        <select
                          value={settings.defaultCustomerId}
                          onChange={(e) => handleChange('defaultCustomerId', e.target.value)}
                          required={settings.publicRegistrationType === 'customer'}
                          className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        >
                          <option value="">Select a customer...</option>
                          {customers.map((customer) => (
                            <option key={customer.Id} value={customer.Id}>
                              {customer.Name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                          New users will be linked to this customer
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">Timezone Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                    Default System Timezone
                  </label>
                  <select
                    value={settings.defaultTimezone}
                    onChange={(e) => handleChange('defaultTimezone', e.target.value)}
                    className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                    This timezone will be used as the default for all users who have not set their own timezone preference.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        
        {activeTab === 'features' && (
          <div className="space-y-3">
            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">Feature Toggles</h3>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.frontpageEnabled !== 'false'}
                    onChange={(e) => handleChange('frontpageEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Enable Front Page
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      When disabled, visiting the root URL redirects directly to the login page.
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.internalTicketsEnabled === 'true'}
                    onChange={(e) => handleChange('internalTicketsEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Enable Internal Ticket System
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      Shows/hides internal tickets module globally. Does not disable ticket integration used in tasks.
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.memosEnabled === 'true'}
                    onChange={(e) => handleChange('memosEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Enable Memos Menu
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      Only controls visibility of Memos in the navbar.
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.expensesEnabled === 'true'}
                    onChange={(e) => handleChange('expensesEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Enable Expenses Module
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      Shows/hides the project expenses module globally. When disabled, expense APIs return 403.
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveExpenses === 'true'}
                    onChange={(e) => handleChange('autoApproveExpenses', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Auto-approve Expenses
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      When enabled, new expenses are created as approved instead of pending.
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveTimeEntries === 'true'}
                    onChange={(e) => handleChange('autoApproveTimeEntries', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Auto-approve Time Entries
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      New time entries are created as approved and approved entries remain editable.
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveVacations === 'true'}
                    onChange={(e) => handleChange('autoApproveVacations', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Auto-approve Vacations
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      New vacation requests are immediately approved.
                    </div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveOutOfOffice === 'true'}
                    onChange={(e) => handleChange('autoApproveOutOfOffice', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Auto-approve Out Of Office
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      New out-of-office requests are immediately approved.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-3">
            <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">AI Assistant</h3>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={settings.aiAssistantEnabled === 'true'}
                    onChange={(e) => handleChange('aiAssistantEnabled', e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[var(--pm-text)]">
                      Enable AI Assistant
                    </div>
                    <div className="text-[11px] text-[var(--pm-muted)]">
                      Shows/hides AI features globally. Configure OpenAI or Ollama below.
                    </div>
                  </div>
                </label>

                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                    AI Provider
                  </label>
                  <select
                    value={settings.aiProvider === 'ollama' ? 'ollama' : 'openai'}
                    onChange={(e) => handleChange('aiProvider', e.target.value)}
                    className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama (local / self-hosted)</option>
                  </select>
                  <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                    Used by the assistant widget, task translate/summarize, and patch-notes improvement.
                  </p>
                </div>

                {settings.aiProvider === 'ollama' ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        Ollama Base URL
                      </label>
                      <input
                        type="text"
                        value={settings.ollamaBaseUrl || 'http://127.0.0.1:11434'}
                        onChange={(e) => handleChange('ollamaBaseUrl', e.target.value)}
                        placeholder="http://127.0.0.1:11434"
                        className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        From Docker on Linux, try <code className="font-mono">http://172.17.0.1:11434</code> or host networking.
                      </p>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                        Ollama Model
                      </label>
                      <input
                        type="text"
                        value={settings.ollamaModel || 'llama3.2'}
                        onChange={(e) => handleChange('ollamaModel', e.target.value)}
                        placeholder="llama3.2"
                        className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                      />
                      <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                        Must already be pulled (`ollama pull llama3.2`).
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                    OpenAI API Key
                  </label>
                  <PasswordInput
                    ref={openAIApiKeyRef}
                    name="openAIApiKey"
                    placeholder="sk-..."
                    autoComplete="new-password"
                    preventAutofill
                    className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                  />
                  <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                    Leave blank to keep the existing key. Only fill in to change it.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                      OpenAI Model
                    </label>
                    <select
                      value={settings.openAIModel || 'gpt-4o-mini'}
                      onChange={(e) => handleChange('openAIModel', e.target.value)}
                      className="w-full max-w-md rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (default)</option>
                      <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                      <option value="gpt-4.1">gpt-4.1</option>
                      <option value="o4-mini">o4-mini</option>
                    </select>
                    <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                      Select the model used by the AI assistant backend.
                    </p>
                  </div>
                  </div>
                  </>
                )}

                <div>
                    <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                      Assistant Behavior
                    </label>
                    <textarea
                      value={settings.openAIBehavior || ''}
                      onChange={(e) => handleChange('openAIBehavior', e.target.value)}
                      rows={3}
                      placeholder="Example: Be concise, use bullet points, and include actionable next steps."
                      className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                      Optional custom instruction appended to assistant system behavior.
                    </p>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">AI Data Views</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    The AI assistant reads data exclusively from these database views. You can customise the SELECT body for each view below (leave empty to use the built-in default).
                  </p>

                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={settings.aiViewsAutoCreate === 'true'}
                      onChange={(e) => handleChange('aiViewsAutoCreate', e.target.checked ? 'true' : 'false')}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--pm-accent)] focus:ring-[var(--pm-accent)]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[var(--pm-text)]">
                        Auto-create/sync AI Views on Server Startup
                      </div>
                      <div className="text-[11px] text-[var(--pm-muted)]">
                        When enabled, startup ensures AI views exist and applies the SQL definitions below.
                      </div>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 gap-3">
                    {(
                      [
                        { key: 'aiViewSql_vAI_ProjectOpenTasks', label: 'vAI_ProjectOpenTasks' },
                        { key: 'aiViewSql_vAI_UserOpenTasks',    label: 'vAI_UserOpenTasks' },
                        { key: 'aiViewSql_vAI_UserWorkloadBase', label: 'vAI_UserWorkloadBase' },
                        { key: 'aiViewSql_vAI_UserAllocations',  label: 'vAI_UserAllocations' },
                      ] as { key: keyof SystemSettings; label: string }[]
                    ).map(({ key, label }) => (
                      <div key={key}>
                        <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">
                          SQL for <code className="rounded bg-[var(--pm-panel)] px-1 font-mono text-[11px]">{label}</code>
                        </label>
                        <textarea
                          value={(settings[key] as string) || ''}
                          onChange={(e) => handleChange(key, e.target.value)}
                          rows={5}
                          placeholder="Leave empty to use the built-in default SELECT…"
                          className="w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 font-mono text-xs text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                        />
                      </div>
                    ))}
                  </div>

                  {(aiViewsSyncMessage || aiViewsSyncError) && (
                    <div className="mt-2 space-y-1">
                      {aiViewsSyncMessage && (
                        <p className="text-sm text-green-600 dark:text-green-400">{aiViewsSyncMessage}</p>
                      )}
                      {aiViewsSyncError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{aiViewsSyncError}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <div>
              <h3 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                Maintenance
              </h3>
              <p className="text-[11px] text-[var(--pm-muted)]">
                Administrative utilities for data consistency and migrations.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-[var(--pm-text)]">Create System Permission Groups</h4>
                <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
                  Creates the default Developer, Support, and Manager permission groups for any organization that is missing them.
                  Safe to run multiple times — existing groups are not modified.
                </p>
                {migrationResult && (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                    Done: {migrationResult.created} groups created, {migrationResult.skipped} already existed.
                  </p>
                )}
                {migrationError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{migrationError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleMigrateSystemGroups}
                disabled={isMigrating}
                className="h-10 shrink-0 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:bg-amber-400"
              >
                {isMigrating ? 'Running…' : 'Run Migration'}
              </button>
            </div>
          </div>
        )}

        {/* Save — embedded fallback when parent does not own PageStickyActions */}
        {actionsPlacement === 'embedded' && activeTab !== 'maintenance' && (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-[var(--pm-border)] bg-[var(--pm-panel)] px-4 py-3 sm:-mx-6 sm:px-6">
            {activeTab === 'ai' && (
              <button
                type="button"
                onClick={() => void handleSyncAiViews()}
                disabled={isSyncingAiViews || isSaving}
                className="h-10 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] px-4 text-sm font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
              >
                {isSyncingAiViews ? 'Syncing…' : 'Sync AI Views Now'}
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
            >
              {isSaving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

