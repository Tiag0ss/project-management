'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface HistoryEntry {
  Id: number;
  ChangeType: string;
  FieldName: string | null;
  OldValue: string | null;
  NewValue: string | null;
  ChangedByUsername: string;
  CreatedAt: string;
}

interface ChangeHistoryProps {
  entityType: 'organization' | 'customer' | 'project' | 'user';
  entityId: number;
}

export default function ChangeHistory({ entityType, entityId }: ChangeHistoryProps) {
  const { token } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = getApiUrl();

  useEffect(() => {
    loadHistory();
  }, [entityType, entityId]);

  const loadHistory = async () => {
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/change-history/${entityType}/${entityId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setHistory(data.history);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getChangeIcon = (changeType: string) => {
    if (changeType === 'created') return '➕';
    if (changeType === 'updated') return '✏️';
    if (changeType === 'deleted') return '🗑️';
    return '📝';
  };

  return (
    <div>
      {isLoading ? (
        <div className="text-center py-8 text-gray-600 dark:text-gray-400">
          Loading history...
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-8 text-gray-600 dark:text-gray-400">
          No changes recorded yet
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <div
              key={entry.Id}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getChangeIcon(entry.ChangeType)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {entry.ChangeType === 'created' ? 'Created' : 
                       entry.FieldName ? `Changed ${entry.FieldName}` : 'Updated'}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(entry.CreatedAt)}
                    </span>
                  </div>
                  
                  {entry.FieldName && (
                    <div className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <span className="text-gray-500 dark:text-gray-400">From:</span>
                          <div className="mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                            {entry.OldValue || <span className="italic text-gray-400">(empty)</span>}
                          </div>
                        </div>
                        <div className="flex-1">
                          <span className="text-gray-500 dark:text-gray-400">To:</span>
                          <div className="mt-1 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                            {entry.NewValue || <span className="italic text-gray-400">(empty)</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    by <span className="font-medium">{entry.ChangedByUsername}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
