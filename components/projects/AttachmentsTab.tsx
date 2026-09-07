'use client';

type ProjectAttachment = {
  Id: number;
  FileName: string;
  FileType: string;
  FileSize: number;
  FirstName?: string | null;
  LastName?: string | null;
  Username?: string;
  CreatedAt: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
  return '📎';
}

export function AttachmentsTab({
  attachments,
  uploading,
  onUpload,
  onPreview,
  onDownload,
  onDelete,
}: {
  attachments: ProjectAttachment[];
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreview: (id: number) => void;
  onDownload: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
          {uploading ? (
            <>⏳ Uploading...</>
          ) : (
            <>📤 Upload File</>
          )}
          <input
            type="file"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
          />
        </label>
        <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
          Max 10MB. Allowed: images, PDF, Word, Excel, ZIP, TXT
        </span>
      </div>

      {attachments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No attachments yet.</p>
      ) : (
        <div className="space-y-3">
          {attachments.map((attachment) => {
            const canPreview = attachment.FileType.startsWith('image/') || attachment.FileType === 'application/pdf';
            return (
              <div key={attachment.Id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-3xl">{getFileIcon(attachment.FileType)}</span>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white truncate" title={attachment.FileName}>
                      {attachment.FileName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatFileSize(attachment.FileSize)} • {attachment.FirstName && attachment.LastName ? `${attachment.FirstName} ${attachment.LastName}` : attachment.Username} • {new Date(attachment.CreatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canPreview && (
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
                  <button
                    onClick={() => onDelete(attachment.Id)}
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
  );
}
