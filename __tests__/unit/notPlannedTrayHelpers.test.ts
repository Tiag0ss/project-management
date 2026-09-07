import {
  filterUnplannedTasksForTray,
  matchesUnplannedTaskSearch,
} from '../../lib/planning/filterUnplannedTasks';
import { getDragAutoScrollDelta } from '../../lib/planning/dragAutoScroll';

describe('filterUnplannedTasksForTray', () => {
  const tasks = [
    { TaskName: 'Alpha API', ProjectName: 'Core', CustomerName: 'Acme' },
    { TaskName: 'Beta UI', ProjectName: 'Portal', CustomerName: 'Beta Co' },
    { TaskName: 'Gamma', ProjectName: null, CustomerName: null },
  ];

  it('matches empty query and truncates', () => {
    expect(matchesUnplannedTaskSearch(tasks[0], '')).toBe(true);
    const result = filterUnplannedTasksForTray(tasks, '', undefined, 2);
    expect(result.totalMatches).toBe(3);
    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('filters by task, project, or customer', () => {
    expect(filterUnplannedTasksForTray(tasks, 'portal').matches).toHaveLength(1);
    expect(filterUnplannedTasksForTray(tasks, 'acme').matches[0].TaskName).toBe('Alpha API');
    expect(
      filterUnplannedTasksForTray(tasks, 'resolved', (t) =>
        t.TaskName === 'Gamma' ? 'Resolved Project' : null
      ).matches
    ).toHaveLength(1);
  });
});

describe('getDragAutoScrollDelta', () => {
  const rect = { top: 100, bottom: 500 };

  it('scrolls up near the top edge', () => {
    expect(getDragAutoScrollDelta(110, rect, 48, 24)).toBeLessThan(0);
  });

  it('scrolls down near the bottom edge', () => {
    expect(getDragAutoScrollDelta(490, rect, 48, 24)).toBeGreaterThan(0);
  });

  it('returns 0 in the middle', () => {
    expect(getDragAutoScrollDelta(300, rect, 48, 24)).toBe(0);
  });
});
