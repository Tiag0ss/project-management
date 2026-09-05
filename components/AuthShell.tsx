'use client';

import type { ReactNode } from 'react';

export const authFieldClass =
  'w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none placeholder:text-[var(--pm-muted)] focus:border-[var(--pm-accent)]';

export const authLabelClass = 'mb-0.5 block text-xs font-medium text-[var(--pm-muted)]';

/** Prefer bg-blue-600 so .pm-app remaps apply; hex fallback if remaps miss. */
export const authPrimaryButtonClass =
  'inline-flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

export const authSecondaryButtonClass =
  'inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface-2)] px-4 text-sm font-medium text-[var(--pm-text)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

export const authLinkClass = 'text-blue-600 dark:text-blue-400 hover:underline';

type AuthShellProps = {
  title: string;
  description?: string;
  companyName?: string;
  companyLogoUrl?: string;
  maxWidthClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export default function AuthShell({
  title,
  description,
  companyName,
  companyLogoUrl,
  maxWidthClassName = 'max-w-md',
  footer,
  children,
}: AuthShellProps) {
  const brand = (companyName || '').trim() || 'Project Management';
  const initial = brand.charAt(0).toUpperCase() || 'P';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className={`w-full ${maxWidthClassName}`}>
        <div className="mb-5 flex flex-col items-center text-center">
          {companyLogoUrl ? (
            <img
              src={companyLogoUrl}
              alt={brand}
              className="mb-3 h-10 w-10 rounded-md bg-[var(--pm-panel)] object-contain ring-1 ring-[var(--pm-border)]"
            />
          ) : (
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
              {initial}
            </div>
          )}
          <p className="text-sm font-semibold text-[var(--pm-text)]">{brand}</p>
        </div>

        <div className="rounded-[var(--pm-radius)] border border-[var(--pm-border)] bg-[var(--pm-panel)] p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h1 className="text-lg font-semibold leading-tight text-[var(--pm-text)]">{title}</h1>
            {description ? <p className="mt-1 text-xs text-[var(--pm-muted)]">{description}</p> : null}
          </div>
          {children}
        </div>

        {footer ? <div className="mt-4 text-center text-xs text-[var(--pm-muted)]">{footer}</div> : null}
      </div>
    </div>
  );
}
