'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import RichTextEditor from '@/components/RichTextEditor';
import { getMemos, createMemo, updateMemo, deleteMemo, Memo } from '@/lib/api/memos';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function MemosPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [enableDateFilter, setEnableDateFilter] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'private' | 'organizations' | 'public'>('all');

  // Form state
  const [memoForm, setMemoForm] = useState({
    title: '',
    content: '',
    visibility: 'private' as 'private' | 'organizations' | 'public',
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    } else if (user && token) {
      loadMemos();
    }
  }, [user, token, isLoading, router]);

  const loadMemos = async () => {
    if (!token) return;
    
    setIsLoadingData(true);
    setError('');
    
    try {
      const data = await getMemos(token);
      setMemos(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load memos');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleCreateMemo = () => {
    setMemoForm({ title: '', content: '', visibility: 'private', tags: [] });
    setTagInput('');
    setSelectedMemo(null);
    setShowMemoModal(true);
  };

  const handleEditMemo = (memo: Memo) => {
    setMemoForm({
      title: memo.Title,
      content: memo.Content || '',
      visibility: memo.Visibility,
      tags: memo.Tags ? memo.Tags.split(',').map(t => t.trim()) : [],
    });
    setTagInput('');
    setSelectedMemo(memo);
    setShowMemoModal(true);
  };

  const handleSaveMemo = async () => {
    if (!token || !memoForm.title.trim()) {
      setError('Title is required');
      return;
    }

    setError('');

    try {
      if (selectedMemo) {
        // Update existing memo
        await updateMemo(selectedMemo.Id, memoForm, token);
      } else {
        // Create new memo
        await createMemo(memoForm, token);
      }
      
      setShowMemoModal(false);
      loadMemos();
    } catch (err: any) {
      setError(err.message || 'Failed to save memo');
    }
  };

  const handleDeleteMemo = (id: number) => {
    setConfirmModal({
      show: true,
      title: 'Delete Memo',
      message: 'Are you sure you want to delete this memo? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmModal(null);
        if (!token) return;
        try {
          await deleteMemo(id, token);
          loadMemos();
        } catch (err: any) {
          setError(err.message || 'Failed to delete memo');
        }
      },
    });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !memoForm.tags.includes(tag)) {
      setMemoForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setMemoForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  // Calendar logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    
    // Add empty slots for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days in month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDateSelect = (date: Date) => {
    // Se clicar na mesma data selecionada, remove o filtro de data
    if (enableDateFilter && 
        date.getDate() === selectedDate.getDate() &&
        date.getMonth() === selectedDate.getMonth() &&
        date.getFullYear() === selectedDate.getFullYear()) {
      setEnableDateFilter(false);
    } else {
      // Seleciona nova data e ativa filtro
      setSelectedDate(date);
      setEnableDateFilter(true);
    }
  };

  const handleClearDateFilter = () => {
    setEnableDateFilter(false);
  };

  const handleClearAllFilters = () => {
    setEnableDateFilter(false);
    setFilterTag(null);
    setFilterVisibility('all');
  };

  // Filter memos
  const filteredMemos = memos.filter(memo => {
    // Filter by visibility
    if (filterVisibility !== 'all' && memo.Visibility !== filterVisibility) {
      return false;
    }

    // Filter by tag
    if (filterTag) {
      const tags = memo.Tags ? memo.Tags.split(',').map(t => t.trim()) : [];
      if (!tags.includes(filterTag)) return false;
    }
    
    // Filter by selected date (only if date filter is enabled)
    if (enableDateFilter) {
      const memoDate = new Date(memo.CreatedAt);
      return (
        memoDate.getDate() === selectedDate.getDate() &&
        memoDate.getMonth() === selectedDate.getMonth() &&
        memoDate.getFullYear() === selectedDate.getFullYear()
      );
    }
    
    return true;
  });

  // Get all unique tags
  const allTags = Array.from(new Set(
    memos.flatMap(m => m.Tags ? m.Tags.split(',').map(t => t.trim()) : [])
  )).sort();

  const days = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  if (!user) return null;

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Memos</h1>
          <button
            onClick={handleCreateMemo}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            <span>+</span>
            <span>New Memo</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                  {monthName}
                </h2>
                <button
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Date Filter Status */}
              {enableDateFilter && (
                <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-center">
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    📅 Showing: {selectedDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}
                  </p>
                </div>
              )}

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map(day => (
                  <div key={day} className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {day}
                  </div>
                ))}
                {days.map((day, index) => {
                  if (!day) {
                    return <div key={`empty-${index}`} className="p-2" />;
                  }
                  
                  const isToday = 
                    day.getDate() === new Date().getDate() &&
                    day.getMonth() === new Date().getMonth() &&
                    day.getFullYear() === new Date().getFullYear();
                  
                  const isSelected =
                    enableDateFilter &&
                    day.getDate() === selectedDate.getDate() &&
                    day.getMonth() === selectedDate.getMonth() &&
                    day.getFullYear() === selectedDate.getFullYear();
                  
                  const hasMemos = memos.some(m => {
                    const memoDate = new Date(m.CreatedAt);
                    return (
                      memoDate.getDate() === day.getDate() &&
                      memoDate.getMonth() === day.getMonth() &&
                      memoDate.getFullYear() === day.getFullYear()
                    );
                  });

                  return (
                    <button
                      key={index}
                      onClick={() => handleDateSelect(day)}
                      className={`
                        p-2 text-sm rounded
                        ${isSelected ? 'bg-blue-600 text-white' : ''}
                        ${isToday && !isSelected ? 'bg-blue-100 dark:bg-blue-900 font-bold' : ''}
                        ${!isSelected && !isToday ? 'hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
                        ${hasMemos && !isSelected ? 'font-semibold' : ''}
                      `}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Visibility Filter */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Visibility</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilterVisibility('all')}
                    className={`px-3 py-1 text-xs rounded ${
                      filterVisibility === 'all'
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    🌟 All
                  </button>
                  <button
                    onClick={() => setFilterVisibility('private')}
                    className={`px-3 py-1 text-xs rounded ${
                      filterVisibility === 'private'
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    🔒 Private
                  </button>
                  <button
                    onClick={() => setFilterVisibility('organizations')}
                    className={`px-3 py-1 text-xs rounded ${
                      filterVisibility === 'organizations'
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    👥 Organizations
                  </button>
                  <button
                    onClick={() => setFilterVisibility('public')}
                    className={`px-3 py-1 text-xs rounded ${
                      filterVisibility === 'public'
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    🌍 Public
                  </button>
                </div>
              </div>

              {/* Tags Filter */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilterTag(null)}
                    className={`px-2 py-1 text-xs rounded ${
                      !filterTag 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    All
                  </button>
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                      className={`px-2 py-1 text-xs rounded ${
                        filterTag === tag
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
              {/* Filter Actions */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Actions</h3>
                <div className="flex flex-col gap-2">
                  {enableDateFilter && (
                    <button
                      onClick={handleClearDateFilter}
                      className="px-3 py-2 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50 flex items-center justify-center gap-2"
                    >
                      📅 Clear Date Filter
                    </button>
                  )}
                  {(enableDateFilter || filterTag || filterVisibility !== 'all') && (
                    <button
                      onClick={handleClearAllFilters}
                      className="px-3 py-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2"
                    >
                      🗑️ Clear All Filters
                    </button>
                  )}
                </div>
              </div>            </div>
          </div>

          {/* Memos List */}
          <div className="lg:col-span-3">
            {isLoadingData ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
              </div>
            ) : filteredMemos.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {enableDateFilter
                    ? `No memos for ${selectedDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : 'No memos found with the current filters'
                  }
                </p>
                {enableDateFilter && (
                  <button
                    onClick={handleClearDateFilter}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    Show All Memos
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMemos.map(memo => (
                  <div key={memo.Id} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    {/* Memo Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {memo.Title}
                        </h3>
                        <div className="flex items-center space-x-3 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {memo.FirstName && memo.LastName 
                              ? `${memo.FirstName} ${memo.LastName}` 
                              : memo.Username}
                          </span>
                          <span>•</span>
                          <span>{new Date(memo.CreatedAt).toLocaleDateString('pt-PT', { 
                            weekday: 'short', 
                            day: 'numeric', 
                            month: 'numeric', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                          <span>•</span>
                          <span className={`
                            px-2 py-0.5 rounded text-xs font-medium
                            ${memo.Visibility === 'private' ? 'bg-gray-200 dark:bg-gray-700' : ''}
                            ${memo.Visibility === 'organizations' ? 'bg-blue-200 dark:bg-blue-900' : ''}
                            ${memo.Visibility === 'public' ? 'bg-green-200 dark:bg-green-900' : ''}
                          `}>
                            {memo.Visibility === 'private' && '🔒 Private'}
                            {memo.Visibility === 'organizations' && '👥 Organizations'}
                            {memo.Visibility === 'public' && '🌍 Public'}
                          </span>
                        </div>
                      </div>
                      
                      {memo.UserId === user?.id && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditMemo(memo)}
                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteMemo(memo.Id)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Memo Content */}
                    {memo.Content && (
                      <div 
                        className="prose prose-sm dark:prose-invert max-w-none mb-3"
                        dangerouslySetInnerHTML={{ __html: memo.Content }}
                      />
                    )}

                    {/* Tags */}
                    {memo.Tags && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {memo.Tags.split(',').map((tag, idx) => (
                          <span 
                            key={idx}
                            className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded"
                          >
                            #{tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Attachments */}
                    {memo.Attachments && memo.Attachments.length > 0 && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span>Attachments ({memo.Attachments.length})</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Memo Modal */}
      {showMemoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {selectedMemo ? 'Edit Memo' : 'New Memo'}
                </h2>
                <button
                  onClick={() => setShowMemoModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={memoForm.title}
                    onChange={(e) => setMemoForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter memo title"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Visibility */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Visibility
                  </label>
                  <select
                    value={memoForm.visibility}
                    onChange={(e) => setMemoForm(prev => ({ ...prev, visibility: e.target.value as any }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="private">🔒 Private</option>
                    <option value="organizations">👥 My Organizations</option>
                    <option value="public">🌍 Public</option>
                  </select>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Content
                  </label>
                  <RichTextEditor
                    content={memoForm.content}
                    onChange={(html) => setMemoForm(prev => ({ ...prev, content: html }))}
                    placeholder="Enter memo content..."
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tags
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Add tag (press Enter)"
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={addTag}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {memoForm.tags.map((tag, idx) => (
                      <span 
                        key={idx}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full flex items-center space-x-2"
                      >
                        <span>#{tag}</span>
                        <button
                          onClick={() => removeTag(tag)}
                          className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowMemoModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMemo}
                  disabled={!memoForm.title.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                >
                  {selectedMemo ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Confirm Modal */}
      {confirmModal?.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{confirmModal.title}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
