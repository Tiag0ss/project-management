'use client';

/** In-page loading placeholder — keeps AppShell chrome visible (no full-screen blank). */
export default function PageLoadingSkeleton({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`w-full animate-pulse space-y-3 ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="h-9 w-48 max-w-[40%] rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
      <div className="h-11 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
      <div className="h-56 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] sm:h-72" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
        <div className="h-28 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
      </div>
    </div>
  );
}
