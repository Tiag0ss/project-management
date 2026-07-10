import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import logger from '../utils/logger';

const router = Router();

type MappingMode = 'existing' | 'create' | 'ignore' | 'vacation';

interface EntityMappingEntry {
  mode: MappingMode;
  targetId?: number | null;
}

interface ResourceMappingEntry {
  mode?: 'existing' | 'fictional';
  userId?: number | null;
}

interface FieldMapping {
  customer: string;
  project: string;
  projectId?: string;
  task: string;
  taskId?: string;
  resource: string;
  resourceId?: string;
  allocStart: string;
  allocEnd: string;
  allocHours: string;
  locked?: string;
  hlEstimationHours?: string;
  comments?: string;
}

interface ImportPayload {
  organizationId: number;
  rows: Record<string, any>[];
  fieldMapping: FieldMapping;
  taskTicketNumbers?: Record<string, string>;
  entityMapping?: {
    customers?: Record<string, EntityMappingEntry>;
    projects?: Record<string, EntityMappingEntry>;
    tasks?: Record<string, EntityMappingEntry>;
    resources?: Record<string, ResourceMappingEntry>;
  };
}

const normalizeText = (value: any): string => String(value || '').trim();

const normalizeKey = (value: any): string => normalizeText(value).toLowerCase();

const isVacationLikeText = (value: any): boolean => {
  const normalized = normalizeKey(value);
  if (!normalized) return false;
  return normalized.includes('vacation') || normalized.includes('férias') || normalized.includes('ferias');
};

const parseDecimal = (value: any): number => {
  const parsed = parseFloat(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseOptionalDecimal = (value: any): number | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return parseDecimal(value);
};

const parseOptionalInt = (value: any): number | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractTicketKey = (value: any): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const jiraPattern = /\b([A-Z][A-Z0-9]+-\d+)\b/i;
  const jiraMatch = normalized.match(jiraPattern);
  if (jiraMatch?.[1]) return jiraMatch[1].toUpperCase();
  return null;
};

const normalizeToHalfHour = (hours: number): number => {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const units = Math.max(1, Math.round(hours * 2));
  return units / 2;
};

const toUsernameBase = (source: string): string => {
  const cleaned = String(source || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return cleaned || 'fictitious.user';
};

const monthAbbreviationToNumber: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const toPaddedDateKey = (year: number, month: number, day: number): string => {
  const yearPart = String(year).padStart(4, '0');
  const monthPart = String(month).padStart(2, '0');
  const dayPart = String(day).padStart(2, '0');
  return `${yearPart}-${monthPart}-${dayPart}`;
};

const toDateKey = (value: any): string | null => {
  if (!value) return null;

  const raw = normalizeText(value);
  if (!raw) return null;

  const isoLikeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLikeMatch) {
    const year = Number(isoLikeMatch[1]);
    const month = Number(isoLikeMatch[2]);
    const day = Number(isoLikeMatch[3]);
    if (year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toPaddedDateKey(year, month, day);
    }
  }

  const plannerDateMatch = raw.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (plannerDateMatch) {
    const month = monthAbbreviationToNumber[plannerDateMatch[1].toLowerCase()];
    const day = Number(plannerDateMatch[2]);
    const year = Number(plannerDateMatch[3]);
    if (month && year > 0 && day >= 1 && day <= 31) {
      return toPaddedDateKey(year, month, day);
    }
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return null;

  return toPaddedDateKey(
    asDate.getUTCFullYear(),
    asDate.getUTCMonth() + 1,
    asDate.getUTCDate()
  );
};

const listDateKeysInclusive = (startKey: string, endKey: string): string[] => {
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const min = start <= end ? start : end;
  const max = start <= end ? end : start;

  const dates: string[] = [];
  const cursor = new Date(min);
  while (cursor <= max) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const isWeekday = (dateKey: string): boolean => {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

const getWorkHoursFieldByWeekday = (weekday: number): string => {
  switch (weekday) {
    case 0:
      return 'WorkHoursSunday';
    case 1:
      return 'WorkHoursMonday';
    case 2:
      return 'WorkHoursTuesday';
    case 3:
      return 'WorkHoursWednesday';
    case 4:
      return 'WorkHoursThursday';
    case 5:
      return 'WorkHoursFriday';
    default:
      return 'WorkHoursSaturday';
  }
};

const getUserCapacityForDate = (dateKey: string, userRow: RowDataPacket | undefined): number => {
  if (!userRow) return 0;
  const date = new Date(`${dateKey}T12:00:00`);
  const weekday = date.getDay();
  const fieldName = getWorkHoursFieldByWeekday(weekday);
  return Math.max(0, parseDecimal((userRow as any)[fieldName]));
};

const filterWorkingDatesForUser = (dateKeys: string[], userRow: RowDataPacket | undefined): string[] => {
  if (!userRow) {
    return dateKeys.filter(isWeekday);
  }

  return dateKeys.filter((dateKey) => {
    const date = new Date(`${dateKey}T12:00:00`);
    const weekday = date.getDay();
    const fieldName = getWorkHoursFieldByWeekday(weekday);
    const hours = parseDecimal((userRow as any)[fieldName]);
    return hours > 0;
  });
};

const splitHoursAcrossDates = (totalHours: number, dateKeys: string[]): Array<{ dateKey: string; hours: number }> => {
  if (dateKeys.length === 0 || totalHours <= 0) return [];

  const weekdays = dateKeys.filter(isWeekday);
  const targetDates = weekdays.length > 0 ? weekdays : dateKeys;

  const totalUnits = Math.max(1, Math.round(totalHours * 2));
  const baseUnits = Math.floor(totalUnits / targetDates.length);
  let remainingUnits = totalUnits - baseUnits * targetDates.length;

  return targetDates.map((dateKey) => {
    const extraUnit = remainingUnits > 0 ? 1 : 0;
    if (remainingUnits > 0) remainingUnits -= 1;
    const unitsForDay = baseUnits + extraUnit;
    return { dateKey, hours: unitsForDay / 2 };
  }).filter((entry) => entry.hours > 0);
};

const toNoonDate = (dateKey: string): Date => new Date(`${dateKey}T12:00:00`);

const areRangesContiguousOrOverlapping = (
  currentStart: string,
  currentEnd: string,
  incomingStart: string,
  incomingEnd: string
): boolean => {
  const currentStartDate = toNoonDate(currentStart);
  const currentEndDate = toNoonDate(currentEnd);
  const incomingStartDate = toNoonDate(incomingStart);
  const incomingEndDate = toNoonDate(incomingEnd);

  const currentMin = currentStartDate <= currentEndDate ? currentStartDate : currentEndDate;
  const currentMax = currentStartDate <= currentEndDate ? currentEndDate : currentStartDate;
  const incomingMin = incomingStartDate <= incomingEndDate ? incomingStartDate : incomingEndDate;
  const incomingMax = incomingStartDate <= incomingEndDate ? incomingEndDate : incomingStartDate;

  const currentMaxPlusOne = new Date(currentMax);
  currentMaxPlusOne.setDate(currentMaxPlusOne.getDate() + 1);

  const incomingMaxPlusOne = new Date(incomingMax);
  incomingMaxPlusOne.setDate(incomingMaxPlusOne.getDate() + 1);

  return incomingMin <= currentMaxPlusOne && currentMin <= incomingMaxPlusOne;
};

const ensureImportAllocationHeader = async (
  connection: { execute: <T = any>(query: string, params?: any[]) => Promise<[T, any]> },
  taskId: number,
  userId: number,
  createdBy: number,
  plannedHours: number,
  allocStart: string,
  allocEnd: string
): Promise<number> => {
  const [existingRows] = await connection.execute<RowDataPacket[]>(
    `SELECT h.Id,
            h.PlannedStartDate,
            h.PlannedEndDate,
            h.PlannedHours,
            MIN(a.AllocationDate) as AllocationMinDate,
            MAX(a.AllocationDate) as AllocationMaxDate
     FROM TaskAllocationHeaders h
     LEFT JOIN TaskAllocations a ON a.TaskAllocationHeaderId = h.Id
     WHERE h.TaskId = ? AND h.UserId = ?
     GROUP BY h.Id, h.PlannedStartDate, h.PlannedEndDate, h.PlannedHours
     ORDER BY h.Id ASC`,
    [taskId, userId]
  );

  for (const row of existingRows) {
    const rowStart = toDateKey(row.PlannedStartDate) || toDateKey(row.AllocationMinDate);
    const rowEnd = toDateKey(row.PlannedEndDate) || toDateKey(row.AllocationMaxDate);
    if (!rowStart || !rowEnd) continue;

    if (areRangesContiguousOrOverlapping(rowStart, rowEnd, allocStart, allocEnd)) {
      const headerId = Number(row.Id);
      const mergedStart = rowStart <= allocStart ? rowStart : allocStart;
      const mergedEnd = rowEnd >= allocEnd ? rowEnd : allocEnd;
      const nextPlannedHours = normalizeToHalfHour(parseDecimal(row.PlannedHours || 0) + plannedHours);

      await connection.execute(
        `UPDATE TaskAllocationHeaders
         SET PlannedStartDate = ?,
             PlannedEndDate = ?,
             PlannedHours = ?
         WHERE Id = ?`,
        [mergedStart, mergedEnd, nextPlannedHours, headerId]
      );

      return headerId;
    }
  }

  const [maxOrderRows] = await connection.execute<RowDataPacket[]>(
    `SELECT MAX(SplitOrder) as MaxSplitOrder
     FROM TaskAllocationHeaders
     WHERE TaskId = ?`,
    [taskId]
  );

  const maxSplitOrder = Number(maxOrderRows[0]?.MaxSplitOrder || 0);
  const splitOrder = Number.isFinite(maxSplitOrder) ? maxSplitOrder + 1 : 1;

  const [insertResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO TaskAllocationHeaders (TaskId, UserId, AllocationMode, SplitOrder, PlannedHours, PlannedStartDate, PlannedEndDate, CreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [taskId, userId, 'parallel', splitOrder, plannedHours, allocStart, allocEnd, createdBy]
  );

  return Number(insertResult.insertId);
};

const recomputeImportAllocationHeader = async (
  connection: { execute: <T = any>(query: string, params?: any[]) => Promise<[T, any]> },
  headerId: number
): Promise<void> => {
  const [aggregateRows] = await connection.execute<RowDataPacket[]>(
    `SELECT MIN(AllocationDate) as MinDate,
            MAX(AllocationDate) as MaxDate,
            COALESCE(SUM(AllocatedHours), 0) as TotalHours
     FROM TaskAllocations
     WHERE TaskAllocationHeaderId = ?`,
    [headerId]
  );

  const row = aggregateRows[0] || {};
  const minDate = toDateKey(row.MinDate);
  const maxDate = toDateKey(row.MaxDate);
  const totalHours = normalizeToHalfHour(parseDecimal(row.TotalHours || 0));

  await connection.execute(
    `UPDATE TaskAllocationHeaders
     SET PlannedStartDate = ?,
         PlannedEndDate = ?,
         PlannedHours = ?
     WHERE Id = ?`,
    [minDate, maxDate, totalHours, headerId]
  );
};

const canManageInOrganization = async (organizationId: number, userId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT om.Role,
            COALESCE(pg.CanManageProjects, 0) as CanManageProjects,
            COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
            COALESCE(pg.CanManageMembers, 0) as CanManageMembers,
            u.IsAdmin
     FROM OrganizationMembers om
     INNER JOIN Users u ON u.Id = om.UserId
     LEFT JOIN PermissionGroups pg ON pg.Id = om.PermissionGroupId
     WHERE om.OrganizationId = ? AND om.UserId = ?`,
    [organizationId, userId]
  );

  if (rows.length === 0) return false;

  const row = rows[0];
  if (Number(row.IsAdmin) === 1) return true;
  if (row.Role === 'Owner' || row.Role === 'Admin') return true;

  return Number(row.CanManageProjects) === 1 || Number(row.CanManageTasks) === 1 || Number(row.CanManageMembers) === 1;
};

router.get('/options/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const organizationIdParam = Array.isArray(req.params.organizationId)
      ? req.params.organizationId[0]
      : req.params.organizationId;
    const organizationId = parseInt(organizationIdParam || '', 10);

    if (!userId || Number.isNaN(organizationId)) {
      return res.status(400).json({ success: false, message: 'Invalid organization' });
    }

    const hasAccess = await canManageInOrganization(organizationId, userId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [customers] = await pool.execute<RowDataPacket[]>(
      `SELECT c.Id, c.Name
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON co.CustomerId = c.Id
       WHERE co.OrganizationId = ? AND c.IsActive = 1
       ORDER BY c.Name ASC`,
      [organizationId]
    );

    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, ProjectName, CustomerId
       FROM Projects
       WHERE OrganizationId = ?
       ORDER BY ProjectName ASC`,
      [organizationId]
    );

    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.ProjectId, p.ProjectName
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       WHERE p.OrganizationId = ?
       ORDER BY p.ProjectName ASC, t.TaskName ASC`,
      [organizationId]
    );

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Id, u.Username, u.FirstName, u.LastName
       FROM Users u
       INNER JOIN OrganizationMembers om ON om.UserId = u.Id
       WHERE om.OrganizationId = ? AND u.IsActive = 1
       ORDER BY u.FirstName ASC, u.LastName ASC, u.Username ASC`,
      [organizationId]
    );

    res.json({
      success: true,
      data: {
        customers,
        projects,
        tasks,
        users,
      },
    });
  } catch (error) {
    logger.error('Planning import options error:', error);
    res.status(500).json({ success: false, message: 'Failed to load import options' });
  }
});

router.post('/import', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const payload = req.body as ImportPayload;
  const organizationId = Number(payload.organizationId);

  if (!organizationId || !Array.isArray(payload.rows) || payload.rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Organization and rows are required' });
  }

  const hasAccess = await canManageInOrganization(organizationId, userId);
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const fieldMapping = payload.fieldMapping || ({} as FieldMapping);
  const requiredFields: Array<keyof FieldMapping> = ['customer', 'project', 'task', 'resource', 'allocStart', 'allocEnd', 'allocHours'];
  for (const field of requiredFields) {
    if (!normalizeText(fieldMapping[field])) {
      return res.status(400).json({ success: false, message: `Missing field mapping for ${field}` });
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [defaultProjectStatuses] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, StatusName, IsDefault
       FROM ProjectStatusValues
       WHERE OrganizationId = ?
       ORDER BY SortOrder ASC, Id ASC`,
      [organizationId]
    );

    const [defaultTaskStatuses] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, StatusName, IsDefault
       FROM TaskStatusValues
       WHERE OrganizationId = ?
       ORDER BY SortOrder ASC, Id ASC`,
      [organizationId]
    );

    const [defaultTaskPriorities] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, PriorityName, IsDefault
       FROM TaskPriorityValues
       WHERE OrganizationId = ?
       ORDER BY SortOrder ASC, Id ASC`,
      [organizationId]
    );

    const [defaultTaskTypes] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, TypeName, IsDefault
       FROM TaskTypeValues
       WHERE OrganizationId = ?
       ORDER BY SortOrder ASC, Id ASC`,
      [organizationId]
    );

    const defaultProjectStatusId = Number(defaultProjectStatuses.find((s: any) => Number(s.IsDefault) === 1)?.Id || defaultProjectStatuses[0]?.Id || 0);
    const defaultTaskStatusId = Number(defaultTaskStatuses.find((s: any) => Number(s.IsDefault) === 1)?.Id || defaultTaskStatuses[0]?.Id || 0);
    const defaultTaskPriorityId = Number(defaultTaskPriorities.find((p: any) => Number(p.IsDefault) === 1)?.Id || defaultTaskPriorities[0]?.Id || 0);
    const defaultTaskTypeId = Number(defaultTaskTypes.find((t: any) => Number(t.IsDefault) === 1)?.Id || defaultTaskTypes[0]?.Id || 0);

    if (!defaultProjectStatusId || !defaultTaskStatusId || !defaultTaskPriorityId || !defaultTaskTypeId) {
      throw new Error('Organization status/priority/type configuration is incomplete');
    }

    const [existingCustomers] = await connection.execute<RowDataPacket[]>(
      `SELECT c.Id, c.Name
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON co.CustomerId = c.Id
       WHERE co.OrganizationId = ?`,
      [organizationId]
    );

    const [existingProjects] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, ProjectName, CustomerId
       FROM Projects
       WHERE OrganizationId = ?`,
      [organizationId]
    );

    const [existingTasks] = await connection.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.ProjectId, t.AssignedTo, t.PlannedStartDate, t.PlannedEndDate
       FROM Tasks t
       INNER JOIN Projects p ON p.Id = t.ProjectId
       WHERE p.OrganizationId = ?`,
      [organizationId]
    );

    const [orgUsers] = await connection.execute<RowDataPacket[]>(
      `SELECT u.Id, u.Username, u.FirstName, u.LastName,
              u.WorkHoursMonday, u.WorkHoursTuesday, u.WorkHoursWednesday, u.WorkHoursThursday,
              u.WorkHoursFriday, u.WorkHoursSaturday, u.WorkHoursSunday
       FROM Users u
       INNER JOIN OrganizationMembers om ON om.UserId = u.Id
       WHERE om.OrganizationId = ? AND u.IsActive = 1`,
      [organizationId]
    );

    const customerByName = new Map<string, number>();
    existingCustomers.forEach((c: any) => customerByName.set(normalizeKey(c.Name), Number(c.Id)));

    const projectByName = new Map<string, number>();
    const projectById = new Map<number, RowDataPacket>();
    const projectCustomerById = new Map<number, number | null>();
    existingProjects.forEach((p: any) => {
      projectByName.set(normalizeKey(p.ProjectName), Number(p.Id));
      projectById.set(Number(p.Id), p);
      projectCustomerById.set(Number(p.Id), p.CustomerId ? Number(p.CustomerId) : null);
    });

    const taskByProjectAndName = new Map<string, number>();
    const taskByProjectAndTicketNumber = new Map<string, number>();
    const taskById = new Map<number, RowDataPacket>();
    existingTasks.forEach((t: any) => {
      taskById.set(Number(t.Id), t);
      const projectId = Number(t.ProjectId);
      const taskNameKey = normalizeKey(t.TaskName);
      taskByProjectAndName.set(`${projectId}::${taskNameKey}`, Number(t.Id));
      const ticketNumber = extractTicketKey(t.TaskName);
      if (ticketNumber) {
        taskByProjectAndTicketNumber.set(`${projectId}::${ticketNumber}`, Number(t.Id));
      }
    });

    const userByLookup = new Map<string, number>();
    const userRowsById = new Map<number, RowDataPacket>();
    orgUsers.forEach((u: any) => {
      const fullName = `${normalizeText(u.FirstName)} ${normalizeText(u.LastName)}`.trim();
      if (fullName) userByLookup.set(normalizeKey(fullName), Number(u.Id));
      if (u.Username) userByLookup.set(normalizeKey(u.Username), Number(u.Id));
      userRowsById.set(Number(u.Id), u);
    });

    const customersMapping = payload.entityMapping?.customers || {};
    const projectsMapping = payload.entityMapping?.projects || {};
    const tasksMapping = payload.entityMapping?.tasks || {};
    const taskTicketNumbers = payload.taskTicketNumbers || {};
    const resourcesMapping = payload.entityMapping?.resources || {};
    const tasksMappingNormalized = new Map<string, EntityMappingEntry>();
    Object.entries(tasksMapping).forEach(([key, entry]) => {
      tasksMappingNormalized.set(normalizeKey(key), entry as EntityMappingEntry);
    });

    const createdCustomerIds = new Set<number>();
    const createdProjectIds = new Set<number>();
    const createdTaskIds = new Set<number>();
    const createdFictitiousUserIds = new Set<number>();
    let allocationRowsCreated = 0;
    let vacationDaysCreated = 0;
    let vacationDaysSkipped = 0;
    let overAllocatedDaysAdjusted = 0;
    let skippedRows = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const createdResourceUsers = new Map<string, number>();

    const ensureFictitiousUser = async (resourceName: string): Promise<number> => {
      const resourceKey = normalizeKey(resourceName);
      const existingCreated = createdResourceUsers.get(resourceKey);
      if (existingCreated) return existingCreated;

      const existingLookup = userByLookup.get(resourceKey);
      if (existingLookup) return existingLookup;

      const [nameFirst, ...nameRest] = normalizeText(resourceName).split(' ').filter(Boolean);
      const firstName = nameFirst || 'Fictitious';
      const lastName = nameRest.join(' ') || 'User';

      const usernameBase = toUsernameBase(resourceName);
      let usernameCandidate = usernameBase;
      for (let attempt = 0; attempt < 50; attempt++) {
        const suffix = attempt === 0 ? '' : `.${attempt + 1}`;
        const candidate = `${usernameBase}${suffix}`;
        const [existingUser] = await connection.execute<RowDataPacket[]>(
          'SELECT Id FROM Users WHERE LOWER(Username) = LOWER(?)',
          [candidate]
        );
        if (existingUser.length === 0) {
          usernameCandidate = candidate;
          break;
        }
      }

      const emailCandidate = `${usernameCandidate}.${Date.now()}.${Math.floor(Math.random() * 100000)}@fictitious.local`;
      const passwordSeed = randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(passwordSeed, 10);

      const [insertUser] = await connection.execute<ResultSetHeader>(
        `INSERT INTO Users (
          Username, Email, PasswordHash, FirstName, LastName,
          IsActive, IsAdmin, UserType, IsDeveloper, IsSupport, IsManager
        ) VALUES (?, ?, ?, ?, ?, 1, 0, 'fictitious', 1, 0, 0)`,
        [usernameCandidate, emailCandidate, passwordHash, firstName, lastName]
      );

      const newUserId = insertUser.insertId;

      await connection.execute(
        `INSERT INTO OrganizationMembers (OrganizationId, UserId, Role)
         VALUES (?, ?, 'Member')`,
        [organizationId, newUserId]
      );

      const [createdUserRows] = await connection.execute<RowDataPacket[]>(
        `SELECT Id, Username, FirstName, LastName,
                WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
                WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday
         FROM Users
         WHERE Id = ?`,
        [newUserId]
      );

      const createdUserRow = createdUserRows[0] as RowDataPacket | undefined;
      if (createdUserRow) {
        userRowsById.set(newUserId, createdUserRow);

        const createdFullName = `${normalizeText(createdUserRow.FirstName)} ${normalizeText(createdUserRow.LastName)}`.trim();
        if (createdFullName) {
          userByLookup.set(normalizeKey(createdFullName), newUserId);
        }
        if (createdUserRow.Username) {
          userByLookup.set(normalizeKey(createdUserRow.Username), newUserId);
        }
      }

      userByLookup.set(resourceKey, newUserId);
      createdResourceUsers.set(resourceKey, newUserId);
      createdFictitiousUserIds.add(newUserId);
      return newUserId;
    };

    const ensureCustomer = async (sourceValue: string): Promise<number | null> => {
      const normalizedSource = normalizeKey(sourceValue);
      if (!normalizedSource) return null;

      const explicit = customersMapping[sourceValue] || customersMapping[normalizedSource];
      if (explicit?.mode === 'existing' && explicit.targetId) {
        return Number(explicit.targetId);
      }

      const existingId = customerByName.get(normalizedSource);
      if (existingId) return existingId;

      const [created] = await connection.execute<ResultSetHeader>(
        `INSERT INTO Customers (Name, IsActive, CreatedBy)
         VALUES (?, 1, ?)`,
        [sourceValue.trim(), userId]
      );

      const customerId = created.insertId;
      await connection.execute(
        `INSERT INTO CustomerOrganizations (CustomerId, OrganizationId)
         VALUES (?, ?)`,
        [customerId, organizationId]
      );

      customerByName.set(normalizedSource, customerId);
      createdCustomerIds.add(customerId);
      return customerId;
    };

    const ensureProject = async (sourceValue: string, customerId: number | null): Promise<number> => {
      const normalizedSource = normalizeKey(sourceValue);
      const explicit = projectsMapping[sourceValue] || projectsMapping[normalizedSource];
      if (explicit?.mode === 'ignore') {
        return -1;
      }
      if (explicit?.mode === 'existing' && explicit.targetId) {
        return Number(explicit.targetId);
      }

      const existingId = projectByName.get(normalizedSource);
      if (existingId) return existingId;

      const [created] = await connection.execute<ResultSetHeader>(
        `INSERT INTO Projects (ProjectName, OrganizationId, CreatedBy, Status, CustomerId)
         VALUES (?, ?, ?, ?, ?)`,
        [sourceValue.trim(), organizationId, userId, defaultProjectStatusId, customerId]
      );

      const projectId = created.insertId;
      projectByName.set(normalizedSource, projectId);
      projectCustomerById.set(projectId, customerId);
      createdProjectIds.add(projectId);
      return projectId;
    };

    const ensureTask = async (
      sourceTask: string,
      projectId: number,
      assignedTo: number | null,
      customerId: number | null,
      estimatedHours: number | null,
      comments: string,
      projectNameRaw: string,
      jiraIssueKey: string | null,
      explicitTaskMapping?: EntityMappingEntry,
      forceVacationFromRow?: boolean
    ): Promise<number> => {
      const normalizedTask = normalizeKey(sourceTask);
      const rawCompositeKey = `${normalizeText(projectNameRaw)}||${normalizeText(sourceTask)}`;
      const normalizedCompositeKey = `${normalizeKey(projectNameRaw)}||${normalizedTask}`;
      const explicit = explicitTaskMapping
        || tasksMapping[rawCompositeKey]
        || tasksMapping[normalizedCompositeKey]
        || tasksMapping[sourceTask]
        || tasksMapping[normalizedTask]
        || tasksMappingNormalized.get(normalizeKey(rawCompositeKey))
        || tasksMappingNormalized.get(normalizedCompositeKey)
        || tasksMappingNormalized.get(normalizedTask);

      if (explicit?.mode === 'vacation') {
        return -2;
      }
      if (forceVacationFromRow && !explicit) {
        return -2;
      }
      if (explicit?.mode === 'existing' && explicit.targetId) {
        const explicitTaskId = Number(explicit.targetId);
        const [taskRows] = await connection.execute<RowDataPacket[]>(
          `SELECT Id, ProjectId FROM Tasks WHERE Id = ?`,
          [explicitTaskId]
        );

        if (taskRows.length === 0) {
          throw new Error(`Mapped task Id ${explicitTaskId} was not found`);
        }

        const currentProjectId = Number(taskRows[0].ProjectId || 0);
        if (currentProjectId !== projectId) {
          await connection.execute(
            `UPDATE Tasks
             SET ProjectId = ?,
                 JiraIssueKey = CASE
                   WHEN ? IS NULL OR ? = '' THEN JiraIssueKey
                   ELSE ?
                 END
             WHERE Id = ?`,
            [projectId, jiraIssueKey, jiraIssueKey, jiraIssueKey, explicitTaskId]
          );
        } else if (jiraIssueKey) {
          await connection.execute(
            `UPDATE Tasks
             SET JiraIssueKey = ?
             WHERE Id = ?`,
            [jiraIssueKey, explicitTaskId]
          );
        }

        taskByProjectAndName.set(`${projectId}::${normalizedTask}`, explicitTaskId);
        if (jiraIssueKey) {
          taskByProjectAndTicketNumber.set(`${projectId}::${jiraIssueKey.toUpperCase()}`, explicitTaskId);
        }
        return explicitTaskId;
      }

      const existingId = taskByProjectAndName.get(`${projectId}::${normalizedTask}`);
      if (existingId) return existingId;

      const [created] = await connection.execute<ResultSetHeader>(
        `INSERT INTO Tasks (
          ProjectId, TaskName, Description, Status, Priority, TaskType, AssignedTo, CustomerId, EstimatedHours, JiraIssueKey, CreatedBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          sourceTask.trim(),
          comments || '',
          defaultTaskStatusId,
          defaultTaskPriorityId,
          defaultTaskTypeId,
          assignedTo,
          customerId,
          estimatedHours,
          jiraIssueKey || null,
          userId,
        ]
      );

      const taskId = created.insertId;
      taskByProjectAndName.set(`${projectId}::${normalizedTask}`, taskId);
      if (jiraIssueKey) {
        taskByProjectAndTicketNumber.set(`${projectId}::${jiraIssueKey.toUpperCase()}`, taskId);
      }
      createdTaskIds.add(taskId);
      return taskId;
    };

    for (let idx = 0; idx < payload.rows.length; idx++) {
      const row = payload.rows[idx] || {};
      const rowNumber = idx + 2;

      try {
        const customerName = normalizeText(row[fieldMapping.customer]);
        const projectName = normalizeText(row[fieldMapping.project]);
        const taskName = normalizeText(row[fieldMapping.task]);
        const rawTaskCompositeKey = `${projectName}||${taskName}`;
        const normalizedTaskCompositeKey = `${normalizeKey(projectName)}||${normalizeKey(taskName)}`;
        const ticketNumberFromMap = normalizeText(
          taskTicketNumbers[rawTaskCompositeKey]
          || taskTicketNumbers[normalizedTaskCompositeKey]
          || taskTicketNumbers[taskName]
          || taskTicketNumbers[normalizeKey(taskName)]
        );
        const ticketNumber = (ticketNumberFromMap || extractTicketKey(taskName) || '').toUpperCase();
        const resourceName = normalizeText(row[fieldMapping.resource]);
        const resourceIdFromCsv = fieldMapping.resourceId ? parseOptionalInt(row[fieldMapping.resourceId]) : null;
        const allocStart = toDateKey(row[fieldMapping.allocStart]);
        const allocEnd = toDateKey(row[fieldMapping.allocEnd]);
        const allocHours = normalizeToHalfHour(parseDecimal(row[fieldMapping.allocHours]));
        const projectIdFromCsv = fieldMapping.projectId ? parseOptionalInt(row[fieldMapping.projectId]) : null;
        const taskIdFromCsv = fieldMapping.taskId ? parseOptionalInt(row[fieldMapping.taskId]) : null;
        const estimatedHours = fieldMapping.hlEstimationHours
          ? parseOptionalDecimal(row[fieldMapping.hlEstimationHours])
          : null;
        const comments = fieldMapping.comments ? normalizeText(row[fieldMapping.comments]) : '';

        if (!projectName || !taskName || !resourceName || !allocStart || !allocEnd || allocHours <= 0) {
          errors.push({ row: rowNumber, message: 'Missing required values (project/task/resource/date/hours)' });
          continue;
        }

        const resourceMapEntry = resourcesMapping[resourceName] || resourcesMapping[normalizeKey(resourceName)];
        let userIdForAllocation: number | null = null;

        if (resourceIdFromCsv && resourceIdFromCsv > 0 && userRowsById.has(resourceIdFromCsv)) {
          userIdForAllocation = resourceIdFromCsv;
        }

        if (resourceMapEntry?.mode === 'fictional') {
          userIdForAllocation = await ensureFictitiousUser(resourceName);
        } else if (resourceMapEntry?.userId) {
          userIdForAllocation = Number(resourceMapEntry.userId);
        }

        if (!userIdForAllocation) {
          userIdForAllocation = userByLookup.get(normalizeKey(resourceName)) || null;
        }

        if (!userIdForAllocation) {
          userIdForAllocation = await ensureFictitiousUser(resourceName);
        }

        const customerId = await ensureCustomer(customerName);

        let projectId: number;
        if (projectIdFromCsv === -1) {
          projectId = -1;
        } else if (projectIdFromCsv && projectIdFromCsv > 0 && projectById.has(projectIdFromCsv)) {
          projectId = projectIdFromCsv;
        } else {
          projectId = await ensureProject(projectName, customerId);
        }

        if (projectId === -1) {
          skippedRows += 1;
          continue;
        }

        const rawEffectiveTaskCompositeKey = `${projectName}||${taskName}`;
        const normalizedEffectiveTaskCompositeKey = `${normalizeKey(projectName)}||${normalizeKey(taskName)}`;
        const taskMappingEntry = (tasksMapping[rawTaskCompositeKey]
          || tasksMapping[normalizedTaskCompositeKey]
          || tasksMapping[rawEffectiveTaskCompositeKey]
          || tasksMapping[normalizedEffectiveTaskCompositeKey]
          || tasksMapping[taskName]
          || tasksMapping[normalizeKey(taskName)]
          || tasksMappingNormalized.get(normalizeKey(rawTaskCompositeKey))
          || tasksMappingNormalized.get(normalizedTaskCompositeKey)
          || tasksMappingNormalized.get(normalizeKey(rawEffectiveTaskCompositeKey))
          || tasksMappingNormalized.get(normalizedEffectiveTaskCompositeKey)
          || tasksMappingNormalized.get(normalizeKey(taskName))) as EntityMappingEntry | undefined;

        const looksLikeVacationRow =
          isVacationLikeText(projectName)
          || isVacationLikeText(taskName)
          || isVacationLikeText(customerName);

        let taskId: number;
        if (taskIdFromCsv && taskIdFromCsv > 0) {
          const existingTaskByCsvId = taskById.get(taskIdFromCsv);
          if (!existingTaskByCsvId) {
            throw new Error(`Task ID ${taskIdFromCsv} not found in selected organization`);
          }
          taskId = taskIdFromCsv;
        } else if (ticketNumber) {
          const mappedByTicket = taskByProjectAndTicketNumber.get(`${projectId}::${ticketNumber}`);
          if (mappedByTicket) {
            taskId = mappedByTicket;
          } else {
            taskId = await ensureTask(
              taskName,
              projectId,
              userIdForAllocation,
              customerId,
              estimatedHours,
              comments,
              projectName,
              ticketNumber || null,
              taskMappingEntry,
              looksLikeVacationRow
            );
          }
        } else {
          taskId = await ensureTask(
            taskName,
            projectId,
            userIdForAllocation,
            customerId,
            estimatedHours,
            comments,
            projectName,
            ticketNumber || null,
            taskMappingEntry,
            looksLikeVacationRow
          );
        }

        if (ticketNumber) {
          await connection.execute(
            `UPDATE Tasks
             SET JiraIssueKey = ?
             WHERE Id = ?`,
            [ticketNumber, taskId]
          );
          taskByProjectAndTicketNumber.set(`${projectId}::${ticketNumber.toUpperCase()}`, taskId);
        }

        if (taskId === -2) {
          const vacationDates = filterWorkingDatesForUser(
            listDateKeysInclusive(allocStart, allocEnd),
            userRowsById.get(Number(userIdForAllocation))
          );

          for (const vacationDate of vacationDates) {
            const [existingVacation] = await connection.execute<RowDataPacket[]>(
              `SELECT Id
               FROM UserVacations
               WHERE UserId = ?
                 AND VacationDate = ?
                 AND LOWER(Status) IN ('pending', 'approved')`,
              [userIdForAllocation, vacationDate]
            );

            if (existingVacation.length > 0) {
              vacationDaysSkipped += 1;
              continue;
            }

            const importNotes = comments || `Imported from planner: ${taskName}`;
            await connection.execute(
              `INSERT INTO UserVacations (UserId, VacationDate, Status, Notes, RequestedBy, ApprovedBy, ApprovedAt)
               VALUES (?, ?, 'approved', ?, ?, ?, CURRENT_TIMESTAMP)`,
              [userIdForAllocation, vacationDate, importNotes, userId, userId]
            );
            vacationDaysCreated += 1;
          }

          continue;
        }

        const isExistingTask = !createdTaskIds.has(taskId);
        if (isExistingTask) {
          if (estimatedHours !== null) {
            await connection.execute(
              `UPDATE Tasks
               SET AssignedTo = ?,
                   EstimatedHours = ?,
                   JiraIssueKey = CASE
                     WHEN ? IS NULL OR ? = '' THEN JiraIssueKey
                     ELSE ?
                   END
               WHERE Id = ?`,
              [userIdForAllocation, estimatedHours, ticketNumber || null, ticketNumber || null, ticketNumber || null, taskId]
            );
          } else {
            await connection.execute(
              `UPDATE Tasks
               SET AssignedTo = ?,
                   JiraIssueKey = CASE
                     WHEN ? IS NULL OR ? = '' THEN JiraIssueKey
                     ELSE ?
                   END
               WHERE Id = ?`,
              [userIdForAllocation, ticketNumber || null, ticketNumber || null, ticketNumber || null, taskId]
            );
          }

          await connection.execute(
            `DELETE FROM TaskAllocations
             WHERE TaskId = ?
               AND AllocationDate BETWEEN ? AND ?
               AND UserId <> ?`,
            [taskId, allocStart, allocEnd, userIdForAllocation]
          );
        }

        const allocationDates = listDateKeysInclusive(allocStart, allocEnd);
        const splitAllocations = splitHoursAcrossDates(allocHours, allocationDates);
        const userRow = userRowsById.get(Number(userIdForAllocation));
        const allocationHeaderId = splitAllocations.length > 0
          ? await ensureImportAllocationHeader(connection, taskId, userIdForAllocation, userId, allocHours, allocStart, allocEnd)
          : null;

        for (const allocation of splitAllocations) {
          if (allocation.hours <= 0) continue;

          const [existingDirectAllocations] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(AllocatedHours), 0) AS TotalHours
             FROM TaskAllocations
             WHERE UserId = ?
               AND AllocationDate = ?
               AND TaskId <> ?`,
            [userIdForAllocation, allocation.dateKey, taskId]
          );

          const [existingChildAllocations] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(AllocatedHours), 0) AS TotalHours
             FROM TaskChildAllocations
             WHERE AllocationDate = ?
               AND EXISTS (
                 SELECT 1
                 FROM TaskAllocations ta
                 WHERE ta.TaskId = TaskChildAllocations.ParentTaskId
                   AND ta.UserId = ?
                   AND ta.AllocationDate = TaskChildAllocations.AllocationDate
               )`,
            [allocation.dateKey, userIdForAllocation]
          );

          const directAllocated = parseDecimal(existingDirectAllocations[0]?.TotalHours || 0);
          const childAllocated = parseDecimal(existingChildAllocations[0]?.TotalHours || 0);
          const userCapacity = getUserCapacityForDate(allocation.dateKey, userRow);
          const remainingCapacity = Math.max(0, userCapacity - directAllocated - childAllocated);
          const cappedHours = normalizeToHalfHour(Math.min(allocation.hours, remainingCapacity));

          if (cappedHours < allocation.hours) {
            overAllocatedDaysAdjusted += 1;
          }

          const [existingAllocation] = await connection.execute<RowDataPacket[]>(
            `SELECT Id, AllocatedHours, TaskAllocationHeaderId
             FROM TaskAllocations
             WHERE TaskId = ? AND UserId = ? AND AllocationDate = ?`,
            [taskId, userIdForAllocation, allocation.dateKey]
          );

          if (cappedHours <= 0) {
            if (existingAllocation.length > 0) {
              await connection.execute(
                `DELETE FROM TaskAllocations
                 WHERE Id = ?`,
                [existingAllocation[0].Id]
              );
            }
            continue;
          }

          if (existingAllocation.length > 0) {
            await connection.execute(
              `UPDATE TaskAllocations
               SET AllocatedHours = ?,
                   TaskAllocationHeaderId = COALESCE(TaskAllocationHeaderId, ?)
               WHERE Id = ?`,
              [cappedHours, allocationHeaderId, existingAllocation[0].Id]
            );
          } else {
            await connection.execute(
              `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, IsManual)
               VALUES (?, ?, ?, ?, ?, 1)`,
              [taskId, allocationHeaderId, userIdForAllocation, allocation.dateKey, cappedHours]
            );
            allocationRowsCreated += 1;
          }
        }

        if (allocationHeaderId) {
          await recomputeImportAllocationHeader(connection, allocationHeaderId);
        }

        await connection.execute(
          `UPDATE Tasks
           SET PlannedStartDate = CASE
                 WHEN PlannedStartDate IS NULL THEN ?
                 WHEN PlannedStartDate > ? THEN ?
                 ELSE PlannedStartDate
               END,
               PlannedEndDate = CASE
                 WHEN PlannedEndDate IS NULL THEN ?
                 WHEN PlannedEndDate < ? THEN ?
                 ELSE PlannedEndDate
               END
           WHERE Id = ?`,
          [allocStart, allocStart, allocStart, allocEnd, allocEnd, allocEnd, taskId]
        );
      } catch (rowError: any) {
        errors.push({ row: rowNumber, message: rowError?.message || 'Failed to process row' });
      }
    }

    await connection.commit();

    res.json({
      success: true,
      data: {
        createdCustomers: createdCustomerIds.size,
        createdProjects: createdProjectIds.size,
        createdTasks: createdTaskIds.size,
        createdFictitiousUsers: createdFictitiousUserIds.size,
        createdAllocations: allocationRowsCreated,
        overAllocatedDaysAdjusted,
        createdVacationDays: vacationDaysCreated,
        skippedVacationDays: vacationDaysSkipped,
        skippedRows,
        errors,
        totalRows: payload.rows.length,
      },
    });
  } catch (error: any) {
    await connection.rollback();
    logger.error('Planning import execution error:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to import planning CSV',
    });
  } finally {
    connection.release();
  }
});

export default router;
