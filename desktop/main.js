const { app, BrowserWindow, ipcMain, powerMonitor } = require('electron');
const path = require('path');

let store = null;

const storeDefaults = {
  session: {
    token: null,
    user: null,
    apiUrl: 'http://localhost:3000',
  },
  settings: {
    idleMinutes: 10,
    graceSeconds: 600,
    alwaysOnTop: true,
  },
};

const initializeStore = async () => {
  if (store) {
    return store;
  }

  const module = await import('electron-store');
  const Store = module.default;
  store = new Store({
    name: 'pm-desktop',
    defaults: storeDefaults,
  });

  return store;
};

let mainWindow = null;
let idleInterval = null;
let currentWindowLayout = 'full';
let draggingState = null;
let promptState = {
  active: false,
  timerId: null,
  timeoutId: null,
};

const WINDOW_LAYOUTS = {
  full: {
    width: 420,
    height: 520,
    minWidth: 380,
    minHeight: 220,
    resizable: true,
  },
  compact: {
    width: 420,
    height: 150,
    minWidth: 380,
    minHeight: 110,
    resizable: false,
  },
};

const applyWindowLayout = (layoutName) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const targetLayout = layoutName === 'compact' ? 'compact' : 'full';
  const config = WINDOW_LAYOUTS[targetLayout];
  const [x, y] = mainWindow.getPosition();

  mainWindow.setResizable(Boolean(config.resizable));
  mainWindow.setMinimumSize(config.minWidth, config.minHeight);
  mainWindow.setBounds({
    x,
    y,
    width: config.width,
    height: config.height,
  }, true);

  currentWindowLayout = targetLayout;
};

const getSession = () => (store ? store.get('session') : storeDefaults.session);
const setSession = (session) => {
  if (store) {
    store.set('session', session);
  }
};
const clearSession = () => setSession({ token: null, user: null, apiUrl: 'http://localhost:3000' });
const getSettings = () => (store ? store.get('settings') : storeDefaults.settings);
const setSettings = (settings) => {
  if (store) {
    store.set('settings', settings);
  }
};

const getClientTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const apiRequest = async (method, endpoint, body) => {
  const session = getSession();
  if (!session?.apiUrl) {
    throw new Error('API URL is not configured');
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const response = await fetch(`${session.apiUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Request failed (${response.status})`);
  }

  return data;
};

const stopTimerById = async (timerId) => {
  const result = await apiRequest('POST', `/api/timers/${timerId}/stop`, {
    clientTimezone: getClientTimezone(),
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:updated');
  }

  return result;
};

const clearPromptState = () => {
  promptState.active = false;
  promptState.timerId = null;
  if (promptState.timeoutId) {
    clearTimeout(promptState.timeoutId);
    promptState.timeoutId = null;
  }
};

const triggerIdlePrompt = async (activeTimer) => {
  if (!mainWindow || mainWindow.isDestroyed() || promptState.active) {
    return;
  }

  const settings = getSettings();
  promptState.active = true;
  promptState.timerId = Number(activeTimer.Id);

  mainWindow.webContents.send('idle:prompt', {
    timer: activeTimer,
    graceSeconds: Number(settings.graceSeconds || 600),
  });

  promptState.timeoutId = setTimeout(async () => {
    try {
      if (!promptState.active || !promptState.timerId) {
        return;
      }

      const result = await stopTimerById(promptState.timerId);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('idle:auto-stopped', result);
      }
    } catch (error) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('idle:auto-stop-error', {
          message: error instanceof Error ? error.message : 'Failed to auto-stop timer',
        });
      }
    } finally {
      clearPromptState();
    }
  }, Number(settings.graceSeconds || 600) * 1000);
};

const checkIdleState = async () => {
  if (!mainWindow || mainWindow.isDestroyed() || promptState.active) {
    return;
  }

  const session = getSession();
  if (!session?.token) {
    return;
  }

  try {
    const settings = getSettings();
    const active = await apiRequest('GET', '/api/timers/active');
    const timer = active?.timer || null;

    if (!timer?.Id) {
      return;
    }

    const idleSeconds = powerMonitor.getSystemIdleTime();
    const thresholdSeconds = Number(settings.idleMinutes || 10) * 60;
    if (idleSeconds >= thresholdSeconds) {
      await triggerIdlePrompt(timer);
    }
  } catch {
    // Ignore transient API errors during idle checks.
  }
};

const startIdleWatcher = () => {
  if (idleInterval) {
    clearInterval(idleInterval);
  }

  idleInterval = setInterval(() => {
    void checkIdleState();
  }, 15000);
};

const createWindow = () => {
  const settings = getSettings();
  const config = WINDOW_LAYOUTS.full;
  const window = new BrowserWindow({
    width: config.width,
    height: config.height,
    minWidth: config.minWidth,
    minHeight: config.minHeight,
    resizable: config.resizable,
    frame: false,
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  currentWindowLayout = 'full';
  return window;
};

ipcMain.handle('auth:session', async () => {
  const session = getSession();
  return {
    token: session?.token || null,
    user: session?.user || null,
    apiUrl: session?.apiUrl || 'http://localhost:3000',
  };
});

ipcMain.handle('auth:login', async (_event, payload) => {
  const apiUrl = String(payload?.apiUrl || '').trim() || 'http://localhost:3000';
  const username = String(payload?.username || '').trim();
  const password = String(payload?.password || '');

  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  const response = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.token) {
    throw new Error(data?.message || 'Login failed');
  }

  setSession({ token: data.token, user: data.user || null, apiUrl });
  return { user: data.user || null, token: data.token, apiUrl };
});

ipcMain.handle('auth:logout', async () => {
  clearSession();
  clearPromptState();
  return { success: true };
});

ipcMain.handle('settings:get', async () => getSettings());

ipcMain.handle('settings:update', async (_event, patch) => {
  const current = getSettings();
  const next = {
    ...current,
    ...patch,
  };

  setSettings(next);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(Boolean(next.alwaysOnTop));
  }

  return next;
});

ipcMain.handle('window:setLayout', async (_event, layoutName) => {
  const target = String(layoutName || '').toLowerCase() === 'compact' ? 'compact' : 'full';
  if (target !== currentWindowLayout) {
    applyWindowLayout(target);
  }
  return { layout: currentWindowLayout };
});

ipcMain.handle('window:fitToContent', async (_event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false };
  }

  const mode = String(payload?.mode || '').toLowerCase() === 'compact' ? 'compact' : 'full';
  const requestedOuterHeight = Number(payload?.outerHeight || 0);
  const config = WINDOW_LAYOUTS[mode];
  const safeRequested = Number.isFinite(requestedOuterHeight) ? requestedOuterHeight : config.height;

  const maxHeight = mode === 'compact' ? 220 : 760;
  const nextHeight = Math.max(config.minHeight, Math.min(maxHeight, Math.ceil(safeRequested)));

  const [x, y] = mainWindow.getPosition();
  mainWindow.setBounds({
    x,
    y,
    width: config.width,
    height: nextHeight,
  }, true);

  currentWindowLayout = mode;
  return { success: true, height: nextHeight };
});

ipcMain.handle('window:setTimerActiveState', async (_event, isActive) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false };
  }

  const active = Boolean(isActive);
  mainWindow.setMinimizable(!active);
  mainWindow.setMaximizable(!active);
  mainWindow.setClosable(!active);

  return {
    success: true,
    active,
  };
});

ipcMain.handle('window:beginDrag', async (_event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false };
  }

  const startMouseX = Number(payload?.mouseScreenX);
  const startMouseY = Number(payload?.mouseScreenY);
  if (Number.isNaN(startMouseX) || Number.isNaN(startMouseY)) {
    return { success: false };
  }

  const [windowX, windowY] = mainWindow.getPosition();
  draggingState = {
    startMouseX,
    startMouseY,
    windowX,
    windowY,
  };

  return { success: true };
});

ipcMain.handle('window:updateDrag', async (_event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || !draggingState) {
    return { success: false };
  }

  const mouseScreenX = Number(payload?.mouseScreenX);
  const mouseScreenY = Number(payload?.mouseScreenY);
  if (Number.isNaN(mouseScreenX) || Number.isNaN(mouseScreenY)) {
    return { success: false };
  }

  const deltaX = mouseScreenX - draggingState.startMouseX;
  const deltaY = mouseScreenY - draggingState.startMouseY;
  const nextX = Math.round(draggingState.windowX + deltaX);
  const nextY = Math.round(draggingState.windowY + deltaY);
  mainWindow.setPosition(nextX, nextY);

  return { success: true };
});

ipcMain.handle('window:endDrag', async () => {
  draggingState = null;
  return { success: true };
});

ipcMain.handle('window:minimize', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false };
  }

  mainWindow.minimize();
  return { success: true };
});

ipcMain.handle('window:close', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false };
  }

  mainWindow.close();
  return { success: true };
});

ipcMain.handle('timer:getActive', async () => {
  const data = await apiRequest('GET', '/api/timers/active');
  return data?.timer || null;
});

ipcMain.handle('timer:getAvailableTasks', async () => {
  const data = await apiRequest('GET', '/api/timers/available-tasks');
  return data?.tasks || [];
});

ipcMain.handle('timer:start', async (_event, payload) => {
  const data = await apiRequest('POST', '/api/timers/start', {
    ...payload,
    clientTimezone: getClientTimezone(),
  });
  clearPromptState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:updated');
  }
  return data?.timer || null;
});

ipcMain.handle('timer:stop', async (_event, timerId) => {
  const result = await stopTimerById(Number(timerId));
  clearPromptState();
  return result;
});

ipcMain.handle('timer:discard', async (_event, timerId) => {
  const data = await apiRequest('DELETE', `/api/timers/${Number(timerId)}`);
  clearPromptState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:updated');
  }
  return data;
});

ipcMain.handle('idle:action', async (_event, action) => {
  if (!promptState.active) {
    return { success: true, ignored: true };
  }

  if (action === 'continue') {
    clearPromptState();
    return { success: true };
  }

  if (action === 'stop') {
    const timerId = promptState.timerId;
    clearPromptState();
    if (!timerId) return { success: false, message: 'No active timer' };
    const result = await stopTimerById(Number(timerId));
    return { success: true, stopped: true, result };
  }

  if (action === 'switch') {
    const timerId = promptState.timerId;
    clearPromptState();
    if (!timerId) return { success: false, message: 'No active timer' };
    const result = await stopTimerById(Number(timerId));
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('timer:switch-requested');
    }
    return { success: true, switched: true, result };
  }

  return { success: false, message: 'Unsupported action' };
});

app.whenReady().then(async () => {
  await initializeStore();
  mainWindow = createWindow();
  startIdleWatcher();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
  }
  clearPromptState();
});