import type { ReactNode } from 'react';

type PageStickyChromeProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Page title + tabs band that stays fixed under AppShell’s header.
 *
 * Must sit outside the scrolling region — parent layout:
 * `flex min-h-0 flex-1 flex-col overflow-hidden` with this as `shrink-0`
 * and tab content in a sibling `flex-1 overflow-y-auto`.
 *
 * Avoid CSS `position: sticky` here: AppShell main padding leaves a gap
 * where scrolled content shows through.
 */
export default function PageStickyChrome({ children, className = '' }: PageStickyChromeProps) {
  return (
    <div
      className={[
        'shrink-0 space-y-2 border-b border-[var(--pm-border)] bg-[var(--pm-bg)] pb-2',
        '-mx-2 px-2 md:-mx-3 md:px-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
