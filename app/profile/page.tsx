'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';

export default function ProfilePage() {
  const { user, token, isLoading: authLoading, isCustomerUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'info' | 'attachments' | 'workHours' | 'security' | 'emailAlerts'>('info');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
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
                  {['Tasks', 'Projects', 'Tickets', 'Planning'].map(category => {
                    const categoryPrefs = emailPreferences.filter(pref => pref.category === category);
                    if (categoryPrefs.length === 0) return null;

                    return (
                      <div key={category} className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                          {category}
                        </h3>
                        <div className="space-y-3">
                          {categoryPrefs.map(pref => (
                            <div
                              key={pref.type}
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={pref.emailEnabled}
                                    onChange={() => toggleEmailPreference(pref.type)}
                                    className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                  />
                                  <span className="ml-3 text-sm font-medium text-gray-900 dark:text-white">
                                    {pref.label}
                                  </span>
                                </label>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${
                                pref.emailEnabled
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                              }`}>
                                {pref.emailEnabled ? 'Enabled' : 'Disabled'}
                              </span>
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
            </div>
          </div>
        </div>
      </div>
  );
}
