'use client';

import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /** Lucide node preferred; string emoji still accepted for legacy call sites */
  icon?: ReactNode;
  title: string;
  message: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  message,
  primaryAction,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  const resolvedIcon =
    icon === undefined ? (
      <Inbox size={40} strokeWidth={1.5} className="text-[var(--pm-muted)] opacity-70" aria-hidden />
    ) : typeof icon === 'string' ? (
      <span className="text-5xl" aria-hidden>
        {icon}
      </span>
    ) : (
      icon
    );

  return (
    <div
      className={`rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center dark:border-gray-600 dark:bg-gray-800 ${className}`}
    >
      <div className="mb-4 flex justify-center">{resolvedIcon}</div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">{message}</p>
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center justify-center gap-3">
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="h-10 rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:focus:ring-offset-gray-800"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
