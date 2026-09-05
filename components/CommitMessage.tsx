'use client';

import { useEffect, useState } from 'react';
import { tasksApi } from '@/lib/api/tasks';

interface CommitMessageProps {
  message: string;
  /** Show Task # badges extracted from the full message (default true) */
  showTaskBadges?: boolean;
  /** Optional auth token to resolve task names for tooltips */
  token?: string;
  /** Preloaded task names (Id → TaskName); missing ids are fetched when token is set */
  taskNamesById?: Record<number, string>;
  /** Open TaskDetailModal (or switch task) when a badge is clicked */
  onTaskClick?: (taskId: number) => void;
}

/** Split subject (first line) from body; ignore blank lines when deciding expandability. */
export function splitCommitMessage(message: string): { subject: string; body: string; hasBody: boolean } {
  const raw = message || '';
  const lines = raw.split(/\r?\n/);
  const subject = (lines[0] || '').trim() || '(no message)';
  const body = lines.slice(1).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  const hasBody = body.trim().length > 0;
  return { subject, body, hasBody };
}

/** Collect unique Task #N references from the full commit message. */
export function extractTaskIdsFromCommitMessage(message: string): number[] {
  const ids = new Set<number>();
  const re = /\bTask\s*#?\s*(\d+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(message || '')) !== null) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return Array.from(ids);
}

const taskNameCache = new Map<number, string>();

/**
 * GitHub-style commit message: subject on one line; expand "…" to show the body
 * (where Task # refs often live). Task badges open details and show the name on hover.
 */
export default function CommitMessage({
  message,
  showTaskBadges = true,
  token,
  taskNamesById,
  onTaskClick,
}: CommitMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const { subject, body, hasBody } = splitCommitMessage(message);
  const taskIds = showTaskBadges ? extractTaskIdsFromCommitMessage(message) : [];
  const [resolvedNames, setResolvedNames] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = { ...(taskNamesById || {}) };
    for (const id of taskIds) {
      if (!initial[id] && taskNameCache.has(id)) {
        initial[id] = taskNameCache.get(id)!;
      }
    }
    return initial;
  });

  useEffect(() => {
    if (taskNamesById) {
      setResolvedNames((prev) => ({ ...prev, ...taskNamesById }));
      for (const [id, name] of Object.entries(taskNamesById)) {
        const numId = Number(id);
        if (name) taskNameCache.set(numId, name);
      }
    }
  }, [taskNamesById]);

  useEffect(() => {
    if (!token || taskIds.length === 0) return;

    const missing = taskIds.filter((id) => !resolvedNames[id] && !taskNameCache.has(id));
    if (missing.length === 0) {
      const fromCache: Record<number, string> = {};
      for (const id of taskIds) {
        if (!resolvedNames[id] && taskNameCache.has(id)) {
          fromCache[id] = taskNameCache.get(id)!;
        }
      }
      if (Object.keys(fromCache).length > 0) {
        setResolvedNames((prev) => ({ ...prev, ...fromCache }));
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => {
          try {
            const res = await tasksApi.getById(id, token);
            const name = String(res.task?.TaskName || '').trim();
            if (name) taskNameCache.set(id, name);
            return [id, name] as const;
          } catch {
            return [id, ''] as const;
          }
        })
      );
      if (cancelled) return;
      const next: Record<number, string> = {};
      for (const [id, name] of entries) {
        if (name) next[id] = name;
      }
      if (Object.keys(next).length > 0) {
        setResolvedNames((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // resolvedNames intentionally omitted — only re-fetch when ids/token change
     
  }, [token, taskIds.join(',')]);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-gray-900 dark:text-white break-words">
          {subject}
        </span>
        {hasBody && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center justify-center shrink-0 px-1.5 py-0.5 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title={expanded ? 'Hide commit details' : 'Show commit details'}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide commit details' : 'Show commit details'}
          >
            …
          </button>
        )}
        {taskIds.map((id) => {
          const name = resolvedNames[id] || taskNameCache.get(id) || '';
          const label = name ? `${name} (Task #${id})` : `Task #${id}`;
          const clickable = typeof onTaskClick === 'function';
          const className =
            'text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' +
            (clickable
              ? ' hover:bg-indigo-200 dark:hover:bg-indigo-900/60 cursor-pointer transition-colors'
              : '');

          if (clickable) {
            return (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => onTaskClick(id)}
                className={className}
              >
                Task #{id}
              </button>
            );
          }

          return (
            <span key={id} title={label} className={className}>
              Task #{id}
            </span>
          );
        })}
      </div>
      {hasBody && expanded && (
        <pre className="mt-2 text-sm whitespace-pre-wrap break-words font-sans text-gray-700 dark:text-gray-300">
          {body}
        </pre>
      )}
    </div>
  );
}
