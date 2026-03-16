import { dbProvider, pool, RowDataPacket } from '../config/database';

type SupportedProvider = 'mysql' | 'mssql';

const VIEW_NAMES = [
  'vAI_ProjectOpenTasks',
  'vAI_UserOpenTasks',
  'vAI_UserWorkloadBase',
  'vAI_UserAllocations',
] as const;

const AUTO_CREATE_KEY = 'aiViewsAutoCreate';

const getSettingKeyForView = (viewName: string): string => `aiViewSql_${viewName}`;

const getDefaultSelectBody = (provider: SupportedProvider, viewName: string): string => {
  switch (viewName) {
    case 'vAI_ProjectOpenTasks':
      return `
SELECT
  p.OrganizationId,
  p.Id AS ProjectId,
  p.ProjectName,
  t.Id AS TaskId,
  t.TaskName,
  t.AssignedTo AS UserId,
  t.DueDate,
  COALESCE(tsv.StatusName, '(No Status)') AS StatusName,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  ta.AllocationDate,
  COALESCE(ta.AllocatedHours, 0) AS AllocatedHours
FROM Tasks t
INNER JOIN Projects p ON t.ProjectId = p.Id
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TaskAllocations ta ON ta.TaskId = t.Id`;
    case 'vAI_UserOpenTasks':
      return `
SELECT
  p.OrganizationId,
  t.AssignedTo AS UserId,
  t.Id AS TaskId,
  t.TaskName,
  p.ProjectName,
  t.DueDate,
  COALESCE(tsv.StatusName, '(No Status)') AS StatusName,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  ta.AllocationDate,
  COALESCE(ta.AllocatedHours, 0) AS AllocatedHours
FROM Tasks t
INNER JOIN Projects p ON t.ProjectId = p.Id
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TaskAllocations ta ON ta.TaskId = t.Id
WHERE t.AssignedTo IS NOT NULL`;
    case 'vAI_UserWorkloadBase':
      return `
SELECT
  om.OrganizationId,
  u.Id AS UserId,
  u.Username,
  u.FirstName,
  u.LastName,
  u.IsActive,
  u.IsManager,
  u.IsDeveloper,
  u.IsSupport,
  t.Id AS TaskId,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  te.WorkDate,
  COALESCE(te.Hours, 0) AS WorkedHours
FROM Users u
INNER JOIN OrganizationMembers om ON om.UserId = u.Id
LEFT JOIN Tasks t ON t.AssignedTo = u.Id
LEFT JOIN Projects p ON t.ProjectId = p.Id AND p.OrganizationId = om.OrganizationId
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TimeEntries te ON te.UserId = u.Id AND te.TaskId = t.Id`;
    case 'vAI_UserAllocations':
      return `
SELECT
  p.OrganizationId,
  ta.UserId,
  ta.TaskId,
  t.TaskName,
  p.ProjectName,
  ta.AllocationDate,
  COALESCE(ta.AllocatedHours, 0) AS AllocatedHours
FROM TaskAllocations ta
INNER JOIN Tasks t ON ta.TaskId = t.Id
INNER JOIN Projects p ON t.ProjectId = p.Id`;
    default:
      return provider === 'mysql' ? 'SELECT 1 AS Value' : 'SELECT CAST(1 AS int) AS Value';
  }
};

const normalizeViewSql = (provider: SupportedProvider, viewName: string, sqlOrBody: string): string => {
  const source = String(sqlOrBody || '').trim();
  if (!source) {
    return provider === 'mysql'
      ? `CREATE OR REPLACE VIEW ${viewName} AS ${getDefaultSelectBody(provider, viewName)}`
      : `CREATE OR ALTER VIEW ${viewName} AS ${getDefaultSelectBody(provider, viewName)}`;
  }

  const hasCreateOrAlter = /^\s*CREATE\s+(OR\s+REPLACE\s+|OR\s+ALTER\s+)?VIEW\s+/i.test(source)
    || /^\s*ALTER\s+VIEW\s+/i.test(source);

  if (hasCreateOrAlter) {
    return source;
  }

  return provider === 'mysql'
    ? `CREATE OR REPLACE VIEW ${viewName} AS ${source}`
    : `CREATE OR ALTER VIEW ${viewName} AS ${source}`;
};

export const ensureAiAssistantViews = async () => {
  const provider = dbProvider as SupportedProvider;
  const settingKeys = [AUTO_CREATE_KEY, ...VIEW_NAMES.map((name) => getSettingKeyForView(name))];
  const placeholders = settingKeys.map(() => '?').join(',');

  const [settingsRows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN (${placeholders})`,
    [...settingKeys]
  );

  const settingsMap: Record<string, string> = {};
  settingsRows.forEach((row: any) => {
    settingsMap[String(row.SettingKey)] = String(row.SettingValue || '');
  });

  if (!Object.prototype.hasOwnProperty.call(settingsMap, AUTO_CREATE_KEY)) {
    await pool.execute('INSERT INTO SystemSettings (SettingKey, SettingValue) VALUES (?, ?)', [AUTO_CREATE_KEY, 'true']);
    settingsMap[AUTO_CREATE_KEY] = 'true';
  }

  const autoCreate = String(settingsMap[AUTO_CREATE_KEY] || 'true').toLowerCase() === 'true';
  if (!autoCreate) {
    return { success: true, autoCreate: false, synced: 0, customUsed: 0 };
  }

  let synced = 0;
  let customUsed = 0;

  for (const viewName of VIEW_NAMES) {
    const key = getSettingKeyForView(viewName);
    const existing = String(settingsMap[key] || '').trim();
    const baseSelectBody = getDefaultSelectBody(provider, viewName);

    if (!existing) {
      await pool.execute('INSERT INTO SystemSettings (SettingKey, SettingValue) VALUES (?, ?)', [key, baseSelectBody]);
      settingsMap[key] = baseSelectBody;
    }

    const finalSql = normalizeViewSql(provider, viewName, settingsMap[key]);
    if (String(settingsMap[key] || '').trim()) {
      customUsed += 1;
    }
    await pool.execute(finalSql);
    synced += 1;
  }

  return { success: true, autoCreate: true, synced, customUsed };
};
