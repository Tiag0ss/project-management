/**
 * Host ↔ board message protocol (JSON).
 *
 * Board → host:
 *   { type: 'ready' }
 *   { type: 'projectSelected', projectId: number | null }
 *   { type: 'sprintSelected', sprintFilter: 'all' | 'backlog' | number | string }
 *   { type: 'sendToAi', task: object }
 *   { type: 'openExternal', url: string }
 *   { type: 'openTask', task: object }
 *   { type: 'copyText', text: string, label?: string, task?: object }
 *   { type: 'setActiveTask', task: object }
 *   { type: 'configure' }
 *   { type: 'error', message: string }
 *
 * Host → board:
 *   { type: 'config', baseUrl: string, token: string, selectedProjectId?: number | null, selectedSprintFilter?: 'all' | 'backlog' | number | string }
 *   { type: 'refresh' }
 *
 * VS Code: acquireVsCodeApi() as window.__PM_VSCODE__
 * Rider: window.pmHost.postMessage / onMessage
 * Visual Studio: chrome.webview.postMessage
 */
export {};
