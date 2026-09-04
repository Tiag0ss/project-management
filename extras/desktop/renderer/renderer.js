const statusBox = document.getElementById('statusBox');
const loginCard = document.getElementById('loginCard');
const timerCard = document.getElementById('timerCard');
const startCard = document.getElementById('startCard');
const openSettingsButton = document.getElementById('openSettingsButton');
const headerCollapseButton = document.getElementById('headerCollapseButton');
const headerLogoutButton = document.getElementById('headerLogoutButton');
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

const callTypeSearch = document.getElementById('callTypeSearch');
const callTypeTrigger = document.getElementById('callTypeTrigger');
const callTypeValue = document.getElementById('callTypeValue');
const callTypeMenu = document.getElementById('callTypeMenu');
const callTypeInput = document.getElementById('callTypeInput');
const callTypeOptions = document.getElementById('callTypeOptions');

const callOrganizationSearch = document.getElementById('callOrganizationSearch');
const callOrganizationTrigger = document.getElementById('callOrganizationTrigger');
const callOrganizationValue = document.getElementById('callOrganizationValue');
const callOrganizationMenu = document.getElementById('callOrganizationMenu');
const callOrganizationInput = document.getElementById('callOrganizationInput');
const callOrganizationOptions = document.getElementById('callOrganizationOptions');

const callProjectSearch = document.getElementById('callProjectSearch');
const callProjectTrigger = document.getElementById('callProjectTrigger');
const callProjectValue = document.getElementById('callProjectValue');
const callProjectMenu = document.getElementById('callProjectMenu');
const callProjectInput = document.getElementById('callProjectInput');
const callProjectOptions = document.getElementById('callProjectOptions');

const callTaskSearch = document.getElementById('callTaskSearch');
const callTaskTrigger = document.getElementById('callTaskTrigger');
const callTaskValue = document.getElementById('callTaskValue');
const callTaskMenu = document.getElementById('callTaskMenu');
const callTaskInput = document.getElementById('callTaskInput');
const callTaskOptions = document.getElementById('callTaskOptions');
const participants = document.getElementById('participants');
const subject = document.getElementById('subject');
const callDescription = document.getElementById('callDescription');
const startCallButton = document.getElementById('startCallButton');
const appHeader = document.querySelector('.app-header');
const compactDragBar = document.getElementById('compactDragBar');
const timerCardHeader = document.querySelector('.timer-card-header');

const tabStartTimer = document.getElementById('tabStartTimer');
const tabOpenTasks = document.getElementById('tabOpenTasks');
const tabRecentTasks = document.getElementById('tabRecentTasks');
const startTimerPanel = document.getElementById('startTimerPanel');
const openTasksPanel = document.getElementById('openTasksPanel');
const recentTasksPanel = document.getElementById('recentTasksPanel');
const openTasksList = document.getElementById('openTasksList');
const recentTasksList = document.getElementById('recentTasksList');
const refreshOpenTasksButton = document.getElementById('refreshOpenTasksButton');
const refreshRecentTasksButton = document.getElementById('refreshRecentTasksButton');

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
let openTasks = [];
let recentTasks = [];
let selectedTaskId = null;
let activeStartTab = 'timer';
let expandedForSwitch = false;
let activeWindowLayout = null;
let isDraggingWindow = false;
let fitResizeRafId = null;
let availableOrganizations = [];
let availableCallProjects = [];
let availableCallTasks = [];
const callTypeChoices = [
  { value: 'Teams', label: 'Teams' },
  { value: 'Phone', label: 'Phone' },
  { value: 'Meeting', label: 'Meeting' },
];
let selectedCallType = 'Teams';
let selectedCallOrganizationId = '';
let selectedCallProjectId = '';
let selectedCallTaskId = '';

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
  headerLogoutButton.classList.toggle('hidden', !signedIn || compact);
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

const closeCallMenus = () => {
  callTypeMenu.classList.add('hidden');
  callTypeTrigger.setAttribute('aria-expanded', 'false');
  callOrganizationMenu.classList.add('hidden');
  callOrganizationTrigger.setAttribute('aria-expanded', 'false');
  callProjectMenu.classList.add('hidden');
  callProjectTrigger.setAttribute('aria-expanded', 'false');
  callTaskMenu.classList.add('hidden');
  callTaskTrigger.setAttribute('aria-expanded', 'false');
};

const openCallMenu = (menu, trigger, input) => {
  closeCallMenus();
  menu.classList.remove('hidden');
  trigger.setAttribute('aria-expanded', 'true');
  input.value = '';
  input.focus();
};

const renderCallTypeOptions = (searchText) => {
  const query = String(searchText || '').toLowerCase().trim();
  const filtered = callTypeChoices.filter((option) => option.label.toLowerCase().includes(query));

  callTypeOptions.innerHTML = '';
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = query ? 'No results found' : 'No options available';
    callTypeOptions.appendChild(empty);
    return;
  }

  for (const option of filtered) {
    const row = document.createElement('div');
    row.className = 'search-option';
    if (option.value === selectedCallType) {
      row.classList.add('selected');
    }
    row.textContent = option.label;
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedCallType = option.value;
      renderCallType();
      closeCallMenus();
    });
    callTypeOptions.appendChild(row);
  }
};

const renderCallType = () => {
  const selected = callTypeChoices.find((option) => option.value === selectedCallType);
  callTypeValue.textContent = selected?.label || 'Select call type';
  renderCallTypeOptions(callTypeInput.value);
};

const renderCallOrganizations = (searchText = callOrganizationInput.value) => {
  const selected = availableOrganizations.find((item) => String(item.Id) === String(selectedCallOrganizationId));
  if (selected) {
    callOrganizationValue.textContent = selected.Name || `Organization ${selected.Id}`;
    callOrganizationValue.classList.remove('muted');
  } else {
    selectedCallOrganizationId = '';
    callOrganizationValue.textContent = 'Select organization';
    callOrganizationValue.classList.add('muted');
  }

  const query = String(searchText || '').toLowerCase().trim();
  const filtered = availableOrganizations.filter((item) => String(item.Name || '').toLowerCase().includes(query));
  callOrganizationOptions.innerHTML = '';
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = query ? 'No results found' : 'No organizations available';
    callOrganizationOptions.appendChild(empty);
    return;
  }

  for (const organization of filtered) {
    const row = document.createElement('div');
    row.className = 'search-option';
    if (String(organization.Id) === String(selectedCallOrganizationId)) {
      row.classList.add('selected');
    }
    row.textContent = String(organization.Name || `Organization ${organization.Id}`);
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedCallOrganizationId = String(organization.Id);
      selectedCallProjectId = '';
      selectedCallTaskId = '';
      availableCallProjects = [];
      availableCallTasks = [];
      renderCallProjects();
      renderCallTasks();
      renderCallOrganizations('');
      closeCallMenus();
      void loadCallProjects(selectedCallOrganizationId);
    });
    callOrganizationOptions.appendChild(row);
  }
};

const renderCallProjects = (searchText = callProjectInput.value) => {
  callProjectTrigger.disabled = !selectedCallOrganizationId;
  const selected = availableCallProjects.find((item) => String(item.Id) === String(selectedCallProjectId));
  if (selected) {
    callProjectValue.textContent = selected.ProjectName || `Project ${selected.Id}`;
    callProjectValue.classList.remove('muted');
  } else {
    selectedCallProjectId = '';
    callProjectValue.textContent = 'Select project';
    callProjectValue.classList.add('muted');
  }

  const query = String(searchText || '').toLowerCase().trim();
  const filtered = availableCallProjects.filter((item) => String(item.ProjectName || '').toLowerCase().includes(query));
  callProjectOptions.innerHTML = '';
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = query ? 'No results found' : 'No projects available';
    callProjectOptions.appendChild(empty);
    return;
  }

  for (const project of filtered) {
    const row = document.createElement('div');
    row.className = 'search-option';
    if (String(project.Id) === String(selectedCallProjectId)) {
      row.classList.add('selected');
    }
    row.textContent = String(project.ProjectName || `Project ${project.Id}`);
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedCallProjectId = String(project.Id);
      selectedCallTaskId = '';
      availableCallTasks = [];
      renderCallTasks();
      renderCallProjects('');
      closeCallMenus();
      void loadCallTasks(selectedCallProjectId);
    });
    callProjectOptions.appendChild(row);
  }
};

const renderCallTasks = (searchText = callTaskInput.value) => {
  callTaskTrigger.disabled = !selectedCallProjectId;
  const selected = availableCallTasks.find((item) => String(item.Id) === String(selectedCallTaskId));
  if (selected) {
    callTaskValue.textContent = selected.TaskName || `Task ${selected.Id}`;
    callTaskValue.classList.remove('muted');
  } else {
    selectedCallTaskId = '';
    callTaskValue.textContent = 'Select task (optional)';
    callTaskValue.classList.add('muted');
  }

  const query = String(searchText || '').toLowerCase().trim();
  const filtered = availableCallTasks.filter((item) => String(item.TaskName || '').toLowerCase().includes(query));
  callTaskOptions.innerHTML = '';

  const clearOption = document.createElement('div');
  clearOption.className = 'search-option';
  clearOption.textContent = 'No task';
  if (!selectedCallTaskId) {
    clearOption.classList.add('selected');
  }
  clearOption.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectedCallTaskId = '';
    renderCallTasks('');
    closeCallMenus();
  });
  callTaskOptions.appendChild(clearOption);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = query ? 'No results found' : 'No tasks available';
    callTaskOptions.appendChild(empty);
    return;
  }

  for (const task of filtered) {
    const row = document.createElement('div');
    row.className = 'search-option';
    if (String(task.Id) === String(selectedCallTaskId)) {
      row.classList.add('selected');
    }
    row.textContent = String(task.TaskName || `Task ${task.Id}`);
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedCallTaskId = String(task.Id);
      renderCallTasks('');
      closeCallMenus();
    });
    callTaskOptions.appendChild(row);
  }
};

const loadCallOrganizations = async () => {
  if (!currentSession?.token) return;
  availableOrganizations = await window.desktopApi.getOrganizations();
  renderCallOrganizations('');
};

const loadCallProjects = async (organizationId) => {
  const id = Number(organizationId);
  if (!id) {
    availableCallProjects = [];
    availableCallTasks = [];
    renderCallProjects('');
    renderCallTasks('');
    return;
  }

  availableCallProjects = await window.desktopApi.getProjectsByOrganization(id);
  availableCallTasks = [];
  renderCallProjects('');
  renderCallTasks('');
};

const loadCallTasks = async (projectId) => {
  const id = Number(projectId);
  if (!id) {
    availableCallTasks = [];
    renderCallTasks('');
    return;
  }

  availableCallTasks = await window.desktopApi.getTasksByProject(id);
  renderCallTasks('');
};

const getTaskLabel = (task) => `${task.TaskName}${task.ProjectName ? ` — ${task.ProjectName}` : ''}`;

const renderTaskList = (container, tasks, emptyMessage) => {
  container.innerHTML = '';
  if (!tasks.length) {
    container.textContent = emptyMessage;
    container.classList.add('muted');
    return;
  }

  container.classList.remove('muted');
  for (const task of tasks) {
    const item = document.createElement('div');
    item.className = 'task-list-item';

    const title = document.createElement('div');
    title.className = 'task-list-item-title';
    title.textContent = task.TaskName || `Task ${task.Id}`;

    const meta = document.createElement('div');
    meta.className = 'task-list-item-meta';
    meta.textContent = task.ProjectName || 'No project';

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className = 'primary';
    startButton.textContent = 'Start Timer';
    startButton.addEventListener('click', async () => {
      try {
        await window.desktopApi.startTimer({
          timerType: 'task',
          taskId: Number(task.Id),
          description: null,
        });
        expandedForSwitch = false;
        selectedTaskId = Number(task.Id);
        renderTaskSearch();
        await loadActiveTimer();
        setStatus('Task timer started');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to start task timer', true);
      }
    });

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(startButton);
    container.appendChild(item);
  }
};

const loadOpenTasks = async () => {
  if (!currentSession?.token) return;
  openTasksList.textContent = 'Loading...';
  openTasksList.classList.add('muted');
  openTasks = await window.desktopApi.getMyOpenTasks();
  renderTaskList(openTasksList, openTasks, 'No open tasks found.');
};

const loadRecentTasks = async () => {
  if (!currentSession?.token) return;
  recentTasksList.textContent = 'Loading...';
  recentTasksList.classList.add('muted');
  recentTasks = await window.desktopApi.getRecentTasks();
  renderTaskList(recentTasksList, recentTasks, 'No recent tasks found.');
};

const selectStartTab = (tabName) => {
  activeStartTab = tabName;
  const isTimer = tabName === 'timer';
  const isOpen = tabName === 'open';
  const isRecent = tabName === 'recent';

  tabStartTimer.classList.toggle('primary', isTimer);
  tabOpenTasks.classList.toggle('primary', isOpen);
  tabRecentTasks.classList.toggle('primary', isRecent);
  tabStartTimer.setAttribute('aria-selected', String(isTimer));
  tabOpenTasks.setAttribute('aria-selected', String(isOpen));
  tabRecentTasks.setAttribute('aria-selected', String(isRecent));

  startTimerPanel.classList.toggle('hidden', !isTimer);
  openTasksPanel.classList.toggle('hidden', !isOpen);
  recentTasksPanel.classList.toggle('hidden', !isRecent);

  if (isOpen) {
    void loadOpenTasks();
  } else if (isRecent) {
    void loadRecentTasks();
  }

  fitWindowToCurrentContent();
};

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
      event.stopPropagation();
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
    await Promise.all([loadSettings(), loadTasks(), loadCallOrganizations(), loadActiveTimer()]);
    selectStartTab('timer');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Login failed', true);
  }
});

logoutButton.addEventListener('click', async () => {
  await window.desktopApi.logout();
  currentSession = null;
  settingsModal.classList.add('hidden');
  availableOrganizations = [];
  availableCallProjects = [];
  availableCallTasks = [];
  selectedCallOrganizationId = '';
  selectedCallProjectId = '';
  selectedCallTaskId = '';
  selectedCallType = 'Teams';
  renderCallType();
  renderCallOrganizations('');
  renderCallProjects('');
  renderCallTasks('');
  renderAuthState();
});

headerLogoutButton.addEventListener('click', async () => {
  await window.desktopApi.logout();
  currentSession = null;
  settingsModal.classList.add('hidden');
  availableOrganizations = [];
  availableCallProjects = [];
  availableCallTasks = [];
  selectedCallOrganizationId = '';
  selectedCallProjectId = '';
  selectedCallTaskId = '';
  selectedCallType = 'Teams';
  renderCallType();
  renderCallOrganizations('');
  renderCallProjects('');
  renderCallTasks('');
  renderAuthState();
});

callTypeTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  if (callTypeMenu.classList.contains('hidden')) {
    openCallMenu(callTypeMenu, callTypeTrigger, callTypeInput);
    renderCallTypeOptions('');
  } else {
    closeCallMenus();
  }
});

callTypeInput.addEventListener('input', (event) => {
  renderCallTypeOptions(event.target.value);
});

callOrganizationTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  if (callOrganizationMenu.classList.contains('hidden')) {
    openCallMenu(callOrganizationMenu, callOrganizationTrigger, callOrganizationInput);
    renderCallOrganizations('');
  } else {
    closeCallMenus();
  }
});

callOrganizationInput.addEventListener('input', (event) => {
  renderCallOrganizations(event.target.value);
});

callProjectTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!selectedCallOrganizationId) {
    return;
  }
  if (callProjectMenu.classList.contains('hidden')) {
    openCallMenu(callProjectMenu, callProjectTrigger, callProjectInput);
    renderCallProjects('');
  } else {
    closeCallMenus();
  }
});

callProjectInput.addEventListener('input', (event) => {
  renderCallProjects(event.target.value);
});

callTaskTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!selectedCallProjectId) {
    return;
  }
  if (callTaskMenu.classList.contains('hidden')) {
    openCallMenu(callTaskMenu, callTaskTrigger, callTaskInput);
    renderCallTasks('');
  } else {
    closeCallMenus();
  }
});

callTaskInput.addEventListener('input', (event) => {
  renderCallTasks(event.target.value);
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
  if (callTypeSearch && !callTypeSearch.contains(target)
    && callOrganizationSearch && !callOrganizationSearch.contains(target)
    && callProjectSearch && !callProjectSearch.contains(target)
    && callTaskSearch && !callTaskSearch.contains(target)) {
    closeCallMenus();
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

tabStartTimer.addEventListener('click', () => selectStartTab('timer'));
tabOpenTasks.addEventListener('click', () => selectStartTab('open'));
tabRecentTasks.addEventListener('click', () => selectStartTab('recent'));
refreshOpenTasksButton.addEventListener('click', () => { void loadOpenTasks(); });
refreshRecentTasksButton.addEventListener('click', () => { void loadRecentTasks(); });

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
    const organizationId = Number(selectedCallOrganizationId || 0) || null;
    const projectId = Number(selectedCallProjectId || 0) || null;
    const taskId = Number(selectedCallTaskId || 0) || null;

    await window.desktopApi.startTimer({
      timerType: 'callRecord',
      organizationId,
      projectId,
      taskId,
      callType: selectedCallType,
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

  if (target.closest('button, input, textarea, select, a, [role="listbox"], [contenteditable="true"], .searchable-select, .search-menu, .search-option')) {
    return false;
  }

  if (document.body.classList.contains('compact-mode')) {
    if (compactDragBar && compactDragBar.contains(target)) {
      return true;
    }
    if (timerCardHeader && timerCardHeader.contains(target)) {
      return true;
    }
    return false;
  }

  if (!appHeader || !appHeader.contains(target)) {
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
  selectStartTab('timer');

  renderCallOrganizations();
  renderCallProjects();
  renderCallTasks();
  renderCallType();

  if (currentSession?.token) {
    await Promise.all([loadSettings(), loadTasks(), loadCallOrganizations(), loadActiveTimer()]);
    selectStartTab('timer');
  }
};

void bootstrap();