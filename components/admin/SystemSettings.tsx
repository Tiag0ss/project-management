'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
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
  autoApproveTimeEntries?: string;
  autoApproveVacations?: string;
  autoApproveOutOfOffice?: string;
  frontpageEnabled?: string;
  aiAssistantEnabled?: string;
  openAIApiKey?: string;
  openAIModel?: string;
  openAIBehavior?: string;
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

type SettingsTab = 'branding' | 'email' | 'access' | 'features' | 'maintenance';

export default function SystemSettings() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');
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
    autoApproveTimeEntries: 'false',
    autoApproveVacations: 'false',
    autoApproveOutOfOffice: 'false',
    frontpageEnabled: 'true',
    aiAssistantEnabled: 'false',
    openAIApiKey: '',
    openAIModel: 'gpt-4o-mini',
    openAIBehavior: '',
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
          autoApproveTimeEntries: data.settings.autoApproveTimeEntries || 'false',
          autoApproveVacations: data.settings.autoApproveVacations || 'false',
          autoApproveOutOfOffice: data.settings.autoApproveOutOfOffice || 'false',
          frontpageEnabled: data.settings.frontpageEnabled !== undefined ? data.settings.frontpageEnabled : 'true',
          aiAssistantEnabled: data.settings.aiAssistantEnabled || 'false',
          openAIApiKey: data.settings.openAIApiKey || '',
          openAIModel: data.settings.openAIModel || 'gpt-4o-mini',
          openAIBehavior: data.settings.openAIBehavior || '',
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
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="text-gray-600 dark:text-gray-400">Loading settings...</div>
      </div>
    );
  }

  const TABS: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'branding',      label: 'Branding',       icon: '🏷️' },
    { id: 'email',         label: 'Email (SMTP)',    icon: '📧' },
    { id: 'access',        label: 'Access & Auth',   icon: '🔐' },
    { id: 'features',      label: 'Features & AI',   icon: '🤖' },
    { id: 'maintenance',   label: 'Maintenance',     icon: '🔧' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          System Settings
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure global system settings and integrations
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* â”€â”€ BRANDING â”€â”€ */}
        {activeTab === 'branding' && (
          <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              🏷️ Branding
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={settings.companyName || ''}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  placeholder="Project Management"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Company Logo URL
                </label>
                <input
                  type="url"
                  value={settings.companyLogoUrl || ''}
                  onChange={(e) => handleChange('companyLogoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Favicon URL
                </label>
                <input
                  type="url"
                  value={settings.faviconUrl || ''}
                  onChange={(e) => handleChange('faviconUrl', e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ EMAIL / SMTP â”€â”€ */}
        {activeTab === 'email' && (
          <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              📧 SMTP Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={settings.smtpHost}
                  onChange={(e) => handleChange('smtpHost', e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  SMTP Port
                </label>
                <input
                  type="number"
                  value={settings.smtpPort}
                  onChange={(e) => handleChange('smtpPort', e.target.value)}
                  placeholder="587"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  SMTP User
                </label>
                <input
                  type="text"
                  value={settings.smtpUser}
                  onChange={(e) => handleChange('smtpUser', e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  SMTP Password
                </label>
                <PasswordInput
                  ref={smtpPasswordRef}
                  name="smtpPassword"
                  placeholder=""
                  autoComplete="new-password"
                  preventAutofill
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Leave blank to keep the existing password. Only fill in to change it.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  From Email
                </label>
                <input
                  type="email"
                  value={settings.smtpFrom}
                  onChange={(e) => handleChange('smtpFrom', e.target.value)}
                  placeholder="noreply@example.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  From Name
                </label>
                <input
                  type="text"
                  value={settings.smtpFromName}
                  onChange={(e) => handleChange('smtpFromName', e.target.value)}
                  placeholder="Project Management System"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Use TLS/SSL
                </label>
                <select
                  value={settings.smtpSecure}
                  onChange={(e) => handleChange('smtpSecure', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="true">Yes (TLS/SSL)</option>
                  <option value="false">No (Plain)</option>
                </select>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                📅 Outlook Calendar Integration
              </h3>

              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.outlookCalendarEnabled === 'true'}
                    onChange={(e) => handleChange('outlookCalendarEnabled', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">Enable Outlook Calendar Sync</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Adds Outlook events to the in-app calendar. Managers/admins can include team members in the same organization.
                    </div>
                  </div>
                </label>

                {settings.outlookCalendarEnabled === 'true' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-0 md:ml-8">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Azure Tenant ID
                      </label>
                      <input
                        type="text"
                        value={settings.outlookTenantId || ''}
                        onChange={(e) => handleChange('outlookTenantId', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Azure Client ID
                      </label>
                      <input
                        type="text"
                        value={settings.outlookClientId || ''}
                        onChange={(e) => handleChange('outlookClientId', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Azure Client Secret
                      </label>
                      <PasswordInput
                        ref={outlookClientSecretRef}
                        name="outlookClientSecret"
                        placeholder=""
                        autoComplete="new-password"
                        preventAutofill
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Leave empty and save to clear the stored Outlook client secret.
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.outlookIncludeTeamEventsForManagers !== 'false'}
                          onChange={(e) => handleChange('outlookIncludeTeamEventsForManagers', e.target.checked ? 'true' : 'false')}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">Managers/Admins see team Outlook events</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
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

        {/* â”€â”€ ACCESS & AUTH â”€â”€ */}
        {activeTab === 'access' && (
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                🔐 Registration Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.allowPublicRegistration === 'true'}
                      onChange={(e) => handleChange('allowPublicRegistration', e.target.checked ? 'true' : 'false')}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        Allow Public Registration
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Allow users to register from the frontpage without an invitation
                      </div>
                    </div>
                  </label>
                </div>

                {settings.allowPublicRegistration === 'true' && (
                  <div className="ml-8 mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Registration Type *
                      </label>
                      <select
                        value={settings.publicRegistrationType}
                        onChange={(e) => handleChange('publicRegistrationType', e.target.value)}
                        required={settings.allowPublicRegistration === 'true'}
                        className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="internal">Internal User</option>
                        <option value="customer">Customer User</option>
                      </select>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {settings.publicRegistrationType === 'internal'
                          ? 'New users will be created as internal users'
                          : 'New users will be created as customer users (linked to a specific customer)'}
                      </p>
                    </div>

                    {settings.publicRegistrationType === 'customer' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Default Customer *
                        </label>
                        <select
                          value={settings.defaultCustomerId}
                          onChange={(e) => handleChange('defaultCustomerId', e.target.value)}
                          required={settings.publicRegistrationType === 'customer'}
                          className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">Select a customer...</option>
                          {customers.map((customer) => (
                            <option key={customer.Id} value={customer.Id}>
                              {customer.Name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          New users will be linked to this customer
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                🌍 Timezone Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Default System Timezone
                  </label>
                  <select
                    value={settings.defaultTimezone}
                    onChange={(e) => handleChange('defaultTimezone', e.target.value)}
                    className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    This timezone will be used as the default for all users who have not set their own timezone preference.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ FEATURES & AI â”€â”€ */}
        {activeTab === 'features' && (
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                🧩 Feature Toggles
              </h3>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.frontpageEnabled !== 'false'}
                    onChange={(e) => handleChange('frontpageEnabled', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Enable Front Page
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      When disabled, visiting the root URL redirects directly to the login page.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.internalTicketsEnabled === 'true'}
                    onChange={(e) => handleChange('internalTicketsEnabled', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Enable Internal Ticket System
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Shows/hides internal tickets module globally. Does not disable ticket integration used in tasks.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.memosEnabled === 'true'}
                    onChange={(e) => handleChange('memosEnabled', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Enable Memos Menu
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Only controls visibility of Memos in the navbar.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveTimeEntries === 'true'}
                    onChange={(e) => handleChange('autoApproveTimeEntries', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Auto-approve Time Entries
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      New time entries are created as approved and approved entries remain editable.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveVacations === 'true'}
                    onChange={(e) => handleChange('autoApproveVacations', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Auto-approve Vacations
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      New vacation requests are immediately approved.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveOutOfOffice === 'true'}
                    onChange={(e) => handleChange('autoApproveOutOfOffice', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Auto-approve Out Of Office
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      New out-of-office requests are immediately approved.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                🤖 AI Assistant
              </h3>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.aiAssistantEnabled === 'true'}
                    onChange={(e) => handleChange('aiAssistantEnabled', e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Enable AI Assistant
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Shows/hides AI assistant globally. Requires OpenAI API key configured below.
                    </div>
                  </div>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    OpenAI API Key
                  </label>
                  <PasswordInput
                    ref={openAIApiKeyRef}
                    name="openAIApiKey"
                    placeholder="sk-..."
                    autoComplete="new-password"
                    preventAutofill
                    className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Leave blank to keep the existing key. Only fill in to change it.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      OpenAI Model
                    </label>
                    <select
                      value={settings.openAIModel || 'gpt-4o-mini'}
                      onChange={(e) => handleChange('openAIModel', e.target.value)}
                      className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (default)</option>
                      <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                      <option value="gpt-4.1">gpt-4.1</option>
                      <option value="o4-mini">o4-mini</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Select the model used by the AI assistant backend.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Assistant Behavior
                    </label>
                    <textarea
                      value={settings.openAIBehavior || ''}
                      onChange={(e) => handleChange('openAIBehavior', e.target.value)}
                      rows={3}
                      placeholder="Example: Be concise, use bullet points, and include actionable next steps."
                      className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Optional custom instruction appended to assistant system behavior.
                    </p>
                  </div>
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
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        Auto-create/sync AI Views on Server Startup
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        When enabled, startup ensures AI views exist and applies the SQL definitions below.
                      </div>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 gap-4">
                    {(
                      [
                        { key: 'aiViewSql_vAI_ProjectOpenTasks', label: 'vAI_ProjectOpenTasks' },
                        { key: 'aiViewSql_vAI_UserOpenTasks',    label: 'vAI_UserOpenTasks' },
                        { key: 'aiViewSql_vAI_UserWorkloadBase', label: 'vAI_UserWorkloadBase' },
                        { key: 'aiViewSql_vAI_UserAllocations',  label: 'vAI_UserAllocations' },
                      ] as { key: keyof SystemSettings; label: string }[]
                    ).map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          SQL for <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{label}</code>
                        </label>
                        <textarea
                          value={(settings[key] as string) || ''}
                          onChange={(e) => handleChange(key, e.target.value)}
                          rows={5}
                          placeholder="Leave empty to use the built-in default SELECTâ€¦"
                          className="w-full px-4 py-2 font-mono text-xs border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={handleSyncAiViews}
                      disabled={isSyncingAiViews}
                      className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white"
                    >
                      {isSyncingAiViews ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Syncing...
                        </>
                      ) : '🔄 Sync AI Views Now'}
                    </button>
                    {aiViewsSyncMessage && <span className="text-sm text-green-600 dark:text-green-400">{aiViewsSyncMessage}</span>}
                    {aiViewsSyncError   && <span className="text-sm text-red-600 dark:text-red-400">{aiViewsSyncError}</span>}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* â”€â”€ MAINTENANCE â”€â”€ */}
        {activeTab === 'maintenance' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              🔧 Maintenance
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Administrative utilities for data consistency and migrations.
            </p>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1">Create System Permission Groups</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Creates the default Developer, Support, and Manager permission groups for any organization that is missing them.
                    Safe to run multiple times â€” existing groups are not modified.
                  </p>
                  {migrationResult && (
                    <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                      âœ… Done: {migrationResult.created} groups created, {migrationResult.skipped} already existed.
                    </p>
                  )}
                  {migrationError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">âŒ {migrationError}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleMigrateSystemGroups}
                  disabled={isMigrating}
                  className="flex-shrink-0 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                >
                  {isMigrating ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Running...
                    </>
                  ) : (
                    '🔄 Run Migration'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Button â€” hidden on Maintenance tab (no form fields there) */}
        {activeTab !== 'maintenance' && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>💾 Save Settings</>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

