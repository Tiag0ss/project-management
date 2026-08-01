import * as vscode from 'vscode';
import {
  fetchMyTasks,
  getApiToken,
  getBaseUrl,
  getRefreshIntervalSeconds,
  testConnection,
} from './api';
import { configureConnection, runSendToAiChat } from './aiChat';
import { PendingTasksProvider, TaskNode } from './tree';

let refreshTimer: ReturnType<typeof setInterval> | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new PendingTasksProvider();
  const treeView = vscode.window.createTreeView('pm.pendingTasks', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.command = 'pm.refreshTasks';
  statusBar.show();

  const updateStatus = (count: number, error?: string) => {
    if (error) {
      statusBar.text = '$(error) PM tasks';
      statusBar.tooltip = error;
      return;
    }
    statusBar.text = `$(checklist) ${count} pending`;
    statusBar.tooltip = 'Project Management — pending tasks (click to refresh)';
  };

  const refresh = async (silent = false) => {
    const baseUrl = getBaseUrl();
    const token = await getApiToken(context);
    if (!baseUrl || !token) {
      provider.refresh([], 'Configure Base URL and API token (click … or run Configure Connection)');
      updateStatus(0, 'Not configured');
      if (!silent) {
        void vscode.window.showWarningMessage('Configure Project Management connection first.');
      }
      return;
    }

    try {
      const tasks = await fetchMyTasks(baseUrl, token);
      provider.refresh(tasks);
      updateStatus(provider.getPendingCount());
      if (!silent) {
        void vscode.window.setStatusBarMessage(`Pending tasks refreshed (${provider.getPendingCount()})`, 2500);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      provider.refresh([], message);
      updateStatus(0, message);
      if (!silent) {
        void vscode.window.showErrorMessage(message);
      }
    }
  };

  const scheduleRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
    const seconds = getRefreshIntervalSeconds();
    if (seconds > 0) {
      refreshTimer = setInterval(() => {
        void refresh(true);
      }, seconds * 1000);
    }
  };

  context.subscriptions.push(
    treeView,
    statusBar,
    vscode.commands.registerCommand('pm.refreshTasks', () => refresh(false)),
    vscode.commands.registerCommand('pm.configure', async () => {
      const ok = await configureConnection(context);
      if (ok) {
        await refresh(true);
      }
    }),
    vscode.commands.registerCommand('pm.testConnection', async () => {
      try {
        const profile = await testConnection(getBaseUrl(), await getApiToken(context));
        void vscode.window.showInformationMessage(
          `Connected as ${profile.username || profile.email || 'user'}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Connection failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('pm.openInBrowser', async (item?: TaskNode) => {
      const node = item instanceof TaskNode ? item : undefined;
      if (!node) {
        void vscode.window.showWarningMessage('Select a task first.');
        return;
      }
      const baseUrl = getBaseUrl();
      if (!baseUrl) {
        void vscode.window.showWarningMessage('Configure Base URL first.');
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/projects/${node.task.ProjectId}`));
    }),
    vscode.commands.registerCommand('pm.sendToAiChat', async (item?: TaskNode) => {
      const node = item instanceof TaskNode ? item : undefined;
      if (!node) {
        void vscode.window.showWarningMessage('Select a task first.');
        return;
      }
      await runSendToAiChat(node);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('projectManagement.refreshIntervalSeconds')) {
        scheduleRefresh();
      }
      if (event.affectsConfiguration('projectManagement.baseUrl')) {
        void refresh(true);
      }
    })
  );

  scheduleRefresh();
  await refresh(true);
}

export function deactivate(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
}
