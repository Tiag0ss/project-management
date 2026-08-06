(function () {
  'use strict';

  /** @type {{ baseUrl: string, token: string, selectedProjectId: number | null, proxyViaHost: boolean, layout: string, hiddenStatuses: string, maxVisibleCards: number, aiInProgressStatusId: number }} */
  let config = {
    baseUrl: '',
    token: '',
    selectedProjectId: null,
    proxyViaHost: false,
    layout: 'horizontal',
    hiddenStatuses: '',
    maxVisibleCards: 2,
    aiInProgressStatusId: 0,
  };

  /** @type {Array<{ Id: number, ProjectName?: string, Name?: string, OrganizationId?: number, OrganizationName?: string }>} */
  let projects = [];
  /** @type {Array<any>} */
  let statuses = [];
  /** @type {Array<any>} */
  let priorities = [];
  /** @type {Array<any>} */
  let tasks = [];
  /** @type {number | null} */
  let currentUserId = null;
  /** @type {any} */
  let activeTimer = null;
  /** @type {number | null} */
  let timerTickInterval = null;
  /** @type {number | null} */
  let draggedTaskId = null;
  /** @type {number | null} */
  let draggedOverTaskId = null;
  /** @type {Map<string, { resolve: Function, reject: Function }>} */
  const pendingApi = new Map();
  let apiSeq = 0;
  let createSubmitting = false;
  let projectHighlight = -1;
  let projectListOpen = false;

  function formatTaskCommitMessage(task) {
    var id = Number(task && task.Id);
    var name = String((task && task.TaskName) || '').trim();
    var tag = id > 0 ? 'Task #' + id : 'Task #';
    if (!name) return tag;
    return tag + ' - ' + name;
  }

  function copyCommitMessage(task) {
    var text = formatTaskCommitMessage(task);
    var done = function () {
      setStatus('Commit message copied', false);
    };
    postHost({ type: 'setActiveTask', task: task });
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        postHost({ type: 'copyText', text: text, label: 'Commit message', task: task });
      });
      return;
    }
    postHost({ type: 'copyText', text: text, label: 'Commit message', task: task });
  }

  const el = {
    projectSearch: /** @type {HTMLInputElement | null} */ (document.getElementById('projectSearch')),
    projectPickerToggle: /** @type {HTMLButtonElement | null} */ (document.getElementById('projectPickerToggle')),
    projectList: /** @type {HTMLUListElement | null} */ (document.getElementById('projectList')),
    projectPicker: /** @type {HTMLElement | null} */ (document.getElementById('projectPicker')),
    addTaskBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById('addTaskBtn')),
    refreshBtn: /** @type {HTMLButtonElement} */ (document.getElementById('refreshBtn')),
    configureBtn: /** @type {HTMLButtonElement} */ (document.getElementById('configureBtn')),
    activeTimerBar: /** @type {HTMLElement | null} */ (document.getElementById('activeTimerBar')),
    activeTimerLabel: /** @type {HTMLElement | null} */ (document.getElementById('activeTimerLabel')),
    activeTimerStop: /** @type {HTMLButtonElement | null} */ (document.getElementById('activeTimerStop')),
    statusLine: /** @type {HTMLElement} */ (document.getElementById('statusLine')),
    board: /** @type {HTMLElement} */ (document.getElementById('board')),
    emptyState: /** @type {HTMLElement} */ (document.getElementById('emptyState')),
    createTaskModal: /** @type {HTMLElement | null} */ (document.getElementById('createTaskModal')),
    createTaskName: /** @type {HTMLInputElement | null} */ (document.getElementById('createTaskName')),
    createTaskStatus: /** @type {HTMLSelectElement | null} */ (document.getElementById('createTaskStatus')),
    createTaskPriority: /** @type {HTMLSelectElement | null} */ (document.getElementById('createTaskPriority')),
    createTaskError: /** @type {HTMLElement | null} */ (document.getElementById('createTaskError')),
    createTaskSubmit: /** @type {HTMLButtonElement | null} */ (document.getElementById('createTaskSubmit')),
  };

  function postHost(message) {
    try {
      if (window.__PM_VSCODE__ && typeof window.__PM_VSCODE__.postMessage === 'function') {
        window.__PM_VSCODE__.postMessage(message);
        return;
      }
      if (window.pmHost && typeof window.pmHost.postMessage === 'function') {
        window.pmHost.postMessage(message);
        return;
      }
      if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
        window.chrome.webview.postMessage(message);
        return;
      }
    } catch (_) {
      /* ignore */
    }
  }

  function setStatus(text, isError) {
    el.statusLine.textContent = text || '';
    el.statusLine.classList.toggle('error', !!isError);
  }

  function sanitizeToken(raw) {
    return String(raw || '')
      .replace(/[\u2022•·]+/g, '')
      .replace(/^bearer\s+/i, '')
      .trim()
      .replace(/\s+/g, '');
  }

  function useHostProxy() {
    return !!config.proxyViaHost;
  }

  function clientTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (_) {
      return 'UTC';
    }
  }

  function requestViaHost(path, options) {
    return new Promise(function (resolve, reject) {
      apiSeq += 1;
      const requestId = 'api_' + Date.now() + '_' + apiSeq;
      pendingApi.set(requestId, { resolve: resolve, reject: reject });
      postHost({
        type: 'apiRequest',
        requestId: requestId,
        path: path,
        method: (options && options.method) || 'GET',
        body: options ? options.body : undefined,
      });
      setTimeout(function () {
        if (!pendingApi.has(requestId)) return;
        pendingApi.delete(requestId);
        reject(new Error('API request timed out'));
      }, 60000);
    });
  }

  async function requestJson(path, options) {
    const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Base URL is not configured');

    if (useHostProxy()) {
      return requestViaHost(path, options);
    }

    const token = sanitizeToken(config.token);
    if (!token) throw new Error('API token is not configured');
    if (!token.startsWith('pt_')) throw new Error('API token must start with pt_');

    const method = (options && options.method) || 'GET';
    const headers = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
    };
    const init = { method: method, headers: headers };
    if (options && options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(baseUrl + path, init);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (/certificate|SSL|TLS|self.signed/i.test(msg)) {
        throw new Error(
          'TLS error (self-signed certificates are not supported in v1). Use a valid certificate or HTTP on LAN/VPN.'
        );
      }
      throw new Error('Network error: ' + msg);
    }

    const data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      throw new Error(data.message || 'HTTP ' + response.status);
    }
    return data;
  }

  function projectLabel(p) {
    const name = p.ProjectName || p.Name || 'Project #' + p.Id;
    const org = p.OrganizationName ? ' · ' + p.OrganizationName : '';
    return name + org;
  }

  function selectedProject() {
    const id = Number(config.selectedProjectId || 0);
    if (!id) return null;
    return (
      projects.find(function (p) {
        return Number(p.Id) === id;
      }) || null
    );
  }

  function updateAddTaskEnabled() {
    if (!el.addTaskBtn) return;
    el.addTaskBtn.disabled = !selectedProject();
  }

  function syncProjectSearchDisplay() {
    if (!el.projectSearch) return;
    const p = selectedProject();
    if (!projectListOpen) {
      el.projectSearch.value = p ? projectLabel(p) : '';
      el.projectSearch.placeholder = projects.length ? 'Search projects…' : 'No projects';
    }
    el.projectSearch.disabled = !projects.length;
    if (el.projectPickerToggle) el.projectPickerToggle.disabled = !projects.length;
    updateAddTaskEnabled();
  }

  function filteredProjects(query) {
    const q = String(query || '')
      .trim()
      .toLowerCase();
    const sorted = projects.slice().sort(function (a, b) {
      return projectLabel(a).localeCompare(projectLabel(b), undefined, { sensitivity: 'base' });
    });
    if (!q) return sorted;
    return sorted.filter(function (p) {
      const hay = (
        String(p.ProjectName || '') +
        ' ' +
        String(p.Name || '') +
        ' ' +
        String(p.OrganizationName || '')
      ).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function closeProjectList() {
    projectListOpen = false;
    projectHighlight = -1;
    if (el.projectList) el.projectList.hidden = true;
    if (el.projectSearch) el.projectSearch.setAttribute('aria-expanded', 'false');
    syncProjectSearchDisplay();
  }

  function renderProjectList(query) {
    if (!el.projectList) return;
    const list = filteredProjects(query);
    el.projectList.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('li');
      empty.className = 'muted';
      empty.textContent = projects.length ? 'No matches' : 'No projects';
      el.projectList.appendChild(empty);
      projectHighlight = -1;
      return;
    }
    if (projectHighlight >= list.length) projectHighlight = list.length - 1;
    list.forEach(function (p, idx) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.projectId = String(p.Id);
      li.textContent = projectLabel(p);
      if (Number(p.Id) === Number(config.selectedProjectId)) li.setAttribute('aria-selected', 'true');
      if (idx === projectHighlight) li.setAttribute('aria-selected', 'true');
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        void selectProjectById(Number(p.Id));
      });
      el.projectList.appendChild(li);
    });
  }

  function openProjectList() {
    if (!projects.length) return;
    projectListOpen = true;
    if (el.projectList) el.projectList.hidden = false;
    if (el.projectSearch) {
      el.projectSearch.setAttribute('aria-expanded', 'true');
      if (selectedProject() && el.projectSearch.value === projectLabel(selectedProject())) {
        el.projectSearch.value = '';
      }
      renderProjectList(el.projectSearch.value);
      el.projectSearch.focus();
    }
  }

  async function selectProjectById(id) {
    config.selectedProjectId = id || null;
    closeProjectList();
    postHost({ type: 'projectSelected', projectId: config.selectedProjectId });
    setStatus('Loading board…', false);
    try {
      await loadBoardForSelection();
      const project = selectedProject();
      setStatus(
        project
          ? 'Loaded “' + projectLabel(project) + '” · ' + tasks.length + ' assigned to you'
          : 'Select a project',
        false
      );
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setStatus(msg, true);
      postHost({ type: 'error', message: msg });
    }
  }

  function isFlagOn(value) {
    return value === true || Number(value) === 1;
  }

  function defaultStatusId(preferredId) {
    const cols = visibleStatuses();
    const pool = cols.length ? cols : statuses;
    if (
      preferredId &&
      pool.some(function (s) {
        return Number(s.Id) === Number(preferredId);
      })
    ) {
      return Number(preferredId);
    }
    const def = pool.find(function (s) {
      return isFlagOn(s.IsDefault);
    });
    if (def) return Number(def.Id);
    const open = pool.find(function (s) {
      return !isFlagOn(s.IsClosed) && !isFlagOn(s.IsCancelled);
    });
    if (open) return Number(open.Id);
    return pool.length ? Number(pool[0].Id) : 0;
  }

  function defaultPriorityId() {
    const def = priorities.find(function (p) {
      return isFlagOn(p.IsDefault);
    });
    if (def) return Number(def.Id);
    return priorities.length ? Number(priorities[0].Id) : 0;
  }

  function resolveInProgressStatusId() {
    const configured = Number(config.aiInProgressStatusId || 0);
    if (
      configured > 0 &&
      statuses.some(function (s) {
        return Number(s.Id) === configured;
      })
    ) {
      return configured;
    }
    const flagged = statuses.find(function (s) {
      return isFlagOn(s.IsInProgress);
    });
    return flagged ? Number(flagged.Id) : 0;
  }

  function taskAssignedToUser(task, userId) {
    if (!userId) return true;
    if (Number(task.AssignedTo) === Number(userId)) return true;
    let assignees = task.Assignees;
    if (!assignees && task.AssigneesJson) {
      try {
        assignees = typeof task.AssigneesJson === 'string' ? JSON.parse(task.AssigneesJson) : task.AssigneesJson;
      } catch (_) {
        assignees = [];
      }
    }
    if (!Array.isArray(assignees)) return false;
    return assignees.some(function (a) {
      return Number(a.UserId || a.Id || a.userId) === Number(userId);
    });
  }

  function fillCreateSelects(preferredStatusId) {
    if (!el.createTaskStatus || !el.createTaskPriority) return;
    const statusPool = visibleStatuses().length ? visibleStatuses() : statuses;
    el.createTaskStatus.innerHTML = '';
    statusPool.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = String(s.Id);
      opt.textContent = s.StatusName || 'Status #' + s.Id;
      el.createTaskStatus.appendChild(opt);
    });
    el.createTaskPriority.innerHTML = '';
    priorities.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = String(p.Id);
      opt.textContent = p.PriorityName || 'Priority #' + p.Id;
      el.createTaskPriority.appendChild(opt);
    });
    const statusId = defaultStatusId(preferredStatusId);
    const priorityId = defaultPriorityId();
    if (statusId) el.createTaskStatus.value = String(statusId);
    if (priorityId) el.createTaskPriority.value = String(priorityId);
  }

  function setCreateError(msg) {
    if (!el.createTaskError) return;
    if (msg) {
      el.createTaskError.hidden = false;
      el.createTaskError.textContent = msg;
    } else {
      el.createTaskError.hidden = true;
      el.createTaskError.textContent = '';
    }
  }

  function openCreateModal(preferredStatusId) {
    if (!el.createTaskModal || !selectedProject()) return;
    if (!statuses.length) {
      setStatus('No statuses available to create a task.', true);
      return;
    }
    if (!priorities.length) {
      setStatus('No priorities available to create a task.', true);
      return;
    }
    fillCreateSelects(preferredStatusId);
    if (el.createTaskName) el.createTaskName.value = '';
    setCreateError('');
    el.createTaskModal.hidden = false;
    el.createTaskModal.setAttribute('aria-hidden', 'false');
    if (el.createTaskName) el.createTaskName.focus();
  }

  function closeCreateModal() {
    if (!el.createTaskModal) return;
    el.createTaskModal.hidden = true;
    el.createTaskModal.setAttribute('aria-hidden', 'true');
    setCreateError('');
    createSubmitting = false;
    if (el.createTaskSubmit) el.createTaskSubmit.disabled = false;
  }

  async function submitCreateTask() {
    if (createSubmitting) return;
    const project = selectedProject();
    if (!project) {
      setCreateError('Select a project first.');
      return;
    }
    const name = el.createTaskName ? String(el.createTaskName.value || '').trim() : '';
    if (!name) {
      setCreateError('Task name is required.');
      if (el.createTaskName) el.createTaskName.focus();
      return;
    }
    const statusId = Number(el.createTaskStatus && el.createTaskStatus.value);
    const priorityId = Number(el.createTaskPriority && el.createTaskPriority.value);
    if (!statusId || !priorityId) {
      setCreateError('Status and priority are required.');
      return;
    }

    createSubmitting = true;
    if (el.createTaskSubmit) el.createTaskSubmit.disabled = true;
    setCreateError('');
    const body = {
      projectId: Number(project.Id),
      taskName: name,
      status: statusId,
      priority: priorityId,
    };
    if (currentUserId) body.assignedTo = currentUserId;
    try {
      await requestJson('/api/tasks', { method: 'POST', body: body });
      closeCreateModal();
      setStatus('Creating…', false);
      await loadBoardForSelection();
      setStatus('Created “' + name + '”', false);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setCreateError(msg);
      createSubmitting = false;
      if (el.createTaskSubmit) el.createTaskSubmit.disabled = false;
    }
  }

  function tasksForStatus(statusId) {
    return tasks
      .filter(function (t) {
        return Number(t.Status) === Number(statusId);
      })
      .sort(function (a, b) {
        return (Number(a.DisplayOrder) || 0) - (Number(b.DisplayOrder) || 0);
      });
  }

  function dueLabel(due) {
    if (!due) return '';
    return String(due).split('T')[0];
  }

  function parseHiddenStatuses(raw) {
    return String(raw || '')
      .split(';')
      .map(function (s) {
        return s.trim().toLowerCase();
      })
      .filter(Boolean);
  }

  function statusSortKey(status) {
    const order = Number(status.SortOrder ?? status.sortOrder);
    return Number.isFinite(order) ? order : 9999;
  }

  function visibleStatuses() {
    const hidden = parseHiddenStatuses(config.hiddenStatuses);
    return statuses
      .slice()
      .sort(function (a, b) {
        const ao = statusSortKey(a);
        const bo = statusSortKey(b);
        if (ao !== bo) return ao - bo;
        return String(a.StatusName || '').localeCompare(String(b.StatusName || ''), undefined, {
          sensitivity: 'base',
        });
      })
      .filter(function (s) {
        if (!hidden.length) return true;
        return hidden.indexOf(String(s.StatusName || '').trim().toLowerCase()) === -1;
      });
  }

  function formatElapsed(startedAt) {
    if (!startedAt) return '0:00';
    const raw = String(startedAt);
    const ms = /Z$|[+-]\d{2}:\d{2}$/.test(raw)
      ? new Date(raw).getTime()
      : new Date(raw.replace(' ', 'T') + 'Z').getTime();
    const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
  }

  function updateActiveTimerBar() {
    if (!el.activeTimerBar || !el.activeTimerLabel) return;
    if (!activeTimer || !activeTimer.Id) {
      el.activeTimerBar.hidden = true;
      if (timerTickInterval) {
        clearInterval(timerTickInterval);
        timerTickInterval = null;
      }
      return;
    }
    el.activeTimerBar.hidden = false;
    const name = activeTimer.TaskName || 'Task #' + (activeTimer.TaskId || '');
    el.activeTimerLabel.textContent = 'Timer: ' + name + ' · ' + formatElapsed(activeTimer.StartedAt);
    if (!timerTickInterval) {
      timerTickInterval = setInterval(function () {
        if (!activeTimer) return;
        el.activeTimerLabel.textContent =
          'Timer: ' +
          (activeTimer.TaskName || 'Task #' + (activeTimer.TaskId || '')) +
          ' · ' +
          formatElapsed(activeTimer.StartedAt);
      }, 1000);
    }
  }

  async function loadActiveTimer() {
    try {
      const data = await requestJson('/api/timers/active');
      activeTimer = data && data.timer ? data.timer : null;
    } catch (_) {
      activeTimer = null;
    }
    updateActiveTimerBar();
  }

  async function startTimerForTask(task) {
    postHost({ type: 'setActiveTask', task: task });
    try {
      const data = await requestJson('/api/timers/start', {
        method: 'POST',
        body: { taskId: Number(task.Id), clientTimezone: clientTimezone() },
      });
      activeTimer = data && data.timer ? data.timer : null;
      updateActiveTimerBar();
      renderBoard();
      setStatus('Timer started on “' + (task.TaskName || '') + '”', false);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setStatus(msg, true);
      postHost({ type: 'error', message: msg });
    }
  }

  async function stopActiveTimer() {
    if (!activeTimer || !activeTimer.Id) return;
    try {
      await requestJson('/api/timers/' + activeTimer.Id + '/stop', {
        method: 'POST',
        body: { clientTimezone: clientTimezone() },
      });
      activeTimer = null;
      updateActiveTimerBar();
      renderBoard();
      setStatus('Timer stopped', false);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setStatus(msg, true);
      postHost({ type: 'error', message: msg });
    }
  }

  async function markInProgressThenAi(task) {
    postHost({ type: 'setActiveTask', task: task });
    const targetId = resolveInProgressStatusId();
    let nextTask = task;
    if (targetId && Number(task.Status) !== Number(targetId)) {
      try {
        await requestJson('/api/tasks/' + task.Id, {
          method: 'PUT',
          body: { status: targetId },
        });
        nextTask = Object.assign({}, task, { Status: targetId });
        tasks = tasks.map(function (t) {
          return Number(t.Id) === Number(task.Id) ? nextTask : t;
        });
        renderBoard();
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        setStatus('Could not set In Progress: ' + msg, true);
      }
    } else if (!targetId) {
      setStatus('No In Progress status configured. In the app: Organization → Statuses → edit a task status → enable “In Progress status”. Or set projectManagement.aiInProgressStatusId in Cursor/VS Code Settings.', true);
    }
    postHost({ type: 'sendToAi', task: nextTask });
  }

  function renderBoard() {
    el.board.innerHTML = '';
    const layout = config.layout === 'vertical' ? 'vertical' : 'horizontal';
    el.board.className = 'layout-' + layout;
    document.body.classList.toggle('layout-vertical', layout === 'vertical');
    document.body.classList.toggle('layout-horizontal', layout === 'horizontal');

    const project = selectedProject();
    if (!project) {
      el.emptyState.style.display = 'block';
      el.emptyState.textContent =
        config.baseUrl && (useHostProxy() || sanitizeToken(config.token))
          ? 'Select a project to load its Kanban board.'
          : 'Configure Base URL and API token to load projects.';
      updateAddTaskEnabled();
      return;
    }
    el.emptyState.style.display = 'none';
    updateAddTaskEnabled();

    const cols = visibleStatuses();
    if (!cols.length) {
      el.emptyState.style.display = 'block';
      el.emptyState.textContent = statuses.length
        ? 'All statuses are hidden by settings (kanbanHiddenStatuses).'
        : 'No statuses configured for this organization.';
      return;
    }

    const maxCards = Number(config.maxVisibleCards);
    const limit = Number.isFinite(maxCards) && maxCards > 0 ? maxCards : 0;

    cols.forEach(function (status) {
      const colTasks = tasksForStatus(status.Id);
      const col = document.createElement('section');
      col.className = 'column';
      col.dataset.statusId = String(status.Id);

      const header = document.createElement('div');
      header.className = 'column-header';
      const title = document.createElement('h3');
      title.className = 'column-title';
      title.textContent = status.StatusName || 'Status';
      if (status.ColorCode) title.style.color = status.ColorCode;
      const count = document.createElement('span');
      count.className = 'column-count';
      count.textContent = String(colTasks.length);
      const addColBtn = document.createElement('button');
      addColBtn.type = 'button';
      addColBtn.className = 'column-add';
      addColBtn.title = 'Add task in ' + (status.StatusName || 'this status');
      addColBtn.setAttribute('aria-label', addColBtn.title);
      addColBtn.textContent = '+';
      addColBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openCreateModal(Number(status.Id));
      });
      const headerActions = document.createElement('div');
      headerActions.className = 'column-header-actions';
      headerActions.appendChild(count);
      headerActions.appendChild(addColBtn);
      header.appendChild(title);
      header.appendChild(headerActions);

      const body = document.createElement('div');
      body.className = 'column-body';
      body.dataset.statusId = String(status.Id);

      body.addEventListener('dragover', function (e) {
        e.preventDefault();
        col.classList.add('drag-over');
      });
      body.addEventListener('dragleave', function () {
        col.classList.remove('drag-over');
      });
      body.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('drag-over');
        const targetCard = e.target.closest && e.target.closest('.card');
        if (targetCard && targetCard.dataset.taskId) {
          void dropOnTask(Number(targetCard.dataset.taskId));
        } else {
          void dropOnColumn(Number(status.Id));
        }
      });

      const shown = limit > 0 ? colTasks.slice(0, limit) : colTasks;
      shown.forEach(function (task) {
        body.appendChild(buildCard(task));
      });

      if (limit > 0 && colTasks.length > limit) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'show-more';
        more.textContent = 'Show more (' + (colTasks.length - limit) + ')';
        more.addEventListener('click', function () {
          more.remove();
          colTasks.slice(limit).forEach(function (task) {
            body.appendChild(buildCard(task));
          });
        });
        body.appendChild(more);
      }

      col.appendChild(header);
      col.appendChild(body);
      el.board.appendChild(col);
    });
  }

  function buildCard(task) {
    const card = document.createElement('article');
    card.className = 'card';
    card.draggable = true;
    card.dataset.taskId = String(task.Id);
    if (task.PriorityColor) card.style.borderLeftColor = task.PriorityColor;
    const isRunning = activeTimer && Number(activeTimer.TaskId) === Number(task.Id);
    if (isRunning) card.classList.add('timer-running');

    const title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = task.TaskName || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (task.TaskTypeName) {
      const typ = document.createElement('span');
      typ.className = 'chip chip-type';
      typ.textContent = task.TaskTypeName;
      if (task.TaskTypeColor) {
        typ.style.color = task.TaskTypeColor;
        typ.style.borderColor = task.TaskTypeColor;
      }
      meta.appendChild(typ);
    }
    if (task.PriorityName) {
      const pri = document.createElement('span');
      pri.className = 'chip chip-priority';
      pri.textContent = task.PriorityName;
      meta.appendChild(pri);
    }
    const due = dueLabel(task.DueDate);
    if (due) {
      const d = document.createElement('span');
      d.className = 'chip';
      d.textContent = due;
      meta.appendChild(d);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const timerBtn = document.createElement('button');
    timerBtn.type = 'button';
    if (isRunning) {
      timerBtn.textContent = 'Stop';
      timerBtn.className = 'card-timer-active';
      timerBtn.title = 'Stop timer';
      timerBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        void stopActiveTimer();
      });
    } else {
      timerBtn.textContent = 'Timer';
      timerBtn.title = 'Start timer';
      timerBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        void startTimerForTask(task);
      });
    }

    const aiBtn = document.createElement('button');
    aiBtn.type = 'button';
    aiBtn.textContent = 'AI';
    aiBtn.title = 'Send to AI Chat';
    aiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      void markInProgressThenAi(task);
    });

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = 'View';
    openBtn.title = 'View task (read-only)';
    openBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      postHost({ type: 'setActiveTask', task: task });
      postHost({ type: 'openTask', task: task });
    });

    const commitBtn = document.createElement('button');
    commitBtn.type = 'button';
    commitBtn.textContent = 'Commit';
    commitBtn.title = 'Copy commit message (Task #Id)';
    commitBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      copyCommitMessage(task);
    });

    const appBtn = document.createElement('button');
    appBtn.type = 'button';
    appBtn.textContent = 'App';
    appBtn.title = 'Open task in Project Management';
    appBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const base = String(config.baseUrl || '').replace(/\/+$/, '');
      const url = base + '/projects/' + task.ProjectId + '?tab=tasks&taskId=' + task.Id;
      postHost({ type: 'openExternal', url: url });
    });

    actions.appendChild(timerBtn);
    actions.appendChild(aiBtn);
    actions.appendChild(openBtn);
    actions.appendChild(commitBtn);
    actions.appendChild(appBtn);

    card.addEventListener('dragstart', function (e) {
      draggedTaskId = Number(task.Id);
      e.dataTransfer.setData('text/plain', String(task.Id));
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', function () {
      draggedTaskId = null;
      draggedOverTaskId = null;
      document.querySelectorAll('.card.drag-over').forEach(function (n) {
        n.classList.remove('drag-over');
      });
    });
    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      draggedOverTaskId = Number(task.Id);
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', function () {
      card.classList.remove('drag-over');
      if (draggedOverTaskId === Number(task.Id)) draggedOverTaskId = null;
    });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('drag-over');
      void dropOnTask(Number(task.Id));
    });

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);
    return card;
  }

  async function reorderKanban(updates) {
    await requestJson('/api/tasks/reorder-kanban', {
      method: 'POST',
      body: { updates: updates },
    });
  }

  async function dropOnColumn(newStatusId) {
    const srcId = draggedTaskId;
    if (!srcId) return;
    const srcTask = tasks.find(function (t) {
      return Number(t.Id) === Number(srcId);
    });
    if (!srcTask || Number(srcTask.Status) === Number(newStatusId)) return;

    const colTasks = tasks
      .filter(function (t) {
        return Number(t.Status) === Number(newStatusId);
      })
      .sort(function (a, b) {
        return (Number(a.DisplayOrder) || 0) - (Number(b.DisplayOrder) || 0);
      });
    const newOrder = (colTasks.length + 1) * 10;
    const prev = tasks.slice();
    tasks = tasks.map(function (t) {
      if (Number(t.Id) === Number(srcId)) {
        return Object.assign({}, t, { Status: newStatusId, DisplayOrder: newOrder });
      }
      return t;
    });
    renderBoard();
    try {
      await reorderKanban([{ taskId: srcId, displayOrder: newOrder, status: newStatusId }]);
      setStatus('Moved “' + (srcTask.TaskName || '') + '”', false);
    } catch (err) {
      tasks = prev;
      renderBoard();
      const msg = err && err.message ? err.message : String(err);
      setStatus(msg, true);
      postHost({ type: 'error', message: msg });
    }
  }

  async function dropOnTask(targetTaskId) {
    const srcId = draggedTaskId;
    if (!srcId || !targetTaskId || Number(srcId) === Number(targetTaskId)) return;
    const srcTask = tasks.find(function (t) {
      return Number(t.Id) === Number(srcId);
    });
    const targetTask = tasks.find(function (t) {
      return Number(t.Id) === Number(targetTaskId);
    });
    if (!srcTask || !targetTask) return;

    const newStatus = Number(targetTask.Status);
    const columnTasks = tasks
      .filter(function (t) {
        return Number(t.Status) === newStatus && Number(t.Id) !== Number(srcId);
      })
      .sort(function (a, b) {
        return (Number(a.DisplayOrder) || 0) - (Number(b.DisplayOrder) || 0);
      });
    const targetIdx = columnTasks.findIndex(function (t) {
      return Number(t.Id) === Number(targetTaskId);
    });
    columnTasks.splice(targetIdx < 0 ? columnTasks.length : targetIdx, 0, Object.assign({}, srcTask, { Status: newStatus }));

    const updates = columnTasks.map(function (t, i) {
      return {
        taskId: Number(t.Id),
        displayOrder: (i + 1) * 10,
        status: newStatus,
      };
    });

    const prev = tasks.slice();
    const updatedIds = new Set(
      columnTasks.map(function (t) {
        return Number(t.Id);
      })
    );
    const others = tasks.filter(function (t) {
      return !updatedIds.has(Number(t.Id));
    });
    tasks = others.concat(
      columnTasks.map(function (t, i) {
        return Object.assign({}, t, { Status: newStatus, DisplayOrder: (i + 1) * 10 });
      })
    );
    renderBoard();

    try {
      await reorderKanban(updates);
      setStatus('Reordered “' + (srcTask.TaskName || '') + '”', false);
    } catch (err) {
      tasks = prev;
      renderBoard();
      const msg = err && err.message ? err.message : String(err);
      setStatus(msg, true);
      postHost({ type: 'error', message: msg });
    }
  }

  async function loadCurrentUser() {
    try {
      const data = await requestJson('/api/user/profile');
      const user = data && data.user && typeof data.user === 'object' ? data.user : data;
      currentUserId = Number(user.userId || user.Id || user.id || 0) || null;
    } catch (_) {
      currentUserId = null;
    }
  }

  async function loadProjects() {
    const data = await requestJson('/api/projects');
    projects = Array.isArray(data.projects) ? data.projects : [];
    if (
      config.selectedProjectId &&
      !projects.some(function (p) {
        return Number(p.Id) === Number(config.selectedProjectId);
      })
    ) {
      config.selectedProjectId = null;
    }
    syncProjectSearchDisplay();
  }

  async function loadBoardForSelection() {
    const project = selectedProject();
    if (!project) {
      statuses = [];
      priorities = [];
      tasks = [];
      renderBoard();
      return;
    }
    const orgId = Number(project.OrganizationId || 0);
    if (!orgId) throw new Error('Selected project has no organization id');

    const [statusData, priorityData, taskData] = await Promise.all([
      requestJson('/api/status-values/task/' + orgId),
      requestJson('/api/status-values/priority/' + orgId),
      requestJson('/api/tasks/project/' + project.Id),
    ]);
    await loadActiveTimer();

    statuses = Array.isArray(statusData.statuses) ? statusData.statuses : [];
    statuses = statuses.slice().sort(function (a, b) {
      const ao = statusSortKey(a);
      const bo = statusSortKey(b);
      if (ao !== bo) return ao - bo;
      return String(a.StatusName || '').localeCompare(String(b.StatusName || ''), undefined, {
        sensitivity: 'base',
      });
    });
    priorities = Array.isArray(priorityData.priorities) ? priorityData.priorities : [];
    priorities = priorities.slice().sort(function (a, b) {
      const ao = Number(a.SortOrder);
      const bo = Number(b.SortOrder);
      const as = Number.isFinite(ao) ? ao : 9999;
      const bs = Number.isFinite(bo) ? bo : 9999;
      if (as !== bs) return as - bs;
      return String(a.PriorityName || '').localeCompare(String(b.PriorityName || ''), undefined, {
        sensitivity: 'base',
      });
    });
    let allTasks = Array.isArray(taskData.tasks) ? taskData.tasks : [];
    allTasks = allTasks.map(function (t) {
      return Object.assign({}, t, {
        ProjectId: t.ProjectId || project.Id,
        ProjectName: t.ProjectName || project.ProjectName || project.Name,
        OrganizationId: t.OrganizationId || orgId,
      });
    });
    tasks = currentUserId
      ? allTasks.filter(function (t) {
          return taskAssignedToUser(t, currentUserId);
        })
      : allTasks;
    renderBoard();
  }

  async function fullReload() {
    const configured = !!config.baseUrl && (useHostProxy() || !!sanitizeToken(config.token));
    if (!configured) {
      projects = [];
      statuses = [];
      priorities = [];
      tasks = [];
      currentUserId = null;
      activeTimer = null;
      syncProjectSearchDisplay();
      updateActiveTimerBar();
      renderBoard();
      setStatus('Configure Base URL and API token.', true);
      return;
    }
    setStatus('Loading…', false);
    el.refreshBtn.disabled = true;
    try {
      await loadCurrentUser();
      await loadProjects();
      await loadBoardForSelection();
      const project = selectedProject();
      setStatus(
        project
          ? 'Loaded “' + projectLabel(project) + '” · ' + tasks.length + ' assigned to you'
          : 'Select a project',
        false
      );
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setStatus(msg, true);
      postHost({ type: 'error', message: msg });
      renderBoard();
    } finally {
      el.refreshBtn.disabled = false;
    }
  }

  function applyConfig(msg) {
    config.baseUrl = String(msg.baseUrl || '').replace(/\/+$/, '');
    config.token = sanitizeToken(msg.token || '');
    config.proxyViaHost = msg.proxyViaHost === true;
    config.layout = msg.layout === 'vertical' ? 'vertical' : 'horizontal';
    config.hiddenStatuses = String(msg.hiddenStatuses || '');
    const maxCards = Number(msg.maxVisibleCards);
    config.maxVisibleCards = Number.isFinite(maxCards) ? maxCards : 2;
    const aiStatus = Number(msg.aiInProgressStatusId);
    config.aiInProgressStatusId = Number.isFinite(aiStatus) && aiStatus > 0 ? aiStatus : 0;
    if (msg.selectedProjectId !== undefined && msg.selectedProjectId !== null && msg.selectedProjectId !== '') {
      config.selectedProjectId = Number(msg.selectedProjectId) || null;
    }
    void fullReload();
  }

  function onHostMessage(raw) {
    const msg =
      typeof raw === 'string'
        ? (function () {
            try {
              return JSON.parse(raw);
            } catch (_) {
              return null;
            }
          })()
        : raw;
    if (!msg || !msg.type) return;
    if (msg.type === 'config') applyConfig(msg);
    if (msg.type === 'refresh') void fullReload();
    if (msg.type === 'apiResponse') {
      const pending = pendingApi.get(msg.requestId);
      if (!pending) return;
      pendingApi.delete(msg.requestId);
      if (msg.ok) pending.resolve(msg.data);
      else pending.reject(new Error(msg.error || 'Request failed'));
    }
  }

  if (el.projectSearch) {
    el.projectSearch.addEventListener('focus', function () {
      openProjectList();
    });
    el.projectSearch.addEventListener('input', function () {
      if (!projectListOpen) openProjectList();
      else renderProjectList(el.projectSearch.value);
      projectHighlight = 0;
    });
    el.projectSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeProjectList();
        el.projectSearch.blur();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!projectListOpen) openProjectList();
        projectHighlight = Math.max(0, projectHighlight) + 1;
        renderProjectList(el.projectSearch.value);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        projectHighlight = Math.max(0, projectHighlight - 1);
        renderProjectList(el.projectSearch.value);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const list = filteredProjects(el.projectSearch.value);
        const pick = list[projectHighlight >= 0 ? projectHighlight : 0];
        if (pick) void selectProjectById(Number(pick.Id));
      }
    });
  }

  if (el.projectPickerToggle) {
    el.projectPickerToggle.addEventListener('click', function () {
      if (projectListOpen) closeProjectList();
      else openProjectList();
    });
  }

  document.addEventListener('click', function (e) {
    if (!el.projectPicker || !projectListOpen) return;
    if (!el.projectPicker.contains(e.target)) closeProjectList();
  });

  el.refreshBtn.addEventListener('click', function () {
    void fullReload();
  });

  if (el.addTaskBtn) {
    el.addTaskBtn.addEventListener('click', function () {
      openCreateModal(null);
    });
  }

  if (el.activeTimerStop) {
    el.activeTimerStop.addEventListener('click', function () {
      void stopActiveTimer();
    });
  }

  if (el.createTaskModal) {
    el.createTaskModal.addEventListener('click', function (e) {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target && target.hasAttribute && target.hasAttribute('data-close-modal')) {
        closeCreateModal();
      }
    });
  }

  if (el.createTaskSubmit) {
    el.createTaskSubmit.addEventListener('click', function () {
      void submitCreateTask();
    });
  }

  if (el.createTaskName) {
    el.createTaskName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submitCreateTask();
      }
      if (e.key === 'Escape') closeCreateModal();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el.createTaskModal && !el.createTaskModal.hidden) {
      closeCreateModal();
    }
  });

  el.configureBtn.addEventListener('click', function () {
    postHost({ type: 'configure' });
  });

  window.addEventListener('message', function (event) {
    onHostMessage(event.data);
  });

  if (window.chrome && window.chrome.webview && window.chrome.webview.addEventListener) {
    window.chrome.webview.addEventListener('message', function (event) {
      onHostMessage(event.data);
    });
  }

  if (window.pmHost && typeof window.pmHost.onMessage === 'function') {
    window.pmHost.onMessage(onHostMessage);
  }

  postHost({ type: 'ready' });
  renderBoard();
  setStatus('Waiting for connection…', false);
})();
