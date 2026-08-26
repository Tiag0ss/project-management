import { pool, RowDataPacket, dbProvider } from '../config/database';

export type TaskAnalyticsSlice = {
  key: string;
  label: string;
  value: number;
  color?: string;
};

export type TaskAnalyticsParentProgress = {
  id: number | null;
  label: string;
  done: number;
  inProgress: number;
  todo: number;
};

export type TaskAnalyticsResult = {
  priorityBreakdown: TaskAnalyticsSlice[];
  typesOfWork: TaskAnalyticsSlice[];
  teamWorkload: TaskAnalyticsSlice[];
  parentProgress: TaskAnalyticsParentProgress[];
};

export type TaskAnalyticsScope = {
  /** When set, restrict to projects in this organization. */
  organizationId?: number | null;
  /** When set, restrict to a single project. */
  projectId?: number | null;
};

const DEFAULT_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#4b5563'];

function castId(expression: string): string {
  return dbProvider === 'mssql'
    ? `CAST(${expression} AS NVARCHAR(50))`
    : `CAST(${expression} AS CHAR)`;
}

function buildScopeClause(scope: TaskAnalyticsScope): { sql: string; params: unknown[] } {
  const conditions: string[] = ['COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0'];
  const params: unknown[] = [];

  if (scope.projectId) {
    conditions.push('t.ProjectId = ?');
    params.push(scope.projectId);
  } else if (scope.organizationId) {
    conditions.push('p.OrganizationId = ?');
    params.push(scope.organizationId);
  }

  return { sql: conditions.join(' AND '), params };
}

function topNWithOther(rows: TaskAnalyticsSlice[], limit: number): TaskAnalyticsSlice[] {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit - 1);
  const otherValue = sorted.slice(limit - 1).reduce((sum, r) => sum + r.value, 0);
  if (otherValue > 0) {
    head.push({ key: 'other', label: 'Other', value: otherValue, color: '#9ca3af' });
  }
  return head;
}

/**
 * Current-state task analytics snapshot (not period-filtered).
 * Counts include all tasks (parents + subtasks) unless hidden from statistics.
 */
export async function queryTaskAnalytics(scope: TaskAnalyticsScope = {}): Promise<TaskAnalyticsResult> {
  const { sql: whereSql, params } = buildScopeClause(scope);
  const needsProjectJoin = !!scope.organizationId && !scope.projectId;
  const fromSql = needsProjectJoin
    ? `FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id`
    : `FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id`;

  const [priorityRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(${castId('tpv.Id')}, 'unset') AS SliceKey,
       COALESCE(tpv.PriorityName, 'Unset') AS SliceLabel,
       COALESCE(tpv.ColorCode, '') AS SliceColor,
       COALESCE(tpv.SortOrder, 9999) AS SortOrder,
       COUNT(*) AS Cnt
     ${fromSql}
     LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
     WHERE ${whereSql}
     GROUP BY tpv.Id, tpv.PriorityName, tpv.ColorCode, tpv.SortOrder
     ORDER BY COALESCE(tpv.SortOrder, 9999), SliceLabel`,
    params
  );

  const [typeRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(${castId('ttv.Id')}, 'unset') AS SliceKey,
       COALESCE(ttv.TypeName, 'Unset') AS SliceLabel,
       COALESCE(ttv.ColorCode, '') AS SliceColor,
       COUNT(*) AS Cnt
     ${fromSql}
     LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
     WHERE ${whereSql}
     GROUP BY ttv.Id, ttv.TypeName, ttv.ColorCode
     ORDER BY Cnt DESC`,
    params
  );

  const [workloadRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       CASE WHEN t.AssignedTo IS NULL THEN 'unassigned' ELSE ${castId('t.AssignedTo')} END AS SliceKey,
       CASE
         WHEN t.AssignedTo IS NULL THEN 'Unassigned'
         WHEN u.FirstName IS NOT NULL AND u.FirstName <> '' THEN CONCAT(COALESCE(u.FirstName, ''), ' ', COALESCE(u.LastName, ''))
         ELSE COALESCE(u.Username, CONCAT('User #', ${castId('t.AssignedTo')}))
       END AS SliceLabel,
       COUNT(*) AS Cnt
     ${fromSql}
     LEFT JOIN Users u ON t.AssignedTo = u.Id
     WHERE ${whereSql}
       AND COALESCE(tsv.IsClosed, 0) = 0
       AND COALESCE(tsv.IsCancelled, 0) = 0
     GROUP BY t.AssignedTo, u.FirstName, u.LastName, u.Username
     ORDER BY Cnt DESC`,
    params
  );

  const parentParams: unknown[] = [];
  let parentScopeSql = '';
  if (scope.projectId) {
    parentScopeSql = 'AND parent.ProjectId = ?';
    parentParams.push(scope.projectId);
  } else if (scope.organizationId) {
    parentScopeSql = 'AND p.OrganizationId = ?';
    parentParams.push(scope.organizationId);
  }

  const [parentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       parent.Id AS ParentId,
       parent.TaskName AS ParentName,
       SUM(CASE WHEN COALESCE(childStatus.IsClosed, 0) = 1 THEN 1 ELSE 0 END) AS DoneCnt,
       SUM(CASE
         WHEN COALESCE(childStatus.IsClosed, 0) = 0
          AND COALESCE(childStatus.IsCancelled, 0) = 0
          AND childStatus.StatusName IS NOT NULL
          AND LOWER(childStatus.StatusName) NOT IN ('to do', 'todo', 'backlog')
         THEN 1 ELSE 0 END) AS InProgressCnt,
       SUM(CASE
         WHEN COALESCE(childStatus.IsClosed, 0) = 0
          AND (
            COALESCE(childStatus.IsCancelled, 0) = 1
            OR childStatus.StatusName IS NULL
            OR LOWER(childStatus.StatusName) IN ('to do', 'todo', 'backlog')
          )
         THEN 1 ELSE 0 END) AS TodoCnt,
       COUNT(*) AS ChildCnt
     FROM Tasks parent
     INNER JOIN Tasks child ON child.ParentTaskId = parent.Id
     LEFT JOIN TaskStatusValues childStatus ON child.Status = childStatus.Id
     ${needsProjectJoin ? 'INNER JOIN Projects p ON parent.ProjectId = p.Id' : ''}
     WHERE parent.ParentTaskId IS NULL
       ${parentScopeSql}
       AND COALESCE(childStatus.HideFromPlanningAndStatistics, 0) = 0
     GROUP BY parent.Id, parent.TaskName
     ORDER BY ChildCnt DESC`,
    parentParams
  );

  let parentProgress: TaskAnalyticsParentProgress[] = parentRows.slice(0, 8).map((row) => ({
    id: Number(row.ParentId),
    label: String(row.ParentName || `Task #${row.ParentId}`),
    done: Number(row.DoneCnt || 0),
    inProgress: Number(row.InProgressCnt || 0),
    todo: Number(row.TodoCnt || 0),
  }));

  if (parentProgress.length === 0) {
    const [overall] = await pool.execute<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) AS DoneCnt,
         SUM(CASE
           WHEN COALESCE(tsv.IsClosed, 0) = 0
            AND COALESCE(tsv.IsCancelled, 0) = 0
            AND tsv.StatusName IS NOT NULL
            AND LOWER(tsv.StatusName) NOT IN ('to do', 'todo', 'backlog')
           THEN 1 ELSE 0 END) AS InProgressCnt,
         SUM(CASE
           WHEN COALESCE(tsv.IsClosed, 0) = 0
            AND (
              COALESCE(tsv.IsCancelled, 0) = 1
              OR tsv.StatusName IS NULL
              OR LOWER(tsv.StatusName) IN ('to do', 'todo', 'backlog')
            )
           THEN 1 ELSE 0 END) AS TodoCnt,
         COUNT(*) AS TotalCnt
       ${fromSql}
       WHERE ${whereSql}`,
      params
    );
    const total = Number(overall[0]?.TotalCnt || 0);
    if (total > 0) {
      parentProgress = [
        {
          id: null,
          label: 'All tasks',
          done: Number(overall[0]?.DoneCnt || 0),
          inProgress: Number(overall[0]?.InProgressCnt || 0),
          todo: Number(overall[0]?.TodoCnt || 0),
        },
      ];
    }
  }

  const priorityBreakdown: TaskAnalyticsSlice[] = priorityRows.map((row, index) => ({
    key: String(row.SliceKey),
    label: String(row.SliceLabel),
    value: Number(row.Cnt || 0),
    color: row.SliceColor ? String(row.SliceColor) : DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));

  const typesOfWork = topNWithOther(
    typeRows.map((row, index) => ({
      key: String(row.SliceKey),
      label: String(row.SliceLabel),
      value: Number(row.Cnt || 0),
      color: row.SliceColor ? String(row.SliceColor) : DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    })),
    6
  );

  const teamWorkload = topNWithOther(
    workloadRows.map((row) => ({
      key: String(row.SliceKey),
      label: String(row.SliceLabel || 'Unknown').trim() || 'Unknown',
      value: Number(row.Cnt || 0),
      color: String(row.SliceKey) === 'unassigned' ? '#9ca3af' : '#2563eb',
    })),
    8
  );

  return {
    priorityBreakdown,
    typesOfWork,
    teamWorkload,
    parentProgress,
  };
}
