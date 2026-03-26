import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

type ReportDatasetKey =
  | 'projects'
  | 'tasks'
  | 'timeEntries'
  | 'callRecords'
  | 'customers'
  | 'applications'
  | 'tickets'
  | 'allocationDates';

const SUPPORTED_DATASETS = new Set<ReportDatasetKey>([
  'projects',
  'tasks',
  'timeEntries',
  'callRecords',
  'customers',
  'applications',
  'tickets',
  'allocationDates',
]);

const isInternalTicketsEnabled = async (): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
    ['internalTicketsEnabled']
  );

  if (rows.length === 0) return true;
  return rows[0].SettingValue !== 'false';
};

const normalizeDateOnly = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
};

router.get('/datasets/:dataset', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const dataset = String(req.params.dataset || '') as ReportDatasetKey;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!SUPPORTED_DATASETS.has(dataset)) {
      return res.status(400).json({ success: false, message: 'Unsupported report dataset' });
    }

    if (dataset === 'tickets') {
      const enabled = await isInternalTicketsEnabled();
      if (!enabled) {
        return res.status(403).json({ success: false, message: 'Internal ticket system is disabled' });
      }
    }

    let query = '';
    let params: Array<number | string> = [];

    switch (dataset) {
      case 'projects':
        query = `
          SELECT
            p.Id,
            p.OrganizationId,
            p.CustomerId,
            p.CreatedBy,
            p.ProjectName,
            p.Description,
            p.StartDate,
            p.EndDate,
            p.CreatedAt,
            COALESCE(p.IsHobby, 0) as IsHobby,
            COALESCE(p.IsGlobal, 0) as IsGlobal,
            o.Name as OrganizationName,
            CASE
              WHEN c.ExternalName IS NOT NULL AND c.ExternalName <> '' THEN c.ExternalName
              ELSE c.Name
            END as CustomerName,
            creator.Username as CreatorName,
            psv.StatusName,
            COALESCE(taskStats.TotalTasks, 0) as TotalTasks,
            COALESCE(taskStats.OpenTasks, 0) as OpenTasks,
            COALESCE(taskStats.ClosedTasks, 0) as ClosedTasks,
            COALESCE(taskStats.TotalEstimatedHours, 0) as TotalEstimatedHours,
            COALESCE(taskStats.TotalWorkedHours, 0) as TotalWorkedHours
          FROM Projects p
          INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
          LEFT JOIN Organizations o ON p.OrganizationId = o.Id
          LEFT JOIN Customers c ON p.CustomerId = c.Id
          LEFT JOIN Users creator ON p.CreatedBy = creator.Id
          LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
          LEFT JOIN (
            SELECT
              t.ProjectId,
              COUNT(*) as TotalTasks,
              SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0 THEN 1 ELSE 0 END) as OpenTasks,
              SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) as ClosedTasks,
              SUM(
                CASE
                  WHEN parentTask.Id IS NULL THEN COALESCE(t.EstimatedHours, 0)
                  ELSE 0
                END
              ) as TotalEstimatedHours,
              COALESCE(worked.TotalWorkedHours, 0) as TotalWorkedHours
            FROM Tasks t
            LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
            LEFT JOIN Tasks parentTask ON parentTask.ParentTaskId = t.Id
            LEFT JOIN (
              SELECT
                t2.ProjectId,
                SUM(te.Hours) as TotalWorkedHours
              FROM TimeEntries te
              INNER JOIN Tasks t2 ON te.TaskId = t2.Id
              GROUP BY t2.ProjectId
            ) worked ON worked.ProjectId = t.ProjectId
            GROUP BY t.ProjectId, worked.TotalWorkedHours
          ) taskStats ON taskStats.ProjectId = p.Id
          ORDER BY p.ProjectName ASC
        `;
        params = [userId];
        break;

      case 'tasks':
        query = `
          SELECT
            t.Id,
            t.ProjectId,
            p.OrganizationId,
            COALESCE(t.CustomerId, p.CustomerId) as CustomerId,
            t.AssignedTo,
            t.CreatedBy,
            t.TaskName,
            t.Description,
            t.EstimatedHours,
            t.PlannedStartDate,
            t.PlannedEndDate,
            t.CreatedAt,
            p.ProjectName,
            o.Name as OrganizationName,
            CASE
              WHEN tc.ExternalName IS NOT NULL AND tc.ExternalName <> '' THEN tc.ExternalName
              WHEN tc.Name IS NOT NULL AND tc.Name <> '' THEN tc.Name
              WHEN pc.ExternalName IS NOT NULL AND pc.ExternalName <> '' THEN pc.ExternalName
              ELSE pc.Name
            END as CustomerName,
            assignee.Username as AssigneeName,
            creator.Username as CreatorName,
            tsv.StatusName,
            COALESCE(tsv.IsClosed, 0) as StatusIsClosed,
            COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
            tpv.PriorityName,
            COALESCE(worked.WorkedHours, 0) as WorkedHours
          FROM Tasks t
          INNER JOIN Projects p ON t.ProjectId = p.Id
          INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
          LEFT JOIN Organizations o ON p.OrganizationId = o.Id
          LEFT JOIN Customers tc ON t.CustomerId = tc.Id
          LEFT JOIN Customers pc ON p.CustomerId = pc.Id
          LEFT JOIN Users assignee ON t.AssignedTo = assignee.Id
          LEFT JOIN Users creator ON t.CreatedBy = creator.Id
          LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
          LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
          LEFT JOIN (
            SELECT TaskId, SUM(Hours) as WorkedHours
            FROM TimeEntries
            GROUP BY TaskId
          ) worked ON worked.TaskId = t.Id
          ORDER BY t.CreatedAt DESC, t.Id DESC
        `;
        params = [userId];
        break;

      case 'timeEntries':
        query = `
          SELECT
            te.Id,
            te.UserId,
            te.TaskId,
            t.ProjectId,
            p.OrganizationId,
            p.CustomerId,
            te.WorkDate,
            te.StartTime,
            te.EndTime,
            te.Hours,
            te.Description,
            te.ApprovalStatus,
            te.CreatedAt,
            worker.Username as UserName,
            t.TaskName,
            p.ProjectName,
            o.Name as OrganizationName,
            CASE
              WHEN c.ExternalName IS NOT NULL AND c.ExternalName <> '' THEN c.ExternalName
              ELSE c.Name
            END as CustomerName
          FROM TimeEntries te
          INNER JOIN Tasks t ON te.TaskId = t.Id
          INNER JOIN Projects p ON t.ProjectId = p.Id
          INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
          LEFT JOIN Users worker ON te.UserId = worker.Id
          LEFT JOIN Organizations o ON p.OrganizationId = o.Id
          LEFT JOIN Customers c ON p.CustomerId = c.Id
          ORDER BY te.WorkDate DESC, te.CreatedAt DESC
        `;
        params = [userId];
        break;

      case 'callRecords':
        query = `
          SELECT
            cr.Id,
            cr.UserId,
            COALESCE(cr.OrganizationId, p.OrganizationId) as OrganizationId,
            COALESCE(cr.ProjectId, p.Id) as ProjectId,
            COALESCE(t.CustomerId, p.CustomerId) as CustomerId,
            cr.TaskId,
            cr.CallDate,
            cr.StartTime,
            cr.DurationMinutes,
            cr.CallType,
            cr.Participants,
            cr.Subject,
            cr.Notes,
            cr.CreatedAt,
            worker.Username as UserName,
            o.Name as OrganizationName,
            p.ProjectName,
            t.TaskName,
            CASE
              WHEN tc.ExternalName IS NOT NULL AND tc.ExternalName <> '' THEN tc.ExternalName
              WHEN tc.Name IS NOT NULL AND tc.Name <> '' THEN tc.Name
              WHEN pc.ExternalName IS NOT NULL AND pc.ExternalName <> '' THEN pc.ExternalName
              ELSE pc.Name
            END as CustomerName
          FROM CallRecords cr
          LEFT JOIN Tasks t ON cr.TaskId = t.Id
          LEFT JOIN Projects p ON COALESCE(t.ProjectId, cr.ProjectId) = p.Id
          INNER JOIN OrganizationMembers om ON COALESCE(cr.OrganizationId, p.OrganizationId) = om.OrganizationId AND om.UserId = ?
          LEFT JOIN Users worker ON cr.UserId = worker.Id
          LEFT JOIN Organizations o ON COALESCE(cr.OrganizationId, p.OrganizationId) = o.Id
          LEFT JOIN Customers tc ON t.CustomerId = tc.Id
          LEFT JOIN Customers pc ON p.CustomerId = pc.Id
          ORDER BY cr.CallDate DESC, cr.StartTime DESC
        `;
        params = [userId];
        break;

      case 'customers':
        query = `
          SELECT DISTINCT
            c.Id,
            customerOrg.OrganizationId,
            customerOrg.OrganizationName,
            c.Name,
            c.ExternalName,
            c.Email,
            c.Phone,
            c.CreatedAt,
            c.UpdatedAt,
            CASE WHEN COALESCE(c.IsActive, 1) = 1 THEN 'Active' ELSE 'Inactive' END as StatusName,
            COALESCE(customerTaskStats.TotalTasks, 0) as TotalTasks,
            COALESCE(customerTaskStats.OpenTasks, 0) as OpenTasks,
            COALESCE(customerTaskStats.ClosedTasks, 0) as ClosedTasks,
            COALESCE(customerTaskStats.TotalEstimatedHours, 0) as TotalEstimatedHours,
            COALESCE(customerWorkedStats.TotalWorkedHours, 0) as TotalWorkedHours,
            (
              SELECT COUNT(*)
              FROM Tickets tk
              LEFT JOIN TicketStatusValues tsv ON tk.StatusId = tsv.Id
              WHERE tk.CustomerId = c.Id AND COALESCE(tsv.IsClosed, 0) = 0
            ) as OpenTickets
          FROM Customers c
          INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
          INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId AND om.UserId = ?
          LEFT JOIN (
            SELECT
              co2.CustomerId,
              MIN(co2.OrganizationId) as OrganizationId,
              MIN(o2.Name) as OrganizationName
            FROM CustomerOrganizations co2
            INNER JOIN Organizations o2 ON co2.OrganizationId = o2.Id
            GROUP BY co2.CustomerId
          ) customerOrg ON customerOrg.CustomerId = c.Id
          LEFT JOIN (
            SELECT
              base.EffectiveCustomerId as CustomerId,
              COUNT(*) as TotalTasks,
              SUM(CASE WHEN base.StatusIsClosed = 0 AND base.StatusIsCancelled = 0 THEN 1 ELSE 0 END) as OpenTasks,
              SUM(CASE WHEN base.StatusIsClosed = 1 THEN 1 ELSE 0 END) as ClosedTasks,
              SUM(CASE WHEN base.IsLeafTask = 1 THEN base.EstimatedHours ELSE 0 END) as TotalEstimatedHours
            FROM (
              SELECT
                t.Id,
                COALESCE(t.CustomerId, p.CustomerId) as EffectiveCustomerId,
                COALESCE(t.EstimatedHours, 0) as EstimatedHours,
                COALESCE(tsv.IsClosed, 0) as StatusIsClosed,
                COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
                CASE WHEN child.Id IS NULL THEN 1 ELSE 0 END as IsLeafTask
              FROM Tasks t
              INNER JOIN Projects p ON t.ProjectId = p.Id
              INNER JOIN OrganizationMembers omTask ON p.OrganizationId = omTask.OrganizationId AND omTask.UserId = ?
              LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
              LEFT JOIN Tasks child ON child.ParentTaskId = t.Id
            ) base
            GROUP BY base.EffectiveCustomerId
          ) customerTaskStats ON customerTaskStats.CustomerId = c.Id
          LEFT JOIN (
            SELECT
              COALESCE(t.CustomerId, p.CustomerId) as EffectiveCustomerId,
              SUM(te.Hours) as TotalWorkedHours
            FROM TimeEntries te
            INNER JOIN Tasks t ON te.TaskId = t.Id
            INNER JOIN Projects p ON t.ProjectId = p.Id
            INNER JOIN OrganizationMembers omTime ON p.OrganizationId = omTime.OrganizationId AND omTime.UserId = ?
            GROUP BY COALESCE(t.CustomerId, p.CustomerId)
          ) customerWorkedStats ON customerWorkedStats.EffectiveCustomerId = c.Id
          ORDER BY c.Name ASC
        `;
        params = [userId, userId, userId];
        break;

      case 'applications':
        query = `
          SELECT
            a.Id,
            a.OrganizationId,
            a.CreatedBy,
            a.Name,
            a.Description,
            a.RepositoryUrl,
            COALESCE(a.IsCustomerSpecific, 0) as IsCustomerSpecific,
            a.CreatedAt,
            o.Name as OrganizationName,
            creator.Username as CreatorName,
            (
              SELECT COUNT(DISTINCT ap.ProjectId)
              FROM ApplicationProjects ap
              WHERE ap.ApplicationId = a.Id
            ) as ProjectCount,
            (
              SELECT COUNT(DISTINCT ac.CustomerId)
              FROM ApplicationCustomers ac
              WHERE ac.ApplicationId = a.Id
            ) as CustomerCount,
            (
              SELECT COUNT(DISTINCT av.Id)
              FROM ApplicationVersions av
              WHERE av.ApplicationId = a.Id
            ) as VersionCount
          FROM Applications a
          INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
          LEFT JOIN Organizations o ON a.OrganizationId = o.Id
          LEFT JOIN Users creator ON a.CreatedBy = creator.Id
          WHERE COALESCE(a.IsActive, 1) = 1
          ORDER BY a.Name ASC
        `;
        params = [userId];
        break;

      case 'tickets':
        query = `
          SELECT
            t.Id,
            t.OrganizationId,
            t.ProjectId,
            t.CustomerId,
            t.AssignedToUserId,
            t.CreatedByUserId,
            t.DeveloperUserId,
            t.TicketNumber,
            t.Title,
            t.Category,
            t.ScheduledDate,
            t.CreatedAt,
            o.Name as OrganizationName,
            CASE
              WHEN c.ExternalName IS NOT NULL AND c.ExternalName <> '' THEN c.ExternalName
              ELSE c.Name
            END as CustomerName,
            p.ProjectName,
            creator.Username as CreatorName,
            assignee.Username as AssigneeName,
            developer.Username as DeveloperName,
            tsv.StatusName,
            tpv.PriorityName
          FROM Tickets t
          INNER JOIN OrganizationMembers om ON t.OrganizationId = om.OrganizationId AND om.UserId = ?
          LEFT JOIN Organizations o ON t.OrganizationId = o.Id
          LEFT JOIN Customers c ON t.CustomerId = c.Id
          LEFT JOIN Projects p ON t.ProjectId = p.Id
          LEFT JOIN Users creator ON t.CreatedByUserId = creator.Id
          LEFT JOIN Users assignee ON t.AssignedToUserId = assignee.Id
          LEFT JOIN Users developer ON t.DeveloperUserId = developer.Id
          LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
          LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
          ORDER BY t.CreatedAt DESC
        `;
        params = [userId];
        break;

      case 'allocationDates':
        query = `
          SELECT
            ta.TaskId,
            ta.TaskAllocationHeaderId,
            ta.UserId,
            t.ProjectId,
            p.OrganizationId,
            p.CustomerId,
            ta.AllocationDate,
            ta.AllocatedHours,
            ta.StartTime,
            ta.EndTime,
            t.TaskName,
            p.ProjectName,
            o.Name as OrganizationName,
            CASE
              WHEN c.ExternalName IS NOT NULL AND c.ExternalName <> '' THEN c.ExternalName
              ELSE c.Name
            END as CustomerName,
            worker.Username as UserName,
            tah.AllocationMode,
            tah.SplitOrder,
            tah.PlannedHours
          FROM TaskAllocations ta
          INNER JOIN Tasks t ON ta.TaskId = t.Id
          INNER JOIN Projects p ON t.ProjectId = p.Id
          INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
          LEFT JOIN Users worker ON ta.UserId = worker.Id
          LEFT JOIN Organizations o ON p.OrganizationId = o.Id
          LEFT JOIN Customers c ON p.CustomerId = c.Id
          LEFT JOIN TaskAllocationHeaders tah ON ta.TaskAllocationHeaderId = tah.Id
          ORDER BY ta.AllocationDate DESC, t.TaskName ASC
        `;
        params = [userId];
        break;
    }

    const [records] = await pool.execute<RowDataPacket[]>(query, params);

    if (dataset === 'allocationDates' && records.length > 0) {
      const [childAllocations] = await pool.execute<RowDataPacket[]>(
        `
          SELECT
            tca.ParentTaskId as TaskId,
            tca.TaskAllocationHeaderId,
            tca.AllocationDate,
            childTask.TaskName as ChildTaskName
          FROM TaskChildAllocations tca
          INNER JOIN Tasks parentTask ON tca.ParentTaskId = parentTask.Id
          INNER JOIN Projects p ON parentTask.ProjectId = p.Id
          INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
          INNER JOIN Tasks childTask ON tca.ChildTaskId = childTask.Id
          ORDER BY tca.AllocationDate DESC, childTask.TaskName ASC
        `,
        [userId]
      );

      const childNamesByAllocation = new Map<string, Set<string>>();

      childAllocations.forEach((allocation) => {
        const key = `${Number(allocation.TaskId || 0)}|${String(allocation.TaskAllocationHeaderId || '')}|${normalizeDateOnly(allocation.AllocationDate)}`;
        if (!childNamesByAllocation.has(key)) {
          childNamesByAllocation.set(key, new Set<string>());
        }

        const childName = String(allocation.ChildTaskName || '').trim();
        if (childName) {
          childNamesByAllocation.get(key)?.add(childName);
        }
      });

      records.forEach((record) => {
        const key = `${Number(record.TaskId || 0)}|${String(record.TaskAllocationHeaderId || '')}|${normalizeDateOnly(record.AllocationDate)}`;
        const childNames = Array.from(childNamesByAllocation.get(key) || []);
        record.ChildTaskNames = childNames.join(', ');
      });
    }

    res.json({ success: true, records });
  } catch (error) {
    console.error('Error fetching report dataset:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch report dataset' });
  }
});

export default router;
