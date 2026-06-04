const statusBox = document.getElementById('statusBox');
const loginCard = document.getElementById('loginCard');
const timerCard = document.getElementById('timerCard');
const startCard = document.getElementById('startCard');
const openSettingsButton = document.getElementById('openSettingsButton');
const headerCollapseButton = document.getElementById('headerCollapseButton');
const minimizeWindowButton = document.getElementById('minimizeWindowButton');
const closeWindowButton = document.getElementById('closeWindowButton');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsButton = document.getElementById('closeSettingsButton');

const apiUrlInput = document.getElementById('apiUrl');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');

const refreshButton = document.getElementById('refreshButton');
const toggleCompactButton = document.getElementById('toggleCompactButton');
const activeTimerElapsed = document.getElementById('activeTimerElapsed');
const activeTimerInfo = document.getElementById('activeTimerInfo');
const stopButton = document.getElementById('stopButton');
const discardButton = document.getElementById('discardButton');

const modeTask = document.getElementById('modeTask');
const modeCall = document.getElementById('modeCall');
const taskForm = document.getElementById('taskForm');
const callForm = document.getElementById('callForm');

const taskSearch = document.getElementById('taskSearch');
const taskSearchTrigger = document.getElementById('taskSearchTrigger');
const taskSearchValue = document.getElementById('taskSearchValue');
const taskSearchMenu = document.getElementById('taskSearchMenu');
const taskSearchInput = document.getElementById('taskSearchInput');
const taskSearchOptions = document.getElementById('taskSearchOptions');
const taskDescription = document.getElementById('taskDescription');
const startTaskButton = document.getElementById('startTaskButton');

const callType = document.getElementById('callType');
const participants = document.getElementById('participants');
const subject = document.getElementById('subject');
const callDescription = document.getElementById('callDescription');
const startCallButton = document.getElementById('startCallButton');

const idleMinutesInput = document.getElementById('idleMinutes');
const graceSecondsInput = document.getElementById('graceSeconds');
const alwaysOnTopInput = document.getElementById('alwaysOnTop');
const saveSettingsButton = document.getElementById('saveSettingsButton');

const idleModal = document.getElementById('idleModal');
const idleMessage = document.getElementById('idleMessage');
const idleCountdown = document.getElementById('idleCountdown');
const idleContinue = document.getElementById('idleContinue');
const idleStop = document.getElementById('idleStop');
const idleSwitch = document.getElementById('idleSwitch');

let currentSession = null;
let activeTimer = null;
let timerTickInterval = null;
let timerPollInterval = null;
let idleCountdownInterval = null;
let availableTasks = [];
let selectedTaskId = null;
let expandedForSwitch = false;
let activeWindowLayout = null;
let isDraggingWindow = false;
let fitResizeRafId = null;

const formatElapsed = (startedAt) => {
  const value = String(startedAt || '');
  if (!value) return '00:00:00';
  const source = /Z$|[+-]\d{2}:\d{2}$/.test(value)
    ? new Date(value)
    : new Date(value.replace(' ', 'T') + 'Z');
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - source.getTime()) / 1000));
  const h = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(elapsedSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const setStatus = (message, isError = false) => {
  statusBox.textContent = message;
  statusBox.style.color = isError ? '#ff9ba5' : '';
};

const syncWindowLayout = async (layout) => {
  if (layout === activeWindowLayout) {
    return;
  }

  try {
    await window.desktopApi.setWindowLayout(layout);
    activeWindowLayout = layout;
  } catch {
    // Keep renderer usable even if resize call fails.
  }
};

const fitWindowToCurrentContent = () => {
  if (fitResizeRafId) {
    cancelAnimationFrame(fitResizeRafId);
  }

  fitResizeRafId = requestAnimationFrame(() => {
    fitResizeRafId = null;
    const compact = document.body.classList.contains('compact-mode');
    const shell = document.querySelector('.app-shell');
    if (!shell) {
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const shellHeight = Math.ceil(shellRect.height);
    const chromeHeight = Math.max(0, Math.ceil(window.outerHeight - window.innerHeight));
    const targetOuterHeight = shellHeight + chromeHeight + 2;

    void window.desktopApi.fitWindowToContent(compact ? 'compact' : 'full', targetOuterHeight);
  });
};

const applyShellLayout = () => {
  const signedIn = Boolean(currentSession?.token);
  const hasActiveTimer = Boolean(activeTimer?.Id);
  const compact = signedIn && hasActiveTimer && !expandedForSwitch;

  document.body.classList.toggle('compact-mode', compact);

  statusBox.classList.toggle('hidden', compact);
  startCard.classList.toggle('hidden', !signedIn || compact);
  openSettingsButton.classList.toggle('hidden', !signedIn || compact);
  headerCollapseButton.classList.toggle('hidden', !signedIn || compact || !hasActiveTimer);
  minimizeWindowButton.classList.toggle('hidden', !signedIn || compact);
  closeWindowButton.classList.toggle('hidden', compact);

  if (hasActiveTimer) {
    toggleCompactButton.classList.toggle('hidden', !compact);
    toggleCompactButton.textContent = 'Expand';
  } else {
    toggleCompactButton.classList.add('hidden');
  }

  void syncWindowLayout(compact ? 'compact' : 'full');
  fitWindowToCurrentContent();
};

const renderTimer = () => {
  if (!activeTimer) {
    activeTimerInfo.textContent = 'Task: No active timer';
    activeTimerElapsed.textContent = '00:00:00';
    stopButton.disabled = true;
    discardButton.disabled = true;
    expandedForSwitch = false;
    applyShellLayout();
    return;
  }

  const type = activeTimer.TimerType === 'callRecord' ? 'Call' : 'Task';
  const title = activeTimer.TaskName || activeTimer.Subject || 'Unnamed';
  const elapsed = formatElapsed(activeTimer.StartedAt);
  activeTimerInfo.textContent = `${type}: ${title}`;
  activeTimerElapsed.textContent = elapsed;
  stopButton.disabled = false;
  discardButton.disabled = false;
  applyShellLayout();
};

const stopLocalIntervals = () => {
  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
  if (timerPollInterval) {
    clearInterval(timerPollInterval);
    timerPollInterval = null;
  }
};

const startLocalIntervals = () => {
  stopLocalIntervals();
  timerTickInterval = setInterval(renderTimer, 1000);
  timerPollInterval = setInterval(() => {
    void loadActiveTimer();
  }, 30000);
};

const renderAuthState = () => {
  const signedIn = Boolean(currentSession?.token);
  loginCard.classList.toggle('hidden', signedIn);
  timerCard.classList.toggle('hidden', !signedIn);
  if (!signedIn) {
    expandedForSwitch = false;
    void syncWindowLayout('full');
  }

  if (signedIn) {
    setStatus(`Signed in as ${currentSession.user?.username || 'user'}`);
    startLocalIntervals();
  } else {
    setStatus('Not authenticated');
    activeTimer = null;
    stopLocalIntervals();
    renderTimer();
  }

  applyShellLayout();
};

const loadSettings = async () => {
  const settings = await window.desktopApi.getSettings();
  idleMinutesInput.value = String(settings.idleMinutes || 10);
  graceSecondsInput.value = String(settings.graceSeconds || 600);
  alwaysOnTopInput.checked = Boolean(settings.alwaysOnTop);
};

const loadTasks = async () => {
  if (!currentSession?.token) return;

  availableTasks = await window.desktopApi.getAvailableTasks();
  if (availableTasks.length === 1 && !selectedTaskId) {
    selectedTaskId = Number(availableTasks[0].Id);
  }
  renderTaskSearch();
};

const getTaskLabel = (task) => `${task.TaskName}${task.ProjectName ? ` — ${task.ProjectName}` : ''}`;

const renderTaskSearchOptions = (searchText) => {
  const query = String(searchText || '').toLowerCase().trim();
  const filtered = availableTasks.filter((task) => {
    const label = getTaskLabel(task).toLowerCase();
    return label.includes(query);
  });

  taskSearchOptions.innerHTML = '';
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = query ? 'No results found' : 'No tasks available';
    taskSearchOptions.appendChild(empty);
    return;
  }

  for (const task of filtered) {
    const option = document.createElement('div');
    option.className = 'search-option';
    if (Number(task.Id) === Number(selectedTaskId)) {
      option.classList.add('selected');
    }
    option.textContent = getTaskLabel(task);
    option.addEventListener('mousedown', (event) => {
      event.preventDefault();
      selectedTaskId = Number(task.Id);
      renderTaskSearch();
      closeTaskMenu();
    });
    taskSearchOptions.appendChild(option);
  }
};

const renderTaskSearch = () => {
  const selectedTask = availableTasks.find((task) => Number(task.Id) === Number(selectedTaskId));
  if (selectedTask) {
    taskSearchValue.textContent = getTaskLabel(selectedTask);
    taskSearchValue.classList.remove('muted');
  } else {
    taskSearchValue.textContent = 'Select Task';
    taskSearchValue.classList.add('muted');
  }

  renderTaskSearchOptions(taskSearchInput.value);
};

const openTaskMenu = () => {
  taskSearchMenu.classList.remove('hidden');
  taskSearchTrigger.setAttribute('aria-expanded', 'true');
  taskSearchInput.value = '';
  renderTaskSearchOptions('');
  taskSearchInput.focus();
};

const closeTaskMenu = () => {
  taskSearchMenu.classList.add('hidden');
  taskSearchTrigger.setAttribute('aria-expanded', 'false');
};

const loadActiveTimer = async () => {
  if (!currentSession?.token) return;
  activeTimer = await window.desktopApi.getActiveTimer();
  renderTimer();
};

const selectMode = (mode) => {
  const taskSelected = mode === 'task';
  taskForm.classList.toggle('hidden', !taskSelected);
  callForm.classList.toggle('hidden', taskSelected);
  modeTask.classList.toggle('primary', taskSelected);
  modeCall.classList.toggle('primary', !taskSelected);
};

loginButton.addEventListener('click', async () => {
  try {
    setStatus('Signing in...');
    const session = await window.desktopApi.login({
      apiUrl: apiUrlInput.value,
      username: usernameInput.value,
      password: passwordInput.value,
    });
    currentSession = session;
    renderAuthState();
    await Promise.all([loadSettings(), loadTasks(), loadActiveTimer()]);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Login failed', true);
  }
});

logoutButton.addEventListener('click', async () => {
  await window.desktopApi.logout();
  currentSession = null;
  settingsModal.classList.add('hidden');
  renderAuthState();
});

openSettingsButton.addEventListener('click', async () => {
  await loadSettings();
  settingsModal.classList.remove('hidden');
});

closeSettingsButton.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

minimizeWindowButton.addEventListener('click', () => {
  void window.desktopApi.minimizeWindow();
});

closeWindowButton.addEventListener('click', () => {
  void window.desktopApi.closeWindow();
});

settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    settingsModal.classList.add('hidden');
  }
});

window.addEventListener('resize', () => {
  fitWindowToCurrentContent();
});

taskSearchTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  if (taskSearchMenu.classList.contains('hidden')) {
    openTaskMenu();
  } else {
    closeTaskMenu();
  }
});

taskSearchInput.addEventListener('input', (event) => {
  renderTaskSearchOptions(event.target.value);
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (taskSearch && !taskSearch.contains(target)) {
    closeTaskMenu();
  }
});

refreshButton.addEventListener('click', () => {
  void loadActiveTimer();
});

toggleCompactButton.addEventListener('click', () => {
  if (!activeTimer?.Id) {
    return;
  }

  expandedForSwitch = true;
  applyShellLayout();

  if (expandedForSwitch) {
    selectMode('task');
  }
});

headerCollapseButton.addEventListener('click', () => {
  if (!activeTimer?.Id) {
    return;
  }

  expandedForSwitch = false;
  applyShellLayout();
});

stopButton.addEventListener('click', async () => {
  if (!activeTimer?.Id) return;
  try {
    await window.desktopApi.stopTimer(activeTimer.Id);
    await loadActiveTimer();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to stop timer', true);
  }
});

discardButton.addEventListener('click', async () => {
  if (!activeTimer?.Id) return;
  try {
    await window.desktopApi.discardTimer(activeTimer.Id);
    await loadActiveTimer();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to discard timer', true);
  }
});

modeTask.addEventListener('click', () => selectMode('task'));
modeCall.addEventListener('click', () => selectMode('call'));

startTaskButton.addEventListener('click', async () => {
  const taskId = Number(selectedTaskId);
  if (!taskId) {
    setStatus('Select a task first', true);
    return;
  }

  try {
    await window.desktopApi.startTimer({
      timerType: 'task',
      taskId,
      description: taskDescription.value || null,
    });
    expandedForSwitch = false;
    await loadActiveTimer();
    setStatus('Task timer started');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to start task timer', true);
  }
});

startCallButton.addEventListener('click', async () => {
  try {
    await window.desktopApi.startTimer({
      timerType: 'callRecord',
      callType: callType.value,
      participants: participants.value || null,
      subject: subject.value || null,
      description: callDescription.value || null,
    });
    expandedForSwitch = false;
    await loadActiveTimer();
    setStatus('Call timer started');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to start call timer', true);
  }
});

saveSettingsButton.addEventListener('click', async () => {
  try {
    const idleMinutes = Number(idleMinutesInput.value || 10);
    const graceSeconds = Number(graceSecondsInput.value || 600);
    await window.desktopApi.updateSettings({
      idleMinutes,
      graceSeconds,
      alwaysOnTop: alwaysOnTopInput.checked,
    });
    setStatus('Settings saved');
    settingsModal.classList.add('hidden');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to save settings', true);
  }
});

const closeIdleModal = () => {
  idleModal.classList.add('hidden');
  if (idleCountdownInterval) {
    clearInterval(idleCountdownInterval);
    idleCountdownInterval = null;
  }
};

const submitIdleAction = async (action) => {
  try {
    await window.desktopApi.submitIdleAction(action);
    closeIdleModal();
    await loadActiveTimer();
    if (action === 'switch') {
      selectMode('task');
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed idle action', true);
  }
};

idleContinue.addEventListener('click', () => {
  void submitIdleAction('continue');
});

idleStop.addEventListener('click', () => {
  void submitIdleAction('stop');
});

idleSwitch.addEventListener('click', () => {
  void submitIdleAction('switch');
});

window.desktopApi.onIdlePrompt((payload) => {
  const timer = payload?.timer || {};
  const label = timer.TaskName || timer.Subject || 'current timer';
  let remaining = Number(payload?.graceSeconds || 600);

  idleMessage.textContent = `No activity detected. Continue timer for ${label}, stop it now, or switch to another task/call.`;
  idleCountdown.textContent = `Auto-stop in ${remaining}s`;
  idleModal.classList.remove('hidden');

  if (idleCountdownInterval) {
    clearInterval(idleCountdownInterval);
  }

  idleCountdownInterval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    idleCountdown.textContent = `Auto-stop in ${remaining}s`;
    if (remaining === 0) {
      clearInterval(idleCountdownInterval);
      idleCountdownInterval = null;
    }
  }, 1000);
});

window.desktopApi.onIdleAutoStopped(() => {
  closeIdleModal();
  setStatus('Timer auto-stopped due to inactivity');
  void loadActiveTimer();
});

window.desktopApi.onIdleAutoStopError((payload) => {
  closeIdleModal();
  setStatus(payload?.message || 'Failed to auto-stop timer', true);
});

window.desktopApi.onSwitchRequested(() => {
  expandedForSwitch = true;
  selectMode('task');
  applyShellLayout();
  openTaskMenu();
});

window.desktopApi.onTimerUpdated(() => {
  void loadActiveTimer();
});

const canStartWindowDrag = (target) => {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest('button, input, textarea, select, a, [role="listbox"], [contenteditable="true"]')) {
    return false;
  }

  return true;
};

document.addEventListener('mousedown', (event) => {
  if (event.button !== 0) {
    return;
  }

  if (!canStartWindowDrag(event.target)) {
    return;
  }

  isDraggingWindow = true;
  void window.desktopApi.beginWindowDrag(event.screenX, event.screenY);
});

document.addEventListener('mousemove', (event) => {
  if (!isDraggingWindow) {
    return;
  }

  void window.desktopApi.updateWindowDrag(event.screenX, event.screenY);
});

document.addEventListener('mouseup', () => {
  if (!isDraggingWindow) {
    return;
  }

  isDraggingWindow = false;
  void window.desktopApi.endWindowDrag();
});

const bootstrap = async () => {
  currentSession = await window.desktopApi.getSession();
  apiUrlInput.value = currentSession?.apiUrl || 'http://localhost:3000';
  renderAuthState();
  selectMode('task');

  if (currentSession?.token) {
    await Promise.all([loadSettings(), loadTasks(), loadActiveTimer()]);
  }
};

void bootstrap();