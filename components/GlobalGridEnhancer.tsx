'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getAllGridPreferences, saveGridPreference, GridPreference } from '@/lib/api/gridPreferences';

interface RuntimeGridPreference {
  columnOrder: string[];
  hiddenColumns: string[];
  sortField: string | null;
  sortDirection: 'asc' | 'desc' | null;
}

const normalizeHeaderKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const hashString = (value: string): string => {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash = hash >>> 0;
  }
  return hash.toString(36);
};

const defaultPreference = (columnIds: string[]): RuntimeGridPreference => ({
  columnOrder: [...columnIds],
  hiddenColumns: [],
  sortField: null,
  sortDirection: null,
});

const getDefaultHiddenColumns = (headerCells: HTMLTableCellElement[], columnIds: string[]) =>
  headerCells
    .map((headerCell, index) => ({
      columnId: columnIds[index],
      isDefaultHidden: headerCell.dataset.defaultHidden === 'true',
    }))
    .filter((entry) => entry.isDefaultHidden)
    .map((entry) => entry.columnId);

const sanitizePreference = (raw: Partial<GridPreference> | null | undefined, availableColumnIds: string[]): RuntimeGridPreference => {
  const available = new Set(availableColumnIds);

  const savedOrder = Array.isArray(raw?.columnOrder)
    ? raw!.columnOrder.filter((columnId): columnId is string => typeof columnId === 'string' && available.has(columnId))
    : [];

  const missing = availableColumnIds.filter((columnId) => !savedOrder.includes(columnId));
  const columnOrder = [...savedOrder, ...missing];

  const hiddenColumns = Array.isArray(raw?.hiddenColumns)
    ? raw!.hiddenColumns.filter((columnId): columnId is string => typeof columnId === 'string' && available.has(columnId))
    : [];

  const sortField = typeof raw?.sortField === 'string' && available.has(raw.sortField) ? raw.sortField : null;
  const sortDirection = raw?.sortDirection === 'asc' || raw?.sortDirection === 'desc' ? raw.sortDirection : null;

  return { columnOrder, hiddenColumns, sortField, sortDirection };
};

const isActionHeader = (label: string) => {
  const lowered = label.trim().toLowerCase();
  return lowered === 'actions' || lowered.length === 0;
};

export default function GlobalGridEnhancer() {
  const pathname = usePathname();
  const { token } = useAuth();
  const [preferencesMap, setPreferencesMap] = useState<Map<string, RuntimeGridPreference>>(new Map());
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const shouldEnhance = useMemo(() => {
    if (!pathname) return false;
    if (pathname.startsWith('/web-reports')) return false;
    return true;
  }, [pathname]);

  useEffect(() => {
    if (!token) {
      setPreferencesMap(new Map());
      return;
    }

    let isCancelled = false;

    const loadPreferences = async () => {
      try {
        const allPreferences = await getAllGridPreferences(token);
        if (isCancelled) return;

        const map = new Map<string, RuntimeGridPreference>();
        allPreferences.forEach((pref) => {
          map.set(pref.gridKey, {
            columnOrder: Array.isArray(pref.columnOrder) ? pref.columnOrder : [],
            hiddenColumns: Array.isArray(pref.hiddenColumns) ? pref.hiddenColumns : [],
            sortField: pref.sortField ?? null,
            sortDirection: pref.sortDirection ?? null,
          });
        });
        setPreferencesMap(map);
      } catch {
        if (!isCancelled) {
          setPreferencesMap(new Map());
        }
      }
    };

    loadPreferences();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!shouldEnhance) return;

    const applyEnhancements = () => {
      const tables = Array.from(document.querySelectorAll('table'));
      const signatureUsageCount = new Map<string, number>();

      tables.forEach((table, tableIndex) => {
        if (!(table instanceof HTMLTableElement)) return;
        if (table.closest('[data-grid-enhancer-ignore="true"]')) return;

        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (!thead || !tbody) return;
        const isSortDisabled = table.dataset.gridDisableSort === 'true';
        const isReorderDisabled = table.dataset.gridDisableReorder === 'true' || isSortDisabled;

        const headerRow = thead.querySelector('tr');
        if (!headerRow) return;

        const headerCells = Array.from(headerRow.children).filter((child) => child instanceof HTMLTableCellElement) as HTMLTableCellElement[];
        if (headerCells.length < 2) return;

        const usedKeys = new Map<string, number>();
        const columnIds = headerCells.map((headerCell, index) => {
          const explicitKey = headerCell.dataset.columnKey?.trim();
          const rawLabel = explicitKey || headerCell.textContent?.trim() || `column-${index + 1}`;
          const normalized = normalizeHeaderKey(rawLabel) || `column-${index + 1}`;
          const count = usedKeys.get(normalized) || 0;
          usedKeys.set(normalized, count + 1);
          return count > 0 ? `${normalized}-${count + 1}` : normalized;
        });

        const explicitGridKey = table.dataset.gridKey?.trim();
        const visualSignature = columnIds.join('|');
        const signatureHash = hashString(visualSignature);
        const currentCount = (signatureUsageCount.get(signatureHash) || 0) + 1;
        signatureUsageCount.set(signatureHash, currentCount);

        const gridInstanceKey = explicitGridKey && explicitGridKey.length > 0
          ? explicitGridKey
          : `${signatureHash}-${currentCount}`;

        const gridKey = `g::${hashString(pathname || '')}::${gridInstanceKey}`;

        if (table.dataset.gridEnhancedKey && table.dataset.gridEnhancedKey !== gridKey) {
          const cells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[];
          cells.forEach((cell) => {
            delete cell.dataset.gridColumnId;
            cell.style.display = '';
          });
        }

        if (table.dataset.gridEnhancedKey === gridKey) {
          return;
        }

        table.dataset.gridEnhancedKey = gridKey;

        const existingPref = preferencesMap.get(gridKey);
        const defaultHiddenColumns = getDefaultHiddenColumns(headerCells, columnIds);
        const baselinePreference: RuntimeGridPreference = {
          ...defaultPreference(columnIds),
          hiddenColumns: [...defaultHiddenColumns],
        };

        let runtimePref = existingPref
          ? sanitizePreference(existingPref, columnIds)
          : baselinePreference;

        if (isReorderDisabled) {
          runtimePref = {
            ...runtimePref,
            columnOrder: [...baselinePreference.columnOrder],
          };
        }

        if (existingPref) {
          const knownColumns = new Set<string>([
            ...(Array.isArray(existingPref.columnOrder) ? existingPref.columnOrder : []),
            ...(Array.isArray(existingPref.hiddenColumns) ? existingPref.hiddenColumns : []),
          ]);

          const newDefaultHiddenColumns = defaultHiddenColumns.filter((columnId) => !knownColumns.has(columnId));
          if (newDefaultHiddenColumns.length > 0) {
            runtimePref = {
              ...runtimePref,
              hiddenColumns: Array.from(new Set([...runtimePref.hiddenColumns, ...newDefaultHiddenColumns])),
            };
          }
        }

        const savePreferenceDebounced = () => {
          if (!token) return;

          const currentTimer = saveTimersRef.current.get(gridKey);
          if (currentTimer) {
            clearTimeout(currentTimer);
          }

          const timer = setTimeout(async () => {
            try {
              await saveGridPreference(token, gridKey, {
                columnOrder: runtimePref.columnOrder,
                hiddenColumns: runtimePref.hiddenColumns,
                sortField: runtimePref.sortField,
                sortDirection: runtimePref.sortDirection,
              });
            } catch {
              // Keep UI functional even if persistence fails
            }
          }, 350);

          saveTimersRef.current.set(gridKey, timer);
        };

        const applyColumnLayout = () => {
          const allRows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
          allRows.forEach((row) => {
            const cells = Array.from(row.children) as HTMLElement[];
            if (cells.length === 0) return;

            cells.forEach((cell, index) => {
              if (!cell.dataset.gridColumnId) {
                const fallbackColumnId = columnIds[index];
                if (fallbackColumnId) {
                  cell.dataset.gridColumnId = fallbackColumnId;
                }
              }
            });

            const cellByColumnId = new Map<string, HTMLElement>();
            cells.forEach((cell) => {
              const columnId = cell.dataset.gridColumnId;
              if (columnId) {
                cellByColumnId.set(columnId, cell);
              }
            });

            runtimePref.columnOrder
              .filter((columnId) => columnIds.includes(columnId))
              .forEach((columnId) => {
                const cell = cellByColumnId.get(columnId);
                if (cell) {
                  row.appendChild(cell);
                }
              });
          });

          const hiddenSet = new Set(runtimePref.hiddenColumns);
          const availableColumnIds = new Set(columnIds);

          const refreshedRows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
          refreshedRows.forEach((row) => {
            const rowCells = Array.from(row.children) as HTMLElement[];
            rowCells.forEach((cell) => {
              const columnId = cell.dataset.gridColumnId;
              if (!columnId || !availableColumnIds.has(columnId)) {
                cell.style.display = 'none';
                return;
              }
              cell.style.display = hiddenSet.has(columnId) ? 'none' : '';
            });
          });
        };

        const compareCellValues = (a: string, b: string) => {
          const cleanA = a.trim();
          const cleanB = b.trim();

          const numberA = Number(cleanA.replace(/[^0-9.-]/g, ''));
          const numberB = Number(cleanB.replace(/[^0-9.-]/g, ''));
          const isNumberA = Number.isFinite(numberA) && /\d/.test(cleanA);
          const isNumberB = Number.isFinite(numberB) && /\d/.test(cleanB);

          if (isNumberA && isNumberB) {
            return numberA - numberB;
          }

          const dateA = Date.parse(cleanA);
          const dateB = Date.parse(cleanB);
          const isDateA = Number.isFinite(dateA);
          const isDateB = Number.isFinite(dateB);

          if (isDateA && isDateB) {
            return dateA - dateB;
          }

          return cleanA.localeCompare(cleanB, undefined, { sensitivity: 'base', numeric: true });
        };

        const applySort = () => {
          if (isSortDisabled) return;
          if (!runtimePref.sortField || !runtimePref.sortDirection) return;

          const visibleOrder = runtimePref.columnOrder.filter((columnId) => columnIds.includes(columnId));
          const columnPosition = visibleOrder.indexOf(runtimePref.sortField);
          if (columnPosition < 0) return;

          const body = table.querySelector('tbody');
          if (!body) return;

          const rows = Array.from(body.querySelectorAll('tr'));
          const sortableRows = rows.filter((row) => row.children.length === visibleOrder.length);
          if (sortableRows.length < 2) return;

          sortableRows.sort((rowA, rowB) => {
            const valueA = (rowA.children[columnPosition]?.textContent || '').trim();
            const valueB = (rowB.children[columnPosition]?.textContent || '').trim();
            const result = compareCellValues(valueA, valueB);
            return runtimePref.sortDirection === 'asc' ? result : -result;
          });

          sortableRows.forEach((row) => body.appendChild(row));
        };

        const clearSortIndicators = () => {
          const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
          headers.forEach((headerCell) => {
            const indicator = headerCell.querySelector('.grid-sort-indicator');
            if (indicator) indicator.remove();
          });
        };

        const applySortIndicators = () => {
          clearSortIndicators();

          if (isSortDisabled) return;

          if (!runtimePref.sortField || !runtimePref.sortDirection) return;

          const visibleOrder = runtimePref.columnOrder.filter((columnId) => columnIds.includes(columnId));
          const sortedIndex = visibleOrder.indexOf(runtimePref.sortField);
          if (sortedIndex < 0) return;

          const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
          const targetHeader = headers[sortedIndex];
          if (!targetHeader) return;

          const indicator = document.createElement('span');
          indicator.className = 'grid-sort-indicator ml-1';
          indicator.textContent = runtimePref.sortDirection === 'asc' ? '↑' : '↓';
          indicator.setAttribute('aria-hidden', 'true');
          targetHeader.appendChild(indicator);
        };

        const refreshTable = () => {
          applyColumnLayout();
          applySort();
          applySortIndicators();
        };

        const attachHeaderSortHandlers = () => {
          if (isSortDisabled) return;
          const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
          const visibleOrder = runtimePref.columnOrder.filter((columnId) => columnIds.includes(columnId));

          headers.forEach((headerCell, position) => {
            const columnId = visibleOrder[position];
            if (!columnId) return;

            const label = (headerCell.textContent || '').trim();
            if (isActionHeader(label)) return;
            if (headerCell.dataset.gridSortIgnore === 'true') return;

            if (headerCell.dataset.gridSortBound === 'true') return;

            headerCell.dataset.gridSortBound = 'true';
            headerCell.style.cursor = 'pointer';

            headerCell.addEventListener('click', () => {
              const currentlySorted = runtimePref.sortField === columnId;
              const nextDirection: 'asc' | 'desc' = currentlySorted && runtimePref.sortDirection === 'asc' ? 'desc' : 'asc';

              runtimePref = {
                ...runtimePref,
                sortField: columnId,
                sortDirection: nextDirection,
              };

              refreshTable();
              savePreferenceDebounced();
            });
          });
        };

        const ensureControlPanel = () => {
          const wrapper = table.parentElement;
          if (!wrapper) return;

          let toolbar = wrapper.querySelector('.global-grid-controls') as HTMLDivElement | null;
          if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.className = 'global-grid-controls mb-2 flex justify-end relative';
            wrapper.insertBefore(toolbar, table);
          }

          toolbar.innerHTML = '';

          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'h-9 px-3 rounded-lg text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 transition-colors';
          button.textContent = 'Columns';

          const panel = document.createElement('div');
          panel.className = 'hidden fixed z-[2147483647] w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3';
          panel.style.top = '0px';
          panel.style.left = '0px';

          const panelTitle = document.createElement('div');
          panelTitle.className = 'text-sm font-semibold text-gray-900 dark:text-white mb-2';
          panelTitle.textContent = 'Table Columns';
          panel.appendChild(panelTitle);

          const list = document.createElement('div');
          list.className = 'space-y-2 max-h-80 overflow-y-auto';

          runtimePref.columnOrder.forEach((columnId, index) => {
            const originalIndex = columnIds.indexOf(columnId);
            if (originalIndex < 0) return;

            const headerLabel = (headerCells[originalIndex].textContent || '').trim() || `Column ${index + 1}`;
            if (isActionHeader(headerLabel)) return;

            const item = document.createElement('div');
            item.className = 'flex items-center gap-2';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !runtimePref.hiddenColumns.includes(columnId);
            checkbox.className = 'h-4 w-4';

            checkbox.addEventListener('change', () => {
              const hiddenSet = new Set(runtimePref.hiddenColumns);
              if (checkbox.checked) {
                hiddenSet.delete(columnId);
              } else {
                hiddenSet.add(columnId);
              }
              runtimePref = {
                ...runtimePref,
                hiddenColumns: Array.from(hiddenSet),
              };
              refreshTable();
              savePreferenceDebounced();
            });

            const label = document.createElement('div');
            label.className = 'flex-1 text-sm text-gray-800 dark:text-gray-200';
            label.textContent = headerLabel;

            const upButton = document.createElement('button');
            upButton.type = 'button';
            upButton.className = 'px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600';
            upButton.textContent = '↑';
            upButton.disabled = isReorderDisabled || index === 0;

            upButton.addEventListener('click', () => {
              if (isReorderDisabled) return;
              if (index === 0) return;
              const nextOrder = [...runtimePref.columnOrder];
              [nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]];
              runtimePref = {
                ...runtimePref,
                columnOrder: nextOrder,
              };
              refreshTable();
              ensureControlPanel();
              savePreferenceDebounced();
            });

            const downButton = document.createElement('button');
            downButton.type = 'button';
            downButton.className = 'px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600';
            downButton.textContent = '↓';
            downButton.disabled = isReorderDisabled || index === runtimePref.columnOrder.length - 1;

            downButton.addEventListener('click', () => {
              if (isReorderDisabled) return;
              if (index === runtimePref.columnOrder.length - 1) return;
              const nextOrder = [...runtimePref.columnOrder];
              [nextOrder[index + 1], nextOrder[index]] = [nextOrder[index], nextOrder[index + 1]];
              runtimePref = {
                ...runtimePref,
                columnOrder: nextOrder,
              };
              refreshTable();
              ensureControlPanel();
              savePreferenceDebounced();
            });

            item.appendChild(checkbox);
            item.appendChild(label);
            item.appendChild(upButton);
            item.appendChild(downButton);
            list.appendChild(item);
          });

          panel.appendChild(list);

          const resetButton = document.createElement('button');
          resetButton.type = 'button';
          resetButton.className = 'mt-3 h-9 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 transition-colors';
          resetButton.textContent = 'Reset';
          resetButton.addEventListener('click', () => {
            runtimePref = {
              ...baselinePreference,
            };
            refreshTable();
            ensureControlPanel();
            savePreferenceDebounced();
          });

          panel.appendChild(resetButton);

          button.addEventListener('click', () => {
            const rect = button.getBoundingClientRect();
            const panelWidth = 320;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const top = Math.min(viewportHeight - 20, rect.bottom + 8);
            const left = Math.max(8, Math.min(viewportWidth - panelWidth - 8, rect.right - panelWidth));
            panel.style.top = `${top}px`;
            panel.style.left = `${left}px`;
            panel.classList.toggle('hidden');
          });

          toolbar.appendChild(button);
          toolbar.appendChild(panel);
        };

        refreshTable();
        attachHeaderSortHandlers();
        ensureControlPanel();
      });
    };

    const runEnhancement = () => {
      window.requestAnimationFrame(() => {
        applyEnhancements();
      });
    };

    runEnhancement();

    const observer = new MutationObserver(() => {
      runEnhancement();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      saveTimersRef.current.forEach((timer) => clearTimeout(timer));
      saveTimersRef.current.clear();
    };
  }, [pathname, shouldEnhance, preferencesMap, token]);

  return null;
}
