import { pool } from '../config/database';
import logger from './logger';

type HistoryEntity = 'organization' | 'customer' | 'project' | 'user' | 'task' | 'ticket';

interface ResolvedHistoryValues {
  oldValue: string | null;
  newValue: string | null;
}

const lookupCache = new Map<string, string>();

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const asString = String(value).trim();
  return asString === '' ? null : asString;
};

const toNullableId = (value: unknown): number | null => {
  const normalized = toNullableString(value);
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;
  const asNumber = Number(normalized);
  return Number.isInteger(asNumber) && asNumber > 0 ? asNumber : null;
};

const toIdList = (value: unknown): number[] => {
  const normalized = toNullableString(value);
  if (!normalized) return [];
  return normalized
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
};

const normalizeBooleanText = (value: unknown): string | null => {
  const normalized = toNullableString(value)?.toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return 'Yes';
  if (['0', 'false', 'no', 'off'].includes(normalized)) return 'No';
  return null;
};

const formatDateValue = (value: unknown): string | null => {
  const normalized = toNullableString(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : normalized;
};

const getCachedLookup = async (
  cachePrefix: string,
  id: number,
  loader: () => Promise<string | null>
): Promise<string | null> => {
  const cacheKey = `${cachePrefix}:${id}`;
  if (lookupCache.has(cacheKey)) {
    return lookupCache.get(cacheKey)!;
  }
  const value = await loader();
  if (value) {
    lookupCache.set(cacheKey, value);
  }
  return value;
};

const lookupUser = async (id: number): Promise<string | null> => {
  return getCachedLookup('user', id, async () => {
    const [rows] = await pool.execute<any[]>(
      `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', FirstName, LastName)), ''), Username, CONCAT('User #', Id)) as DisplayName
       FROM Users WHERE Id = ?`,
      [id]
    );
    return rows.length > 0 ? String(rows[0].DisplayName) : null;
  });
};

const lookupOrganization = async (id: number): Promise<string | null> => {
  return getCachedLookup('organization', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT Name FROM Organizations WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].Name) : null;
  });
};

const lookupCustomer = async (id: number): Promise<string | null> => {
  return getCachedLookup('customer', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT Name FROM Customers WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].Name) : null;
  });
};

const lookupProject = async (id: number): Promise<string | null> => {
  return getCachedLookup('project', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT ProjectName FROM Projects WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].ProjectName) : null;
  });
};

const lookupTask = async (id: number): Promise<string | null> => {
  return getCachedLookup('task', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT TaskName FROM Tasks WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].TaskName) : null;
  });
};

const lookupApplication = async (id: number): Promise<string | null> => {
  return getCachedLookup('application', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT Name FROM Applications WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].Name) : null;
  });
};

const lookupApplications = async (ids: number[]): Promise<string[]> => {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];

  const placeholders = uniqueIds.map(() => '?').join(',');
  const [rows] = await pool.execute<any[]>(
    `SELECT Id, Name FROM Applications WHERE Id IN (${placeholders})`,
    uniqueIds
  );

  const nameById = new Map<number, string>();
  for (const row of rows) {
    nameById.set(Number(row.Id), String(row.Name));
  }

  return uniqueIds.map((id) => nameById.get(id) || String(id));
};

const lookupReleaseVersion = async (id: number): Promise<string | null> => {
  return getCachedLookup('releaseVersion', id, async () => {
    const [rows] = await pool.execute<any[]>(
      `SELECT av.VersionNumber, av.VersionName, a.Name as ApplicationName
       FROM ApplicationVersions av
       LEFT JOIN Applications a ON av.ApplicationId = a.Id
       WHERE av.Id = ?`,
      [id]
    );

    if (rows.length === 0) return null;
    const application = rows[0].ApplicationName ? String(rows[0].ApplicationName) : 'Application';
    const versionNumber = rows[0].VersionNumber ? String(rows[0].VersionNumber) : `#${id}`;
    const versionName = rows[0].VersionName ? ` (${String(rows[0].VersionName)})` : '';
    return `${application} - ${versionNumber}${versionName}`;
  });
};

const lookupProjectStatus = async (id: number): Promise<string | null> => {
  return getCachedLookup('projectStatus', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT StatusName FROM ProjectStatusValues WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].StatusName) : null;
  });
};

const lookupTaskStatus = async (id: number): Promise<string | null> => {
  return getCachedLookup('taskStatus', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT StatusName FROM TaskStatusValues WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].StatusName) : null;
  });
};

const lookupTaskPriority = async (id: number): Promise<string | null> => {
  return getCachedLookup('taskPriority', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT PriorityName FROM TaskPriorityValues WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].PriorityName) : null;
  });
};

const lookupTaskType = async (id: number): Promise<string | null> => {
  return getCachedLookup('taskType', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT TypeName FROM TaskTypeValues WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].TypeName) : null;
  });
};

const lookupTicketStatus = async (id: number): Promise<string | null> => {
  return getCachedLookup('ticketStatus', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT StatusName FROM TicketStatusValues WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].StatusName) : null;
  });
};

const lookupTicketPriority = async (id: number): Promise<string | null> => {
  return getCachedLookup('ticketPriority', id, async () => {
    const [rows] = await pool.execute<any[]>(
      'SELECT PriorityName FROM TicketPriorityValues WHERE Id = ?',
      [id]
    );
    return rows.length > 0 ? String(rows[0].PriorityName) : null;
  });
};

const resolveFieldValue = async (
  entity: HistoryEntity,
  fieldName: string | null,
  value: unknown
): Promise<string | null> => {
  const field = (fieldName || '').trim();
  if (!field) {
    return toNullableString(value);
  }

  const booleanFields = new Set([
    'IsActive',
    'IsHobby',
    'IsVisibleToCustomer',
    'DueDateMandatory',
    'HideIntegratedJiraTicketsByDefault',
    'IsEnabled'
  ]);

  const dateFields = new Set([
    'StartDate',
    'EndDate',
    'DueDate',
    'PlannedStartDate',
    'PlannedEndDate',
    'ScheduledDate',
    'ReleaseDate',
    'BaselineStartDate',
    'BaselineEndDate'
  ]);

  const idListFields = new Set([
    'applications',
    'ApplicationIds',
    'OrganizationIds'
  ]);

  if (booleanFields.has(field)) {
    return normalizeBooleanText(value) ?? toNullableString(value);
  }

  if (dateFields.has(field)) {
    return formatDateValue(value);
  }

  if (idListFields.has(field)) {
    const ids = toIdList(value);
    if (ids.length === 0) return null;

    if (field === 'applications' || field === 'ApplicationIds') {
      const names = await lookupApplications(ids);
      return names.join(', ');
    }

    if (field === 'OrganizationIds') {
      const resolvedNames: string[] = [];
      for (const id of ids) {
        resolvedNames.push((await lookupOrganization(id)) ?? String(id));
      }
      return resolvedNames.join(', ');
    }
  }

  const id = toNullableId(value);
  if (id === null) {
    return toNullableString(value);
  }

  if (field === 'Status') {
    if (entity === 'project') {
      return (await lookupProjectStatus(id)) ?? String(id);
    }
    if (entity === 'task') {
      return (await lookupTaskStatus(id)) ?? String(id);
    }
    if (entity === 'ticket') {
      return (await lookupTicketStatus(id)) ?? String(id);
    }
  }

  if (field === 'Priority') {
    if (entity === 'task') {
      return (await lookupTaskPriority(id)) ?? String(id);
    }
    if (entity === 'ticket') {
      return (await lookupTicketPriority(id)) ?? String(id);
    }
  }

  if (field === 'TaskType') {
    return (await lookupTaskType(id)) ?? String(id);
  }

  switch (field) {
    case 'Assignees':
    case 'AssignedTo':
    case 'AssignedToUserId':
    case 'ProjectManagerId':
    case 'DefaultSupportUserId':
    case 'DeveloperUserId':
    case 'CreatedByUserId':
    case 'UserId':
      return (await lookupUser(id)) ?? String(id);
    case 'OrganizationId':
      return (await lookupOrganization(id)) ?? String(id);
    case 'CustomerId':
      return (await lookupCustomer(id)) ?? String(id);
    case 'ProjectId':
      return (await lookupProject(id)) ?? String(id);
    case 'ParentTaskId':
    case 'DependsOnTaskId':
    case 'TaskId':
      return (await lookupTask(id)) ?? String(id);
    case 'ApplicationId':
      return (await lookupApplication(id)) ?? String(id);
    case 'ReleaseVersionId':
      return (await lookupReleaseVersion(id)) ?? String(id);
    default:
      return String(id);
  }
};

export async function resolveHistoryValues(
  entity: HistoryEntity,
  fieldName: string | null,
  oldValue: unknown,
  newValue: unknown
): Promise<ResolvedHistoryValues> {
  return {
    oldValue: await resolveFieldValue(entity, fieldName, oldValue),
    newValue: await resolveFieldValue(entity, fieldName, newValue)
  };
}

/**
 * Log a change in organization data
 */
export async function logOrganizationHistory(
  organizationId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    const resolved = await resolveHistoryValues('organization', fieldName, oldValue, newValue);
    await pool.execute(
      `INSERT INTO OrganizationHistory (OrganizationId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [organizationId, changedBy, changeType, fieldName, resolved.oldValue, resolved.newValue]
    );
  } catch (error) {
    logger.error('Error logging organization history:', error);
  }
}

/**
 * Log a change in customer data
 */
export async function logCustomerHistory(
  customerId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    const resolved = await resolveHistoryValues('customer', fieldName, oldValue, newValue);
    await pool.execute(
      `INSERT INTO CustomerHistory (CustomerId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customerId, changedBy, changeType, fieldName, resolved.oldValue, resolved.newValue]
    );
  } catch (error) {
    logger.error('Error logging customer history:', error);
  }
}

/**
 * Log a change in project data
 */
export async function logProjectHistory(
  projectId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    const resolved = await resolveHistoryValues('project', fieldName, oldValue, newValue);
    await pool.execute(
      `INSERT INTO ProjectHistory (ProjectId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectId, changedBy, changeType, fieldName, resolved.oldValue, resolved.newValue]
    );
  } catch (error) {
    logger.error('Error logging project history:', error);
  }
}

/**
 * Log a change in user data
 */
export async function logUserHistory(
  userId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    const resolved = await resolveHistoryValues('user', fieldName, oldValue, newValue);
    await pool.execute(
      `INSERT INTO UserHistory (UserId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, changedBy, changeType, fieldName, resolved.oldValue, resolved.newValue]
    );
  } catch (error) {
    logger.error('Error logging user history:', error);
  }
}
