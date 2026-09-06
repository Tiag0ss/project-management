'use client';

import { useState, type ReactNode } from 'react';

type CollapsibleFilterPanelProps = {
  title?: string;
  /** Number of active filters — shown as a badge when > 0 */
  activeCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /**
   * Content between the toggle and the trailing count (e.g. RAG / status chips).
   * Fills the spare horizontal space in the filter header.
   */
  headerMiddle?: ReactNode;
  /** Optional content on the right of the toggle (e.g. result count) */
  headerExtra?: ReactNode;
};

/**
 * Compact collapsible filter chrome for list pages.
 * Filters are collapsed by default to free vertical space.
 */
export default function CollapsibleFilterPanel({
  title = 'Filters',
  activeCount = 0,
  defaultOpen = false,
  children,
  className = '',
  bodyClassName = 'p-3 border-t border-[var(--pm-border)]',
  headerMiddle,
  headerExtra,
}: CollapsibleFilterPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActive = activeCount > 0;

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-2 text-left text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-gray-950 dark:hover:text-white"
        >
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="truncate">{title}</span>
          {hasActive && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
              {activeCount}
            </span>
          )}
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            {open ? 'Hide' : 'Show'}
          </span>
        </button>

        <div className="min-w-0 flex-1 overflow-x-auto">
          {headerMiddle ? (
            <div className="flex items-center justify-start gap-1 sm:justify-center">{headerMiddle}</div>
          ) : null}
        </div>

        {headerExtra ? <div className="shrink-0">{headerExtra}</div> : null}
      </div>

      {open ? <div className={bodyClassName}>{children}</div> : null}
    </div>
  );
}
