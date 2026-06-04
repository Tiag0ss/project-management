const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (eventName, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(eventName, handler);
  return () => ipcRenderer.removeListener(eventName, handler);
};

contextBridge.exposeInMainWorld('desktopApi', {
  getSession: () => ipcRenderer.invoke('auth:session'),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),
  logout: () => ipcRenderer.invoke('auth:logout'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setWindowLayout: (layout) => ipcRenderer.invoke('window:setLayout', layout),
  fitWindowToContent: (mode, outerHeight) => ipcRenderer.invoke('window:fitToContent', { mode, outerHeight }),
  setTimerActiveState: (isActive) => ipcRenderer.invoke('window:setTimerActiveState', isActive),
  beginWindowDrag: (mouseScreenX, mouseScreenY) => ipcRenderer.invoke('window:beginDrag', { mouseScreenX, mouseScreenY }),
  updateWindowDrag: (mouseScreenX, mouseScreenY) => ipcRenderer.invoke('window:updateDrag', { mouseScreenX, mouseScreenY }),
  endWindowDrag: () => ipcRenderer.invoke('window:endDrag'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  getActiveTimer: () => ipcRenderer.invoke('timer:getActive'),
  getAvailableTasks: () => ipcRenderer.invoke('timer:getAvailableTasks'),
  startTimer: (payload) => ipcRenderer.invoke('timer:start', payload),
  stopTimer: (timerId) => ipcRenderer.invoke('timer:stop', timerId),
  discardTimer: (timerId) => ipcRenderer.invoke('timer:discard', timerId),

  onTimerUpdated: (callback) => subscribe('timer:updated', callback),
  onSwitchRequested: (callback) => subscribe('timer:switch-requested', callback),

  submitIdleAction: (action) => ipcRenderer.invoke('idle:action', action),
  onIdlePrompt: (callback) => subscribe('idle:prompt', callback),
  onIdleAutoStopped: (callback) => subscribe('idle:auto-stopped', callback),
  onIdleAutoStopError: (callback) => subscribe('idle:auto-stop-error', callback),
});