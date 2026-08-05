import * as vscode from 'vscode';
import { PmTask } from './tasks';
import { stripHtmlToPlainText } from './html';

const TOKEN_SECRET_KEY = 'projectManagement.apiToken';
const KEEP_EXISTING_TOKEN_SENTINEL = '';

/** Normalize pasted tokens (trim, strip Bearer, drop whitespace/bullets). */
export function sanitizeApiToken(raw: string): string {
  let token = String(raw || '')
    .replace(/[\u2022•·]+/g, '')
    .replace(/^bearer\s+/i, '')
    .trim();
  // Remove accidental whitespace/newlines from paste
  token = token.replace(/\s+/g, '');
  return token;
}

export async function getApiToken(context: vscode.ExtensionContext): Promise<string> {
  return sanitizeApiToken((await context.secrets.get(TOKEN_SECRET_KEY)) || '');
}

export async function setApiToken(context: vscode.ExtensionContext, token: string): Promise<void> {
  const cleaned = sanitizeApiToken(token);
  if (!cleaned) {
    await context.secrets.delete(TOKEN_SECRET_KEY);
    return;
  }
  await context.secrets.store(TOKEN_SECRET_KEY, cleaned);
}

export function getBaseUrl(): string {
  return vscode.workspace.getConfiguration('projectManagement').get<string>('baseUrl', '').replace(/\/+$/, '');
}

export function getRefreshIntervalSeconds(): number {
  return vscode.workspace.getConfiguration('projectManagement').get<number>('refreshIntervalSeconds', 300);
}

export function getAiPromptTemplate(): string {
  return vscode.workspace.getConfiguration('projectManagement').get<string>('aiPromptTemplate', '') || '';
}

export function getAiInProgressStatusId(): number {
  const n = vscode.workspace
    .getConfiguration('projectManagement')
    .get<number>('aiInProgressStatusId', 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function tokenPreview(token: string): string {
  const cleaned = sanitizeApiToken(token);
  if (!cleaned) return '(empty)';
  if (!cleaned.startsWith('pt_')) return '(missing pt_ prefix)';
  if (cleaned.length < 12) return `${cleaned}… (too short)`;
  return `${cleaned.slice(0, 11)}…`;
}

export async function requestJson<T>(
  baseUrl: string,
  token: string,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  if (!baseUrl) {
    throw new Error('Base URL is not configured');
  }
  const cleanedToken = sanitizeApiToken(token);
  if (!cleanedToken) {
    throw new Error('API token is not configured');
  }
  if (!cleanedToken.startsWith('pt_')) {
    throw new Error(
      `API token must start with pt_ (got ${tokenPreview(cleanedToken)}). Create one in Profile → API Tokens.`
    );
  }

  const method = (options?.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cleanedToken}`,
    Accept: 'application/json',
  };

  const init: RequestInit = { method, headers };
  if (options?.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/certificate|SSL|TLS|self.signed/i.test(message)) {
      throw new Error(
        'TLS error (self-signed certificates are not supported in v1). Use a valid certificate or HTTP on LAN/VPN.'
      );
    }
    throw new Error(`Network error: ${message}`);
  }

  const data = (await response.json().catch(() => ({}))) as { message?: string; errors?: unknown };
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const serverMessage = data.message || 'Unauthorized';
      throw new Error(
        `${serverMessage} — check your API token (sent ${tokenPreview(cleanedToken)}) and Base URL`
      );
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
  const user =
    data.user && typeof data.user === 'object'
      ? (data.user as Record<string, unknown>)
      : data;
  return {
    username: String(user.username ?? user.Username ?? ''),
    email: String(user.email ?? user.Email ?? ''),
  };
}

export async function fetchMyTasks(baseUrl: string, token: string): Promise<PmTask[]> {
  const data = await requestJson<{ tasks?: PmTask[] }>(baseUrl, token, '/api/tasks/my-tasks');
  return Array.isArray(data.tasks) ? data.tasks : [];
}

export interface PmStatusValue {
  Id: number;
  StatusName: string;
  ColorCode?: string;
  SortOrder?: number;
  IsClosed?: number | boolean;
  IsCancelled?: number | boolean;
  IsInProgress?: number | boolean;
  HideFromPlanningAndStatistics?: number | boolean;
}

export async function fetchTaskStatuses(
  baseUrl: string,
  token: string,
  organizationId: number
): Promise<PmStatusValue[]> {
  const data = await requestJson<{ statuses?: PmStatusValue[] }>(
    baseUrl,
    token,
    `/api/status-values/task/${organizationId}`
  );
  const list = Array.isArray(data.statuses) ? data.statuses : [];
  return list.slice().sort((a, b) => (a.SortOrder ?? 9999) - (b.SortOrder ?? 9999));
}

export async function updateTaskStatus(
  baseUrl: string,
  token: string,
  taskId: number,
  statusId: number
): Promise<void> {
  await requestJson(baseUrl, token, `/api/tasks/${taskId}`, {
    method: 'PUT',
    body: { status: statusId },
  });
}

export type AiContentMode = 'name' | 'nameDescription' | 'full';

export function buildAiPrompt(
  task: PmTask,
  baseUrl: string,
  mode: AiContentMode,
  customFullTemplate?: string
): string {
  const descriptionPlain = stripHtmlToPlainText(task.Description);
  const appUrl = `${baseUrl}/projects/${task.ProjectId}?tab=tasks&taskId=${task.Id}`;
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
