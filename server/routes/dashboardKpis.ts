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
  | 'tasksByPriority';

interface DashboardKpiWidget {
  id: string;
  type: DashboardKpiType;
  title?: string;
  organizationId?: number | null;
  statusValueId?: number | null;
  priorityValueId?: number | null;
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
]);

const KPI_TYPES_REQUIRING_ORG = new Set<DashboardKpiType>([
  'organizationProjects',
  'organizationTasks',
  'organizationPendingTasks',
  'organizationCompletedTasks',
  'tasksByStatus',
  'tasksByPriority',
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

  if (KPI_TYPES_REQUIRING_ORG.has(rawType) && !organizationId) {
    return null;
  }

  if (rawType === 'tasksByStatus' && !statusValueId) {
    return null;
  }

  if (rawType === 'tasksByPriority' && !priorityValueId) {
    return null;
  }

  return {
    id: widgetId,
    type: rawType,
    title,
    organizationId,
    statusValueId,
    priorityValueId,
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
    };
  }

  const inClause = buildInClause(accessibleOrgIds);

  const [organizations] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT o.Id, o.Name
     FROM Organizations o
     INNER JOIN OrganizationMembers om ON o.Id = om.OrganizationId
     WHERE om.UserId = ?
       AND o.Id IN (${inClause})
     ORDER BY o.Name ASC`,
    [userId, ...accessibleOrgIds]
  );

  const [statuses] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, OrganizationId, StatusName, ColorCode
     FROM TaskStatusValues
     WHERE OrganizationId IN (${inClause})
     ORDER BY OrganizationId ASC, SortOrder ASC, StatusName ASC`,
    [...accessibleOrgIds]
  );

  const [priorities] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, OrganizationId, PriorityName, ColorCode
     FROM TaskPriorityValues
     WHERE OrganizationId IN (${inClause})
     ORDER BY OrganizationId ASC, SortOrder ASC, PriorityName ASC`,
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

  return {
    organizations: organizations.map((row) => ({
      Id: Number(row.Id),
      Name: String(row.Name || ''),
    })),
    statusesByOrganization,
    prioritiesByOrganization,
  };
};

const getWidgetValue = async (
  widget: DashboardKpiWidget,
  userId: number,
  accessibleOrgIds: number[]
): Promise<KpiMetricValue> => {
  if (accessibleOrgIds.length === 0) {
    return { value: 0 };
  }

  const inClause = buildInClause(accessibleOrgIds);

  if (widget.type === 'totalProjects') {
    const value = await querySingleNumber(
      `SELECT COUNT(*) AS total
       FROM Projects
       WHERE OrganizationId IN (${inClause})`,
      [...accessibleOrgIds]
    );
    return { value };
  }

  if (widget.type === 'myTasks') {
    const value = await querySingleNumber(
      `SELECT COUNT(DISTINCT t.Id) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       LEFT JOIN TaskAssignees ta ON ta.TaskId = t.Id
       LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
       WHERE p.OrganizationId IN (${inClause})
         AND (t.AssignedTo = ? OR ta.UserId = ?)
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0`,
      [...accessibleOrgIds, userId, userId]
    );
    return { value };
  }

  if (widget.type === 'myPendingTasks') {
    const value = await querySingleNumber(
      `SELECT COUNT(DISTINCT t.Id) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       LEFT JOIN TaskAssignees ta ON ta.TaskId = t.Id
       LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
       WHERE p.OrganizationId IN (${inClause})
         AND (t.AssignedTo = ? OR ta.UserId = ?)
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         AND COALESCE(tsv.IsClosed, 0) = 0
         AND COALESCE(tsv.IsCancelled, 0) = 0`,
      [...accessibleOrgIds, userId, userId]
    );
    return { value };
  }

  if (widget.type === 'myCompletedTasks') {
    const value = await querySingleNumber(
      `SELECT COUNT(DISTINCT t.Id) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       LEFT JOIN TaskAssignees ta ON ta.TaskId = t.Id
       LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
       WHERE p.OrganizationId IN (${inClause})
         AND (t.AssignedTo = ? OR ta.UserId = ?)
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         AND COALESCE(tsv.IsClosed, 0) = 1`,
      [...accessibleOrgIds, userId, userId]
    );
    return { value };
  }

  if (widget.type === 'hoursThisWeek') {
    const week = getWeekBounds();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         (
           SELECT COALESCE(SUM(te.Hours), 0)
           FROM TimeEntries te
           WHERE te.UserId = ?
             AND te.WorkDate BETWEEN ? AND ?
         ) AS totalHours,
         (
           SELECT COALESCE(SUM(ta.AllocatedHours), 0)
           FROM TaskAllocations ta
           WHERE ta.UserId = ?
             AND ta.AllocationDate BETWEEN ? AND ?
         ) AS allocatedHours`,
      [userId, week.start, week.end, userId, week.start, week.end]
    );

    const totalHours = Number(rows[0]?.totalHours || 0);
    const allocatedHours = Number(rows[0]?.allocatedHours || 0);
    return {
      value: totalHours,
      suffix: 'h',
      subtitle: `Allocated: ${allocatedHours.toFixed(1)}h`,
    };
  }

  if (widget.type === 'hoursThisMonth') {
    const month = getMonthBounds();

    const value = await querySingleNumber(
      `SELECT COALESCE(SUM(Hours), 0) AS total
       FROM TimeEntries
       WHERE UserId = ?
         AND WorkDate BETWEEN ? AND ?`,
      [userId, month.start, month.end]
    );

    return { value, suffix: 'h' };
  }

  if (widget.type === 'myTickets') {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 0 THEN 1 ELSE 0 END), 0) AS active
       FROM Tickets tk
       LEFT JOIN TicketStatusValues tsv ON tsv.Id = tk.StatusId
       WHERE tk.OrganizationId IN (${inClause})
         AND (tk.CreatedByUserId = ? OR tk.AssignedToUserId = ?)`,
      [...accessibleOrgIds, userId, userId]
    );

    const total = Number(rows[0]?.total || 0);
    const active = Number(rows[0]?.active || 0);
    return {
      value: total,
      subtitle: active > 0 ? `${active} active` : undefined,
    };
  }

  if (widget.type === 'customersTotal') {
    const value = await querySingleNumber(
      `SELECT COUNT(DISTINCT c.Id) AS total
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON co.CustomerId = c.Id
       WHERE c.IsActive = 1
         AND co.OrganizationId IN (${inClause})`,
      [...accessibleOrgIds]
    );
    return { value };
  }

  if (!widget.organizationId || !accessibleOrgIds.includes(Number(widget.organizationId))) {
    return { value: 0 };
  }

  const organizationId = Number(widget.organizationId);

  if (widget.type === 'organizationProjects') {
    const value = await querySingleNumber(
      'SELECT COUNT(*) AS total FROM Projects WHERE OrganizationId = ?',
      [organizationId]
    );
    return { value };
  }

  if (widget.type === 'organizationTasks') {
    const value = await querySingleNumber(
      `SELECT COUNT(*) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
       WHERE p.OrganizationId = ?
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0`,
      [organizationId]
    );
    return { value };
  }

  if (widget.type === 'organizationPendingTasks') {
    const value = await querySingleNumber(
      `SELECT COUNT(*) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
       WHERE p.OrganizationId = ?
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         AND COALESCE(tsv.IsClosed, 0) = 0
         AND COALESCE(tsv.IsCancelled, 0) = 0`,
      [organizationId]
    );
    return { value };
  }

  if (widget.type === 'organizationCompletedTasks') {
    const value = await querySingleNumber(
      `SELECT COUNT(*) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       LEFT JOIN TaskStatusValues tsv ON tsv.Id = t.Status
       WHERE p.OrganizationId = ?
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         AND COALESCE(tsv.IsClosed, 0) = 1`,
      [organizationId]
    );
    return { value };
  }

  if (widget.type === 'tasksByStatus' && widget.statusValueId) {
    const value = await querySingleNumber(
      `SELECT COUNT(*) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       WHERE p.OrganizationId = ?
         AND t.Status = ?`,
      [organizationId, Number(widget.statusValueId)]
    );
    return { value };
  }

  if (widget.type === 'tasksByPriority' && widget.priorityValueId) {
    const value = await querySingleNumber(
      `SELECT COUNT(*) AS total
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       WHERE p.OrganizationId = ?
         AND t.Priority = ?`,
      [organizationId, Number(widget.priorityValueId)]
    );
    return { value };
  }

  return { value: 0 };
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

    for (const widget of widgets) {
      values[widget.id] = await getWidgetValue(widget, userId, accessibleOrgIds);
    }

    res.json({ success: true, values });
  } catch (error) {
    console.error('Error loading dashboard KPI values:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard KPI values' });
  }
});

export default router;
