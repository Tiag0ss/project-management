'use client';

import React, { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { getTaskAttachment } from '@/lib/api/taskAttachments';
import { stripHtml } from '@/lib/stripHtml';

type HoursFmt = (hours: number) => string;
type PillStyle = (
  color: string | null | undefined,
  opts?: { alpha?: string; borderAlpha?: string }
) => React.CSSProperties | undefined;

export function ReportingTaskDetailModal({
  selectedTask,
  organizationId,
  token,
  decimalHoursToHMS,
  pillStyle,
  onClose,
  onAlert,
}: {
  selectedTask: any;
  organizationId: number;
  token: string;
  decimalHoursToHMS: HoursFmt;
  pillStyle: PillStyle;
  onClose: () => void;
  onAlert: (title: string, message: string) => void;
}) {
  const [taskAllocations, setTaskAllocations] = useState<any[]>([]);
  const [taskTimeEntries, setTaskTimeEntries] = useState<any[]>([]);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);
  const [taskHistory, setTaskHistory] = useState<any[]>([]);
  const [taskTags, setTaskTags] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadingTaskDetails, setLoadingTaskDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingTaskDetails(true);
      setNewComment('');
      setShowTagSelector(false);
      try {
        const allocationsResponse = await fetch(
          `${getApiUrl()}/api/task-allocations/task/${selectedTask.Id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!cancelled) {
          if (allocationsResponse.ok) {
            const data = await allocationsResponse.json();
            setTaskAllocations(data.allocations || []);
          } else {
            setTaskAllocations([]);
          }
        }

        const timeEntriesResponse = await fetch(
          `${getApiUrl()}/api/time-entries/task/${selectedTask.Id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!cancelled) {
          if (timeEntriesResponse.ok) {
            const data = await timeEntriesResponse.json();
            setTaskTimeEntries(data.entries || []);
          } else {
            setTaskTimeEntries([]);
          }
        }

        const commentsResponse = await fetch(
          `${getApiUrl()}/api/task-comments/task/${selectedTask.Id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!cancelled) {
          if (commentsResponse.ok) {
            const data = await commentsResponse.json();
            setTaskComments(data.comments || []);
          } else {
            setTaskComments([]);
          }
        }

        const attachmentsResponse = await fetch(
          `${getApiUrl()}/api/task-attachments/task/${selectedTask.Id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!cancelled) {
          if (attachmentsResponse.ok) {
            const data = await attachmentsResponse.json();
            setTaskAttachments(data.data || []);
          } else {
            setTaskAttachments([]);
          }
        }

        const historyResponse = await fetch(
          `${getApiUrl()}/api/task-history/task/${selectedTask.Id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!cancelled) {
          if (historyResponse.ok) {
            const data = await historyResponse.json();
            setTaskHistory(data.history || []);
          } else {
            setTaskHistory([]);
          }
        }

        const tagsResponse = await fetch(`${getApiUrl()}/api/tags/task/${selectedTask.Id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!cancelled) {
          if (tagsResponse.ok) {
            const data = await tagsResponse.json();
            setTaskTags(data.tags || []);
          } else {
            setTaskTags([]);
          }
        }
      } catch (err) {
        console.error('Failed to load task details:', err);
        if (!cancelled) {
          setTaskAllocations([]);
          setTaskTimeEntries([]);
          setTaskComments([]);
          setTaskAttachments([]);
          setTaskHistory([]);
          setTaskTags([]);
        }
      } finally {
        if (!cancelled) setLoadingTaskDetails(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedTask.Id, token]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedTask) return;

    setSubmittingComment(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/task-comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: selectedTask.Id,
          comment: newComment.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTaskComments((prev) => [data.comment, ...prev]);
        setNewComment('');
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/task-comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setTaskComments((prev) => prev.filter((c) => c.Id !== commentId));
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/task-attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setTaskAttachments((prev) => prev.filter((a) => a.Id !== attachmentId));
      }
    } catch (err) {
      console.error('Failed to delete attachment:', err);
    }
  };

  const handleDownloadAttachment = async (attachmentId: number) => {
    if (!token) return;

    try {
      const attachment = await getTaskAttachment(attachmentId, token);

      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.FileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      onAlert('Download Failed', err.message || 'Failed to download attachment');
    }
  };

  const handlePreviewAttachment = async (attachmentId: number) => {
    if (!token) return;

    try {
      const attachment = await getTaskAttachment(attachmentId, token);

      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });

      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');

      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      onAlert('Preview Failed', err.message || 'Failed to preview attachment');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTask) return;

    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-zip-compressed',
      'text/plain',
    ];

    if (!allowedTypes.includes(file.type)) {
      onAlert('Invalid File Type', 'File type not allowed. Allowed: images, PDF, Word, Excel, ZIP, TXT');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      onAlert('File Too Large', 'File size exceeds 10MB limit');
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target?.result as string;
          const base64Data = base64.split(',')[1];

          const response = await fetch(
            `${getApiUrl()}/api/task-attachments/task/${selectedTask.Id}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: base64Data,
              }),
            }
          );

          if (response.ok) {
            const attachmentsResponse = await fetch(
              `${getApiUrl()}/api/task-attachments/task/${selectedTask.Id}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (attachmentsResponse.ok) {
              const data = await attachmentsResponse.json();
              setTaskAttachments(data.data || []);
            }
          } else {
            const error = await response.json();
            onAlert('Upload Error', error.message || 'Failed to upload file');
          }
        } catch (err) {
          console.error('Failed to upload file:', err);
          onAlert('Upload Error', 'Failed to upload file');
        } finally {
          setUploadingFile(false);
          e.target.value = '';
        }
      };

      reader.onerror = () => {
        onAlert('File Error', 'Failed to read file');
        setUploadingFile(false);
        e.target.value = '';
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload file:', err);
      onAlert('Upload Error', 'Failed to upload file');
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const loadAvailableTags = async (orgId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/tags/organization/${orgId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data.tags || []);
      }
    } catch (err) {
      console.error('Failed to load available tags:', err);
    }
  };

  const handleAddTag = async (tagId: number) => {
    if (!selectedTask) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/tags/task/${selectedTask.Id}/tag/${tagId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const tag = availableTags.find((t) => t.Id === tagId);
        if (tag && !taskTags.find((t) => t.Id === tagId)) {
          setTaskTags((prev) => [...prev, tag]);
        }
        setShowTagSelector(false);
      }
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!selectedTask) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/tags/task/${selectedTask.Id}/tag/${tagId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setTaskTags((prev) => prev.filter((t) => t.Id !== tagId));
      }
    } catch (err) {
      console.error('Failed to remove tag:', err);
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

  return (
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
    <div className="p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedTask.TaskName}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-2 py-1 text-xs font-semibold rounded-full"
              style={pillStyle(selectedTask.StatusColor, { alpha: '20' })}
            >
              {selectedTask.StatusName || 'Unknown'}
            </span>
            {selectedTask.PriorityName && (
              <span className="px-2 py-1 text-xs font-semibold rounded-full"
                style={pillStyle(selectedTask.PriorityColor, { alpha: '20' })}
              >
                {selectedTask.PriorityName}
              </span>
            )}
          </div>
          {/* Tags */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {taskTags.map((tag: any) => (
              <span
                key={tag.Id}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full"
                style={{ backgroundColor: tag.Color + '20', color: tag.Color, border: `1px solid ${tag.Color}` }}
              >
                🏷️ {tag.Name}
                <button
                  onClick={() => handleRemoveTag(tag.Id)}
                  className="ml-1 hover:opacity-70"
                  title="Remove tag"
                >
                  ×
                </button>
              </span>
            ))}
            <div className="relative">
              <button
                onClick={() => {
                  if (!showTagSelector) {
                    loadAvailableTags(organizationId);
                  }
                  setShowTagSelector(!showTagSelector);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                + Add Tag
              </button>
              {showTagSelector && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-10">
                  <div className="p-2 max-h-48 overflow-y-auto">
                    {availableTags.filter(t => !taskTags.find((tt: any) => tt.Id === t.Id)).length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">No more tags available</p>
                    ) : (
                      availableTags
                        .filter(t => !taskTags.find((tt: any) => tt.Id === t.Id))
                        .map((tag: any) => (
                          <button
                            key={tag.Id}
                            onClick={() => handleAddTag(tag.Id)}
                            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.Color }}
                            />
                            {tag.Name}
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
        >
          ×
        </button>
      </div>

      {/* Task Info */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estimated Hours</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {decimalHoursToHMS(parseFloat(selectedTask.EstimatedHours || 0))}
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Allocated Hours</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {decimalHoursToHMS(parseFloat(selectedTask.TotalAllocated || 0))}
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Worked Hours</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {decimalHoursToHMS(parseFloat(selectedTask.TotalWorked || 0))}
          </div>
        </div>
      </div>

      {/* Description */}
      {selectedTask.Description && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Description</h3>
          <div 
            className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: selectedTask.Description }}
          />
        </div>
      )}

      {/* Allocations */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Planned Allocations</h3>
        {loadingTaskDetails ? (
          <p className="text-gray-500 dark:text-gray-400">Loading allocations...</p>
        ) : taskAllocations.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No allocations found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    User
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Time
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Hours
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {taskAllocations.map((allocation: any, idx: number) => {
                  const date = new Date(allocation.AllocationDate);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                        {dayName}, {dateStr}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        {allocation.Username || 'Unknown'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center text-gray-700 dark:text-gray-300">
                        {allocation.StartTime || '-'} - {allocation.EndTime || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                        {decimalHoursToHMS(parseFloat(allocation.AllocatedHours))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Time Entries */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Time Entries</h3>
        {loadingTaskDetails ? (
          <p className="text-gray-500 dark:text-gray-400">Loading time entries...</p>
        ) : taskTimeEntries.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No time entries recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    User
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Description
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Hours
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {taskTimeEntries.map((entry: any, idx: number) => {
                  const date = new Date(entry.WorkDate);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                        {dayName}, {dateStr}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        {entry.Username || 'Unknown'}
                      </td>
                      <td className="px-4 py-2 text-sm text-center text-gray-700 dark:text-gray-300">
                        {entry.StartTime || '-'} - {entry.EndTime || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        {stripHtml(entry.Description) || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                        {decimalHoursToHMS(parseFloat(entry.Hours))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Comments Section */}
      <div className="mt-6 border-t dark:border-gray-700 pt-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          💬 Comments
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({taskComments.length})
          </span>
        </h3>
        
        {/* Add Comment Form */}
        <div className="mb-4 flex gap-3">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddComment();
              }
            }}
          />
          <button
            onClick={handleAddComment}
            disabled={submittingComment || !newComment.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submittingComment ? '...' : 'Send'}
          </button>
        </div>

        {/* Comments List */}
        {loadingTaskDetails ? (
          <p className="text-gray-500 dark:text-gray-400">Loading comments...</p>
        ) : taskComments.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">No comments yet. Be the first to comment!</p>
        ) : (
          <div className="space-y-4 max-h-60 overflow-y-auto">
            {taskComments.map((comment: any) => (
              <div key={comment.Id} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                  {(comment.FirstName?.[0] || comment.Username?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {comment.FirstName && comment.LastName 
                          ? `${comment.FirstName} ${comment.LastName}` 
                          : comment.Username}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(comment.CreatedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteComment(comment.Id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete comment"
                    >
                      🗑️
                    </button>
                  </div>
                  <div
                    className="text-gray-700 dark:text-gray-300 mt-1 prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: comment.Comment }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attachments Section */}
      <div className="mt-6 border-t dark:border-gray-700 pt-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          📎 Attachments
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({taskAttachments.length})
          </span>
        </h3>
        
        {/* Upload Button */}
        <div className="mb-4">
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors">
            {uploadingFile ? (
              <>⏳ Uploading...</>
            ) : (
              <>📤 Upload File</>
            )}
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploadingFile}
            />
          </label>
          <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
            Max 10MB. Allowed: images, PDF, Word, Excel, text, CSV, ZIP
          </span>
        </div>

        {/* Attachments List */}
        {loadingTaskDetails ? (
          <p className="text-gray-500 dark:text-gray-400">Loading attachments...</p>
        ) : taskAttachments.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">No attachments yet.</p>
        ) : (
          <div className="space-y-2">
            {taskAttachments.map((attachment: any) => {
              const canPreview = attachment.FileType.startsWith('image/') || attachment.FileType === 'application/pdf';
              return (
              <div key={attachment.Id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-2xl">{getFileIcon(attachment.FileType)}</span>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {attachment.FileName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(attachment.FileSize)} • {attachment.FirstName && attachment.LastName ? `${attachment.FirstName} ${attachment.LastName}` : attachment.Username} • {new Date(attachment.CreatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canPreview && (
                    <button
                      onClick={() => handlePreviewAttachment(attachment.Id)}
                      className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                      title="Preview"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadAttachment(attachment.Id)}
                    className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    title="Download"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteAttachment(attachment.Id)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Delete"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* History Section */}
      <div className="mt-6 border-t dark:border-gray-700 pt-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          📜 History
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({taskHistory.length})
          </span>
        </h3>
        
        {loadingTaskDetails ? (
          <p className="text-gray-500 dark:text-gray-400">Loading history...</p>
        ) : taskHistory.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">No history recorded yet.</p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {taskHistory.map((entry: any) => {
              const date = new Date(entry.CreatedAt);
              const timeStr = date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              
              // Format the action message
              let actionText = '';
              let actionIcon = '📝';
              
              switch (entry.Action) {
                case 'created':
                  actionText = 'created the task';
                  actionIcon = '🆕';
                  break;
                case 'updated':
                  if (entry.FieldName) {
                    actionText = `changed ${entry.FieldName}`;
                    if (entry.OldValue && entry.NewValue) {
                      actionText += ` from "${entry.OldValue}" to "${entry.NewValue}"`;
                    } else if (entry.NewValue) {
                      actionText += ` to "${entry.NewValue}"`;
                    }
                  } else {
                    actionText = 'updated the task';
                  }
                  actionIcon = '✏️';
                  break;
                case 'status_changed':
                  actionText = `changed status from "${entry.OldValue || 'None'}" to "${entry.NewValue}"`;
                  actionIcon = '🔄';
                  break;
                case 'assigned':
                  actionText = entry.NewValue ? `assigned to ${entry.NewValue}` : 'removed assignment';
                  actionIcon = '👤';
                  break;
                case 'comment_added':
                  actionText = 'added a comment';
                  actionIcon = '💬';
                  break;
                case 'attachment_added':
                  actionText = `added attachment "${entry.NewValue || 'file'}"`;
                  actionIcon = '📎';
                  break;
                case 'attachment_removed':
                  actionText = `removed attachment "${entry.OldValue || 'file'}"`;
                  actionIcon = '🗑️';
                  break;
                default:
                  actionText = entry.Action;
              }
              
              return (
                <div key={entry.Id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-xl">{actionIcon}</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-medium">{entry.FirstName || entry.Username || 'Unknown'}</span>
                      {' '}{actionText}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {timeStr}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Close Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</div>
  );
}
