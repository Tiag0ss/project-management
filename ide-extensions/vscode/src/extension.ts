import * as vscode from 'vscode';
import { getApiToken, getBaseUrl, testConnection } from './api';
import { configureConnection } from './aiChat';
import { KanbanPanel } from './kanbanPanel';

class LauncherProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const open = new vscode.TreeItem('Open Kanban Board', vscode.TreeItemCollapsibleState.None);
    open.command = { command: 'pm.openKanban', title: 'Open Kanban Board' };
    open.iconPath = new vscode.ThemeIcon('layout');
    open.tooltip = 'Opens the project Kanban in an editor tab';

    const configure = new vscode.TreeItem('Configure Connection', vscode.TreeItemCollapsibleState.None);
    configure.command = { command: 'pm.configure', title: 'Configure Connection' };
    configure.iconPath = new vscode.ThemeIcon('gear');

    return [open, configure];
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const openKanban = () => KanbanPanel.show(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('pm.kanbanLauncher', new LauncherProvider()),
    vscode.commands.registerCommand('pm.openKanban', openKanban),
    vscode.commands.registerCommand('pm.refreshKanban', async () => {
      if (!KanbanPanel.current) {
        openKanban();
        return;
      }
      await KanbanPanel.current.refresh();
    }),
    vscode.commands.registerCommand('pm.configure', async () => {
      const ok = await configureConnection(context);
      if (ok) {
        if (KanbanPanel.current) await KanbanPanel.current.refresh();
        else openKanban();
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
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('projectManagement.refreshIntervalSeconds') &&
        KanbanPanel.current
      ) {
        KanbanPanel.current.scheduleRefresh();
      }
      if (
        event.affectsConfiguration('projectManagement.baseUrl') ||
        event.affectsConfiguration('projectManagement.kanbanLayout') ||
        event.affectsConfiguration('projectManagement.kanbanHiddenStatuses') ||
        event.affectsConfiguration('projectManagement.kanbanMaxVisibleCards')
      ) {
        void KanbanPanel.current?.refresh();
      }
    })
  );
}

export function deactivate(): void {
  KanbanPanel.current?.dispose();
}
