'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getAllGridPreferences, saveGridPreference, GridPreference } from '@/lib/api/gridPreferences';

interface RuntimeGridPreference {
  columnOrder: string[];
  hiddenColumns: string[];
  columnSizing: Record<string, number>;
  columnSizeMode: Record<string, 'fixed' | 'grow'>;
  sortField: string | null;
  sortDirection: 'asc' | 'desc' | null;
  rowDensity: 'compact' | 'comfortable';
  hasSavedHiddenColumns?: boolean;
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
  columnSizing: {},
  columnSizeMode: Object.fromEntries(columnIds.map((columnId) => [columnId, 'grow' as const])),
  sortField: null,
  sortDirection: null,
  rowDensity: 'comfortable',
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
    ? raw.columnOrder.filter((columnId): columnId is string => typeof columnId === 'string' && available.has(columnId))
    : [];

  const missing = availableColumnIds.filter((columnId) => !savedOrder.includes(columnId));
  const columnOrder = [...savedOrder, ...missing];

  const hiddenColumns = Array.isArray(raw?.hiddenColumns)
    ? raw.hiddenColumns.filter((columnId): columnId is string => typeof columnId === 'string' && available.has(columnId))
    : [];

  const columnSizing = raw?.columnSizing && typeof raw.columnSizing === 'object'
    ? Object.entries(raw.columnSizing).reduce<Record<string, number>>((accumulator, [key, value]) => {
        if (!available.has(key)) return accumulator;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return accumulator;
        accumulator[key] = Math.max(60, Math.min(1400, Math.round(numeric)));
        return accumulator;
      }, {})
    : {};

  const columnSizeMode = availableColumnIds.reduce<Record<string, 'fixed' | 'grow'>>((accumulator, columnId) => {
    const mode = raw?.columnSizeMode && typeof raw.columnSizeMode === 'object'
      ? raw.columnSizeMode[columnId]
      : undefined;
    accumulator[columnId] = mode === 'fixed' ? 'fixed' : 'grow';
    return accumulator;
  }, {});

  const sortField = typeof raw?.sortField === 'string' && available.has(raw.sortField) ? raw.sortField : null;
  const sortDirection = raw?.sortDirection === 'asc' || raw?.sortDirection === 'desc' ? raw.sortDirection : null;
  const rowDensity = raw?.rowDensity === 'compact' || raw?.rowDensity === 'comfortable'
    ? raw.rowDensity
    : 'comfortable';

  return {
    columnOrder,
    hiddenColumns,
    columnSizing,
    columnSizeMode,
    sortField,
    sortDirection,
    rowDensity,
    hasSavedHiddenColumns: Array.isArray(raw?.hiddenColumns),
  };
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
  // Always-current snapshot of runtime prefs — updated immediately on every local change
  // so re-initialization after a React re-render uses up-to-date state, not stale server data.
  const livePreferencesRef = useRef<Map<string, RuntimeGridPreference>>(new Map());

  const shouldEnhance = useMemo(() => {
    if (!pathname) return false;
    if (pathname.startsWith('/web-reports')) return false;
    if (pathname.startsWith('/approvals')) return false;
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
            columnSizing: pref.columnSizing && typeof pref.columnSizing === 'object' ? pref.columnSizing : {},
            columnSizeMode: pref.columnSizeMode && typeof pref.columnSizeMode === 'object' ? pref.columnSizeMode : {},
            sortField: pref.sortField ?? null,
            sortDirection: pref.sortDirection ?? null,
            rowDensity: pref.rowDensity === 'compact' || pref.rowDensity === 'comfortable' ? pref.rowDensity : 'comfortable',
            hasSavedHiddenColumns: Array.isArray(pref.hiddenColumns),
          });
        });
        livePreferencesRef.current = new Map(map);
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

      tables.forEach((table) => {
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

        const actionColumnIds = new Set<string>();
        const actionColumnDefaultWidths: Record<string, number> = {};
        headerCells.forEach((headerCell, index) => {
          const columnId = columnIds[index];
          if (!columnId) return;
          const label = (headerCell.textContent || '').trim();
          if (!isActionHeader(label)) return;
          actionColumnIds.add(columnId);
          const measuredWidth = Math.max(80, Math.round(headerCell.getBoundingClientRect().width || 120));
          actionColumnDefaultWidths[columnId] = Math.max(60, Math.min(1400, measuredWidth));
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
            cell.style.removeProperty('width');
            cell.style.removeProperty('min-width');
            cell.style.removeProperty('max-width');
          });
        }

        if (table.dataset.gridEnhancedKey === gridKey) {
          return;
        }

        table.dataset.gridEnhancedKey = gridKey;

        const existingPref = livePreferencesRef.current.get(gridKey) ?? preferencesMap.get(gridKey);
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
          if (existingPref.hasSavedHiddenColumns === false) {
            runtimePref = {
              ...runtimePref,
              hiddenColumns: Array.from(new Set([...runtimePref.hiddenColumns, ...defaultHiddenColumns])),
            };
          }

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

        if (actionColumnIds.size > 0) {
          const nextMode = { ...runtimePref.columnSizeMode };
          const nextSizing = { ...runtimePref.columnSizing };
          actionColumnIds.forEach((columnId) => {
            nextMode[columnId] = 'fixed';
            if (!Number.isFinite(nextSizing[columnId])) {
              nextSizing[columnId] = actionColumnDefaultWidths[columnId] || 120;
            }
          });
          runtimePref = {
            ...runtimePref,
            columnSizeMode: nextMode,
            columnSizing: nextSizing,
          };
        }

        // Persist the post-initialization state so re-initialization after a React re-render
        // picks up the correct snapshot instead of stale server data.
        livePreferencesRef.current.set(gridKey, { ...runtimePref, hasSavedHiddenColumns: true });

        // commitRuntimePref: update both the local variable and the live ref atomically.
        const commitRuntimePref = (next: RuntimeGridPreference) => {
          runtimePref = next;
          livePreferencesRef.current.set(gridKey, { ...next, hasSavedHiddenColumns: true });
        };

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
                columnSizing: runtimePref.columnSizing,
                columnSizeMode: runtimePref.columnSizeMode,
                sortField: runtimePref.sortField,
                sortDirection: runtimePref.sortDirection,
                rowDensity: runtimePref.rowDensity,
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

              const isActionColumn = actionColumnIds.has(columnId);
              const mode = isActionColumn ? 'fixed' : (runtimePref.columnSizeMode[columnId] === 'fixed' ? 'fixed' : 'grow');
              const width = Number.isFinite(runtimePref.columnSizing[columnId])
                ? runtimePref.columnSizing[columnId]
                : (isActionColumn ? (actionColumnDefaultWidths[columnId] || 120) : undefined);
              if (mode === 'fixed' && typeof width === 'number' && Number.isFinite(width)) {
                const finalWidth = `${Math.max(60, Math.min(1400, Math.round(width)))}px`;
                cell.style.width = finalWidth;
                cell.style.minWidth = finalWidth;
                cell.style.maxWidth = finalWidth;
              } else {
                cell.style.removeProperty('width');
                cell.style.removeProperty('min-width');
                cell.style.removeProperty('max-width');
              }
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

        const applyRowDensity = () => {
          table.classList.remove('grid-density-compact');
          if (runtimePref.rowDensity === 'compact') {
            table.classList.add('grid-density-compact');
          }
        };

        const refreshTable = () => {
          applyRowDensity();
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
            headerCell.tabIndex = 0;
            headerCell.setAttribute('role', 'button');
            headerCell.setAttribute('aria-label', `${label || 'Column'} sort`);

            const applySortForColumn = () => {
              const currentlySorted = runtimePref.sortField === columnId;
              const nextDirection: 'asc' | 'desc' = currentlySorted && runtimePref.sortDirection === 'asc' ? 'desc' : 'asc';

              commitRuntimePref({
                ...runtimePref,
                sortField: columnId,
                sortDirection: nextDirection,
              });

              refreshTable();
              savePreferenceDebounced();
            };

            headerCell.addEventListener('click', applySortForColumn);

            headerCell.addEventListener('keydown', (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              applySortForColumn();
            });

            headerCell.addEventListener('focus', () => {
              headerCell.style.outline = '2px solid rgb(59 130 246)';
              headerCell.style.outlineOffset = '2px';
            });

            headerCell.addEventListener('blur', () => {
              headerCell.style.removeProperty('outline');
              headerCell.style.removeProperty('outline-offset');
            });
          });
        };

        const attachColumnDragHandlers = () => {
          if (isReorderDisabled) return;

          const allHeaders = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
          let dragSourceId: string | null = null;

          const clearDropIndicators = () => {
            allHeaders.forEach((h) => h.style.removeProperty('box-shadow'));
          };

          allHeaders.forEach((headerCell) => {
            const label = (headerCell.textContent || '').trim();
            const isAction = isActionHeader(label);

            if (!isAction) {
              // Source: make draggable
              if (!headerCell.dataset.gridDragBound) {
                headerCell.dataset.gridDragBound = 'true';
                headerCell.draggable = true;
                headerCell.style.cursor = 'grab';

                // Prevent the resize handle from triggering a drag
                const resizeHandle = headerCell.querySelector('.grid-column-resize-handle') as HTMLElement | null;
                if (resizeHandle) {
                  resizeHandle.addEventListener('dragstart', (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                  });
                }

                headerCell.addEventListener('dragstart', (e: DragEvent) => {
                  const cid = headerCell.dataset.gridColumnId;
                  if (!cid) return;
                  dragSourceId = cid;
                  headerCell.style.opacity = '0.5';
                  headerCell.style.cursor = 'grabbing';
                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', cid);
                  }
                });

                headerCell.addEventListener('dragend', () => {
                  dragSourceId = null;
                  headerCell.style.opacity = '';
                  headerCell.style.cursor = 'grab';
                  clearDropIndicators();
                });
              }

              // Drop target
              if (!headerCell.dataset.gridDropBound) {
                headerCell.dataset.gridDropBound = 'true';

                headerCell.addEventListener('dragover', (e: DragEvent) => {
                  e.preventDefault();
                  const targetId = headerCell.dataset.gridColumnId;
                  if (!dragSourceId || !targetId || dragSourceId === targetId) {
                    clearDropIndicators();
                    return;
                  }
                  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                  clearDropIndicators();
                  const rect = headerCell.getBoundingClientRect();
                  const mid = rect.left + rect.width / 2;
                  headerCell.style.boxShadow = e.clientX < mid
                    ? 'inset 3px 0 0 0 #3b82f6'
                    : 'inset -3px 0 0 0 #3b82f6';
                });

                headerCell.addEventListener('dragleave', () => {
                  headerCell.style.removeProperty('box-shadow');
                });

                headerCell.addEventListener('drop', (e: DragEvent) => {
                  e.preventDefault();
                  clearDropIndicators();
                  const targetId = headerCell.dataset.gridColumnId;
                  if (!dragSourceId || !targetId || dragSourceId === targetId) return;

                  const rect = headerCell.getBoundingClientRect();
                  const insertBefore = e.clientX < rect.left + rect.width / 2;
                  const nextOrder = [...runtimePref.columnOrder];
                  const fromIndex = nextOrder.indexOf(dragSourceId);
                  if (fromIndex < 0) return;
                  nextOrder.splice(fromIndex, 1);
                  const adjustedToIndex = nextOrder.indexOf(targetId);
                  if (adjustedToIndex < 0) return;
                  nextOrder.splice(insertBefore ? adjustedToIndex : adjustedToIndex + 1, 0, dragSourceId);

                  dragSourceId = null;

                  commitRuntimePref({ ...runtimePref, columnOrder: nextOrder });
                  refreshTable();
                  ensureControlPanel();
                  savePreferenceDebounced();
                });
              }
            }
          });
        };

        const attachResizeHandles = () => {
          const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
          const visibleOrder = runtimePref.columnOrder.filter((columnId) => columnIds.includes(columnId));

          headers.forEach((headerCell, position) => {
            const columnId = visibleOrder[position];
            if (!columnId) return;
            if (isActionHeader((headerCell.textContent || '').trim())) return;
            if (headerCell.dataset.gridResizeBound === 'true') return;

            headerCell.dataset.gridResizeBound = 'true';
            if (!headerCell.style.position) {
              headerCell.style.position = 'relative';
            }

            const handle = document.createElement('div');
            handle.className = 'grid-column-resize-handle';
            handle.style.position = 'absolute';
            handle.style.top = '0';
            handle.style.right = '0';
            handle.style.width = '9px';
            handle.style.height = '100%';
            handle.style.cursor = 'col-resize';
            handle.style.userSelect = 'none';
            handle.style.touchAction = 'none';
            handle.style.zIndex = '3';

            const line = document.createElement('div');
            line.style.position = 'absolute';
            line.style.top = '20%';
            line.style.right = '2px';
            line.style.width = '2px';
            line.style.height = '60%';
            line.style.borderRadius = '9999px';
            line.style.backgroundColor = 'rgba(156, 163, 175, 0.7)';
            handle.appendChild(line);

            handle.addEventListener('mousedown', (downEvent) => {
              downEvent.preventDefault();
              downEvent.stopPropagation();

              const startX = downEvent.clientX;
              const startWidth = Math.max(60, Math.round(headerCell.getBoundingClientRect().width));

              commitRuntimePref({
                ...runtimePref,
                columnSizeMode: {
                  ...runtimePref.columnSizeMode,
                  [columnId]: 'fixed',
                },
                columnSizing: {
                  ...runtimePref.columnSizing,
                  [columnId]: runtimePref.columnSizing[columnId] || startWidth,
                },
              });

              const onMouseMove = (moveEvent: MouseEvent) => {
                const delta = moveEvent.clientX - startX;
                const nextWidth = Math.max(60, Math.min(1400, Math.round(startWidth + delta)));
                commitRuntimePref({
                  ...runtimePref,
                  columnSizing: {
                    ...runtimePref.columnSizing,
                    [columnId]: nextWidth,
                  },
                });
                applyColumnLayout();
              };

              const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                refreshTable();
                ensureControlPanel();
                savePreferenceDebounced();
              };

              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            });

            headerCell.appendChild(handle);
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

          const densityGroup = document.createElement('div');
          densityGroup.className = 'h-9 flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1';

          const comfyButton = document.createElement('button');
          comfyButton.type = 'button';
          comfyButton.className = `h-7 px-3 text-sm rounded-md transition-colors ${runtimePref.rowDensity === 'comfortable' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`;
          comfyButton.textContent = 'Comfy';
          comfyButton.addEventListener('click', () => {
            commitRuntimePref({ ...runtimePref, rowDensity: 'comfortable' });
            refreshTable();
            ensureControlPanel();
            savePreferenceDebounced();
          });

          const compactButton = document.createElement('button');
          compactButton.type = 'button';
          compactButton.className = `h-7 px-3 text-sm rounded-md transition-colors ${runtimePref.rowDensity === 'compact' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`;
          compactButton.textContent = 'Compact';
          compactButton.addEventListener('click', () => {
            commitRuntimePref({ ...runtimePref, rowDensity: 'compact' });
            refreshTable();
            ensureControlPanel();
            savePreferenceDebounced();
          });

          densityGroup.appendChild(comfyButton);
          densityGroup.appendChild(compactButton);

          const panel = document.createElement('div');
          panel.className = 'hidden fixed z-[2147483647] w-[28rem] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3';
          panel.style.top = '0px';
          panel.style.left = '0px';

          const panelTitle = document.createElement('div');
          panelTitle.className = 'text-sm font-semibold text-gray-900 dark:text-white mb-2';
          panelTitle.textContent = 'Table Columns';
          panel.appendChild(panelTitle);

          const fixedColumnsCount = runtimePref.columnOrder.filter((columnId) => runtimePref.columnSizeMode[columnId] === 'fixed').length;
          const panelSummary = document.createElement('div');
          panelSummary.className = 'text-xs text-gray-600 dark:text-gray-300 mb-2';
          panelSummary.textContent = fixedColumnsCount > 0
            ? `${fixedColumnsCount} fixed column${fixedColumnsCount > 1 ? 's' : ''}`
            : 'No fixed columns';
          panel.appendChild(panelSummary);

          const list = document.createElement('div');
          list.className = 'space-y-2 max-h-80 overflow-y-auto';

          runtimePref.columnOrder.forEach((columnId, index) => {
            const originalIndex = columnIds.indexOf(columnId);
            if (originalIndex < 0) return;

            const headerLabel = (headerCells[originalIndex].textContent || '').trim() || `Column ${index + 1}`;
            if (isActionHeader(headerLabel)) return;

            const item = document.createElement('div');
            item.className = 'flex items-center gap-2 flex-wrap';

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
              commitRuntimePref({
                ...runtimePref,
                hiddenColumns: Array.from(hiddenSet),
              });
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
              commitRuntimePref({ ...runtimePref, columnOrder: nextOrder });
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
              commitRuntimePref({ ...runtimePref, columnOrder: nextOrder });
              refreshTable();
              ensureControlPanel();
              savePreferenceDebounced();
            });

            const modeSelect = document.createElement('select');
            modeSelect.className = 'px-2 py-1 rounded text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100';
            modeSelect.innerHTML = '<option value="grow">Grow</option><option value="fixed">Fixed</option>';
            modeSelect.value = runtimePref.columnSizeMode[columnId] === 'fixed' ? 'fixed' : 'grow';

            modeSelect.addEventListener('change', () => {
              const nextMode = modeSelect.value === 'fixed' ? 'fixed' : 'grow';
              commitRuntimePref({
                ...runtimePref,
                columnSizeMode: {
                  ...runtimePref.columnSizeMode,
                  [columnId]: nextMode,
                },
                columnSizing: nextMode === 'fixed'
                  ? {
                      ...runtimePref.columnSizing,
                      [columnId]: Number.isFinite(runtimePref.columnSizing[columnId])
                        ? runtimePref.columnSizing[columnId]
                        : Math.max(100, Math.round(headerCells[originalIndex].getBoundingClientRect().width || 140)),
                    }
                  : runtimePref.columnSizing,
              });
              refreshTable();
              ensureControlPanel();
              savePreferenceDebounced();
            });

            const widthInput = document.createElement('input');
            widthInput.type = 'number';
            widthInput.min = '60';
            widthInput.max = '1400';
            widthInput.step = '1';
            widthInput.className = 'w-20 px-2 py-1 rounded text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100';
            widthInput.value = String(
              Number.isFinite(runtimePref.columnSizing[columnId])
                ? runtimePref.columnSizing[columnId]
                : Math.max(100, Math.round(headerCells[originalIndex].getBoundingClientRect().width || 140))
            );
            widthInput.disabled = runtimePref.columnSizeMode[columnId] !== 'fixed';

            widthInput.addEventListener('change', () => {
              const nextWidth = Math.max(60, Math.min(1400, Math.round(Number(widthInput.value) || 140)));
              commitRuntimePref({
                ...runtimePref,
                columnSizeMode: {
                  ...runtimePref.columnSizeMode,
                  [columnId]: 'fixed',
                },
                columnSizing: {
                  ...runtimePref.columnSizing,
                  [columnId]: nextWidth,
                },
              });
              refreshTable();
              ensureControlPanel();
              savePreferenceDebounced();
            });

            item.appendChild(checkbox);
            item.appendChild(label);
            item.appendChild(upButton);
            item.appendChild(downButton);
            item.appendChild(modeSelect);
            item.appendChild(widthInput);
            list.appendChild(item);
          });

          panel.appendChild(list);

          const resetButton = document.createElement('button');
          resetButton.type = 'button';
          resetButton.className = 'mt-3 h-9 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 transition-colors';
          resetButton.textContent = 'Reset';
          resetButton.addEventListener('click', () => {
            commitRuntimePref({ ...baselinePreference });
            refreshTable();
            ensureControlPanel();
            savePreferenceDebounced();
          });

          panel.appendChild(resetButton);

          button.addEventListener('click', () => {
            const rect = button.getBoundingClientRect();
            const panelWidth = 448;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const top = Math.min(viewportHeight - 20, rect.bottom + 8);
            const left = Math.max(8, Math.min(viewportWidth - panelWidth - 8, rect.right - panelWidth));
            panel.style.top = `${top}px`;
            panel.style.left = `${left}px`;
            panel.classList.toggle('hidden');
          });

          const toolbarControls = document.createElement('div');
          toolbarControls.className = 'flex items-center gap-2';
          toolbarControls.appendChild(densityGroup);
          toolbarControls.appendChild(button);

          toolbar.appendChild(toolbarControls);
          toolbar.appendChild(panel);
        };

        refreshTable();
        attachHeaderSortHandlers();
        attachColumnDragHandlers();
        attachResizeHandles();
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
