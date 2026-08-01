import * as vscode from 'vscode';
import {
  AiContentMode,
  buildAiPrompt,
  getAiAutoSubmit,
  getAiPromptTemplate,
  getApiToken,
  getBaseUrl,
  setApiToken,
  testConnection,
} from './api';
import { TaskNode } from './tree';
import { PmTask } from './tasks';

function isCursorHost(): boolean {
  const name = (vscode.env.appName || '').toLowerCase();
  return name.includes('cursor');
}

async function copyPromptFallback(prompt: string, reason: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showInformationMessage(`${reason} Prompt copied to clipboard — paste into AI chat.`);
}

/**
 * Prefill or submit AI chat. Cursor and VS Code use different chat surfaces.
 */
export async function sendPromptToAiChat(prompt: string, autoSubmit: boolean): Promise<void> {
  const partial = !autoSubmit;

  // VS Code Copilot Chat
  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      isPartialQuery: partial,
    });
    return;
  } catch {
    // continue
  }

  // Cursor — try known / evolving command IDs; fall back to clipboard
  if (isCursorHost()) {
    const cursorAttempts: Array<{ command: string; args?: unknown }> = [
      { command: 'composer.newAgentChat', args: { partialQuery: true, query: prompt } },
      { command: 'aichat.newchataction' },
      { command: 'cursorai.action.generateInTerminal' },
    ];

    for (const attempt of cursorAttempts) {
      try {
        if (attempt.args !== undefined) {
          await vscode.commands.executeCommand(attempt.command, attempt.args);
        } else {
          await vscode.commands.executeCommand(attempt.command);
        }
        // Best-effort: many Cursor commands ignore query args — always leave clipboard as backup
        await vscode.env.clipboard.writeText(prompt);
        void vscode.window.showInformationMessage(
          autoSubmit
            ? 'Opened Cursor AI. If the prompt was not submitted, paste from clipboard.'
            : 'Opened Cursor AI and copied prompt to clipboard — paste and edit before sending.'
        );
        return;
      } catch {
        // try next
      }
    }

    await copyPromptFallback(prompt, 'Cursor chat command unavailable.');
    return;
  }

  await copyPromptFallback(prompt, 'AI chat command unavailable.');
}

export async function configureConnection(context: vscode.ExtensionContext): Promise<boolean> {
  const currentUrl = getBaseUrl();
  const baseUrl = await vscode.window.showInputBox({
    title: 'Project Management — Base URL',
    prompt: 'No trailing slash. HTTPS with valid cert, or HTTP on LAN.',
    value: currentUrl,
    ignoreFocusOut: true,
    placeHolder: 'https://pm.example.com',
  });
  if (baseUrl === undefined) return false;

  const existingToken = await getApiToken(context);
  const token = await vscode.window.showInputBox({
    title: 'Project Management — API Token',
    prompt: 'Paste pt_… token from Profile → API Tokens',
    value: existingToken ? '••••••••' : '',
    password: true,
    ignoreFocusOut: true,
  });
  if (token === undefined) return false;

  await vscode.workspace.getConfiguration('projectManagement').update('baseUrl', baseUrl.trim().replace(/\/+$/, ''), true);
  if (token && token !== '••••••••') {
    await setApiToken(context, token);
  }

  try {
    const profile = await testConnection(getBaseUrl(), await getApiToken(context));
    void vscode.window.showInformationMessage(`Connected as ${profile.username || profile.email || 'user'}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Connection failed: ${message}`);
    return false;
  }
}

export async function runSendToAiChat(taskNode: TaskNode): Promise<void> {
  const task: PmTask = taskNode.task;
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    void vscode.window.showWarningMessage('Configure Base URL first.');
    return;
  }

  const contentPick = await vscode.window.showQuickPick(
    [
      { label: 'Name only', mode: 'name' as AiContentMode },
      { label: 'Name + description', mode: 'nameDescription' as AiContentMode },
      { label: 'Full context', mode: 'full' as AiContentMode },
    ],
    { title: 'AI prompt content', ignoreFocusOut: true }
  );
  if (!contentPick) return;

  const defaultAuto = getAiAutoSubmit();
  const modePick = await vscode.window.showQuickPick(
    [
      {
        label: 'Edit before send',
        description: defaultAuto ? '' : '(default)',
        autoSubmit: false,
      },
      {
        label: 'Send now',
        description: defaultAuto ? '(default)' : '',
        autoSubmit: true,
      },
    ],
    { title: 'Send mode', ignoreFocusOut: true }
  );
  if (!modePick) return;

  const prompt = buildAiPrompt(task, baseUrl, contentPick.mode, getAiPromptTemplate());
  await sendPromptToAiChat(prompt, modePick.autoSubmit);
}
