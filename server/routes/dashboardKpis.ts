import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

type DashboardKpiType =
  | 'totalProjects'
  | 'myTasks'
  | 'myPendingTasks'
  | 'myCompletedTasks'
  | 'hoursThisWeek'
  | 'hoursThisMonth'
  | 'myTickets'
  | 'customersTotal'
  | 'organizationProjects'
  | 'organizationTasks'
  | 'organizationPendingTasks'
  | 'organizationCompletedTasks'
  | 'tasksByStatus'
  | 'tasksByPriority'
  | 'tasksByTag'
  | 'tasksFiltered'
  | 'overdueTasksFiltered'
  | 'blockedTasksFiltered'
  | 'unestimatedTasksFiltered'
  | 'reopenedTasksFiltered'
  | 'throughputThisWeek'
  | 'throughputThisMonth'
  | 'cycleTimeMedianDays'
  | 'leadTimeMedianDays'
  | 'ticketsSlaRisk';

interface DashboardKpiWidget {
  id: string;
  type: DashboardKpiType;
  title?: string;
  organizationId?: number | null;
  statusValueId?: number | null;
  priorityValueId?: number | null;
  tagId?: number | null;
}

interface KpiMetricValue {
  value: number;
  suffix?: string;
  subtitle?: string;
}

const ALLOWED_KPI_TYPES = new Set<DashboardKpiType>([
  'totalProjects',
  'myTasks',
  'myPendingTasks',
  'myCompletedTasks',
  'hoursThisWeek',
  'hoursThisMonth',
  'myTickets',
  'customersTotal',
  'organizationProjects',
  'organizationTasks',
  'organizationPendingTasks',
  'organizationCompletedTasks',
  'tasksByStatus',
  'tasksByPriority',
  'tasksByTag',
  'tasksFiltered',
  'overdueTasksFiltered',
  'blockedTasksFiltered',
  'unestimatedTasksFiltered',
  'reopenedTasksFiltered',
  'throughputThisWeek',
  'throughputThisMonth',
  'cycleTimeMedianDays',
  'leadTimeMedianDays',
  'ticketsSlaRisk',
]);

const KPI_TYPES_REQUIRING_ORG = new Set<DashboardKpiType>([
  'organizationProjects',
  'organizationTasks',
  'organizationPendingTasks',
  'organizationCompletedTasks',
  'tasksByStatus',
  'tasksByPriority',
  'tasksByTag',
  'tasksFiltered',
  'overdueTasksFiltered',
  'blockedTasksFiltered',
  'unestimatedTasksFiltered',
  'reopenedTasksFiltered',
  'throughputThisWeek',
  'throughputThisMonth',
  'cycleTimeMedianDays',
  'leadTimeMedianDays',
  'ticketsSlaRisk',
]);

const sanitizeWidget = (rawWidget: any, index: number): DashboardKpiWidget | null => {
  if (!rawWidget || typeof rawWidget !== 'object') {
    return null;
  }

  const rawType = String(rawWidget.type || '').trim() as DashboardKpiType;
  if (!ALLOWED_KPI_TYPES.has(rawType)) {
    return null;
  }

  const rawId = String(rawWidget.id || '').trim();
  const widgetId = rawId.length > 0 ? rawId : `kpi-${index + 1}`;

  const title = typeof rawWidget.title === 'string' && rawWidget.title.trim().length > 0
    ? rawWidget.title.trim().slice(0, 120)
    : undefined;

  const organizationIdNumeric = Number(rawWidget.organizationId);
  const organizationId = Number.isInteger(organizationIdNumeric) && organizationIdNumeric > 0
    ? organizationIdNumeric
    : null;

  const statusValueIdNumeric = Number(rawWidget.statusValueId);
  const statusValueId = Number.isInteger(statusValueIdNumeric) && statusValueIdNumeric > 0
    ? statusValueIdNumeric
    : null;

  const priorityValueIdNumeric = Number(rawWidget.priorityValueId);
  const priorityValueId = Number.isInteger(priorityValueIdNumeric) && priorityValueIdNumeric > 0
    ? priorityValueIdNumeric
    : null;

  const tagIdNumeric = Number(rawWidget.tagId);
  const tagId = Number.isInteger(tagIdNumeric) && tagIdNumeric > 0
    ? tagIdNumeric
    : null;

  if (KPI_TYPES_REQUIRING_ORG.has(rawType) && !organizationId) {
    return null;
  }

  if (rawType === 'tasksByStatus' && !statusValueId) {
    return null;
  }

  if (rawType === 'tasksByPriority' && !priorityValueId) {
    return null;
  }

  if (rawType === 'tasksByTag' && !tagId) {
    return null;
  }

  return {
    id: widgetId,
    type: rawType,
    title,
    organizationId,
    statusValueId,
    priorityValueId,
    tagId,
  };
};

const sanitizeWidgets = (raw: any): DashboardKpiWidget[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const sanitized = raw
    .slice(0, 30)
    .map((entry, index) => sanitizeWidget(entry, index))
    .filter((entry): entry is DashboardKpiWidget => entry !== null);

  const deduped: DashboardKpiWidget[] = [];
  const seen = new Set<string>();
  for (const widget of sanitized) {
    const key = widget.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(widget);
  }

  return deduped;
};

const getWeekBounds = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  return {
    start: formatDate(weekStart),
    end: formatDate(weekEnd),
  };
};

const getMonthBounds = () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  return {
    start: formatDate(monthStart),
    end: formatDate(monthEnd),
  };
};

const getAccessibleOrganizationIds = async (userId: number): Promise<number[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT DISTINCT OrganizationId FROM OrganizationMembers WHERE UserId = ?',
    [userId]
  );

  return rows
    .map((row) => Number(row.OrganizationId))
    .filter((orgId) => Number.isInteger(orgId) && orgId > 0);
};

const buildInClause = (values: number[]) => values.map(() => '?').join(', ');

const querySingleNumber = async (query: string, params: Array<number | string>) => {
  const [rows] = await pool.execute<RowDataPacket[]>(query, params);
  if (rows.length === 0) {
    return 0;
  }

  const firstRow = rows[0];
  const firstKey = Object.keys(firstRow)[0];
  return Number(firstRow[firstKey] || 0);
};

const buildMetadata = async (userId: number, accessibleOrgIds: number[]) => {
  if (accessibleOrgIds.length === 0) {
    return {
      organizations: [] as Array<{ Id: number; Name: string }>,
      statusesByOrganization: {} as Record<string, Array<{ Id: number; StatusName: string; ColorCode: string | null }>>,
      prioritiesByOrganization: {} as Record<string, Array<{ Id: number; PriorityName: string; ColorCode: string | null }>>,
      tagsByOrganization: {} as Record<string, Array<{ Id: number; Name: string; Color: string | null }>>,
    };
  }

  const placeholders = accessibleOrgIds.map(() => '?').join(',');

  const [organizations] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT o.Id, o.Name
     FROM Organizations o
     INNER JOIN OrganizationMembers om ON o.Id = om.OrganizationId
     WHERE om.UserId = ?
       AND o.Id IN (${placeholders})
     ORDER BY o.Name ASC`,
    [userId, ...accessibleOrgIds]
  );

  const [statuses] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, OrganizationId, StatusName, ColorCode
     FROM TaskStatusValues
     WHERE OrganizationId IN (${placeholders})
     ORDER BY OrganizationId ASC, SortOrder ASC, StatusName ASC`,
    [...accessibleOrgIds]
  );

  const [priorities] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, OrganizationId, PriorityName, ColorCode
     FROM TaskPriorityValues
     WHERE OrganizationId IN (${placeholders})
     ORDER BY OrganizationId ASC, SortOrder ASC, PriorityName ASC`,
    [...accessibleOrgIds]
  );

  const [tags] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, OrganizationId, Name, Color
     FROM Tags
     WHERE OrganizationId IN (${placeholders})
     ORDER BY OrganizationId ASC, Name ASC`,
    [...accessibleOrgIds]
  );

  const statusesByOrganization: Record<string, Array<{ Id: number; StatusName: string; ColorCode: string | null }>> = {};
  statuses.forEach((row) => {
    const organizationId = String(row.OrganizationId);
    if (!statusesByOrganization[organizationId]) {
      statusesByOrganization[organizationId] = [];
    }

    statusesByOrganization[organizationId].push({
      Id: Number(row.Id),
      StatusName: String(row.StatusName || ''),
      ColorCode: row.ColorCode ? String(row.ColorCode) : null,
    });
  });

  const prioritiesByOrganization: Record<string, Array<{ Id: number; PriorityName: string; ColorCode: string | null }>> = {};
  priorities.forEach((row) => {
    const organizationId = String(row.OrganizationId);
    if (!prioritiesByOrganization[organizationId]) {
      prioritiesByOrganization[organizationId] = [];
    }

    prioritiesByOrganization[organizationId].push({
      Id: Number(row.Id),
      PriorityName: String(row.PriorityName || ''),
      ColorCode: row.ColorCode ? String(row.ColorCode) : null,
    });
  });

  const tagsByOrganization: Record<string, Array<{ Id: number; Name: string; Color: string | null }>> = {};
  tags.forEach((row) => {
    const organizationId = String(row.OrganizationId);
    if (!tagsByOrganization[organizationId]) {
      tagsByOrganization[organizationId] = [];
    }

    tagsByOrganization[organizationId].push({
      Id: Number(row.Id),
      Name: String(row.Name || ''),
      Color: row.Color ? String(row.Color) : null,
    });
  });

  return {
    organizations: organizations.map((row) => ({
      Id: Number(row.Id),
      Name: String(row.Name || ''),
    })),
    statusesByOrganization,
    prioritiesByOrganization,
    tagsByOrganization,
  };
};

type KpiDetailType = 'tasks' | 'projects' | 'customers' | 'tickets' | 'timeEntries' | 'unknown';

interface KpiDetailItem {
  id: number;
  name: string;
  taskId?: number;
  projectId?: number;
  tags?: Array<{ name: string; color?: string | null }>;
  project?: string;
  customer?: string;
  status?: string;
  date?: string;
  hours?: number;
  isClosed?: boolean;
}

interface KpiDetailResult {
  type: KpiDetailType;
  items: KpiDetailItem[];
}

const mapTaskRowsWithTags = (rows: RowDataPacket[]): KpiDetailItem[] => {
  const byTaskId = new Map<number, KpiDetailItem>();

  rows.forEach((row) => {
    const taskId = Number(row.Id);
    if (!byTaskId.has(taskId)) {
      byTaskId.set(taskId, {
        id: taskId,
        taskId,
        projectId: row.ProjectId ? Number(row.ProjectId) : undefined,
        name: String(row.TaskName || ''),
        project: String(row.ProjectName || ''),
        customer: String(row.CustomerName || ''),
        status: String(row.StatusName || ''),
        tags: [],
      });
    }

    const item = byTaskId.get(taskId);
    if (!item) {
      return;
    }

    const tagName = row.TagName ? String(row.TagName).trim() : '';
    const tagColor = row.TagColor ? String(row.TagColor) : null;
    if (tagName.length > 0 && !item.tags?.some((tag) => tag.name === tagName)) {
      item.tags?.push({ name: tagName, color: tagColor });
    }
  });

  return Array.from(byTaskId.values());
};

const applyOptionalTaskFilters = (
  widget: DashboardKpiWidget,
  baseQuery: string,
  params: Array<number | string>
): { query: string; params: Array<number | string> } => {
  let query = baseQuery;
  const nextParams = [...params];

  if (widget.statusValueId) {
    query += ' AND t.Status = ?';
    nextParams.push(Number(widget.statusValueId));
  }

  if (widget.priorityValueId) {
    query += ' AND t.Priority = ?';
    nextParams.push(Number(widget.priorityValueId));
  }

  if (widget.tagId) {
    query += ' AND EXISTS (SELECT 1 FROM TaskTags ftt WHERE ftt.TaskId = t.Id AND ftt.TagId = ?)';
    nextParams.push(Number(widget.tagId));
  }

  return { query, params: nextParams };
};

const calculateMedian = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
};

const getWidgetDetails = async (
  widget: DashboardKpiWidget,
  userId: number,
  accessibleOrgIds: number[],
  options?: { limit?: number; offset?: number }
): Promise<KpiDetailResult> => {
  if (accessibleOrgIds.length === 0) {
    return { type: 'unknown', items: [] };
  }

  const placeholders = accessibleOrgIds.map(() => '?').join(',');
  const todayDate = new Date();
  const todayKey = todayDate.toISOString().split('T')[0];
  const limit = options?.limit;
  const offset = Math.max(0, Number(options?.offset || 0));
  const appendPagination = (baseQuery: string, params: Array<number | string>) => {
    if (typeof limit === 'number') {
      return {
        query: `${baseQuery} LIMIT ? OFFSET ?`,
        params: [...params, limit, offset],
      };
    }

    return { query: baseQuery, params };
  };

  if (widget.type === 'hoursThisWeek' || widget.type === 'hoursThisMonth') {
    const range = widget.type === 'hoursThisWeek' ? getWeekBounds() : getMonthBounds();
    const base = `
      SELECT te.Id, te.TaskId, t.ProjectId, te.WorkDate, te.Hours, t.TaskName, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName
      FROM TimeEntries te
      LEFT JOIN Tasks t ON t.Id = te.TaskId
      LEFT JOIN Projects p ON p.Id = t.ProjectId
      LEFT JOIN Customers c ON c.Id = p.CustomerId
      WHERE te.UserId = ?
        AND te.WorkDate BETWEEN ? AND ?
      ORDER BY te.WorkDate DESC, te.Id DESC`;

    const paged = appendPagination(base, [userId, range.start, range.end]);
    const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

    return {
      type: 'timeEntries',
      items: rows.map((row) => ({
        id: Number(row.Id),
        taskId: row.TaskId ? Number(row.TaskId) : undefined,
        projectId: row.ProjectId ? Number(row.ProjectId) : undefined,
        name: String(row.TaskName || `Entry #${row.Id}`),
        project: String(row.ProjectName || ''),
        customer: String(row.CustomerName || ''),
        date: row.WorkDate ? String(row.WorkDate).split('T')[0] : undefined,
        hours: Number(row.Hours || 0),
      })),
    };
  }

  if (widget.type === 'totalProjects') {
    const base = `
      SELECT p.Id, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName
      FROM Projects p
      LEFT JOIN Customers c ON p.CustomerId = c.Id
      WHERE p.OrganizationId IN (${placeholders})
      ORDER BY p.ProjectName ASC`;

    const paged = appendPagination(base, [...accessibleOrgIds]);
    const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

    return {
      type: 'projects',
      items: rows.map((row) => ({
        id: Number(row.Id),
        name: String(row.ProjectName || ''),
        customer: String(row.CustomerName || ''),
      })),
    };
  }

  if (widget.type === 'customersTotal') {
    const base = `
      SELECT DISTINCT c.Id, COALESCE(c.ExternalName, c.Name) as CustomerName
      FROM Customers c
      INNER JOIN CustomerOrganizations co ON co.CustomerId = c.Id
      WHERE c.IsActive = 1
        AND co.OrganizationId IN (${placeholders})
      ORDER BY CustomerName ASC`;

    const paged = appendPagination(base, [...accessibleOrgIds]);
    const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

    return {
      type: 'customers',
      items: rows.map((row) => ({
        id: Number(row.Id),
        name: String(row.CustomerName || ''),
      })),
    };
  }

  if (widget.type === 'myTickets') {
    const base = `
      SELECT DISTINCT tk.Id, tk.ProjectId, tk.Title, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName, tsv.StatusName, COALESCE(tsv.IsClosed, 0) as IsClosed
      FROM Tickets tk
      LEFT JOIN Projects p ON p.Id = tk.ProjectId
      LEFT JOIN Customers c ON c.Id = COALESCE(tk.CustomerId, p.CustomerId)
      LEFT JOIN TicketStatusValues tsv ON tsv.Id = tk.StatusId
      WHERE tk.OrganizationId IN (${placeholders})
        AND (tk.CreatedByUserId = ? OR tk.AssignedToUserId = ?)
      ORDER BY tk.Id DESC`;

    const paged = appendPagination(base, [...accessibleOrgIds, userId, userId]);
    const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

    return {
      type: 'tickets',
      items: rows.map((row) => ({
        id: Number(row.Id),
        projectId: row.ProjectId ? Number(row.ProjectId) : undefined,
        name: String(row.Title || ''),
        project: String(row.ProjectName || ''),
        customer: String(row.CustomerName || ''),
        status: String(row.StatusName || ''),
        isClosed: Number(row.IsClosed || 0) === 1,
      })),
    };
  }

  if (widget.type === 'myTasks' || widget.type === 'myPendingTasks' || widget.type === 'myCompletedTasks') {
    let base = `
      SELECT t.Id, t.ProjectId, t.TaskName, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName, tsv.StatusName, tg.Name as TagName, tg.Color as TagColor
      FROM Tasks t
      INNER JOIN Projects p ON p.Id = t.ProjectId
      LEFT JOIN Customers c ON p.CustomerId = c.Id
      LEFT JOIN TaskAssignees ta ON ta.TaskId = t.Id
      LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
      LEFT JOIN TaskTags tt ON tt.TaskId = t.Id
      LEFT JOIN Tags tg ON tg.Id = tt.TagId
      WHERE p.OrganizationId IN (${placeholders})
        AND (t.AssignedTo = ? OR ta.UserId = ?)
        AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0`;

    if (widget.type === 'myPendingTasks') {
      base += ' AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0';
    } else if (widget.type === 'myCompletedTasks') {
      base += ' AND COALESCE(tsv.IsClosed, 0) = 1';
    }

    const filtered = applyOptionalTaskFilters(widget, base, [...accessibleOrgIds, userId, userId]);
    const paged = appendPagination(`${filtered.query} ORDER BY t.TaskName ASC`, filtered.params);
    const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

    return {
      type: 'tasks',
      items: mapTaskRowsWithTags(rows),
    };
  }

  if (
    widget.type === 'organizationProjects' ||
    widget.type === 'organizationTasks' ||
    widget.type === 'organizationPendingTasks' ||
    widget.type === 'organizationCompletedTasks' ||
    widget.type === 'tasksByStatus' ||
    widget.type === 'tasksByPriority' ||
    widget.type === 'tasksByTag' ||
    widget.type === 'tasksFiltered' ||
    widget.type === 'overdueTasksFiltered' ||
    widget.type === 'blockedTasksFiltered' ||
    widget.type === 'unestimatedTasksFiltered' ||
    widget.type === 'reopenedTasksFiltered' ||
    widget.type === 'throughputThisWeek' ||
    widget.type === 'throughputThisMonth' ||
    widget.type === 'cycleTimeMedianDays' ||
    widget.type === 'leadTimeMedianDays' ||
    widget.type === 'ticketsSlaRisk'
  ) {
    if (!widget.organizationId || !accessibleOrgIds.includes(Number(widget.organizationId))) {
      return { type: 'unknown', items: [] };
    }

    const organizationId = Number(widget.organizationId);

    if (widget.type === 'organizationProjects') {
      const base = `
        SELECT p.Id, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName
        FROM Projects p
        LEFT JOIN Customers c ON p.CustomerId = c.Id
        WHERE p.OrganizationId = ?
        ORDER BY p.ProjectName ASC`;

      const paged = appendPagination(base, [organizationId]);
      const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

      return {
        type: 'projects',
        items: rows.map((row) => ({
          id: Number(row.Id),
          name: String(row.ProjectName || ''),
          customer: String(row.CustomerName || ''),
        })),
      };
    }

    if (widget.type === 'ticketsSlaRisk') {
      const base = `
        SELECT tk.Id, tk.ProjectId, tk.Title, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName,
               tsv.StatusName, COALESCE(tsv.IsClosed, 0) as IsClosed,
               tk.CreatedAt,
               tk.ResolvedAt,
               sr.ResolutionHours
        FROM Tickets tk
        LEFT JOIN Projects p ON p.Id = tk.ProjectId
        LEFT JOIN Customers c ON c.Id = COALESCE(tk.CustomerId, p.CustomerId)
        LEFT JOIN TicketStatusValues tsv ON tsv.Id = tk.StatusId
        LEFT JOIN SLARules sr ON sr.OrganizationId = tk.OrganizationId
          AND sr.IsActive = 1
          AND (sr.PriorityId IS NULL OR sr.PriorityId = tk.PriorityId)
        WHERE tk.OrganizationId = ?
          AND COALESCE(tsv.IsClosed, 0) = 0
          AND sr.ResolutionHours IS NOT NULL
        ORDER BY tk.CreatedAt ASC`;

      const paged = appendPagination(base, [organizationId]);
      const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

      const now = Date.now();
      const items = rows
        .map((row) => {
          const createdAt = row.CreatedAt ? new Date(row.CreatedAt).getTime() : 0;
          const resolutionHours = Number(row.ResolutionHours || 0);
          if (!createdAt || !resolutionHours || row.ResolvedAt) {
            return null;
          }

          const elapsedHours = (now - createdAt) / 3600000;
          if (elapsedHours < resolutionHours * 0.75) {
            return null;
          }

          const riskLevel = elapsedHours >= resolutionHours ? 2 : 1;
          return {
            id: Number(row.Id),
            projectId: row.ProjectId ? Number(row.ProjectId) : undefined,
            name: String(row.Title || ''),
            project: String(row.ProjectName || ''),
            customer: String(row.CustomerName || ''),
            status: String(row.StatusName || ''),
            isClosed: Number(row.IsClosed || 0) === 1,
            hours: riskLevel,
          } as KpiDetailItem;
        })
        .filter((entry): entry is KpiDetailItem => entry !== null)
        .sort((a, b) => Number(b.hours || 0) - Number(a.hours || 0));

      return {
        type: 'tickets',
        items,
      };
    }

    if (widget.type === 'throughputThisWeek' || widget.type === 'throughputThisMonth') {
      const range = widget.type === 'throughputThisWeek' ? getWeekBounds() : getMonthBounds();
      let base = `
        SELECT t.Id, t.ProjectId, t.TaskName, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName,
               tsv.StatusName, tg.Name as TagName, tg.Color as TagColor
        FROM Tasks t
        INNER JOIN Projects p ON p.Id = t.ProjectId
        LEFT JOIN Customers c ON p.CustomerId = c.Id
        LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
        LEFT JOIN TaskTags tt ON tt.TaskId = t.Id
        LEFT JOIN Tags tg ON tg.Id = tt.TagId
        WHERE p.OrganizationId = ?
          AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
          AND EXISTS (
            SELECT 1
            FROM TaskHistory th
            INNER JOIN TaskStatusValues closedStatus ON closedStatus.OrganizationId = p.OrganizationId
              AND COALESCE(closedStatus.IsClosed, 0) = 1
              AND th.NewValue = closedStatus.StatusName
            WHERE th.TaskId = t.Id
              AND th.FieldName = 'Status'
              AND th.CreatedAt >= ?
              AND th.CreatedAt <= ?
          )`;

      const filtered = applyOptionalTaskFilters(widget, base, [organizationId, `${range.start} 00:00:00`, `${range.end} 23:59:59`]);
      const paged = appendPagination(`${filtered.query} ORDER BY t.TaskName ASC`, filtered.params);
      const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

      return {
        type: 'tasks',
        items: mapTaskRowsWithTags(rows),
      };
    }

    if (widget.type === 'cycleTimeMedianDays' || widget.type === 'leadTimeMedianDays') {
      let base = `
        SELECT t.Id, t.ProjectId, t.TaskName, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName,
               tsv.StatusName,
               t.CreatedAt,
               (
                 SELECT MIN(thClosed.CreatedAt)
                 FROM TaskHistory thClosed
                 INNER JOIN TaskStatusValues closedStatus ON closedStatus.OrganizationId = p.OrganizationId
                   AND COALESCE(closedStatus.IsClosed, 0) = 1
                   AND thClosed.NewValue = closedStatus.StatusName
                 WHERE thClosed.TaskId = t.Id
                   AND thClosed.FieldName = 'Status'
               ) as FirstClosedAt,
               (
                 SELECT MIN(thStart.CreatedAt)
                 FROM TaskHistory thStart
                 WHERE thStart.TaskId = t.Id
                   AND thStart.FieldName = 'Status'
               ) as FirstStatusChangeAt
        FROM Tasks t
        INNER JOIN Projects p ON p.Id = t.ProjectId
        LEFT JOIN Customers c ON p.CustomerId = c.Id
        LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
        WHERE p.OrganizationId = ?
          AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0`;

      const filtered = applyOptionalTaskFilters(widget, base, [organizationId]);
      const [rows] = await pool.execute<RowDataPacket[]>(filtered.query, filtered.params);

      const metricItems = rows
        .map((row) => {
          const createdAt = row.CreatedAt ? new Date(row.CreatedAt) : null;
          const firstClosedAt = row.FirstClosedAt ? new Date(row.FirstClosedAt) : null;
          const firstStatusChangeAt = row.FirstStatusChangeAt ? new Date(row.FirstStatusChangeAt) : null;
          if (!createdAt || !firstClosedAt || Number.isNaN(createdAt.getTime()) || Number.isNaN(firstClosedAt.getTime())) {
            return null;
          }

          const startDate = widget.type === 'cycleTimeMedianDays'
            ? (firstStatusChangeAt && !Number.isNaN(firstStatusChangeAt.getTime()) ? firstStatusChangeAt : createdAt)
            : createdAt;

          const days = Math.max(0, (firstClosedAt.getTime() - startDate.getTime()) / 86400000);

          return {
            id: Number(row.Id),
            taskId: Number(row.Id),
            projectId: row.ProjectId ? Number(row.ProjectId) : undefined,
            name: String(row.TaskName || ''),
            project: String(row.ProjectName || ''),
            customer: String(row.CustomerName || ''),
            status: String(row.StatusName || ''),
            date: row.FirstClosedAt ? String(row.FirstClosedAt).split('T')[0] : undefined,
            hours: Number(days.toFixed(2)),
          } as KpiDetailItem;
        })
        .filter((item): item is KpiDetailItem => item !== null)
        .sort((a, b) => Number(b.hours || 0) - Number(a.hours || 0));

      if (typeof limit === 'number') {
        return {
          type: 'tasks',
          items: metricItems.slice(offset, offset + limit),
        };
      }

      return {
        type: 'tasks',
        items: metricItems,
      };
    }

    let base = `
      SELECT t.Id, t.ProjectId, t.TaskName, p.ProjectName, COALESCE(c.ExternalName, c.Name) as CustomerName, tsv.StatusName, tg.Name as TagName, tg.Color as TagColor
      FROM Tasks t
      INNER JOIN Projects p ON p.Id = t.ProjectId
      LEFT JOIN Customers c ON p.CustomerId = c.Id
      LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
      LEFT JOIN Tasks dep ON dep.Id = t.DependsOnTaskId
      LEFT JOIN TaskStatusValues depStatus ON depStatus.Id = dep.Status
      LEFT JOIN TaskTags tt ON tt.TaskId = t.Id
      LEFT JOIN Tags tg ON tg.Id = tt.TagId
      WHERE p.OrganizationId = ?
        AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0`;

    const params: Array<number | string> = [organizationId];

    if (widget.type === 'organizationPendingTasks') {
      base += ' AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0';
    } else if (widget.type === 'organizationCompletedTasks') {
      base += ' AND COALESCE(tsv.IsClosed, 0) = 1';
    } else if (widget.type === 'overdueTasksFiltered') {
      base += ' AND t.DueDate IS NOT NULL AND t.DueDate < ? AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0';
      params.push(todayKey);
    } else if (widget.type === 'blockedTasksFiltered') {
      base += ' AND t.DependsOnTaskId IS NOT NULL AND COALESCE(depStatus.IsClosed, 0) = 0 AND COALESCE(depStatus.IsCancelled, 0) = 0';
    } else if (widget.type === 'unestimatedTasksFiltered') {
      base += ' AND COALESCE(t.EstimatedHours, 0) <= 0 AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0';
    } else if (widget.type === 'reopenedTasksFiltered') {
      base += ` AND EXISTS (
        SELECT 1
        FROM TaskHistory closedHistory
        INNER JOIN TaskStatusValues closedStatus ON closedStatus.OrganizationId = p.OrganizationId
          AND COALESCE(closedStatus.IsClosed, 0) = 1
          AND closedHistory.NewValue = closedStatus.StatusName
        WHERE closedHistory.TaskId = t.Id
          AND closedHistory.FieldName = 'Status'
      )`;
      base += ` AND EXISTS (
        SELECT 1
        FROM TaskHistory reopenHistory
        INNER JOIN TaskStatusValues reopenStatus ON reopenStatus.OrganizationId = p.OrganizationId
          AND COALESCE(reopenStatus.IsClosed, 0) = 0
          AND COALESCE(reopenStatus.IsCancelled, 0) = 0
          AND reopenHistory.NewValue = reopenStatus.StatusName
        WHERE reopenHistory.TaskId = t.Id
          AND reopenHistory.FieldName = 'Status'
          AND reopenHistory.CreatedAt > (
            SELECT MAX(closedHistory2.CreatedAt)
            FROM TaskHistory closedHistory2
            INNER JOIN TaskStatusValues closedStatus2 ON closedStatus2.OrganizationId = p.OrganizationId
              AND COALESCE(closedStatus2.IsClosed, 0) = 1
              AND closedHistory2.NewValue = closedStatus2.StatusName
            WHERE closedHistory2.TaskId = t.Id
              AND closedHistory2.FieldName = 'Status'
          )
      )`;
    }

    const filtered = applyOptionalTaskFilters(widget, base, params);
    const paged = appendPagination(`${filtered.query} ORDER BY t.TaskName ASC`, filtered.params);
    const [rows] = await pool.execute<RowDataPacket[]>(paged.query, paged.params);

    return {
      type: 'tasks',
      items: mapTaskRowsWithTags(rows),
    };
  }

  return { type: 'unknown', items: [] };
};

const getWidgetValue = async (
  widget: DashboardKpiWidget,
  userId: number,
  accessibleOrgIds: number[],
  details: KpiDetailResult
): Promise<KpiMetricValue> => {
  if (accessibleOrgIds.length === 0) {
    return { value: 0 };
  }

  if (widget.type === 'hoursThisWeek' || widget.type === 'hoursThisMonth') {
    const totalHours = details.items.reduce((sum, item) => sum + Number(item.hours || 0), 0);

    if (widget.type === 'hoursThisWeek') {
      const week = getWeekBounds();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(ta.AllocatedHours), 0) AS allocatedHours
         FROM TaskAllocations ta
         WHERE ta.UserId = ?
           AND ta.AllocationDate BETWEEN ? AND ?`,
        [userId, week.start, week.end]
      );

      const allocatedHours = Number(rows[0]?.allocatedHours || 0);
      return {
        value: totalHours,
        suffix: 'h',
        subtitle: `Allocated: ${allocatedHours.toFixed(1)}h`,
      };
    }

    return { value: totalHours, suffix: 'h' };
  }

  if (widget.type === 'myTickets') {
    const active = details.items.filter((item) => !item.isClosed).length;
    return {
      value: details.items.length,
      subtitle: active > 0 ? `${active} active` : undefined,
    };
  }

  if (widget.type === 'ticketsSlaRisk') {
    const breached = details.items.filter((item) => Number(item.hours || 0) >= 2).length;
    const warning = details.items.filter((item) => Number(item.hours || 0) === 1).length;
    const subtitleParts: string[] = [];
    if (breached > 0) {
      subtitleParts.push(`${breached} breached`);
    }
    if (warning > 0) {
      subtitleParts.push(`${warning} near breach`);
    }

    return {
      value: details.items.length,
      subtitle: subtitleParts.length > 0 ? subtitleParts.join(' • ') : undefined,
    };
  }

  if (widget.type === 'cycleTimeMedianDays' || widget.type === 'leadTimeMedianDays') {
    const values = details.items
      .map((item) => Number(item.hours || 0))
      .filter((entry) => Number.isFinite(entry) && entry >= 0);

    const median = calculateMedian(values);
    return {
      value: Number(median.toFixed(1)),
      suffix: 'd',
      subtitle: values.length > 0 ? `${values.length} closed tasks` : undefined,
    };
  }

  if (widget.type === 'throughputThisWeek' || widget.type === 'throughputThisMonth') {
    return {
      value: details.items.length,
      subtitle: widget.type === 'throughputThisWeek' ? 'Closed this week' : 'Closed this month',
    };
  }

  return { value: details.items.length };
};

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const accessibleOrgIds = await getAccessibleOrganizationIds(userId);
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT DashboardKpiConfig FROM Users WHERE Id = ?',
      [userId]
    );

    const rawConfig = rows.length > 0 ? rows[0].DashboardKpiConfig : null;
    const hasCustomConfig = rawConfig !== null && String(rawConfig).trim().length > 0;

    let widgets: DashboardKpiWidget[] = [];
    if (hasCustomConfig) {
      try {
        widgets = sanitizeWidgets(JSON.parse(String(rawConfig)));
      } catch {
        widgets = [];
      }
    }

    const metadata = await buildMetadata(userId, accessibleOrgIds);

    res.json({
      success: true,
      widgets,
      hasCustomConfig,
      metadata,
    });
  } catch (error) {
    console.error('Error loading dashboard KPI config:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard KPI config' });
  }
});

router.put('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const accessibleOrgIds = await getAccessibleOrganizationIds(userId);
    const requestedWidgets = sanitizeWidgets(req.body?.widgets || []);

    const sanitizedForAccess = requestedWidgets.filter((widget) => {
      if (widget.organizationId && !accessibleOrgIds.includes(Number(widget.organizationId))) {
        return false;
      }
      return true;
    });

    const serialized = JSON.stringify(sanitizedForAccess);

    await pool.execute(
      'UPDATE Users SET DashboardKpiConfig = ? WHERE Id = ?',
      [serialized, userId]
    );

    res.json({
      success: true,
      widgets: sanitizedForAccess,
      message: 'Dashboard KPI configuration saved',
    });
  } catch (error) {
    console.error('Error saving dashboard KPI config:', error);
    res.status(500).json({ success: false, message: 'Failed to save dashboard KPI config' });
  }
});

router.post('/values', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const accessibleOrgIds = await getAccessibleOrganizationIds(userId);
    const widgets = sanitizeWidgets(req.body?.widgets || []);

    const values: Record<string, KpiMetricValue> = {};
    const detailsByWidget: Record<string, KpiDetailResult> = {};

    for (const widget of widgets) {
      const details = await getWidgetDetails(widget, userId, accessibleOrgIds);
      detailsByWidget[widget.id] = details;
      values[widget.id] = await getWidgetValue(widget, userId, accessibleOrgIds, details);
    }

    res.json({ success: true, values, detailsByWidget });
  } catch (error) {
    console.error('Error loading dashboard KPI values:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard KPI values' });
  }
});

// Get detailed breakdown for a KPI widget
router.post('/:widgetId/details', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const widgetData = req.body?.widget;
    if (!widgetData) {
      return res.status(400).json({ success: false, message: 'Widget data required' });
    }

    const widget = sanitizeWidget(widgetData, 0);
    if (!widget) {
      return res.status(400).json({ success: false, message: 'Invalid widget' });
    }

    const accessibleOrgIds = await getAccessibleOrganizationIds(userId);

    if (accessibleOrgIds.length === 0) {
      return res.json({ success: true, items: [], type: 'unknown' });
    }

    const limit = 100;
    const offset = Math.max(0, Number(req.body?.offset || 0));

    const details = await getWidgetDetails(widget, userId, accessibleOrgIds, { limit, offset });
    res.json({ success: true, items: details.items, type: details.type });
  } catch (error) {
    console.error('Error loading KPI details:', error);
    res.status(500).json({ success: false, message: 'Failed to load KPI details' });
  }
});

export default router;
