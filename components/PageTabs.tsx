'use client';

export type PageTab = {
  id: string;
  label: string;
  href?: string;
  disabled?: boolean;
};

type PageTabsProps = {
  tabs: PageTab[];
  activeId: string;
  onChange?: (id: string) => void;
};

/** Screen-level top tabs for the new AppShell (not left asides). */
export default function PageTabs({ tabs, activeId, onChange }: PageTabsProps) {
  return (
    <div className="flex gap-0.5 overflow-x-auto border-b border-[var(--pm-border)] pb-px">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const disabled = !!tab.disabled;
        const className = [
          'shrink-0 rounded-t-[var(--pm-radius-sm)] px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-colors',
          active
            ? 'bg-[var(--pm-surface-2)] text-[var(--pm-text)] border border-b-transparent border-[var(--pm-border)]'
            : 'text-[var(--pm-muted)] hover:text-[var(--pm-text)]',
          disabled ? 'cursor-not-allowed opacity-40 hover:text-[var(--pm-muted)]' : '',
        ].join(' ');
        if (tab.href && !disabled) {
          return (
            <a key={tab.id} href={tab.href} className={className} aria-current={active ? 'page' : undefined}>
              {tab.label}
            </a>
          );
        }
        return (
          <button
            key={tab.id}
            type="button"
            className={className}
            onClick={() => {
              if (disabled) return;
              onChange?.(tab.id);
            }}
            disabled={disabled}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
