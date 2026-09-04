'use client';

import { getApiUrl } from '@/lib/api/config';
import { recurringAllocationsApi, RecurringAllocation } from '@/lib/api/recurringAllocations';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/old/Navbar';
import ScrollToTopButton from '@/components/old/ScrollToTopButton';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import ConfirmAlertModal from '@/components/old/ConfirmAlertModal';
import ProfileTaskFormVisibility from '@/components/old/profile/ProfileTaskFormVisibility';
import ApiTokensManagement from '@/components/old/admin/ApiTokensManagement';
import { useUrlTab } from '@/hooks/useUrlTab';

const PROFILE_TABS = [
  'info',
  'attachments',
  'workHours',
  'security',
  'apiTokens',
  'emailAlerts',
  'recurringTasks',
  'vacations',
  'outOfOffice',
  'taskForm',
] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];
const TIMEZONES = [
  { value: '', label: 'Use system default' },
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

type LeaveDayPortion = 'full' | 'half';

const normalizeLeaveDayPortion = (value: unknown): LeaveDayPortion => {
  return String(value || '').toLowerCase() === 'half' ? 'half' : 'full';
};

const formatLeaveUnits = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-gray-700 dark:text-gray-200">Loading…</div>
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const { user, token, isLoading: authLoading, isCustomerUser, updateUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useUrlTab<ProfileTab>(PROFILE_TABS, 'info');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    timezone: '',
    countryCode: '',
    regionCode: '',
    navbarMenuLayout: 'top',
    navbarLeftMode: 'fixed',
    navbarLeftCollapsed: false,
    dashboardCalendarInOverview: true,
    hoursDisplayFormat: 'hms',
    azureAdObjectId: '',
  });
  const [profileRegions, setProfileRegions] = useState<{ code: string; name: string }[]>([]);
  
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [canChangePassword, setCanChangePassword] = useState(false);

  const syncPasswordFormState = () => {
    const currentPassword = readPasswordInput(currentPasswordRef);
    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);
    setCanChangePassword(
      currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0
    );
  };
  
  // Work Hours state
  const [workHours, setWorkHours] = useState({
    monday: 8,
    tuesday: 8,
    wednesday: 8,
    thursday: 8,
    friday: 8,
    saturday: 0,
    sunday: 0,
  });
  const [workStartTimes, setWorkStartTimes] = useState({
    monday: '09:00',
    tuesday: '09:00',
    wednesday: '09:00',
    thursday: '09:00',
    friday: '09:00',
    saturday: '09:00',
    sunday: '09:00',
  });
  const [lunchTime, setLunchTime] = useState('12:00');
  const [lunchDuration, setLunchDuration] = useState(60);
  const [hobbyStartTimes, setHobbyStartTimes] = useState({
    monday: '19:00',
    tuesday: '19:00',
    wednesday: '19:00',
    thursday: '19:00',
    friday: '19:00',
    saturday: '10:00',
    sunday: '10:00',
  });
  const [hobbyHours, setHobbyHours] = useState({
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 4,
    sunday: 4,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Email preferences state
  const [emailPreferences, setEmailPreferences] = useState<any[]>([]);
  const [isSavingEmailPrefs, setIsSavingEmailPrefs] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState<string | null>(null);

  const [vacationEntries, setVacationEntries] = useState<any[]>([]);
  const [vacationSummary, setVacationSummary] = useState({
    annualTotal: 22,
    approvedDays: 0,
    pendingDays: 0,
    reservedDays: 0,
    remainingDays: 22,
    isOverLimit: false,
  });
  const [vacationStartDate, setVacationStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [vacationEndDate, setVacationEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [vacationDayPortion, setVacationDayPortion] = useState<LeaveDayPortion>('full');
  const [vacationNotes, setVacationNotes] = useState('');
  const [isSavingVacation, setIsSavingVacation] = useState(false);
  const [vacationDeleteTarget, setVacationDeleteTarget] = useState<{ id: number; date: string } | null>(null);
  const [recurringDeleteId, setRecurringDeleteId] = useState<number | null>(null);

  const [outOfOfficeEntries, setOutOfOfficeEntries] = useState<any[]>([]);
  const [outOfOfficeSummary, setOutOfOfficeSummary] = useState({
    approvedDays: 0,
    pendingDays: 0,
    rejectedDays: 0,
    reservedDays: 0,
  });
  const [outOfOfficeStartDate, setOutOfOfficeStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [outOfOfficeEndDate, setOutOfOfficeEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [outOfOfficeDayPortion, setOutOfOfficeDayPortion] = useState<LeaveDayPortion>('full');
  const [outOfOfficeNotes, setOutOfOfficeNotes] = useState('');
  const [isSavingOutOfOffice, setIsSavingOutOfOffice] = useState(false);
  const [outOfOfficeDeleteTarget, setOutOfOfficeDeleteTarget] = useState<{ id: number; date: string } | null>(null);

  // Recurring Tasks state
  const [recurringAllocations, setRecurringAllocations] = useState<RecurringAllocation[]>([]);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringAllocation | null>(null);
  const [recurringError, setRecurringError] = useState('');
  const [recurringForm, setRecurringForm] = useState({
    title: '',
    description: '',
    recurrenceType: 'daily',
    recurrenceInterval: 1,
    daysOfWeek: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    startTime: '09:00',
    endTime: '17:00',
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(oldPath('/login'));
    } else if (user && token) {
      loadUserProfile();
    }
  }, [user, authLoading, router, token]);

  useEffect(() => {
    loadProfileRegions(profileForm.countryCode);
  }, [profileForm.countryCode, token]);

  const loadUserProfile = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/profile`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const profile = data.user;
        
        setWorkHours({
          monday: profile.WorkHoursMonday || 8,
          tuesday: profile.WorkHoursTuesday || 8,
          wednesday: profile.WorkHoursWednesday || 8,
          thursday: profile.WorkHoursThursday || 8,
          friday: profile.WorkHoursFriday || 8,
          saturday: profile.WorkHoursSaturday || 0,
          sunday: profile.WorkHoursSunday || 0,
        });
        setWorkStartTimes({
          monday: profile.WorkStartMonday || '09:00',
          tuesday: profile.WorkStartTuesday || '09:00',
          wednesday: profile.WorkStartWednesday || '09:00',
          thursday: profile.WorkStartThursday || '09:00',
          friday: profile.WorkStartFriday || '09:00',
          saturday: profile.WorkStartSaturday || '09:00',
          sunday: profile.WorkStartSunday || '09:00',
        });
        setLunchTime(profile.LunchTime || '12:00');
        setLunchDuration(profile.LunchDuration || 60);
        setHobbyStartTimes({
          monday: profile.HobbyStartMonday || '19:00',
          tuesday: profile.HobbyStartTuesday || '19:00',
          wednesday: profile.HobbyStartWednesday || '19:00',
          thursday: profile.HobbyStartThursday || '19:00',
          friday: profile.HobbyStartFriday || '19:00',
          saturday: profile.HobbyStartSaturday || '10:00',
          sunday: profile.HobbyStartSunday || '10:00',
        });
        setHobbyHours({
          monday: profile.HobbyHoursMonday || 0,
          tuesday: profile.HobbyHoursTuesday || 0,
          wednesday: profile.HobbyHoursWednesday || 0,
          thursday: profile.HobbyHoursThursday || 0,
          friday: profile.HobbyHoursFriday || 0,
          saturday: profile.HobbyHoursSaturday || 4,
          sunday: profile.HobbyHoursSunday || 4,
        });
        
        // Set profile form
        setProfileForm({
          firstName: profile.FirstName || '',
          lastName: profile.LastName || '',
          email: profile.Email || '',
          timezone: profile.Timezone || '',
          countryCode: profile.CountryCode || '',
          regionCode: profile.RegionCode || '',
          navbarMenuLayout: (profile.NavbarMenuLayout || 'top') === 'left' ? 'left' : 'top',
          navbarLeftMode: (profile.NavbarLeftMode || 'fixed') === 'floating' ? 'floating' : 'fixed',
          navbarLeftCollapsed: !!profile.NavbarLeftCollapsed,
          dashboardCalendarInOverview: Number(profile.DashboardCalendarInOverview ?? 1) === 1,
          hoursDisplayFormat: (profile.HoursDisplayFormat || 'hms') === 'decimal' ? 'decimal' : 'hms',
          azureAdObjectId: profile.AzureAdObjectId || '',
        });
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  };

  const loadAttachments = async () => {
    if (!token || !user) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/${user.id}/attachments`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAttachments(data.attachments || []);
      }
    } catch (err: any) {
      console.error('Failed to load attachments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmailPreferences = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/email-preferences`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setEmailPreferences(data.preferences || []);
      }
    } catch (err: any) {
      console.error('Failed to load email preferences:', err);
    }
  };

  const loadVacationData = async () => {
    if (!token) return;
    try {
      const year = new Date().getFullYear();
      const response = await fetch(`${getApiUrl()}/api/vacations/my?year=${year}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load vacations');
      }

      const data = await response.json();
      setVacationEntries(data.entries || []);
      setVacationSummary({
        annualTotal: Number(data.annualTotal || 22),
        approvedDays: Number(data.approvedDays || 0),
        pendingDays: Number(data.pendingDays || 0),
        reservedDays: Number(data.reservedDays || 0),
        remainingDays: Number(data.remainingDays || 0),
        isOverLimit: !!data.isOverLimit,
      });
    } catch (err: any) {
      setMessage(err.message || 'Failed to load vacations');
    }
  };

  const getVacationRequestDays = () => {
    const start = new Date(`${vacationStartDate}T12:00:00`);
    const end = new Date(`${vacationEndDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  };

  const getVacationRequestUnits = () => {
    const days = getVacationRequestDays();
    const multiplier = vacationDayPortion === 'half' ? 0.5 : 1;
    return days * multiplier;
  };

  const handleRequestVacation = async () => {
    if (!token) return;
    const requestDays = getVacationRequestDays();

    if (requestDays <= 0) {
      setMessage('Invalid vacation date range');
      return;
    }

    setIsSavingVacation(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/vacations/my/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: vacationStartDate,
          endDate: vacationEndDate,
          dayPortion: vacationDayPortion,
          notes: vacationNotes,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit vacation request');
      }

      const exceededDates = Array.isArray(data.exceededDates) ? data.exceededDates : [];
      const nonWorkingDates = Array.isArray(data.nonWorkingDates) ? data.nonWorkingDates : [];
      const exceededSuffix = exceededDates.length > 0
        ? ` · Exceeded days: ${exceededDates.join(', ')}`
        : '';
      const nonWorkingSuffix = nonWorkingDates.length > 0
        ? ` · Non-working days skipped: ${nonWorkingDates.join(', ')}`
        : '';

      setMessage(`Vacation request submitted (${data.created || 0} added${data.skipped ? `, ${data.skipped} duplicate` : ''}${data.exceeded ? `, ${data.exceeded} exceeded` : ''}${data.nonWorkingSkipped ? `, ${data.nonWorkingSkipped} non-working` : ''})${exceededSuffix}${nonWorkingSuffix}`);
      setVacationNotes('');
      setVacationDayPortion('full');
      await loadVacationData();
    } catch (err: any) {
      setMessage(err.message || 'Failed to submit vacation request');
    } finally {
      setIsSavingVacation(false);
    }
  };

  const handleDeleteMyVacation = async (vacationId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/vacations/${vacationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete vacation day');
      }

      setMessage('Vacation day deleted');
      await loadVacationData();
    } catch (err: any) {
      setMessage(err.message || 'Failed to delete vacation day');
    }
  };

  const confirmDeleteMyVacation = async () => {
    if (!vacationDeleteTarget) return;
    const vacationId = vacationDeleteTarget.id;
    setVacationDeleteTarget(null);
    await handleDeleteMyVacation(vacationId);
  };

  const loadOutOfOfficeData = async () => {
    if (!token) return;
    try {
      const year = new Date().getFullYear();
      const response = await fetch(`${getApiUrl()}/api/out-of-office/my?year=${year}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load out-of-office');
      }

      const data = await response.json();
      const normalizedEntries = (data.entries || []).map((entry: any) => ({
        ...entry,
        VacationDate: entry.VacationDate || entry.OutOfOfficeDate,
      }));

      setOutOfOfficeEntries(normalizedEntries);
      setOutOfOfficeSummary({
        approvedDays: Number(data.approvedDays || 0),
        pendingDays: Number(data.pendingDays || 0),
        rejectedDays: Number(data.rejectedDays || 0),
        reservedDays: Number(data.reservedDays || 0),
      });
    } catch (err: any) {
      setMessage(err.message || 'Failed to load out-of-office');
    }
  };

  const getOutOfOfficeRequestDays = () => {
    const start = new Date(`${outOfOfficeStartDate}T12:00:00`);
    const end = new Date(`${outOfOfficeEndDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  };

  const getOutOfOfficeRequestUnits = () => {
    const days = getOutOfOfficeRequestDays();
    const multiplier = outOfOfficeDayPortion === 'half' ? 0.5 : 1;
    return days * multiplier;
  };

  const handleRequestOutOfOffice = async () => {
    if (!token) return;
    const requestDays = getOutOfOfficeRequestDays();

    if (requestDays <= 0) {
      setMessage('Invalid out-of-office date range');
      return;
    }

    setIsSavingOutOfOffice(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/out-of-office/my/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: outOfOfficeStartDate,
          endDate: outOfOfficeEndDate,
          dayPortion: outOfOfficeDayPortion,
          notes: outOfOfficeNotes,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit out-of-office request');
      }

      const nonWorkingDates = Array.isArray(data.nonWorkingDates) ? data.nonWorkingDates : [];
      const nonWorkingSuffix = nonWorkingDates.length > 0
        ? ` · Non-working days skipped: ${nonWorkingDates.join(', ')}`
        : '';

      setMessage(`Out-of-office request submitted (${data.created || 0} added${data.skipped ? `, ${data.skipped} duplicate` : ''}${data.nonWorkingSkipped ? `, ${data.nonWorkingSkipped} non-working` : ''})${nonWorkingSuffix}`);
      setOutOfOfficeNotes('');
      setOutOfOfficeDayPortion('full');
      await loadOutOfOfficeData();
    } catch (err: any) {
      setMessage(err.message || 'Failed to submit out-of-office request');
    } finally {
      setIsSavingOutOfOffice(false);
    }
  };

  const handleDeleteMyOutOfOffice = async (outOfOfficeId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/out-of-office/${outOfOfficeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete out-of-office day');
      }

      setMessage('Out-of-office day deleted');
      await loadOutOfOfficeData();
    } catch (err: any) {
      setMessage(err.message || 'Failed to delete out-of-office day');
    }
  };

  const confirmDeleteMyOutOfOffice = async () => {
    if (!outOfOfficeDeleteTarget) return;
    const outOfOfficeId = outOfOfficeDeleteTarget.id;
    setOutOfOfficeDeleteTarget(null);
    await handleDeleteMyOutOfOffice(outOfOfficeId);
  };

  const saveEmailPreferences = async () => {
    if (!token) return;
    
    setIsSavingEmailPrefs(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/email-preferences`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ preferences: emailPreferences }),
        }
      );
      
      if (response.ok) {
        setMessage('Email preferences saved successfully');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save email preferences');
      }
    } catch (err: any) {
      setMessage('Failed to save email preferences');
    } finally {
      setIsSavingEmailPrefs(false);
    }
  };

  const toggleEmailPreference = (type: string) => {
    setEmailPreferences(prefs =>
      prefs.map(pref =>
        pref.type === type
          ? { ...pref, emailEnabled: !pref.emailEnabled }
          : pref
      )
    );
  };

  const sendTestSummaryEmail = async (type: 'daily' | 'weekly') => {
    if (!token) return;
    
    const summaryType = type === 'daily' ? 'daily_work_summary' : 'weekly_work_summary';
    setSendingTestEmail(summaryType);
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/email-preferences/test-summary/${type}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'Test email sent successfully!');
      } else {
        setMessage(data.message || 'Failed to send test email');
      }
      setTimeout(() => setMessage(''), 5000);
    } catch (err: any) {
      setMessage('Failed to send test email');
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setSendingTestEmail(null);
    }
  };

  // Recurring Allocations Functions
  const loadRecurringAllocations = async () => {
    if (!token || !user) return;
    
    try {
      const allocations = await recurringAllocationsApi.getUserAllocations(user.id, token);
      setRecurringAllocations(allocations);
    } catch (err: any) {
      console.error('Failed to load recurring allocations:', err);
      setMessage('Failed to load recurring tasks');
    }
  };

  const handleSaveRecurring = async () => {
    if (!token || !user) return;
    
    setRecurringError('');
    
    // Validate required fields
    if (!recurringForm.title.trim()) {
      setRecurringError('Title is required');
      return;
    }
    if (!recurringForm.recurrenceType) {
      setRecurringError('Recurrence type is required');
      return;
    }
    if (!recurringForm.startDate) {
      setRecurringError('Start date is required');
      return;
    }
    if (!recurringForm.startTime) {
      setRecurringError('Start time is required');
      return;
    }
    if (!recurringForm.endTime) {
      setRecurringError('End time is required');
      return;
    }
    
    // Validate custom_days requires daysOfWeek
    if (recurringForm.recurrenceType === 'custom_days' && !recurringForm.daysOfWeek) {
      setRecurringError('Please select at least one day of the week');
      return;
    }
    
    // Validate interval types require interval value
    if (['interval_days', 'interval_weeks', 'interval_months'].includes(recurringForm.recurrenceType)) {
      if (!recurringForm.recurrenceInterval || recurringForm.recurrenceInterval < 1) {
        setRecurringError('Interval must be at least 1');
        return;
      }
    }
    
    setIsSaving(true);
    
    try {
      const allocationData: Partial<RecurringAllocation> = {
        UserId: user.id,
        Title: recurringForm.title.trim(),
        Description: recurringForm.description.trim() || undefined,
        RecurrenceType: recurringForm.recurrenceType,
        RecurrenceInterval: recurringForm.recurrenceInterval || undefined,
        DaysOfWeek: recurringForm.daysOfWeek || undefined,
        StartDate: recurringForm.startDate,
        EndDate: recurringForm.endDate || undefined,
        StartTime: recurringForm.startTime,
        EndTime: recurringForm.endTime,
      };

      console.log('Saving recurring allocation:', allocationData);

      if (editingRecurring) {
        await recurringAllocationsApi.update(editingRecurring.Id, allocationData, token);
        setMessage('Recurring task updated successfully');
      } else {
        await recurringAllocationsApi.create(allocationData, token);
        setMessage('Recurring task created successfully');
      }
      
      await loadRecurringAllocations();
      setShowRecurringModal(false);
      setEditingRecurring(null);
      setRecurringError('');
      resetRecurringForm();
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      console.error('Error saving recurring task:', err);
      setRecurringError(err.message || 'Failed to save recurring task');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecurring = (id: number) => {
    if (!token) return;
    setRecurringDeleteId(id);
  };

  const confirmDeleteRecurring = async () => {
    if (!token || recurringDeleteId === null) return;
    const id = recurringDeleteId;
    setRecurringDeleteId(null);
    try {
      await recurringAllocationsApi.delete(id, token);
      setMessage('Recurring task deleted successfully');
      await loadRecurringAllocations();
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage('Failed to delete recurring task');
    }
  };

  const handleEditRecurring = (allocation: RecurringAllocation) => {
    setEditingRecurring(allocation);
    setRecurringForm({
      title: allocation.Title,
      description: allocation.Description || '',
      recurrenceType: allocation.RecurrenceType,
      recurrenceInterval: allocation.RecurrenceInterval || 1,
      daysOfWeek: allocation.DaysOfWeek || '',
      startDate: allocation.StartDate,
      endDate: allocation.EndDate || '',
      startTime: allocation.StartTime,
      endTime: allocation.EndTime,
    });
    setShowRecurringModal(true);
  };

  const resetRecurringForm = () => {
    setRecurringForm({
      title: '',
      description: '',
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      daysOfWeek: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      startTime: '09:00',
      endTime: '17:00',
    });
  };

  const getRecurrenceTypeLabel = (type: string, interval?: number, daysOfWeek?: string) => {
    switch (type) {
      case 'daily':
        return 'Every day';
      case 'weekly':
        return 'Every week';
      case 'monthly':
        return 'Every month';
      case 'custom_days':
        if (daysOfWeek) {
          const days = daysOfWeek.split(',').map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseInt(d)]);
          return `Every ${days.join(', ')}`;
        }
        return 'Custom days';
      case 'interval_days':
        return `Every ${interval} day(s)`;
      case 'interval_weeks':
        return `Every ${interval} week(s)`;
      case 'interval_months':
        return `Every ${interval} month(s)`;
      default:
        return type;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    return '📎';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Task': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Ticket': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Project': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'Customer': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'Organization': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const handleDownloadAttachment = async (attachment: any) => {
    if (!token) return;
    
    try {
      let endpoint = '';
      switch (attachment.Type) {
        case 'Task':
          endpoint = `/api/task-attachments/${attachment.Id}`;
          break;
        case 'Ticket':
          endpoint = `/api/ticket-attachments/${attachment.Id}`;
          break;
        case 'Project':
          endpoint = `/api/project-attachments/${attachment.Id}`;
          break;
        case 'Customer':
          endpoint = `/api/customer-attachments/${attachment.Id}`;
          break;
        case 'Organization':
          endpoint = `/api/organization-attachments/${attachment.Id}`;
          break;
        default:
          return;
      }

      const response = await fetch(
        `${getApiUrl()}${endpoint}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const fileData = data.data;
        
        // Convert base64 to blob
        const byteCharacters = atob(fileData.FileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileData.FileType });
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.FileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to download attachment:', err);
    }
  };

  const updateWorkHour = (day: keyof typeof workHours, value: number) => {
    setWorkHours(prev => ({ ...prev, [day]: value }));
  };

  const updateWorkStartTime = (day: keyof typeof workStartTimes, value: string) => {
    setWorkStartTimes(prev => ({ ...prev, [day]: value }));
  };

  const updateHobbyHour = (day: keyof typeof hobbyHours, value: number) => {
    setHobbyHours(prev => ({ ...prev, [day]: value }));
  };

  const updateHobbyStartTime = (day: keyof typeof hobbyStartTimes, value: string) => {
    setHobbyStartTimes(prev => ({ ...prev, [day]: value }));
  };

  const getTotalWeeklyHours = () => {
    return Object.values(workHours).reduce((sum, hours) => sum + (Number(hours) || 0), 0);
  };

  const getTotalWeeklyHobbyHours = () => {
    return Object.values(hobbyHours).reduce((sum, hours) => sum + (Number(hours) || 0), 0);
  };

  const handleSaveWorkHours = async () => {
    if (!token) return;
    
    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/work-hours`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workHours,
            workStartTimes,
            lunchTime,
            lunchDuration,
            hobbyHours,
            hobbyStartTimes,
          }),
        }
      );
      
      if (response.ok) {
        setMessage('Work hours settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        setMessage(data.message || 'Failed to save work hours');
      }
    } catch (err: any) {
      setMessage(err.message || 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!token) return;
    
    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/profile`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(profileForm),
        }
      );
      
      if (response.ok) {
        setMessage('Profile updated successfully!');
        setIsEditingProfile(false);
        updateUser({ hoursDisplayFormat: profileForm.hoursDisplayFormat });
        // Reload to get updated data
        await loadUserProfile();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        setMessage(data.message || 'Failed to update profile');
      }
    } catch (err: any) {
      setMessage(err.message || 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const loadProfileRegions = async (cc: string) => {
    if (!token || !cc) { setProfileRegions([]); return; }
    try {
      const res = await fetch(`${getApiUrl()}/api/holidays/regions/${cc}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfileRegions(data.regions || []);
      } else {
        setProfileRegions([]);
      }
    } catch {
      setProfileRegions([]);
    }
  };

  const handleChangePassword = async () => {
    if (!token) return;
    
    const currentPassword = readPasswordInput(currentPasswordRef);
    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);

    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }
    
    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/change-password`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );
      
      if (response.ok) {
        setMessage('Password changed successfully!');
        clearPasswordInput(currentPasswordRef);
        clearPasswordInput(newPasswordRef);
        clearPasswordInput(confirmPasswordRef);
        setCanChangePassword(false);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        setMessage(data.message || 'Failed to change password');
      }
    } catch (err: any) {
      setMessage(err.message || 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      <div className="flex flex-col md:flex-row w-full mx-auto min-h-[calc(100vh-64px)]">
        {/* Mobile tabs */}
        <div className="md:hidden sticky top-16 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex overflow-x-auto px-2 py-2 gap-1" aria-label="Profile tabs">
            {([
              { id: 'info' as const, label: 'Profile', icon: '👤' },
              { id: 'vacations' as const, label: 'Vacations', icon: '🏖️' },
              { id: 'outOfOffice' as const, label: 'OOO', icon: '🚫' },
              ...(!isCustomerUser
                ? [
                    { id: 'workHours' as const, label: 'Hours', icon: '⏰' },
                    { id: 'recurringTasks' as const, label: 'Recurring', icon: '🔁' },
                  ]
                : []),
              { id: 'attachments' as const, label: 'Files', icon: '📎' },
              { id: 'security' as const, label: 'Security', icon: '🔒' },
              { id: 'apiTokens' as const, label: 'API', icon: '🔑' },
              { id: 'emailAlerts' as const, label: 'Email', icon: '📧' },
              ...(!isCustomerUser ? [{ id: 'taskForm' as const, label: 'Task Form', icon: '📝' }] : []),
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'vacations') loadVacationData();
                  if (tab.id === 'outOfOffice') loadOutOfOfficeData();
                  if (tab.id === 'emailAlerts') loadEmailPreferences();
                  if (tab.id === 'attachments') loadAttachments();
                  if (tab.id === 'recurringTasks') loadRecurringAllocations();
                }}
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
          {/* User Profile Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-3">
                {user.firstName?.[0] || user.username?.[0] || 'U'}
              </div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
              {user.isAdmin && (
                <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                  Administrator
                </span>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            <button
              onClick={() => setActiveTab('info')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'info'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">👤</span>
              <span className="font-medium">Profile Info</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('vacations');
                loadVacationData();
              }}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'vacations'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🏖️</span>
              <span className="font-medium">Vacations</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('outOfOffice');
                loadOutOfOfficeData();
              }}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'outOfOffice'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🚫</span>
              <span className="font-medium">Out Of Office</span>
            </button>

            {!isCustomerUser && (
              <button
                onClick={() => setActiveTab('workHours')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                  activeTab === 'workHours'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-xl">⏰</span>
                <span className="font-medium">Work Hours</span>
              </button>
            )}

            {!isCustomerUser && (
              <button
                onClick={() => {
                  setActiveTab('recurringTasks');
                  loadRecurringAllocations();
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                  activeTab === 'recurringTasks'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-xl">🔄</span>
                <span className="font-medium">Recurring Tasks</span>
              </button>
            )}

            <button
              onClick={() => {
                setActiveTab('attachments');
                loadAttachments();
              }}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'attachments'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">📎</span>
              <span className="font-medium">My Attachments ({attachments.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'security'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🔒</span>
              <span className="font-medium">Security</span>
            </button>

            <button
              onClick={() => setActiveTab('apiTokens')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'apiTokens'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">🔑</span>
              <span className="font-medium">API Tokens</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('emailAlerts');
                loadEmailPreferences();
              }}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                activeTab === 'emailAlerts'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-xl">📧</span>
              <span className="font-medium">Email Alerts</span>
            </button>

            {!isCustomerUser && (
              <button
                onClick={() => setActiveTab('taskForm')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                  activeTab === 'taskForm'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-xl">📝</span>
                <span className="font-medium">Task Form</span>
              </button>
            )}

          </nav>
        </aside>

        {/* Main Content */}
        <main ref={scrollContainerRef} className="flex-1 overflow-auto min-w-0">
          <div className="p-6">
              {message && (
                <div className={`mb-4 p-3 rounded ${
                  message.includes('successfully') || message.includes('Success')
                    ? 'bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400'
                }`}>
                  {message}
                </div>
              )}
              
              {activeTab === 'info' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      Personal Information
                    </h2>
                    {!isEditingProfile ? (
                      <button
                        onClick={() => setIsEditingProfile(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        ✏️ Edit Profile
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setIsEditingProfile(false);
                            loadUserProfile();
                          }}
                          className="px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveProfile}
                          disabled={isSaving}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                        >
                          {isSaving ? 'Saving...' : '💾 Save Changes'}
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Username
                    </label>
                    <p className="text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded">
                      {user.username}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Username cannot be changed</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      First Name
                    </label>
                    {isEditingProfile ? (
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, firstName: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{user.firstName || 'Not set'}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Last Name
                    </label>
                    {isEditingProfile ? (
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, lastName: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{user.lastName || 'Not set'}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    {isEditingProfile ? (
                      <input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{user.email}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Azure AD Object ID
                    </label>
                    {isEditingProfile ? (
                      <>
                        <input
                          type="text"
                          value={profileForm.azureAdObjectId}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, azureAdObjectId: e.target.value }))}
                          placeholder="00000000-0000-0000-0000-000000000000"
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Required to import your Microsoft Teams call records. Find your &quot;oid&quot; at{' '}
                          <a href="https://myaccount.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                            myaccount.microsoft.com
                          </a>{' '}
                          → Profile → Show JSON.
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-900 dark:text-white font-mono text-sm">
                        {profileForm.azureAdObjectId || <span className="text-gray-400 italic">Not set</span>}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Timezone
                    </label>
                    {isEditingProfile ? (
                      <select
                        value={profileForm.timezone}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, timezone: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {TIMEZONES.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileForm.timezone ? TIMEZONES.find(tz => tz.value === profileForm.timezone)?.label || profileForm.timezone : 'System default'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Country
                    </label>
                    {isEditingProfile ? (
                      <input
                        type="text"
                        value={profileForm.countryCode}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase().slice(0, 2);
                          setProfileForm(prev => ({ ...prev, countryCode: val, regionCode: '' }));
                        }}
                        placeholder="e.g. PT, DE, US"
                        maxLength={2}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">{profileForm.countryCode || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Region / Subdivision
                    </label>
                    {isEditingProfile ? (
                      profileRegions.length > 0 ? (
                        <select
                          value={profileForm.regionCode}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, regionCode: e.target.value }))}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">— National (no region) —</option>
                          {profileRegions.map((r) => (
                            <option key={r.code} value={r.code}>{r.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          {profileForm.countryCode
                            ? 'No regional holidays configured for this country'
                            : 'Set a country first to see available regions'}
                        </p>
                      )
                    ) : (
                      <p className="text-gray-900 dark:text-white">{profileForm.regionCode || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Navbar Menu Layout
                    </label>
                    {isEditingProfile ? (
                      <select
                        value={profileForm.navbarMenuLayout}
                        onChange={(e) => setProfileForm(prev => ({
                          ...prev,
                          navbarMenuLayout: e.target.value === 'left' ? 'left' : 'top',
                        }))}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="top">Top (current)</option>
                        <option value="left">Left sidebar</option>
                      </select>
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileForm.navbarMenuLayout === 'left' ? 'Left sidebar' : 'Top (current)'}
                      </p>
                    )}
                  </div>

                  {profileForm.navbarMenuLayout === 'left' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Left Sidebar Mode
                      </label>
                      {isEditingProfile ? (
                        <select
                          value={profileForm.navbarLeftMode}
                          onChange={(e) => setProfileForm(prev => ({
                            ...prev,
                            navbarLeftMode: e.target.value === 'floating' ? 'floating' : 'fixed',
                          }))}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="fixed">Fixed</option>
                          <option value="floating">Floating</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 dark:text-white">
                          {profileForm.navbarLeftMode === 'floating' ? 'Floating' : 'Fixed'}
                        </p>
                      )}
                    </div>
                  )}

                  {profileForm.navbarMenuLayout === 'left' && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Start Sidebar Collapsed</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">You can still expand/collapse from the navbar button.</p>
                      </div>
                      {isEditingProfile ? (
                        <input
                          type="checkbox"
                          checked={profileForm.navbarLeftCollapsed}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, navbarLeftCollapsed: e.target.checked }))}
                          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {profileForm.navbarLeftCollapsed ? 'Yes' : 'No'}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Show Calendar in Dashboard Overview</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">When enabled, calendar appears inside Overview and the separate Dashboard calendar menu is hidden.</p>
                    </div>
                    {isEditingProfile ? (
                      <input
                        type="checkbox"
                        checked={profileForm.dashboardCalendarInOverview}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, dashboardCalendarInOverview: e.target.checked }))}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    ) : (
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {profileForm.dashboardCalendarInOverview ? 'Yes' : 'No'}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Hours Display Format
                    </label>
                    {isEditingProfile ? (
                      <select
                        value={profileForm.hoursDisplayFormat}
                        onChange={(e) => setProfileForm(prev => ({
                          ...prev,
                          hoursDisplayFormat: e.target.value === 'decimal' ? 'decimal' : 'hms',
                        }))}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="hms">hh:MM:ss (e.g. 01:30:00)</option>
                        <option value="decimal">Decimal (e.g. 1.50h)</option>
                      </select>
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileForm.hoursDisplayFormat === 'decimal' ? 'Decimal (e.g. 1.50h)' : 'hh:MM:ss (e.g. 01:30:00)'}
                      </p>
                    )}
                  </div>


                </div>
              )}

              {activeTab === 'security' && (
                <div className="max-w-md space-y-6">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    Change Password
                  </h2>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Password
                    </label>
                    <PasswordInput
                      ref={currentPasswordRef}
                      name="currentPassword"
                      onInput={syncPasswordFormState}
                      autoComplete="current-password"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Password
                    </label>
                    <PasswordInput
                      ref={newPasswordRef}
                      name="newPassword"
                      onInput={syncPasswordFormState}
                      autoComplete="new-password"
                      preventAutofill
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Must be at least 6 characters
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confirm New Password
                    </label>
                    <PasswordInput
                      ref={confirmPasswordRef}
                      name="confirmPassword"
                      onInput={syncPasswordFormState}
                      autoComplete="new-password"
                      preventAutofill
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  
                  <button
                    onClick={handleChangePassword}
                    disabled={isSaving || !canChangePassword}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    {isSaving ? 'Changing Password...' : '🔒 Change Password'}
                  </button>
                </div>
              )}

              {activeTab === 'apiTokens' && <ApiTokensManagement mode="self" />}

              {activeTab === 'workHours' && (
                <div>
                  <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
                    Work Hours Settings
                  </h2>

                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Configure your work and hobby schedule for each day of the week.
                    </p>

                    {/* Grid Table */}
                    <div className="overflow-x-auto" data-grid-enhancer-ignore="true">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700">
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Day of Week
                            </th>
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-center text-sm font-semibold text-blue-700 dark:text-blue-300" colSpan={2}>
                              💼 Work
                            </th>
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-center text-sm font-semibold text-purple-700 dark:text-purple-300" colSpan={2}>
                              🎨 Hobby
                            </th>
                          </tr>
                          <tr className="bg-gray-50 dark:bg-gray-700">
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-2"></th>
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                              Start Time
                            </th>
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                              Hours
                            </th>
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-xs font-medium text-purple-600 dark:text-purple-400">
                              Start Time
                            </th>
                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-xs font-medium text-purple-600 dark:text-purple-400">
                              Hours
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { key: 'monday', label: 'Monday', icon: '📅' },
                            { key: 'tuesday', label: 'Tuesday', icon: '📅' },
                            { key: 'wednesday', label: 'Wednesday', icon: '📅' },
                            { key: 'thursday', label: 'Thursday', icon: '📅' },
                            { key: 'friday', label: 'Friday', icon: '📅' },
                            { key: 'saturday', label: 'Saturday', icon: '📅' },
                            { key: 'sunday', label: 'Sunday', icon: '📅' },
                          ].map(({ key, label, icon }) => (
                            <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{icon}</span>
                                  <span className="font-medium text-gray-900 dark:text-white">{label}</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                                <input
                                  type="time"
                                  value={workStartTimes[key as keyof typeof workStartTimes]}
                                  onChange={(e) => updateWorkStartTime(key as keyof typeof workStartTimes, e.target.value)}
                                  className="w-28 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                              </td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="24"
                                    step="0.5"
                                    value={workHours[key as keyof typeof workHours]}
                                    onChange={(e) => updateWorkHour(key as keyof typeof workHours, parseFloat(e.target.value) || 0)}
                                    className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                  />
                                  <span className="text-xs text-gray-500 dark:text-gray-400">h</span>
                                </div>
                              </td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 bg-purple-50/50 dark:bg-purple-900/10">
                                <input
                                  type="time"
                                  value={hobbyStartTimes[key as keyof typeof hobbyStartTimes]}
                                  onChange={(e) => updateHobbyStartTime(key as keyof typeof hobbyStartTimes, e.target.value)}
                                  className="w-28 px-2 py-1 border border-purple-300 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                              </td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 bg-purple-50/50 dark:bg-purple-900/10">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="24"
                                    step="0.5"
                                    value={hobbyHours[key as keyof typeof hobbyHours]}
                                    onChange={(e) => updateHobbyHour(key as keyof typeof hobbyHours, parseFloat(e.target.value) || 0)}
                                    className="w-16 px-2 py-1 border border-purple-300 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                  />
                                  <span className="text-xs text-purple-500 dark:text-purple-400">h</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-100 dark:bg-gray-700">
                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                              Weekly Totals:
                            </td>
                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-3"></td>
                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">
                              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {getTotalWeeklyHours().toFixed(1)}h
                              </span>
                            </td>
                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 bg-purple-50/50 dark:bg-purple-900/10"></td>
                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-3 bg-purple-50/50 dark:bg-purple-900/10">
                              <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                {getTotalWeeklyHobbyHours().toFixed(1)}h
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Lunch Break Settings */}
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        🍽️ Lunch Break Settings
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Lunch Time
                          </label>
                          <input
                            type="time"
                            value={lunchTime}
                            onChange={(e) => setLunchTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            When your lunch break typically starts
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Lunch Duration
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="180"
                              step="15"
                              value={lunchDuration}
                              onChange={(e) => setLunchDuration(parseInt(e.target.value) || 0)}
                              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <span className="text-sm text-gray-500 dark:text-gray-400">minutes</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            How long your lunch break usually lasts
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={handleSaveWorkHours}
                        disabled={isSaving}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                      >
                        {isSaving ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'attachments' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    My Uploaded Files
                  </h2>
                  
                  {isLoading ? (
                    <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                  ) : attachments.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                      You haven't uploaded any files yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {attachments.map((attachment: any) => (
                        <div
                          key={`${attachment.Type}-${attachment.Id}`}
                          className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                        >
                          <div className="flex items-start gap-4">
                            <span className="text-3xl flex-shrink-0">{getFileIcon(attachment.FileType)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getTypeColor(attachment.Type)}`}>
                                  {attachment.Type}
                                </span>
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                  {attachment.EntityName}
                                </span>
                                {attachment.ProjectName && (
                                  <span className="text-sm text-gray-500 dark:text-gray-500">
                                    · {attachment.ProjectName}
                                  </span>
                                )}
                              </div>
                              <div className="font-medium text-gray-900 dark:text-white truncate">
                                {attachment.FileName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {formatFileSize(attachment.FileSize)} · {new Date(attachment.CreatedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDownloadAttachment(attachment)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex-shrink-0"
                              title="Download"
                            >
                              ⬇️ Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'taskForm' && token && !isCustomerUser && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Task Form</h2>
                  <ProfileTaskFormVisibility token={token} />
                </div>
              )}

              {/* Email Alerts Tab */}
              {activeTab === 'emailAlerts' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email Alert Preferences</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Choose which notifications you want to receive via email
                      </p>
                    </div>
                    <button
                      onClick={saveEmailPreferences}
                      disabled={isSavingEmailPrefs}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                    >
                      {isSavingEmailPrefs ? 'Saving...' : 'Save Preferences'}
                    </button>
                  </div>

                  {/* Group preferences by category */}
                  {['Tasks', 'Projects', 'Tickets', 'Planning', 'Summaries'].map(category => {
                    const categoryPrefs = emailPreferences.filter(pref => pref.category === category);
                    if (categoryPrefs.length === 0) return null;

                    return (
                      <div key={category} className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                          {category === 'Summaries' ? '📊 ' + category : category}
                        </h3>
                        <div className="space-y-3">
                          {categoryPrefs.map(pref => (
                            <div
                              key={pref.type}
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <label className="flex items-center cursor-pointer flex-1">
                                  <input
                                    type="checkbox"
                                    checked={pref.emailEnabled}
                                    onChange={() => toggleEmailPreference(pref.type)}
                                    className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                  />
                                  <div className="ml-3 flex-1">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                      {pref.label}
                                    </span>
                                    {pref.description && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {pref.description}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Test button for summary emails */}
                                {(pref.type === 'daily_work_summary' || pref.type === 'weekly_work_summary') && (
                                  <button
                                    onClick={() => sendTestSummaryEmail(pref.type === 'daily_work_summary' ? 'daily' : 'weekly')}
                                    disabled={sendingTestEmail !== null}
                                    className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {sendingTestEmail === pref.type ? (
                                      <span className="flex items-center gap-1">
                                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Sending...
                                      </span>
                                    ) : (
                                      '📧 Send Test'
                                    )}
                                  </button>
                                )}
                                <span className={`text-xs px-2 py-1 rounded ${
                                  pref.emailEnabled
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                                }`}>
                                  {pref.emailEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {emailPreferences.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Loading preferences...
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'recurringTasks' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Recurring Tasks</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Define recurring time blocks that are automatically allocated to prevent scheduling conflicts
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingRecurring(null);
                        resetRecurringForm();
                        setShowRecurringModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      <span>➕</span> New Recurring Task
                    </button>
                  </div>

                  {recurringAllocations.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <p className="text-lg mb-2">No recurring tasks defined</p>
                      <p className="text-sm">Create a recurring task to automatically block time on your calendar</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recurringAllocations.map(allocation => (
                        <div
                          key={allocation.Id}
                          className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900 dark:text-white">{allocation.Title}</h3>
                              {!allocation.IsActive && (
                                <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {allocation.Description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{allocation.Description}</p>
                            )}
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                🔄 {getRecurrenceTypeLabel(allocation.RecurrenceType, allocation.RecurrenceInterval, allocation.DaysOfWeek)}
                              </span>
                              <span className="flex items-center gap-1">
                                ⏰ {allocation.StartTime} - {allocation.EndTime}
                              </span>
                              <span className="flex items-center gap-1">
                                📅 {new Date(allocation.StartDate).toLocaleDateString()}
                                {allocation.EndDate && ` - ${new Date(allocation.EndDate).toLocaleDateString()}`}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => handleEditRecurring(allocation)}
                              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRecurring(allocation.Id)}
                              className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'vacations' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Vacation Management</h2>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Annual Total</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{vacationSummary.annualTotal}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Approved</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{vacationSummary.approvedDays}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
                      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{vacationSummary.pendingDays}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Remaining</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{vacationSummary.remainingDays}</p>
                    </div>
                  </div>

                  {vacationSummary.isOverLimit && (
                    <div className="p-3 rounded border border-red-400 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                      Warning: Vacation allocation exceeds annual limit.
                    </div>
                  )}

                  <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Request Vacation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={vacationStartDate}
                          onChange={(e) => setVacationStartDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                        <input
                          type="date"
                          value={vacationEndDate}
                          onChange={(e) => setVacationEndDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day Portion</label>
                      <select
                        value={vacationDayPortion}
                        onChange={(e) => setVacationDayPortion(e.target.value as LeaveDayPortion)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="full">Full Day (default)</option>
                        <option value="half">Half Day</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                      <input
                        type="text"
                        value={vacationNotes}
                        onChange={(e) => setVacationNotes(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Optional notes"
                      />
                    </div>
                    <button
                      onClick={handleRequestVacation}
                      disabled={isSavingVacation}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
                    >
                      {isSavingVacation ? 'Submitting...' : `Request ${formatLeaveUnits(getVacationRequestUnits())} day(s)`}
                    </button>
                  </div>

                  <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">My Vacation Days</h3>
                    {vacationEntries.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No vacation records yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {vacationEntries.map((entry) => (
                          <div key={entry.Id} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50">
                            <span className="text-sm text-gray-900 dark:text-white">{String(entry.VacationDate).split('T')[0]}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100">
                                {normalizeLeaveDayPortion(entry.DayPortion) === 'half' ? 'Half Day' : 'Full Day'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${String(entry.Status).toLowerCase() === 'approved'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : String(entry.Status).toLowerCase() === 'rejected'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                {entry.Status}
                              </span>
                              <button
                                onClick={() => setVacationDeleteTarget({ id: entry.Id, date: String(entry.VacationDate).split('T')[0] })}
                                className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'outOfOffice' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Out Of Office Management</h2>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Approved</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{outOfOfficeSummary.approvedDays}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
                      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{outOfOfficeSummary.pendingDays}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Rejected</p>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">{outOfOfficeSummary.rejectedDays}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Reserved</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{outOfOfficeSummary.reservedDays}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Request Out Of Office</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={outOfOfficeStartDate}
                          onChange={(e) => setOutOfOfficeStartDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                        <input
                          type="date"
                          value={outOfOfficeEndDate}
                          onChange={(e) => setOutOfOfficeEndDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day Portion</label>
                      <select
                        value={outOfOfficeDayPortion}
                        onChange={(e) => setOutOfOfficeDayPortion(e.target.value as LeaveDayPortion)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="full">Full Day (default)</option>
                        <option value="half">Half Day</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                      <input
                        type="text"
                        value={outOfOfficeNotes}
                        onChange={(e) => setOutOfOfficeNotes(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Optional notes"
                      />
                    </div>
                    <button
                      onClick={handleRequestOutOfOffice}
                      disabled={isSavingOutOfOffice}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-gray-400 text-white rounded-lg"
                    >
                      {isSavingOutOfOffice ? 'Submitting...' : `Request ${formatLeaveUnits(getOutOfOfficeRequestUnits())} day(s)`}
                    </button>
                  </div>

                  <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">My Out Of Office Days</h3>
                    {outOfOfficeEntries.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No out-of-office records yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {outOfOfficeEntries.map((entry) => (
                          <div key={entry.Id} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50">
                            <span className="text-sm text-gray-900 dark:text-white">{String(entry.OutOfOfficeDate || entry.VacationDate).split('T')[0]}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100">
                                {normalizeLeaveDayPortion(entry.DayPortion) === 'half' ? 'Half Day' : 'Full Day'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${String(entry.Status).toLowerCase() === 'approved'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : String(entry.Status).toLowerCase() === 'rejected'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                {entry.Status}
                              </span>
                              <button
                                onClick={() => setOutOfOfficeDeleteTarget({ id: entry.Id, date: String(entry.OutOfOfficeDate || entry.VacationDate).split('T')[0] })}
                                className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recurring Task Modal */}
              {showRecurringModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                        {editingRecurring ? 'Edit Recurring Task' : 'New Recurring Task'}
                      </h2>

                      {recurringError && (
                        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                          {recurringError}
                        </div>
                      )}

                      <div className="space-y-4">
                        {/* Title */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={recurringForm.title}
                            onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="e.g., Team Meeting, Gym Time"
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Description
                          </label>
                          <textarea
                            value={recurringForm.description}
                            onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })}
                            rows={2}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Optional description"
                          />
                        </div>

                        {/* Recurrence Type */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Recurrence Pattern *
                          </label>
                          <select
                            value={recurringForm.recurrenceType}
                            onChange={(e) => setRecurringForm({ ...recurringForm, recurrenceType: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="daily">Every day</option>
                            <option value="weekly">Every week</option>
                            <option value="monthly">Every month</option>
                            <option value="custom_days">Specific days of the week</option>
                            <option value="interval_days">Every X days</option>
                            <option value="interval_weeks">Every X weeks</option>
                            <option value="interval_months">Every X months</option>
                          </select>
                        </div>

                        {/* Interval (for interval_days/weeks/months) */}
                        {['interval_days', 'interval_weeks', 'interval_months'].includes(recurringForm.recurrenceType) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Interval *
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={recurringForm.recurrenceInterval}
                              onChange={(e) => setRecurringForm({ ...recurringForm, recurrenceInterval: parseInt(e.target.value) || 1 })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        )}

                        {/* Days of Week (for custom_days) */}
                        {recurringForm.recurrenceType === 'custom_days' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Select Days *
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => {
                                const selectedDays = recurringForm.daysOfWeek.split(',').filter(d => d);
                                const isSelected = selectedDays.includes(String(index));
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => {
                                      let days = recurringForm.daysOfWeek.split(',').filter(d => d);
                                      if (isSelected) {
                                        days = days.filter(d => d !== String(index));
                                      } else {
                                        days.push(String(index));
                                      }
                                      setRecurringForm({ ...recurringForm, daysOfWeek: days.join(',') });
                                    }}
                                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                                      isSelected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                    }`}
                                  >
                                    {day.substring(0, 3)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Time Range */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Start Time *
                            </label>
                            <input
                              type="time"
                              value={recurringForm.startTime}
                              onChange={(e) => setRecurringForm({ ...recurringForm, startTime: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              End Time *
                            </label>
                            <input
                              type="time"
                              value={recurringForm.endTime}
                              onChange={(e) => setRecurringForm({ ...recurringForm, endTime: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        </div>

                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Start Date *
                            </label>
                            <input
                              type="date"
                              value={recurringForm.startDate}
                              onChange={(e) => setRecurringForm({ ...recurringForm, startDate: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              End Date (optional)
                            </label>
                            <input
                              type="date"
                              value={recurringForm.endDate}
                              onChange={(e) => setRecurringForm({ ...recurringForm, endDate: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          This recurring task will automatically block time on your calendar to prevent scheduling conflicts.
                        </p>
                      </div>

                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={() => {
                            setShowRecurringModal(false);
                            setEditingRecurring(null);
                            setRecurringError('');
                            resetRecurringForm();
                          }}
                          className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveRecurring}
                          disabled={isSaving || !recurringForm.title.trim() || !recurringForm.startTime || !recurringForm.endTime || !recurringForm.startDate}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                        >
                          {isSaving ? 'Saving...' : 'Save Recurring Task'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {vacationDeleteTarget && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Vacation Day</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                        Are you sure you want to delete your vacation day on{' '}
                        <span className="font-medium">{vacationDeleteTarget.date}</span>?
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setVacationDeleteTarget(null)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmDeleteMyVacation}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {outOfOfficeDeleteTarget && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Out Of Office Day</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                        Are you sure you want to delete your out-of-office day on{' '}
                        <span className="font-medium">{outOfOfficeDeleteTarget.date}</span>?
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setOutOfOfficeDeleteTarget(null)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmDeleteMyOutOfOffice}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

          </div>
        </main>
      </div>

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />

      <ConfirmAlertModal
        isOpen={recurringDeleteId !== null}
        type="confirm"
        title="Delete recurring task"
        message="Are you sure you want to delete this recurring task? This will remove all future occurrences."
        onClose={() => setRecurringDeleteId(null)}
        onConfirm={() => void confirmDeleteRecurring()}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}
