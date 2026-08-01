import * as vscode from 'vscode';
import { PmTask } from './tasks';
import { stripHtmlToPlainText } from './html';

const TOKEN_SECRET_KEY = 'projectManagement.apiToken';

export async function getApiToken(context: vscode.ExtensionContext): Promise<string> {
  return (await context.secrets.get(TOKEN_SECRET_KEY)) || '';
}

export async function setApiToken(context: vscode.ExtensionContext, token: string): Promise<void> {
  if (!token) {
    await context.secrets.delete(TOKEN_SECRET_KEY);
    return;
  }
  await context.secrets.store(TOKEN_SECRET_KEY, token.trim());
}

export function getBaseUrl(): string {
  return vscode.workspace.getConfiguration('projectManagement').get<string>('baseUrl', '').replace(/\/+$/, '');
}

export function getRefreshIntervalSeconds(): number {
  return vscode.workspace.getConfiguration('projectManagement').get<number>('refreshIntervalSeconds', 300);
}

export function getAiAutoSubmit(): boolean {
  return vscode.workspace.getConfiguration('projectManagement').get<boolean>('aiAutoSubmit', false);
}

export function getAiPromptTemplate(): string {
  return vscode.workspace.getConfiguration('projectManagement').get<string>('aiPromptTemplate', '') || '';
}

async function requestJson<T>(baseUrl: string, token: string, path: string): Promise<T> {
  if (!baseUrl) {
    throw new Error('Base URL is not configured');
  }
  if (!token) {
    throw new Error('API token is not configured');
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/certificate|SSL|TLS|self.signed/i.test(message)) {
      throw new Error(
        'TLS error (self-signed certificates are not supported in v1). Use a valid certificate or HTTP on LAN/VPN.'
      );
    }
    throw new Error(`Network error: ${message}`);
  }

  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Unauthorized — check your API token (pt_…)');
    }
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data as T;
}

export async function testConnection(
  baseUrl: string,
  token: string
): Promise<{ username: string; email: string }> {
  const data = await requestJson<Record<string, unknown>>(baseUrl, token, '/api/user/profile');
  return {
    username: String(data.username ?? data.Username ?? ''),
    email: String(data.email ?? data.Email ?? ''),
  };
}

export async function fetchMyTasks(baseUrl: string, token: string): Promise<PmTask[]> {
  const data = await requestJson<{ tasks?: PmTask[] }>(baseUrl, token, '/api/tasks/my-tasks');
  return Array.isArray(data.tasks) ? data.tasks : [];
}

export type AiContentMode = 'name' | 'nameDescription' | 'full';

export function buildAiPrompt(
  task: PmTask,
  baseUrl: string,
  mode: AiContentMode,
  customFullTemplate?: string
): string {
  const descriptionPlain = stripHtmlToPlainText(task.Description);
  const appUrl = `${baseUrl}/projects/${task.ProjectId}`;
  const due = task.DueDate ? String(task.DueDate).split('T')[0] : '—';

  if (mode === 'name') {
    return `Help me work on this task: ${task.TaskName}`;
  }

  if (mode === 'nameDescription') {
    return [
      'Help me work on this task:',
      '',
      `Title: ${task.TaskName}`,
      '',
      'Description:',
      descriptionPlain || '—',
    ].join('\n');
  }

  const template =
    (customFullTemplate || '').trim() ||
    [
      'Help me work on this task:',
      '',
      'Title: {TaskName}',
      'Project: {ProjectName}',
      'Status: {StatusName}',
      'Priority: {PriorityName}',
      'Due: {DueDate}',
      '',
      'Description:',
      '{DescriptionPlain}',
      '',
      'App: {AppUrl}',
    ].join('\n');

  return template
    .replaceAll('{TaskName}', task.TaskName || '—')
    .replaceAll('{ProjectName}', task.ProjectName || '—')
    .replaceAll('{StatusName}', task.StatusName || '—')
    .replaceAll('{PriorityName}', task.PriorityName || '—')
    .replaceAll('{DueDate}', due)
    .replaceAll('{DescriptionPlain}', descriptionPlain || '—')
    .replaceAll('{AppUrl}', appUrl);
}
