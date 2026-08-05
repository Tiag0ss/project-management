import * as vscode from 'vscode';
import { getApiToken, getBaseUrl, requestJson } from './api';
import { configureConnection, runSendToAiForTask } from './aiChat';
import { PmTask } from './tasks';

const SELECTED_PROJECT_KEY = 'projectManagement.selectedProjectId';

type BoardToHostMessage =
  | { type: 'ready' }
  | { type: 'projectSelected'; projectId: number | null }
  | { type: 'sendToAi'; task: PmTask }
  | { type: 'openExternal'; url: string }
  | { type: 'configure' }
  | { type: 'error'; message: string }
  | {
      type: 'apiRequest';
      requestId: string;
      path: string;
      method?: string;
      body?: unknown;
    };

export function getKanbanLayout(): 'horizontal' | 'vertical' {
  const v = vscode.workspace
    .getConfiguration('projectManagement')
    .get<string>('kanbanLayout', 'horizontal');
  return v === 'vertical' ? 'vertical' : 'horizontal';
}

export function getKanbanHiddenStatuses(): string {
  return (
    vscode.workspace.getConfiguration('projectManagement').get<string>('kanbanHiddenStatuses', '') ||
    ''
  );
}

export function getKanbanMaxVisibleCards(): number {
  const n = vscode.workspace
    .getConfiguration('projectManagement')
    .get<number>('kanbanMaxVisibleCards', 2);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 2;
}

/**
 * Hosts the Kanban board in an editor tab (WebviewPanel) — not the narrow sidebar.
 */
export class KanbanPanel {
  public static current: KanbanPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ) {
    this.panel = panel;
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media', 'kanban')],
    };
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      async (raw: BoardToHostMessage) => this.onBoardMessage(raw),
      null,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.visible) void this.pushConfig();
      },
      null,
      this.disposables
    );

    void this.pushConfig();
    this.scheduleRefresh();
  }

  static show(context: vscode.ExtensionContext): KanbanPanel {
    if (KanbanPanel.current) {
      KanbanPanel.current.panel.reveal(vscode.ViewColumn.Active, false);
      void KanbanPanel.current.pushConfig();
      return KanbanPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'pm.kanbanPanel',
      'PM Kanban',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media', 'kanban')],
      }
    );
    KanbanPanel.current = new KanbanPanel(context, panel);
    return KanbanPanel.current;
  }

  async refresh(): Promise<void> {
    await this.pushConfig(true);
  }

  scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    const seconds = vscode.workspace
      .getConfiguration('projectManagement')
      .get<number>('refreshIntervalSeconds', 300);
    if (seconds > 0) {
      this.refreshTimer = setInterval(() => {
        void this.post({ type: 'refresh' });
      }, seconds * 1000);
    }
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    KanbanPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async onBoardMessage(msg: BoardToHostMessage): Promise<void> {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'ready':
        await this.pushConfig();
        break;
      case 'projectSelected': {
        const id = msg.projectId == null ? undefined : Number(msg.projectId);
        if (id && id > 0) {
          await this.context.globalState.update(SELECTED_PROJECT_KEY, id);
        } else {
          await this.context.globalState.update(SELECTED_PROJECT_KEY, undefined);
        }
        break;
      }
      case 'configure': {
        const ok = await configureConnection(this.context);
        if (ok) await this.pushConfig();
        break;
      }
      case 'openExternal': {
        if (msg.url) {
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        break;
      }
      case 'sendToAi': {
        if (msg.task) {
          await runSendToAiForTask(msg.task);
        }
        break;
      }
      case 'apiRequest': {
        await this.handleApiRequest(msg);
        break;
      }
      case 'error': {
        if (msg.message) {
          void vscode.window.showErrorMessage(msg.message);
        }
        break;
      }
      default:
        break;
    }
  }

  private async handleApiRequest(msg: {
    requestId: string;
    path: string;
    method?: string;
    body?: unknown;
  }): Promise<void> {
    try {
      const baseUrl = getBaseUrl();
      const token = await getApiToken(this.context);
      const data = await requestJson(baseUrl, token, msg.path, {
        method: msg.method,
        body: msg.body,
      });
      await this.post({
        type: 'apiResponse',
        requestId: msg.requestId,
        ok: true,
        data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.post({
        type: 'apiResponse',
        requestId: msg.requestId,
        ok: false,
        error: message,
      });
    }
  }

  private async pushConfig(forceRefresh = false): Promise<void> {
    const baseUrl = getBaseUrl();
    const selectedProjectId = this.context.globalState.get<number>(SELECTED_PROJECT_KEY);
    await this.post({
      type: 'config',
      baseUrl,
      token: '',
      proxyViaHost: true,
      selectedProjectId: selectedProjectId ?? null,
      layout: getKanbanLayout(),
      hiddenStatuses: getKanbanHiddenStatuses(),
      maxVisibleCards: getKanbanMaxVisibleCards(),
    });
    if (forceRefresh) {
      await this.post({ type: 'refresh' });
    }
  }

  private async post(message: unknown): Promise<void> {
    await this.panel.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'kanban', 'board.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'kanban', 'board.js')
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: https: http:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'unsafe-inline'`,
      `connect-src 'none'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Project Management — Kanban</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <div id="toolbar">
    <label for="projectSelect">Project</label>
    <select id="projectSelect" aria-label="Project"></select>
    <button type="button" id="refreshBtn">Refresh</button>
    <button type="button" id="configureBtn" class="primary">Configure</button>
  </div>
  <div id="statusLine" aria-live="polite"></div>
  <div id="board" role="list"></div>
  <div id="emptyState"></div>
  <script>
    const __vscode = acquireVsCodeApi();
    window.__PM_VSCODE__ = __vscode;
  </script>
  <script src="${jsUri}"></script>
</body>
</html>`;
  }
}
