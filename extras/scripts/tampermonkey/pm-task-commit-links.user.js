// ==UserScript==
// @name         Project Management — Task # commit links
// @namespace    https://github.com/project-management
// @version      1.0.0
// @description  Turn "Task #123" in git commit history into links that open PM dashboard TaskDetailModal
// @author       Project Management
// @match        https://github.com/*
// @match        https://bitbucket.org/*
// @match        https://*.bitbucket.org/*
// // Uncomment and set your Gitea host:
// // @match     https://gitea.example.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

/**
 * Install
 * -------
 * 1. Tampermonkey → Create a new script → paste this file
 * 2. Edit PM_BY_HOST below (one PM base URL per git host)
 * 3. For Gitea: uncomment the @match line and set your hostname
 * 4. Optional: Tampermonkey menu → "Set PM URL for this host…" overrides PM_BY_HOST for the current hostname
 *
 * Links open: {base}/dashboard?task={id}
 * (PM resolves ProjectId and opens TaskDetailModal)
 */

(function () {
  'use strict';

  // ── Config: map git hostname → Project Management base URL ───────────────
  // Use the same base for GitHub + Gitea if they share one PM instance.
  const PM_BY_HOST = {
    'github.com': 'https://pm.example.com',
    // 'gitea.mycompany.com': 'https://pm.example.com',
    'bitbucket.org': 'https://pm-bitbucket.example.com',
  };

  const TASK_RE = /\bTask\s*#?\s*(\d+)\b/gi;
  const ATTR_MARK = 'data-pm-task-linked';
  const LINK_CLASS = 'pm-task-link';

  function normalizeHost(hostname) {
    return String(hostname || '')
      .toLowerCase()
      .replace(/^www\./, '');
  }

  function getPmBaseUrl() {
    const host = normalizeHost(location.hostname);
    const override = typeof GM_getValue === 'function' ? GM_getValue(`pmBase:${host}`, '') : '';
    const raw = String(override || PM_BY_HOST[host] || '').trim();
    if (!raw || raw.includes('example.com')) return null;
    return raw.replace(/\/+$/, '');
  }

  function taskHref(base, taskId) {
    return `${base}/dashboard?task=${encodeURIComponent(String(taskId))}`;
  }

  function ensureStyles() {
    if (document.getElementById('pm-task-link-styles')) return;
    const style = document.createElement('style');
    style.id = 'pm-task-link-styles';
    style.textContent = `
      a.${LINK_CLASS} {
        display: inline-flex;
        align-items: center;
        padding: 0 6px;
        margin: 0 2px;
        border-radius: 999px;
        font-size: 0.85em;
        font-weight: 600;
        line-height: 1.5;
        text-decoration: none !important;
        color: #3730a3 !important;
        background: #e0e7ff;
        border: 1px solid #c7d2fe;
        white-space: nowrap;
      }
      a.${LINK_CLASS}:hover {
        background: #c7d2fe;
      }
      @media (prefers-color-scheme: dark) {
        a.${LINK_CLASS} {
          color: #c7d2fe !important;
          background: rgba(67, 56, 202, 0.35);
          border-color: rgba(165, 180, 252, 0.45);
        }
        a.${LINK_CLASS}:hover {
          background: rgba(67, 56, 202, 0.55);
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function shouldSkipTextNode(node) {
    const el = node.parentElement;
    if (!el) return true;
    if (el.closest(`a, script, style, noscript, textarea, input, [${ATTR_MARK}]`)) return true;
    // Avoid code blocks / diffs where "Task #1" may appear as noise
    if (el.closest('pre, .blob-code, .diff-line, .highlight')) return true;
    return false;
  }

  function linkifyTextNode(textNode, base) {
    const text = textNode.nodeValue;
    if (!text || !TASK_RE.test(text)) {
      TASK_RE.lastIndex = 0;
      return false;
    }
    TASK_RE.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let changed = false;

    while ((match = TASK_RE.exec(text)) !== null) {
      const id = match[1];
      const start = match.index;
      const end = start + match[0].length;
      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }
      const a = document.createElement('a');
      a.className = LINK_CLASS;
      a.href = taskHref(base, id);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = `Open Task #${id} in Project Management`;
      a.setAttribute(ATTR_MARK, '1');
      a.textContent = match[0];
      frag.appendChild(a);
      lastIndex = end;
      changed = true;
    }

    if (!changed) return false;
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    const parent = textNode.parentNode;
    if (!parent) return false;
    parent.replaceChild(frag, textNode);
    return true;
  }

  function collectRoots() {
    const selectors = [
      // GitHub
      '[data-testid="commit-row-message"]',
      '.js-details-container .commit-title',
      '.commit-title',
      '.commit-desc',
      '.TimelineItem-body',
      '.markdown-title',
      // Gitea
      '.commit-list .message',
      '.commit-header h3',
      '.commit-summary',
      // Bitbucket
      '[data-testid="commit-message"]',
      '.commit-list-item',
      '.css-1v2r3k4', // brittle BB class — also scan broader below
    ];

    const roots = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => roots.add(el));
    }

    // Broader fallback: main content area
    const main =
      document.querySelector('main') ||
      document.querySelector('#content') ||
      document.querySelector('[role="main"]') ||
      document.body;
    if (main) roots.add(main);

    return Array.from(roots);
  }

  function linkifyRoot(root, base) {
    if (!root || root.nodeType !== 1) return;
    if (root.closest && root.closest(`a.${LINK_CLASS}`)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !TASK_RE.test(node.nodeValue)) {
          TASK_RE.lastIndex = 0;
          return NodeFilter.FILTER_REJECT;
        }
        TASK_RE.lastIndex = 0;
        if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let current;
    while ((current = walker.nextNode())) {
      nodes.push(current);
    }
    for (const node of nodes) {
      linkifyTextNode(node, base);
    }
  }

  function run() {
    const base = getPmBaseUrl();
    if (!base) return;
    ensureStyles();
    for (const root of collectRoots()) {
      linkifyRoot(root, base);
    }
  }

  let scheduled = false;
  function scheduleRun() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      run();
    });
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('Set PM URL for this host…', () => {
      const host = normalizeHost(location.hostname);
      const current = getPmBaseUrl() || PM_BY_HOST[host] || '';
      const next = window.prompt(
        `Project Management base URL for ${host}\n(leave empty to clear override)`,
        current
      );
      if (next === null) return;
      const trimmed = String(next).trim().replace(/\/+$/, '');
      if (!trimmed) {
        GM_setValue(`pmBase:${host}`, '');
        window.alert(`Cleared override for ${host}. Using PM_BY_HOST if defined.`);
      } else {
        GM_setValue(`pmBase:${host}`, trimmed);
        window.alert(`Saved: ${host} → ${trimmed}`);
      }
      scheduleRun();
    });

    GM_registerMenuCommand('Clear PM URL override for this host', () => {
      const host = normalizeHost(location.hostname);
      GM_setValue(`pmBase:${host}`, '');
      window.alert(`Cleared override for ${host}`);
      scheduleRun();
    });
  }

  registerMenu();
  scheduleRun();

  const observer = new MutationObserver(() => scheduleRun());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // SPA navigations (GitHub / Bitbucket)
  const pushState = history.pushState;
  history.pushState = function (...args) {
    const result = pushState.apply(this, args);
    scheduleRun();
    return result;
  };
  window.addEventListener('popstate', scheduleRun);
})();
