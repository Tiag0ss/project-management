import type { ReactNode } from 'react';

type PageStickyActionsProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Page-level Edit / Save / Cancel bar fixed under the scrolling content.
 *
 * Parent layout (same as PageStickyChrome):
 * `flex min-h-0 flex-1 flex-col overflow-hidden`
 * with chrome `shrink-0`, main `flex-1 overflow-y-auto`, and this as `shrink-0`.
 *
 * Prefer this over putting primary form actions in the page header.
 */
export default function PageStickyActions({ children, className = '' }: PageStickyActionsProps) {
  return (
    <div
      data-page-sticky-actions=""
      className={[
        'shrink-0 border-t border-[var(--pm-border)] bg-[var(--pm-bg)] pt-2',
        '-mx-2 px-2 md:-mx-3 md:px-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="toolbar"
      aria-label="Page actions"
    >
      <div className="flex flex-wrap items-center justify-end gap-2 pb-2">{children}</div>
    </div>
  );
}

/** Shared classes for primary/secondary actions in PageStickyActions. */
export const pageActionButtonClass = {
  primary:
    'h-10 inline-flex items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400',
  success:
    'h-10 inline-flex items-center rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400',
  secondary:
    'h-10 inline-flex items-center rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] px-4 text-sm font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'h-10 inline-flex items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400',
} as const;
