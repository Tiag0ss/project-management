'use client';

import React, { useMemo, useState } from 'react';
import {
  TASK_FORM_FIELD_CATALOG,
  TASK_FORM_TAB_CATALOG,
  TaskFieldVisibilityCatalogItem,
  TaskFieldVisibilityConfig,
  createDefaultTaskFieldVisibility,
} from '@/lib/taskFieldVisibility';

interface TaskFormVisibilityEditorProps {
  value: TaskFieldVisibilityConfig;
  onChange: (next: TaskFieldVisibilityConfig) => void;
  disabled?: boolean;
}

type EditorArea = 'tabs' | 'labels' | 'header' | 'details' | 'hours';

const AREA_META: { id: EditorArea; label: string; description: string }[] = [
  {
    id: 'tabs',
    label: 'Modal tabs',
    description: 'Which tabs appear in the task modal.',
  },
  {
    id: 'labels',
    label: 'Section labels',
    description: 'Show or hide section headings to save space. Fields stay visible.',
  },
  {
    id: 'header',
    label: 'Header',
    description: 'Controls above the tabs (pills, timer, tags, actions).',
  },
  {
    id: 'details',
    label: 'Details tab',
    description: 'Fields inside the Details tab.',
  },
  {
    id: 'hours',
    label: 'Hours tab',
    description: 'Planning, allocations, and time entries.',
  },
];

function areaForSection(section: string): Exclude<EditorArea, 'tabs'> {
  if (section === 'Section labels') return 'labels';
  if (section === 'Header') return 'header';
  if (section === 'Hours' || section.startsWith('Hours ')) return 'hours';
  return 'details';
}

function VisibilityRow({
  label,
  hint,
  checked,
  locked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  locked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
        locked || disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${
        checked
          ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
          : 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 opacity-75'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        checked={checked}
        disabled={locked || disabled}
        onChange={(e) => onChange(e.target.checked)}
        title={locked ? `${label} is required` : `Toggle ${label}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
          {locked && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              Required
            </span>
          )}
          {!locked && !checked && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
              Hidden
            </span>
          )}
        </span>
        {hint && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

function SectionBlock({
  title,
  items,
  config,
  disabled,
  kind,
  onToggleField,
  onToggleTab,
  onSetSectionVisible,
}: {
  title: string;
  items: TaskFieldVisibilityCatalogItem[];
  config: TaskFieldVisibilityConfig;
  disabled?: boolean;
  kind: 'field' | 'tab';
  onToggleField: (key: string, visible: boolean) => void;
  onToggleTab: (key: string, visible: boolean) => void;
  onSetSectionVisible?: (visible: boolean) => void;
}) {
  const optionalItems = items.filter((item) => !item.locked);
  const allOptionalVisible =
    optionalItems.length > 0 &&
    optionalItems.every((item) =>
      kind === 'tab' ? config.tabs[item.key] !== false : config.fields[item.key] !== false
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        {onSetSectionVisible && optionalItems.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSetSectionVisible(!allOptionalVisible)}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {allOptionalVisible ? 'Hide all optional' : 'Show all optional'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {items.map((item) => {
          const checked =
            kind === 'tab' ? config.tabs[item.key] !== false : config.fields[item.key] !== false;
          return (
            <VisibilityRow
              key={item.key}
              label={item.label}
              hint={item.hint}
              checked={checked}
              locked={item.locked}
              disabled={disabled}
              onChange={(next) =>
                kind === 'tab' ? onToggleTab(item.key, next) : onToggleField(item.key, next)
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export default function TaskFormVisibilityEditor({
  value,
  onChange,
  disabled = false,
}: TaskFormVisibilityEditorProps) {
  const [activeArea, setActiveArea] = useState<EditorArea>('tabs');

  const config = useMemo(() => {
    const defaults = createDefaultTaskFieldVisibility();
    return {
      fields: { ...defaults.fields, ...value.fields },
      tabs: { ...defaults.tabs, ...value.tabs },
    };
  }, [value]);

  const setField = (key: string, visible: boolean) => {
    onChange({
      ...config,
      fields: { ...config.fields, [key]: visible },
    });
  };

  const setTab = (key: string, visible: boolean) => {
    onChange({
      ...config,
      tabs: { ...config.tabs, [key]: visible },
    });
  };

  const fieldsBySection = useMemo(() => {
    const map = new Map<string, TaskFieldVisibilityCatalogItem[]>();
    for (const field of TASK_FORM_FIELD_CATALOG) {
      const section = field.section || 'Other';
      const list = map.get(section) || [];
      list.push(field);
      map.set(section, list);
    }
    return map;
  }, []);

  const sectionsForArea = useMemo(() => {
    return Array.from(fieldsBySection.entries()).filter(([section]) => areaForSection(section) === activeArea);
  }, [activeArea, fieldsBySection]);

  const areaCounts = useMemo(() => {
    const counts: Record<EditorArea, { visible: number; total: number }> = {
      tabs: { visible: 0, total: 0 },
      labels: { visible: 0, total: 0 },
      header: { visible: 0, total: 0 },
      details: { visible: 0, total: 0 },
      hours: { visible: 0, total: 0 },
    };

    for (const tab of TASK_FORM_TAB_CATALOG) {
      counts.tabs.total += 1;
      if (config.tabs[tab.key] !== false) counts.tabs.visible += 1;
    }
    for (const field of TASK_FORM_FIELD_CATALOG) {
      const area = areaForSection(field.section || 'Other');
      counts[area].total += 1;
      if (config.fields[field.key] !== false) counts[area].visible += 1;
    }
    return counts;
  }, [config]);

  const setSectionVisible = (sectionFields: TaskFieldVisibilityCatalogItem[], visible: boolean) => {
    const nextFields = { ...config.fields };
    for (const field of sectionFields) {
      if (!field.locked) nextFields[field.key] = visible;
    }
    onChange({ ...config, fields: nextFields });
  };

  const activeMeta = AREA_META.find((area) => area.id === activeArea)!;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 p-2 space-y-1 bg-gray-50 dark:bg-gray-900/40">
          {AREA_META.map((area) => {
            const counts = areaCounts[area.id];
            const selected = activeArea === area.id;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => setActiveArea(area.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="text-sm font-medium">{area.label}</div>
                <div className={`text-xs mt-0.5 ${selected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                  {counts.visible}/{counts.total} visible
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-4 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{activeMeta.label}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{activeMeta.description}</p>
          </div>

          {activeArea === 'tabs' ? (
            <SectionBlock
              title="Tabs in the task modal"
              items={TASK_FORM_TAB_CATALOG}
              config={config}
              disabled={disabled}
              kind="tab"
              onToggleField={setField}
              onToggleTab={setTab}
              onSetSectionVisible={(visible) => {
                const nextTabs = { ...config.tabs };
                for (const tab of TASK_FORM_TAB_CATALOG) {
                  if (!tab.locked) nextTabs[tab.key] = visible;
                }
                onChange({ ...config, tabs: nextTabs });
              }}
            />
          ) : (
            sectionsForArea.map(([section, fields]) => (
              <SectionBlock
                key={section}
                title={section}
                items={fields}
                config={config}
                disabled={disabled}
                kind="field"
                onToggleField={setField}
                onToggleTab={setTab}
                onSetSectionVisible={(visible) => setSectionVisible(fields, visible)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
