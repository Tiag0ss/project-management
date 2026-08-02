import { pool, RowDataPacket } from '../config/database';
import {
  TASK_FIELD_VISIBILITY_SETTING_KEY,
  createDefaultTaskFieldVisibility,
  normalizeTaskFieldVisibility,
  serializeTaskFieldVisibility,
  TaskFieldVisibilityConfig,
} from './taskFieldVisibility';

export type TaskFieldVisibilitySource = 'user' | 'organization' | 'global';

export interface ResolvedTaskFieldVisibility {
  config: TaskFieldVisibilityConfig;
  source: TaskFieldVisibilitySource;
  hasUserOverride: boolean;
}

async function loadGlobalVisibility(): Promise<TaskFieldVisibilityConfig> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
    [TASK_FIELD_VISIBILITY_SETTING_KEY]
  );
  if (rows.length === 0) {
    return createDefaultTaskFieldVisibility();
  }
  return normalizeTaskFieldVisibility(rows[0].SettingValue);
}

async function loadOrgVisibilityIfPresent(orgId: number): Promise<TaskFieldVisibilityConfig | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT VisibilityJson FROM OrganizationTaskFieldVisibility WHERE OrganizationId = ?',
    [orgId]
  );
  if (rows.length === 0) {
    return null;
  }
  return normalizeTaskFieldVisibility(rows[0].VisibilityJson);
}

async function loadUserVisibilityIfPresent(
  userId: number,
  orgId: number
): Promise<TaskFieldVisibilityConfig | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT VisibilityJson FROM UserTaskFieldVisibility WHERE UserId = ? AND OrganizationId = ?',
    [userId, orgId]
  );
  if (rows.length === 0) {
    return null;
  }
  return normalizeTaskFieldVisibility(rows[0].VisibilityJson);
}

export async function seedOrgTaskFieldVisibility(orgId: number): Promise<TaskFieldVisibilityConfig> {
  const config = await loadGlobalVisibility();
  const value = serializeTaskFieldVisibility(config);
  await pool.execute(
    `INSERT INTO OrganizationTaskFieldVisibility (OrganizationId, VisibilityJson)
     VALUES (?, ?)`,
    [orgId, value]
  );
  return config;
}

export async function ensureOrgTaskFieldVisibility(orgId: number): Promise<TaskFieldVisibilityConfig> {
  const existing = await loadOrgVisibilityIfPresent(orgId);
  if (existing) {
    return existing;
  }
  return seedOrgTaskFieldVisibility(orgId);
}

/** Resolve visibility: user override → organization → global. */
export async function resolveEffectiveTaskFieldVisibility(
  userId: number,
  orgId: number
): Promise<ResolvedTaskFieldVisibility> {
  const userConfig = await loadUserVisibilityIfPresent(userId, orgId);
  if (userConfig) {
    return { config: userConfig, source: 'user', hasUserOverride: true };
  }

  const orgConfig = await loadOrgVisibilityIfPresent(orgId);
  if (orgConfig) {
    return { config: orgConfig, source: 'organization', hasUserOverride: false };
  }

  const globalConfig = await loadGlobalVisibility();
  return { config: globalConfig, source: 'global', hasUserOverride: false };
}

export async function saveUserTaskFieldVisibility(
  userId: number,
  orgId: number,
  config: TaskFieldVisibilityConfig
): Promise<TaskFieldVisibilityConfig> {
  const normalized = normalizeTaskFieldVisibility(config);
  const value = serializeTaskFieldVisibility(normalized);
  const [existing] = await pool.execute<RowDataPacket[]>(
    'SELECT UserId FROM UserTaskFieldVisibility WHERE UserId = ? AND OrganizationId = ?',
    [userId, orgId]
  );
  if (existing.length === 0) {
    await pool.execute(
      'INSERT INTO UserTaskFieldVisibility (UserId, OrganizationId, VisibilityJson) VALUES (?, ?, ?)',
      [userId, orgId, value]
    );
  } else {
    await pool.execute(
      'UPDATE UserTaskFieldVisibility SET VisibilityJson = ? WHERE UserId = ? AND OrganizationId = ?',
      [value, userId, orgId]
    );
  }
  return normalized;
}

export async function clearUserTaskFieldVisibility(userId: number, orgId: number): Promise<void> {
  await pool.execute(
    'DELETE FROM UserTaskFieldVisibility WHERE UserId = ? AND OrganizationId = ?',
    [userId, orgId]
  );
}

export { loadGlobalVisibility };
