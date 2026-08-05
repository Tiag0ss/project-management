'use client';

import { useState } from 'react';

interface CommitMessageProps {
  message: string;
  /** Show Task # badges extracted from the full message (default true) */
  showTaskBadges?: boolean;
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

/**
 * GitHub-style commit message: subject on one line; expand "…" to show the body
 * (where Task # refs often live).
 */
export default function CommitMessage({ message, showTaskBadges = true }: CommitMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const { subject, body, hasBody } = splitCommitMessage(message);
  const taskIds = showTaskBadges ? extractTaskIdsFromCommitMessage(message) : [];

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
        {taskIds.map((id) => (
          <span
            key={id}
            className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
          >
            Task #{id}
          </span>
        ))}
      </div>
      {hasBody && expanded && (
        <pre className="mt-2 text-sm whitespace-pre-wrap break-words font-sans text-gray-700 dark:text-gray-300">
          {body}
        </pre>
      )}
    </div>
  );
}
