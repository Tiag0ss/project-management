import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PmTask } from './tasks';

const START_MARKER = '# >>> PM-ACTIVE-TASK:START';
const END_MARKER = '# >>> PM-ACTIVE-TASK:END';
const HOOK_MARKER = 'PM-ACTIVE-TASK-HOOK';

export interface ActiveTaskEntry {
  taskId: number;
  projectId: number;
  taskName: string;
  updatedAt: string;
}

export interface ActiveTaskFile {
  tasks: ActiveTaskEntry[];
  updatedAt: string;
}

function formatCommitLine(task: ActiveTaskEntry): string {
  const name = String(task.taskName || '').trim();
  const tag = `Task #${task.taskId}`;
  return name ? `${tag} - ${name}` : tag;
}

function buildCursorrulesBlock(tasks: ActiveTaskEntry[]): string {
  if (tasks.length === 0) {
    return [
      START_MARKER,
      '# Managed by Project Management Kanban extension — do not edit this block by hand.',
      '# No active PM tasks since the last commit.',
      END_MARKER,
    ].join('\n');
  }

  const lines = tasks.map((t) => `- ${formatCommitLine(t)}`);
  const ids = tasks.map((t) => `Task #${t.taskId}`).join(', ');
  return [
    START_MARKER,
    '# Managed by Project Management Kanban extension — do not edit this block by hand.',
    '# Cursor "Generate commit message" reads .cursorrules (not .cursor/rules).',
    'When generating a Git commit message for this repository, include ALL of these task references',
    '(tasks worked on since the last successful commit):',
    ...lines,
    `Always keep every of these references in the message: ${ids}.`,
    'Prefer starting the subject with the most recently activated task, then briefly describe the staged changes.',
    'If more than one task is listed, put the others in the subject or body — do not drop any Task #Id.',
    END_MARKER,
  ].join('\n');
}

function upsertCursorrulesBlock(filePath: string, block: string): void {
  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf8');
  }

  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  let next: string;
  if (start >= 0 && end > start) {
    const before = existing.slice(0, start).replace(/\s+$/, '');
    const after = existing.slice(end + END_MARKER.length).replace(/^\s+/, '');
    next = [before, block, after].filter((p) => p.length > 0).join('\n\n') + '\n';
  } else if (existing.trim()) {
    next = `${existing.replace(/\s+$/, '')}\n\n${block}\n`;
  } else {
    next = `${block}\n`;
  }

  fs.writeFileSync(filePath, next, 'utf8');
}

function findGitRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 40; i++) {
    const gitPath = path.join(dir, '.git');
    try {
      if (fs.existsSync(gitPath)) {
        return dir;
      }
    } catch {
      // continue
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  for (const folder of folders) {
    const root = findGitRoot(folder.uri.fsPath);
    if (root) return root;
  }
  return folders[0].uri.fsPath;
}

function readActiveTaskFile(jsonPath: string): ActiveTaskFile {
  const empty: ActiveTaskFile = { tasks: [], updatedAt: new Date().toISOString() };
  if (!fs.existsSync(jsonPath)) return empty;
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, unknown>;
    // Legacy single-task shape
    if (raw && typeof raw.taskId === 'number') {
      return {
        tasks: [
          {
            taskId: Number(raw.taskId),
            projectId: Number(raw.projectId) || 0,
            taskName: String(raw.taskName || ''),
            updatedAt: String(raw.updatedAt || new Date().toISOString()),
          },
        ],
        updatedAt: String(raw.updatedAt || new Date().toISOString()),
      };
    }
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    return {
      tasks: tasks
        .map((t) => {
          const row = t as Record<string, unknown>;
          return {
            taskId: Number(row.taskId),
            projectId: Number(row.projectId) || 0,
            taskName: String(row.taskName || ''),
            updatedAt: String(row.updatedAt || new Date().toISOString()),
          };
        })
        .filter((t) => Number.isFinite(t.taskId) && t.taskId > 0),
      updatedAt: String(raw.updatedAt || new Date().toISOString()),
    };
  } catch {
    return empty;
  }
}

function writeActiveTaskFile(jsonPath: string, file: ActiveTaskFile): void {
  fs.writeFileSync(jsonPath, JSON.stringify(file, null, 2) + '\n', 'utf8');
}

function clearActiveTaskArtifacts(gitRoot: string): void {
  const jsonPath = path.join(gitRoot, '.git', 'pm-active-task.json');
  const empty: ActiveTaskFile = { tasks: [], updatedAt: new Date().toISOString() };
  try {
    writeActiveTaskFile(jsonPath, empty);
  } catch {
    try {
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    } catch {
      // ignore
    }
  }
  try {
    upsertCursorrulesBlock(path.join(gitRoot, '.cursorrules'), buildCursorrulesBlock([]));
  } catch {
    // ignore
  }
}

function prepareCommitMsgScript(): string {
  return `#!/bin/sh
# ${HOOK_MARKER} v2 — append all Task #Ids from .git/pm-active-task.json when missing
MSG_FILE="$1"
COMMIT_SOURCE="$2"
case "$COMMIT_SOURCE" in
  merge|squash) exit 0 ;;
esac
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
CTX="$ROOT/.git/pm-active-task.json"
[ -f "$CTX" ] || exit 0
[ -f "$MSG_FILE" ] || exit 0
# Collect taskId values (supports multi-task JSON and legacy single object)
IDS="$(grep -oE '"taskId"[[:space:]]*:[[:space:]]*[0-9]+' "$CTX" | grep -oE '[0-9]+' | sort -nu)"
[ -n "$IDS" ] || exit 0
MISSING=""
for TASK_ID in $IDS; do
  if ! grep -Eiq "Task[[:space:]]*#?[[:space:]]*$TASK_ID([^0-9]|$)" "$MSG_FILE"; then
    MISSING="$MISSING $TASK_ID"
  fi
done
MISSING="$(echo "$MISSING" | sed 's/^[[:space:]]*//')"
[ -n "$MISSING" ] || exit 0
printf '\\n' >> "$MSG_FILE"
for TASK_ID in $MISSING; do
  printf 'Task #%s\\n' "$TASK_ID" >> "$MSG_FILE"
done
exit 0
`;
}

function postCommitScript(): string {
  return `#!/bin/sh
# ${HOOK_MARKER} v2 — clear active PM tasks after a successful commit
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
CTX="$ROOT/.git/pm-active-task.json"
RULES="$ROOT/.cursorrules"
# Empty task list
printf '%s\\n' '{
  "tasks": [],
  "updatedAt": "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"
}' > "$CTX" 2>/dev/null || rm -f "$CTX"

# Clear managed .cursorrules block if present
if [ -f "$RULES" ] && grep -q 'PM-ACTIVE-TASK:START' "$RULES" 2>/dev/null; then
  START='# >>> PM-ACTIVE-TASK:START'
  END='# >>> PM-ACTIVE-TASK:END'
  TMP="$(mktemp)"
  awk -v start="$START" -v end="$END" '
    $0 == start { skip=1; print start; print "# Managed by Project Management Kanban extension — do not edit this block by hand."; print "# No active PM tasks since the last commit."; next }
    $0 == end { skip=0; print end; next }
    skip { next }
    { print }
  ' "$RULES" > "$TMP" && mv "$TMP" "$RULES"
fi
exit 0
`;
}

function ensureGitHooks(gitRoot: string): void {
  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  try {
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    const writeHook = (name: string, body: string) => {
      const hookPath = path.join(hooksDir, name);
      if (fs.existsSync(hookPath)) {
        const current = fs.readFileSync(hookPath, 'utf8');
        if (!current.includes(HOOK_MARKER)) {
          return;
        }
      }
      fs.writeFileSync(hookPath, body, { mode: 0o755 });
    };

    writeHook('prepare-commit-msg', prepareCommitMsgScript());
    writeHook('post-commit', postCommitScript());
  } catch {
    // Fail open
  }
}

/**
 * Add/refresh a PM task in the workspace active-task list (does not replace others).
 * Used so Cursor Generate commit message and git hooks know every task worked on
 * since the last successful commit.
 */
export async function setActiveTaskContext(task: PmTask): Promise<void> {
  const taskId = Number(task.Id);
  if (!Number.isFinite(taskId) || taskId <= 0) return;

  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return;

  const entry: ActiveTaskEntry = {
    taskId,
    projectId: Number(task.ProjectId) || 0,
    taskName: String(task.TaskName || '').trim(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const gitRoot = findGitRoot(workspaceRoot) || workspaceRoot;
    const gitDir = path.join(gitRoot, '.git');
    if (!fs.existsSync(gitDir)) return;

    const jsonPath = path.join(gitDir, 'pm-active-task.json');
    const file = readActiveTaskFile(jsonPath);
    const without = file.tasks.filter((t) => t.taskId !== entry.taskId);
    without.push(entry);
    const next: ActiveTaskFile = {
      tasks: without,
      updatedAt: entry.updatedAt,
    };
    writeActiveTaskFile(jsonPath, next);
    ensureGitHooks(gitRoot);

    const rulesPath = path.join(gitRoot, '.cursorrules');
    upsertCursorrulesBlock(rulesPath, buildCursorrulesBlock(next.tasks));
  } catch (error) {
    console.error('setActiveTaskContext failed', error);
  }
}

/** Clear active tasks (e.g. after commit). Exported for tests/manual use. */
export async function clearActiveTaskContext(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) return;
  const gitRoot = findGitRoot(workspaceRoot) || workspaceRoot;
  if (!fs.existsSync(path.join(gitRoot, '.git'))) return;
  clearActiveTaskArtifacts(gitRoot);
}

export function formatTaskCommitMessage(task: PmTask): string {
  const name = String(task.TaskName || '').trim();
  const tag = `Task #${task.Id}`;
  return name ? `${tag} - ${name}` : tag;
}
