'use client';

import { useEffect, useState } from 'react';

export const GANTT_NONE_SELECTED = -1;
export const PLANNING_GANTT_VIEW_OPTIONS_KEY = 'planning:gantt:view-options';

export type PlanningGanttViewOptions = {
  showDependencyLines: boolean;
  showCriticalPath: boolean;
  showBaseline: boolean;
  showGanttTotals: boolean;
  showTaskBarHours: boolean;
  showTimeEntriesOverlay: boolean;
  hideNotPlannedTasks: boolean;
  selectedGanttUserIds: number[];
};

const DEFAULTS: PlanningGanttViewOptions = {
  showDependencyLines: true,
  showCriticalPath: false,
  showBaseline: false,
  showGanttTotals: true,
  showTaskBarHours: true,
  showTimeEntriesOverlay: false,
  hideNotPlannedTasks: false,
  selectedGanttUserIds: [],
};

function normalizeSelectedUserIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const normalizedIds = raw.filter(
    (id: unknown): id is number =>
      typeof id === 'number' && Number.isInteger(id) && (id === GANTT_NONE_SELECTED || id > 0)
  );
  if (normalizedIds.includes(GANTT_NONE_SELECTED)) {
    return [GANTT_NONE_SELECTED];
  }
  return normalizedIds;
}

/** Persist Gantt toggle preferences in localStorage. */
export function usePlanningGanttViewOptions() {
  const [showDependencyLines, setShowDependencyLines] = useState(DEFAULTS.showDependencyLines);
  const [showCriticalPath, setShowCriticalPath] = useState(DEFAULTS.showCriticalPath);
  const [showBaseline, setShowBaseline] = useState(DEFAULTS.showBaseline);
  const [showGanttTotals, setShowGanttTotals] = useState(DEFAULTS.showGanttTotals);
  const [showTaskBarHours, setShowTaskBarHours] = useState(DEFAULTS.showTaskBarHours);
  const [showTimeEntriesOverlay, setShowTimeEntriesOverlay] = useState(DEFAULTS.showTimeEntriesOverlay);
  const [hideNotPlannedTasks, setHideNotPlannedTasks] = useState(DEFAULTS.hideNotPlannedTasks);
  const [selectedGanttUserIds, setSelectedGanttUserIds] = useState<number[]>(DEFAULTS.selectedGanttUserIds);
  const [hasLoadedGanttViewPrefs, setHasLoadedGanttViewPrefs] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLANNING_GANTT_VIEW_OPTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PlanningGanttViewOptions>;
        if (typeof parsed.showDependencyLines === 'boolean') setShowDependencyLines(parsed.showDependencyLines);
        if (typeof parsed.showCriticalPath === 'boolean') setShowCriticalPath(parsed.showCriticalPath);
        if (typeof parsed.showBaseline === 'boolean') setShowBaseline(parsed.showBaseline);
        if (typeof parsed.showGanttTotals === 'boolean') setShowGanttTotals(parsed.showGanttTotals);
        if (typeof parsed.showTaskBarHours === 'boolean') setShowTaskBarHours(parsed.showTaskBarHours);
        if (typeof parsed.showTimeEntriesOverlay === 'boolean') {
          setShowTimeEntriesOverlay(parsed.showTimeEntriesOverlay);
        }
        if (typeof parsed.hideNotPlannedTasks === 'boolean') setHideNotPlannedTasks(parsed.hideNotPlannedTasks);
        if (Array.isArray(parsed.selectedGanttUserIds)) {
          setSelectedGanttUserIds(normalizeSelectedUserIds(parsed.selectedGanttUserIds));
        }
      }
    } catch (error) {
      console.warn('Failed to load Gantt view options from localStorage:', error);
    } finally {
      setHasLoadedGanttViewPrefs(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedGanttViewPrefs) return;
    try {
      localStorage.setItem(
        PLANNING_GANTT_VIEW_OPTIONS_KEY,
        JSON.stringify({
          showDependencyLines,
          showCriticalPath,
          showBaseline,
          showGanttTotals,
          showTaskBarHours,
          showTimeEntriesOverlay,
          hideNotPlannedTasks,
          selectedGanttUserIds,
        } satisfies PlanningGanttViewOptions)
      );
    } catch (error) {
      console.warn('Failed to save Gantt view options to localStorage:', error);
    }
  }, [
    hasLoadedGanttViewPrefs,
    showDependencyLines,
    showCriticalPath,
    showBaseline,
    showGanttTotals,
    showTaskBarHours,
    showTimeEntriesOverlay,
    hideNotPlannedTasks,
    selectedGanttUserIds,
  ]);

  return {
    showDependencyLines,
    setShowDependencyLines,
    showCriticalPath,
    setShowCriticalPath,
    showBaseline,
    setShowBaseline,
    showGanttTotals,
    setShowGanttTotals,
    showTaskBarHours,
    setShowTaskBarHours,
    showTimeEntriesOverlay,
    setShowTimeEntriesOverlay,
    hideNotPlannedTasks,
    setHideNotPlannedTasks,
    selectedGanttUserIds,
    setSelectedGanttUserIds,
    hasLoadedGanttViewPrefs,
  };
}
