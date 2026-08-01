'use client';

import React, { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  Bandage,
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  Bug,
  Building2,
  Calendar,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  CirclePlus,
  ClipboardList,
  Clock,
  Code,
  FileText,
  Flag,
  Heart,
  Layers,
  LifeBuoy,
  Lightbulb,
  Link,
  List,
  ListTodo,
  Mail,
  Megaphone,
  Milestone,
  PenTool,
  Phone,
  Puzzle,
  Rocket,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Star,
  Target,
  TestTube2,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

export const TASK_TYPE_ICON_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'feature', label: 'Feature' },
  { value: 'bug', label: 'Bug' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'wrench', label: 'Chore / Maintenance' },
  { value: 'epic', label: 'Epic' },
  { value: 'story', label: 'Story' },
  { value: 'subtask', label: 'Subtask' },
  { value: 'spike', label: 'Spike' },
  { value: 'research', label: 'Research' },
  { value: 'support', label: 'Support' },
  { value: 'hotfix', label: 'Hotfix' },
  { value: 'blocker', label: 'Blocker' },
  { value: 'idea', label: 'Idea' },
  { value: 'design', label: 'Design' },
  { value: 'code', label: 'Development' },
  { value: 'test', label: 'Testing' },
  { value: 'deploy', label: 'Deploy' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'document', label: 'Document' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'users', label: 'Users' },
  { value: 'building', label: 'Organization' },
  { value: 'chart', label: 'Analytics' },
  { value: 'clock', label: 'Schedule' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'bell', label: 'Notification' },
  { value: 'link', label: 'Link' },
  { value: 'flag', label: 'Flag' },
  { value: 'check-circle', label: 'Done' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Favorite' },
  { value: 'bookmark', label: 'Bookmark' },
  { value: 'trophy', label: 'Trophy' },
  { value: 'rocket', label: 'Release' },
  { value: 'target', label: 'Goal' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'puzzle', label: 'Integration' },
  { value: 'settings', label: 'Settings' },
  { value: 'shield', label: 'Compliance' },
  { value: 'lightning', label: 'Urgent' },
  { value: 'megaphone', label: 'Announcement' },
  { value: 'clipboard', label: 'Checklist' },
  { value: 'plus-circle', label: 'Add' },
  { value: 'exclamation', label: 'Alert' },
] as const;

export type TaskTypeIconId = (typeof TASK_TYPE_ICON_OPTIONS)[number]['value'];

export const TASK_TYPE_ICON_IDS = new Set<string>(TASK_TYPE_ICON_OPTIONS.map((option) => option.value));

export const DEFAULT_TASK_TYPE_ICON: TaskTypeIconId = 'task';

export const TASK_TYPE_NAME_ICON_DEFAULTS: Record<string, TaskTypeIconId> = {
  feature: 'feature',
  bug: 'bug',
  improvement: 'improvement',
  chore: 'wrench',
  epic: 'epic',
  story: 'story',
  subtask: 'subtask',
  spike: 'spike',
  task: 'task',
};

const TASK_TYPE_LUCIDE_ICONS: Record<TaskTypeIconId, LucideIcon> = {
  task: ListTodo,
  feature: Sparkles,
  bug: Bug,
  improvement: TrendingUp,
  wrench: Wrench,
  epic: Layers,
  story: BookOpen,
  subtask: List,
  spike: Zap,
  research: Search,
  support: LifeBuoy,
  hotfix: Bandage,
  blocker: Ban,
  idea: Lightbulb,
  design: PenTool,
  code: Code,
  test: TestTube2,
  deploy: Upload,
  security: ShieldCheck,
  performance: BarChart3,
  refactor: Shuffle,
  document: FileText,
  meeting: Users,
  email: Mail,
  phone: Phone,
  users: Users,
  building: Building2,
  chart: ChartColumn,
  clock: Clock,
  calendar: Calendar,
  bell: Bell,
  link: Link,
  flag: Flag,
  'check-circle': CircleCheck,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  trophy: Trophy,
  rocket: Rocket,
  target: Target,
  milestone: Milestone,
  puzzle: Puzzle,
  settings: Settings,
  shield: Shield,
  lightning: Zap,
  megaphone: Megaphone,
  clipboard: ClipboardList,
  'plus-circle': CirclePlus,
  exclamation: CircleAlert,
};

export function inferTaskTypeIconFromName(typeName: string | null | undefined): TaskTypeIconId {
  const normalized = String(typeName || '').trim().toLowerCase();
  return TASK_TYPE_NAME_ICON_DEFAULTS[normalized] || DEFAULT_TASK_TYPE_ICON;
}

export function resolveTaskTypeIcon(
  iconSvg: string | null | undefined,
  typeName?: string | null
): TaskTypeIconId {
  const raw = String(iconSvg ?? '').trim().toLowerCase();
  if (raw && TASK_TYPE_ICON_IDS.has(raw)) {
    return raw as TaskTypeIconId;
  }
  if (typeName) {
    return inferTaskTypeIconFromName(typeName);
  }
  return DEFAULT_TASK_TYPE_ICON;
}

export function getTaskTypeIconLabel(iconSvg: string | null | undefined): string {
  const id = resolveTaskTypeIcon(iconSvg);
  return TASK_TYPE_ICON_OPTIONS.find((option) => option.value === id)?.label || 'Task';
}

export function TaskTypeIcon({
  iconSvg,
  typeName,
  className = 'w-4 h-4',
  iconColor,
}: {
  iconSvg?: string | null;
  typeName?: string | null;
  className?: string;
  iconColor?: string | null;
}) {
  const iconId = resolveTaskTypeIcon(iconSvg, typeName);
  const Icon = TASK_TYPE_LUCIDE_ICONS[iconId];
  return (
    <Icon
      className={className}
      strokeWidth={2}
      aria-hidden="true"
      color={iconColor || undefined}
    />
  );
}

export function TaskTypeIconMark({
  name,
  iconSvg,
  color,
  className = 'w-3.5 h-3.5',
  colored = true,
}: {
  name?: string | null;
  iconSvg?: string | null;
  color?: string | null;
  className?: string;
  colored?: boolean;
}) {
  if (!name && !iconSvg) return null;

  const label = name || getTaskTypeIconLabel(iconSvg);
  const useTypeColor = colored && !!color;
  const icon = (
    <TaskTypeIcon
      iconSvg={iconSvg}
      typeName={name}
      className={className}
      iconColor={useTypeColor ? color : undefined}
    />
  );

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      title={label}
    >
      {icon}
    </span>
  );
}

export function TaskTypeBadge({
  name,
  color,
  iconSvg,
  className = '',
}: {
  name: string;
  color?: string | null;
  iconSvg?: string | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}
      style={color ? { backgroundColor: `${color}20`, color } : undefined}
    >
      <TaskTypeIcon iconSvg={iconSvg} typeName={name} className="w-3.5 h-3.5 shrink-0" />
      <span>{name}</span>
    </span>
  );
}

export function TaskTypeIconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color?: string;
  onChange: (iconId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const selectedId = resolveTaskTypeIcon(value);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return TASK_TYPE_ICON_OPTIONS;
    return TASK_TYPE_ICON_OPTIONS.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query)
    );
  }, [search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          style={color ? { color } : undefined}
        >
          <TaskTypeIcon iconSvg={selectedId} className="w-7 h-7" />
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">Selected icon</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{getTaskTypeIconLabel(selectedId)}</div>
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search icons..."
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
      />

      <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 p-2">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {filteredOptions.map((iconOption) => {
            const selected = selectedId === iconOption.value;
            return (
              <button
                key={iconOption.value}
                type="button"
                onClick={() => onChange(iconOption.value)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={iconOption.label}
                aria-label={iconOption.label}
              >
                <TaskTypeIcon iconSvg={iconOption.value} className="w-7 h-7 shrink-0" />
                <span className="text-[10px] leading-tight text-center line-clamp-2">{iconOption.label}</span>
              </button>
            );
          })}
        </div>
        {filteredOptions.length === 0 && (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No icons match your search.</div>
        )}
      </div>
    </div>
  );
}
