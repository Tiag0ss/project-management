'use client';

export type PageTab = {
  id: string;
  label: string;
  href?: string;
};

type PageTabsProps = {
  tabs: PageTab[];
  activeId: string;
  onChange?: (id: string) => void;
};

/** Screen-level top tabs for the new AppShell (not left asides). */
export default function PageTabs({ tabs, activeId, onChange }: PageTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--pm-border)] pb-px">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const className = [
          'shrink-0 rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-[var(--pm-surface-2)] text-[var(--pm-text)] border border-b-transparent border-[var(--pm-border)]'
            : 'text-[var(--pm-muted)] hover:text-[var(--pm-text)]',
        ].join(' ');
        if (tab.href) {
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
            onClick={() => onChange?.(tab.id)}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
