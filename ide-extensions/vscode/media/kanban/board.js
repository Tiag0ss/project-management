(function () {
  'use strict';

  /** @type {{ baseUrl: string, token: string, selectedProjectId: number | null, proxyViaHost: boolean, layout: string, hiddenStatuses: string, maxVisibleCards: number }} */
  let config = {
    baseUrl: '',
    token: '',
    selectedProjectId: null,
    proxyViaHost: false,
    layout: 'horizontal',
    hiddenStatuses: '',
    maxVisibleCards: 2,
  };

  /** @type {Array<{ Id: number, ProjectName?: string, Name?: string, OrganizationId?: number }>} */
  let projects = [];
  /** @type {Array<any>} */
  let statuses = [];
  /** @type {Array<any>} */
  let tasks = [];
  /** @type {number | null} */
  let draggedTaskId = null;
  /** @type {number | null} */
  let draggedOverTaskId = null;
  /** @type {Map<string, { resolve: Function, reject: Function }>} */
  const pendingApi = new Map();
  let apiSeq = 0;

  const el = {
    projectSelect: /** @type {HTMLSelectElement} */ (document.getElementById('projectSelect')),
    refreshBtn: /** @type {HTMLButtonElement} */ (document.getElementById('refreshBtn')),
    configureBtn: /** @type {HTMLButtonElement} */ (document.getElementById('configureBtn')),
    statusLine: /** @type {HTMLElement} */ (document.getElementById('statusLine')),
    board: /** @type {HTMLElement} */ (document.getElementById('board')),
    emptyState: /** @type {HTMLElement} */ (document.getElementById('emptyState')),
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

    // IDE webviews cannot call the API directly (CORS / opaque origin) — host proxies.
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

  function fillProjectSelect() {
    const prev = config.selectedProjectId;
    el.projectSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = projects.length ? 'Select a project…' : 'No projects';
    el.projectSelect.appendChild(placeholder);

    projects
      .slice()
      .sort(function (a, b) {
        return projectLabel(a).localeCompare(projectLabel(b), undefined, { sensitivity: 'base' });
      })
      .forEach(function (p) {
        const opt = document.createElement('option');
        opt.value = String(p.Id);
        opt.textContent = projectLabel(p);
        el.projectSelect.appendChild(opt);
      });

    if (prev && projects.some(function (p) {
      return Number(p.Id) === Number(prev);
    })) {
      el.projectSelect.value = String(prev);
    }
  }

  function selectedProject() {
    const id = Number(el.projectSelect.value || config.selectedProjectId || 0);
    if (!id) return null;
    return projects.find(function (p) {
      return Number(p.Id) === id;
    }) || null;
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
      .filter(function (status) {
        const name = String(status.StatusName || '').trim().toLowerCase();
        return !hidden.includes(name);
      });
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
      el.emptyState.textContent = config.baseUrl && (useHostProxy() || sanitizeToken(config.token))
        ? 'Select a project to load its Kanban board.'
        : 'Configure Base URL and API token to load projects.';
      return;
    }
    el.emptyState.style.display = 'none';

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
      header.appendChild(title);
      header.appendChild(count);

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

    const title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = task.TaskName || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (task.PriorityName) {
      const pri = document.createElement('span');
      pri.textContent = task.PriorityName;
      meta.appendChild(pri);
    }
    const due = dueLabel(task.DueDate);
    if (due) {
      const d = document.createElement('span');
      d.textContent = due;
      meta.appendChild(d);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const aiBtn = document.createElement('button');
    aiBtn.type = 'button';
    aiBtn.textContent = 'AI';
    aiBtn.title = 'Send to AI Chat';
    aiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      postHost({ type: 'sendToAi', task: task });
    });

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = 'Open';
    openBtn.title = 'Open in browser';
    openBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const base = String(config.baseUrl || '').replace(/\/+$/, '');
      postHost({ type: 'openExternal', url: base + '/projects/' + task.ProjectId });
    });

    actions.appendChild(aiBtn);
    actions.appendChild(openBtn);

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
    if (!srcId || Number(srcId) === Number(targetTaskId)) return;
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
    const updatedIds = new Set(columnTasks.map(function (t) {
      return Number(t.Id);
    }));
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

  async function loadProjects() {
    const data = await requestJson('/api/projects');
    projects = Array.isArray(data.projects) ? data.projects : [];
    fillProjectSelect();
  }

  async function loadBoardForSelection() {
    const project = selectedProject();
    if (!project) {
      statuses = [];
      tasks = [];
      renderBoard();
      return;
    }
    const orgId = Number(project.OrganizationId || 0);
    if (!orgId) throw new Error('Selected project has no organization id');

    const [statusData, taskData] = await Promise.all([
      requestJson('/api/status-values/task/' + orgId),
      requestJson('/api/tasks/project/' + project.Id),
    ]);

    statuses = Array.isArray(statusData.statuses) ? statusData.statuses : [];
    statuses = statuses.slice().sort(function (a, b) {
      const ao = statusSortKey(a);
      const bo = statusSortKey(b);
      if (ao !== bo) return ao - bo;
      return String(a.StatusName || '').localeCompare(String(b.StatusName || ''), undefined, {
        sensitivity: 'base',
      });
    });
    tasks = Array.isArray(taskData.tasks) ? taskData.tasks : [];
    // Ensure ProjectId/Name present for AI host
    tasks = tasks.map(function (t) {
      return Object.assign({}, t, {
        ProjectId: t.ProjectId || project.Id,
        ProjectName: t.ProjectName || project.ProjectName || project.Name,
        OrganizationId: t.OrganizationId || orgId,
      });
    });
    renderBoard();
  }

  async function fullReload() {
    const configured =
      !!config.baseUrl && (useHostProxy() || !!sanitizeToken(config.token));
    if (!configured) {
      projects = [];
      statuses = [];
      tasks = [];
      fillProjectSelect();
      renderBoard();
      setStatus('Configure Base URL and API token.', true);
      return;
    }
    setStatus('Loading…', false);
    el.refreshBtn.disabled = true;
    try {
      await loadProjects();
      await loadBoardForSelection();
      const project = selectedProject();
      setStatus(project ? 'Loaded “' + projectLabel(project) + '”' : 'Select a project', false);
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
    if (msg.selectedProjectId !== undefined && msg.selectedProjectId !== null && msg.selectedProjectId !== '') {
      config.selectedProjectId = Number(msg.selectedProjectId) || null;
    }
    void fullReload();
  }

  function onHostMessage(raw) {
    const msg = typeof raw === 'string' ? (function () {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    })() : raw;
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

  el.projectSelect.addEventListener('change', function () {
    const id = Number(el.projectSelect.value || 0) || null;
    config.selectedProjectId = id;
    postHost({ type: 'projectSelected', projectId: id });
    void (async function () {
      setStatus('Loading board…', false);
      try {
        await loadBoardForSelection();
        const project = selectedProject();
        setStatus(project ? 'Loaded “' + projectLabel(project) + '”' : 'Select a project', false);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        setStatus(msg, true);
        postHost({ type: 'error', message: msg });
      }
    })();
  });

  el.refreshBtn.addEventListener('click', function () {
    void fullReload();
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

  // Rider / custom hosts can assign window.pmHost.onMessage
  if (window.pmHost && typeof window.pmHost.onMessage === 'function') {
    window.pmHost.onMessage(onHostMessage);
  }

  postHost({ type: 'ready' });
  renderBoard();
  setStatus('Waiting for connection…', false);
})();
