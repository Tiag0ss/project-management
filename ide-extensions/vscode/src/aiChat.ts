import * as vscode from 'vscode';
import {
  AiContentMode,
  buildAiPrompt,
  getAiPromptTemplate,
  getApiToken,
  getBaseUrl,
  sanitizeApiToken,
  setApiToken,
  testConnection,
} from './api';

const KEEP_EXISTING_TOKEN_SENTINEL = '';
import { PmTask } from './tasks';

function isCursorHost(): boolean {
  const name = (vscode.env.appName || '').toLowerCase();
  return name.includes('cursor');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyPromptFallback(prompt: string, reason: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showInformationMessage(`${reason} Prompt copied to clipboard — paste into AI chat.`);
}

async function tryChatSubmit(): Promise<void> {
  for (const command of ['workbench.action.chat.submit', 'composer.startGeneration']) {
    try {
      await vscode.commands.executeCommand(command);
      return;
    } catch {
      // try next
    }
  }
}

/**
 * Focus the active Cursor composer (never create a new agent chat).
 * Returns true when focus command ran.
 */
async function focusActiveCursorComposer(): Promise<boolean> {
  for (const command of ['composer.focusComposer', 'composer.openComposer']) {
    try {
      await vscode.commands.executeCommand(command);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/**
 * Prefill or submit AI chat into the **active** conversation.
 * Cursor: never call composer.newAgentChat / aichat.newchataction.
 */
export async function sendPromptToAiChat(prompt: string, autoSubmit: boolean): Promise<void> {
  const partial = !autoSubmit;

  // Cursor: focus the active composer first (newAgentChat always opened a fresh chat)
  if (isCursorHost()) {
    await vscode.env.clipboard.writeText(prompt);
    const focused = await focusActiveCursorComposer();
    if (focused) {
      await sleep(150);
      try {
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      } catch {
        // clipboard still has the prompt
      }
      if (autoSubmit) {
        await tryChatSubmit();
      }
      void vscode.window.showInformationMessage(
        autoSubmit
          ? 'Prompt pasted into the active chat. If it was not sent, press Enter (also on clipboard).'
          : 'Prompt pasted into the active chat — edit and send (also on clipboard).'
      );
      return;
    }

    // Older Cursor builds may still accept chat.open
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: prompt,
        isPartialQuery: partial,
      });
      if (autoSubmit) {
        await tryChatSubmit();
      }
      return;
    } catch {
      // continue to clipboard fallback
    }

    await copyPromptFallback(prompt, 'Could not focus the active Cursor chat.');
    return;
  }

  // VS Code Copilot Chat
  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      isPartialQuery: partial,
    });
    if (autoSubmit) {
      await tryChatSubmit();
    }
    return;
  } catch {
    // continue
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
  const tokenInput = await vscode.window.showInputBox({
    title: 'Project Management — API Token',
    prompt: existingToken
      ? 'Paste a new pt_… token from Profile → API Tokens (leave empty to keep the current token)'
      : 'Paste pt_… token from Profile → API Tokens',
    value: KEEP_EXISTING_TOKEN_SENTINEL,
    password: true,
    ignoreFocusOut: true,
    placeHolder: existingToken ? 'Leave empty to keep current token' : 'pt_…',
    validateInput: (value) => {
      const cleaned = sanitizeApiToken(value);
      if (!cleaned) {
        return existingToken ? null : 'API token is required';
      }
      if (!cleaned.startsWith('pt_')) {
        return 'Token must start with pt_';
      }
      if (cleaned.length < 20) {
        return 'Token looks too short — paste the full value shown once at creation';
      }
      return null;
    },
  });
  if (tokenInput === undefined) return false;

  const cleanedInput = sanitizeApiToken(tokenInput);
  if (cleanedInput) {
    await setApiToken(context, cleanedInput);
  } else if (!existingToken) {
    void vscode.window.showErrorMessage('API token is required.');
    return false;
  }

  await vscode.workspace
    .getConfiguration('projectManagement')
    .update('baseUrl', baseUrl.trim().replace(/\/+$/, ''), true);

  try {
    // Re-read settings after update (workspace config can lag one tick)
    const effectiveUrl = baseUrl.trim().replace(/\/+$/, '') || getBaseUrl();
    const effectiveToken = await getApiToken(context);
    const profile = await testConnection(effectiveUrl, effectiveToken);
    void vscode.window.showInformationMessage(
      `Connected as ${profile.username || profile.email || 'user'}`
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Connection failed: ${message}`);
    return false;
  }
}

export async function runSendToAiForTask(task: PmTask): Promise<void> {
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

  const prompt = buildAiPrompt(task, baseUrl, contentPick.mode, getAiPromptTemplate());
  await sendPromptToAiChat(prompt, false);
}
