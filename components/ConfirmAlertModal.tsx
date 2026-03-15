'use client';

import { ReactNode } from 'react';

interface ConfirmAlertModalProps {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title: string;
  message: ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  alertLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  preserveLineBreaks?: boolean;
}

export default function ConfirmAlertModal({
  isOpen,
  type,
  title,
  message,
  onClose,
  onConfirm,
  cancelLabel = 'Cancel',
  confirmLabel = 'Delete',
  alertLabel = 'OK',
  confirmVariant = 'danger',
  preserveLineBreaks = false,
}: ConfirmAlertModalProps) {
  if (!isOpen) {
    return null;
  }

  const isConfirm = type === 'confirm';
  const messageClassName = preserveLineBreaks
    ? 'mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line'
    : 'mt-2 text-sm text-gray-700 dark:text-gray-300';
  const actionClassName = isConfirm
    ? confirmVariant === 'primary'
      ? 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors'
      : 'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors'
    : 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-start mb-4">
            <div className="flex-shrink-0">
              {isConfirm ? (
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h3>
              <div className={messageClassName}>{message}</div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            {isConfirm && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                {cancelLabel}
              </button>
            )}
            <button
              onClick={isConfirm ? onConfirm : onClose}
              className={actionClassName}
            >
              {isConfirm ? confirmLabel : alertLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
