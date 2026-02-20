'use client';

import { getApiUrl } from '@/lib/api/config';
import { recurringAllocationsApi, RecurringAllocation } from '@/lib/api/recurringAllocations';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';

// Complete list of IANA timezones
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

export default function ProfilePage() {
  const { user, token, isLoading: authLoading, isCustomerUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'info' | 'attachments' | 'workHours' | 'security' | 'emailAlerts' | 'recurringTasks'>('info');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    timezone: '',
  });
  
  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
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
      router.push('/login');
    } else if (user && token) {
      loadUserProfile();
    }
  }, [user, authLoading, router, token]);

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

  const handleDeleteRecurring = async (id: number) => {
    if (!token) return;
    
    if (!confirm('Are you sure you want to delete this recurring task? This will remove all future occurrences.')) {
      return;
    }
    
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

  const handleChangePassword = async () => {
    if (!token) return;
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage('New passwords do not match');
      return;
    }
    
    if (passwordForm.newPassword.length < 6) {
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
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword,
          }),
        }
      );
      
      if (response.ok) {
        setMessage('Password changed successfully!');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
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

        <div className="container mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
                  {user.firstName?.[0] || user.username?.[0] || 'U'}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
                  {user.isAdmin && (
                    <span className="inline-block mt-1 px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      Administrator
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'info'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  👤 Profile Info
                </button>
                {!isCustomerUser && (
                  <button
                    onClick={() => setActiveTab('workHours')}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'workHours'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    ⏰ Work Hours
                  </button>
                )}
                {!isCustomerUser && (
                  <button
                    onClick={() => {
                      setActiveTab('recurringTasks');
                      loadRecurringAllocations();
                    }}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'recurringTasks'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    🔄 Recurring Tasks
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveTab('attachments');
                    loadAttachments();
                  }}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'attachments'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  📎 My Attachments ({attachments.length})
                </button>
                <button
                  onClick={() => setActiveTab('security')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'security'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  🔒 Security
                </button>                <button
                  onClick={() => {
                    setActiveTab('emailAlerts');
                    loadEmailPreferences();
                  }}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'emailAlerts'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  📧 Email Alerts
                </button>              </nav>
            </div>

            {/* Content */}
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
                            setProfileForm({
                              firstName: user.firstName || '',
                              lastName: user.lastName || '',
                              email: user.email || '',
                              timezone: profileForm.timezone || '',
                            });
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
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
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
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  
                  <button
                    onClick={handleChangePassword}
                    disabled={isSaving || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    {isSaving ? 'Changing Password...' : '🔒 Change Password'}
                  </button>
                </div>
              )}

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
                    <div className="overflow-x-auto">
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

              {/* Recurring Task Modal */}
              {showRecurringModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
            </div>
          </div>
        </div>
      </div>
  );
}
