'use client';

import { useState, useRef } from 'react';

interface AttachmentUploaderProps {
  onUpload: (fileName: string, fileType: string, fileSize: number, fileData: string) => Promise<void>;
  maxSize?: number;
  disabled?: boolean;
}

const ALLOWED_TYPES = [
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

const FILE_ICONS: { [key: string]: string } = {
  'image/': '🖼️',
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/zip': '📦',
  'application/x-zip-compressed': '📦',
  'text/plain': '📃',
};

export default function AttachmentUploader({ onUpload, maxSize = 10 * 1024 * 1024, disabled = false }: AttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (fileType: string): string => {
    for (const [type, icon] of Object.entries(FILE_ICONS)) {
      if (fileType.startsWith(type)) {
        return icon;
      }
    }
    return '📎';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('File type not allowed. Allowed: images, PDF, Word, Excel, ZIP, TXT');
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      setError(`File size exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB limit`);
      return;
    }

    try {
      setUploading(true);

      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target?.result as string;
          // Remove data:mime/type;base64, prefix
          const base64Data = base64.split(',')[1];

          await onUpload(file.name, file.type, file.size, base64Data);

          // Reset input
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (err: any) {
          setError(err.message || 'Failed to upload file');
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = () => {
        setError('Failed to read file');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-colors ${
            disabled || uploading
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          {uploading ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <span>📎</span>
              <span>Attach File</span>
            </>
          )}
        </label>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Allowed: Images, PDF, Word, Excel, ZIP, TXT (max {(maxSize / 1024 / 1024).toFixed(0)}MB)
      </div>
    </div>
  );
}

interface AttachmentListProps {
  attachments: Array<{
    Id: number;
    FileName: string;
    FileType: string;
    FileSize: number;
    CreatedAt: string;
    FirstName?: string;
    LastName?: string;
    Username: string;
    UploadedByUserId: number;
  }>;
  currentUserId: number;
  isAdmin: boolean;
  onDownload: (attachmentId: number) => void;
  onPreview?: (attachmentId: number) => void;
  onDelete: (attachmentId: number) => void;
}

export function AttachmentList({ attachments, currentUserId, isAdmin, onDownload, onPreview, onDelete }: AttachmentListProps) {
  const getFileIcon = (fileType: string): string => {
    for (const [type, icon] of Object.entries(FILE_ICONS)) {
      if (fileType.startsWith(type)) {
        return icon;
      }
    }
    return '📎';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const canPreview = (fileType: string): boolean => {
    return fileType.startsWith('image/') || fileType === 'application/pdf';
  };

  if (attachments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No attachments yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.Id}
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-2xl flex-shrink-0">{getFileIcon(attachment.FileType)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {attachment.FileName}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {formatFileSize(attachment.FileSize)}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {attachment.FirstName && attachment.LastName
                  ? `${attachment.FirstName} ${attachment.LastName}`
                  : attachment.Username}
                {' • '}
                {formatDate(attachment.CreatedAt)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onPreview && canPreview(attachment.FileType) && (
              <button
                onClick={() => onPreview(attachment.Id)}
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
              onClick={() => onDownload(attachment.Id)}
              className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
              title="Download"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>

            {(isAdmin || attachment.UploadedByUserId === currentUserId) && (
              <button
                onClick={() => onDelete(attachment.Id)}
                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title="Delete"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
