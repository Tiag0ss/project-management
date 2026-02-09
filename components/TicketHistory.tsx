'use client';

import { useState, useEffect } from 'react';
import { getTicketHistory, TicketHistoryEntry } from '@/lib/api/tickets';

interface TicketHistoryProps {
  ticketId: number;
  token: string;
}

export default function TicketHistory({ ticketId, token }: TicketHistoryProps) {
  const [history, setHistory] = useState<TicketHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadHistory();
  }, [ticketId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getTicketHistory(ticketId, token);
      setHistory(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const formatHistoryMessage = (entry: TicketHistoryEntry): string => {
    const userName = entry.FirstName && entry.LastName 
      ? `${entry.FirstName} ${entry.LastName}` 
      : entry.Username;

    switch (entry.Action) {
      case 'Created':
        return `${userName} created this ticket`;
      
      case 'StatusChanged':
        return `${userName} changed status from "${entry.OldValue}" to "${entry.NewValue}"`;
      
      case 'PriorityChanged':
        return `${userName} changed priority from "${entry.OldValue}" to "${entry.NewValue}"`;
      
      case 'AssignedToChanged':
        if (!entry.OldValue && entry.NewValue) {
          return `${userName} assigned this ticket`;
        } else if (entry.OldValue && !entry.NewValue) {
          return `${userName} unassigned this ticket`;
        } else {
          return `${userName} changed assignment`;
        }
      
      case 'DeveloperChanged':
        if (!entry.OldValue && entry.NewValue) {
          return `${userName} assigned a developer`;
        } else if (entry.OldValue && !entry.NewValue) {
          return `${userName} removed the developer`;
        } else {
          return `${userName} changed developer`;
        }
      
      case 'Updated':
        if (entry.FieldName === 'Title') {
          return `${userName} changed title from "${entry.OldValue}" to "${entry.NewValue}"`;
        } else if (entry.FieldName === 'Description') {
          return `${userName} updated the description`;
        } else if (entry.FieldName === 'Category') {
          return `${userName} changed category from "${entry.OldValue}" to "${entry.NewValue}"`;
        } else if (entry.FieldName === 'ProjectId') {
          if (!entry.OldValue && entry.NewValue) {
            return `${userName} assigned to a project`;
          } else if (entry.OldValue && !entry.NewValue) {
            return `${userName} removed from project`;
          } else {
            return `${userName} changed project`;
          }
        } else if (entry.FieldName === 'ScheduledDate') {
          if (!entry.OldValue && entry.NewValue) {
            return `${userName} scheduled this ticket`;
          } else if (entry.OldValue && !entry.NewValue) {
            return `${userName} removed the scheduled date`;
          } else {
            return `${userName} changed scheduled date`;
          }
        }
        return `${userName} updated ${entry.FieldName}`;
      
      default:
        return `${userName} performed an action`;
    }
  };

  const getActionIcon = (action: string): string => {
    switch (action) {
      case 'Created':
        return '🎉';
      case 'StatusChanged':
        return '🔄';
      case 'PriorityChanged':
        return '⚡';
      case 'AssignedToChanged':
        return '👤';
      case 'DeveloperChanged':
        return '👨‍💻';
      case 'Updated':
        return '✏️';
      default:
        return '📝';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
        {error}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">📜</div>
        <p className="text-gray-500 dark:text-gray-400">No history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>

        {/* Timeline entries */}
        <div className="space-y-6">
          {history.map((entry, index) => (
            <div key={entry.Id} className="relative flex gap-4">
              {/* Icon */}
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-xl z-10">
                {getActionIcon(entry.Action)}
              </div>

              {/* Content */}
              <div className="flex-1 pb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm text-gray-900 dark:text-white font-medium">
                    {formatHistoryMessage(entry)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatDate(entry.CreatedAt)}
                  </p>

                  {/* Show details for certain actions */}
                  {(entry.Action === 'Updated' && entry.FieldName === 'Description') && (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        {entry.OldValue && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Previous:</span>
                            <p className="text-gray-700 dark:text-gray-300 mt-1 line-clamp-2">{entry.OldValue}</p>
                          </div>
                        )}
                        {entry.NewValue && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Updated:</span>
                            <p className="text-gray-700 dark:text-gray-300 mt-1 line-clamp-2">{entry.NewValue}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
