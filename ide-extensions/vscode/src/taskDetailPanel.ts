import * as vscode from 'vscode';
import { getApiToken, getBaseUrl, requestJson } from './api';
import { runSendToAiForTask } from './aiChat';
import { stripHtmlToPlainText } from './html';
import { PmTask } from './tasks';

export function taskDeepLink(baseUrl: string, projectId: number, taskId: number): string {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return `${base}/projects/${projectId}?tab=tasks&taskId=${taskId}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

type ActiveTimer = { Id: number; TaskId?: number; TaskName?: string; StartedAt?: string } | null;

/**
 * Read-only task viewer in an editor tab (cannot host the React TaskDetailModal).
 * “Open in app” uses the same deep link that opens TaskDetailModal in the web UI.
 */
export class TaskDetailPanel {
  public static current: TaskDetailPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private activeTimer: ActiveTimer = null;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private task: PmTask,
    panel: vscode.WebviewPanel
  ) {
    this.panel = panel;
    this.panel.webview.options = { enableScripts: true };
    void this.refreshTimerAndRender();

    this.panel.webview.onDidReceiveMessage(
      async (msg: { type?: string }) => {
        if (!msg?.type) return;
        if (msg.type === 'openInApp') {
          const url = taskDeepLink(getBaseUrl(), Number(this.task.ProjectId), Number(this.task.Id));
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        if (msg.type === 'copyLink') {
          const url = taskDeepLink(getBaseUrl(), Number(this.task.ProjectId), Number(this.task.Id));
          await vscode.env.clipboard.writeText(url);
          void vscode.window.showInformationMessage('Task link copied to clipboard.');
        }
        if (msg.type === 'sendToAi') {
          await runSendToAiForTask(this.task);
        }
        if (msg.type === 'startTimer') {
          await this.startTimer();
        }
        if (msg.type === 'stopTimer') {
          await this.stopTimer();
        }
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static show(context: vscode.ExtensionContext, task: PmTask): TaskDetailPanel {
    const title = `Task: ${task.TaskName || task.Id}`.slice(0, 80);
    if (TaskDetailPanel.current) {
      TaskDetailPanel.current.task = task;
      TaskDetailPanel.current.panel.title = title;
      void TaskDetailPanel.current.refreshTimerAndRender();
      TaskDetailPanel.current.panel.reveal(vscode.ViewColumn.Beside, false);
      return TaskDetailPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'pm.taskDetail',
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    TaskDetailPanel.current = new TaskDetailPanel(context, task, panel);
    return TaskDetailPanel.current;
  }

  dispose(): void {
    TaskDetailPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async refreshTimerAndRender(): Promise<void> {
    try {
      const baseUrl = getBaseUrl();
      const token = await getApiToken(this.context);
      if (baseUrl && token) {
        const data = await requestJson<{ timer?: ActiveTimer }>(baseUrl, token, '/api/timers/active');
        this.activeTimer = data.timer || null;
      } else {
        this.activeTimer = null;
      }
    } catch {
      this.activeTimer = null;
    }
    this.render();
  }

  private async startTimer(): Promise<void> {
    try {
      const baseUrl = getBaseUrl();
      const token = await getApiToken(this.context);
      const data = await requestJson<{ timer?: ActiveTimer }>(baseUrl, token, '/api/timers/start', {
        method: 'POST',
        body: { taskId: Number(this.task.Id), clientTimezone: clientTimezone() },
      });
      this.activeTimer = data.timer || null;
      this.render();
      void vscode.window.showInformationMessage(`Timer started on “${this.task.TaskName || this.task.Id}”.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  private async stopTimer(): Promise<void> {
    if (!this.activeTimer?.Id) return;
    try {
      const baseUrl = getBaseUrl();
      const token = await getApiToken(this.context);
      await requestJson(baseUrl, token, `/api/timers/${this.activeTimer.Id}/stop`, {
        method: 'POST',
        body: { clientTimezone: clientTimezone() },
      });
      this.activeTimer = null;
      this.render();
      void vscode.window.showInformationMessage('Timer stopped.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  private render(): void {
    const t = this.task;
    const due = t.DueDate ? String(t.DueDate).split('T')[0] : '—';
    const description = stripHtmlToPlainText(t.Description) || '—';
    const runningHere = this.activeTimer && Number(this.activeTimer.TaskId) === Number(t.Id);
    const timerBtn = runningHere
      ? `<button type="button" class="secondary" id="stopTimer">Stop timer</button>`
      : `<button type="button" class="secondary" id="startTimer">Start timer</button>`;

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>${escapeHtml(t.TaskName)}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; font-size: 12px; opacity: 0.9; }
    .pill { padding: 2px 8px; border-radius: 999px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    section { margin-bottom: 16px; }
    h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; margin: 0 0 6px; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: inherit; line-height: 1.45; }
    .hint { font-size: 12px; opacity: 0.7; }
  </style>
</head>
<body>
  <h1>${escapeHtml(t.TaskName || 'Untitled task')}</h1>
  <div class="meta">
    ${t.ProjectName ? `<span class="pill">${escapeHtml(t.ProjectName)}</span>` : ''}
    ${t.StatusName ? `<span class="pill">${escapeHtml(t.StatusName)}</span>` : ''}
    ${t.TaskTypeName ? `<span class="pill"${t.TaskTypeColor ? ` style="border:1px solid ${escapeHtml(t.TaskTypeColor)};color:${escapeHtml(t.TaskTypeColor)}"` : ''}>${escapeHtml(t.TaskTypeName)}</span>` : ''}
    ${t.PriorityName ? `<span class="pill">${escapeHtml(t.PriorityName)}</span>` : ''}
    <span class="pill">Due ${escapeHtml(due)}</span>
    <span class="pill">#${escapeHtml(t.Id)}</span>
    ${runningHere ? `<span class="pill">Timer running</span>` : ''}
  </div>
  <div class="actions">
    <button type="button" id="openApp">Open in app</button>
    <button type="button" class="secondary" id="copyLink">Copy link</button>
    ${timerBtn}
    <button type="button" class="secondary" id="ai">Send to AI</button>
  </div>
  <p class="hint">Read-only preview. “Open in app” opens the full task modal in Project Management.</p>
  <section>
    <h2>Description</h2>
    <pre>${escapeHtml(description)}</pre>
  </section>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('openApp').addEventListener('click', () => vscode.postMessage({ type: 'openInApp' }));
    document.getElementById('copyLink').addEventListener('click', () => vscode.postMessage({ type: 'copyLink' }));
    document.getElementById('ai').addEventListener('click', () => vscode.postMessage({ type: 'sendToAi' }));
    const startBtn = document.getElementById('startTimer');
    const stopBtn = document.getElementById('stopTimer');
    if (startBtn) startBtn.addEventListener('click', () => vscode.postMessage({ type: 'startTimer' }));
    if (stopBtn) stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'stopTimer' }));
  </script>
</body>
</html>`;
  }
}
