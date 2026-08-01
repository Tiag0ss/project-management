import * as vscode from 'vscode';
import { PmTask, groupByProject, isPendingTask } from './tasks';
import { stripHtmlToPlainText } from './html';

export class ProjectNode extends vscode.TreeItem {
  constructor(
    public readonly projectName: string,
    public readonly tasks: PmTask[]
  ) {
    super(projectName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = `${tasks.length}`;
  }
}

export class TaskNode extends vscode.TreeItem {
  constructor(public readonly task: PmTask) {
    super(task.TaskName, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'task';
    this.id = String(task.Id);
    this.iconPath = new vscode.ThemeIcon('checklist');

    const due = task.DueDate ? String(task.DueDate).split('T')[0] : '';
    const bits = [task.StatusName, task.PriorityName, due].filter(Boolean);
    this.description = bits.join(' · ');

    const plain = stripHtmlToPlainText(task.Description);
    this.tooltip = new vscode.MarkdownString(
      `**${task.TaskName}**\n\n${task.ProjectName || ''}\n\n${plain || '_No description_'}`.trim()
    );
  }
}

type TreeNode = ProjectNode | TaskNode;

export class PendingTasksProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private tasks: PmTask[] = [];
  private lastError = '';

  refresh(tasks: PmTask[], error = ''): void {
    this.tasks = tasks.filter(isPendingTask);
    this.lastError = error;
    this._onDidChangeTreeData.fire();
  }

  getPendingCount(): number {
    return this.tasks.length;
  }

  getLastError(): string {
    return this.lastError;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (this.lastError && !element) {
      const err = new vscode.TreeItem(this.lastError);
      err.iconPath = new vscode.ThemeIcon('error');
      return [err as TreeNode];
    }

    if (!element) {
      const grouped = groupByProject(this.tasks);
      return [...grouped.entries()].map(([name, tasks]) => new ProjectNode(name, tasks));
    }

    if (element instanceof ProjectNode) {
      return element.tasks.map((task) => new TaskNode(task));
    }

    return [];
  }
}
