import { pool, RowDataPacket } from '../config/database';
import { decrypt } from './encryption';

export type VcsIntegrationType = 'github' | 'gitea' | 'bitbucket';

const TABLE_BY_TYPE: Record<VcsIntegrationType, string> = {
  github: 'OrganizationGitHubIntegrations',
  gitea: 'OrganizationGiteaIntegrations',
  bitbucket: 'OrganizationBitbucketIntegrations',
};

/**
 * Resolve a VCS integration row for an org.
 * Prefer explicit id, then IsDefault=1, then first enabled, then any row.
 */
export async function resolveVcsIntegration(
  type: VcsIntegrationType,
  organizationId: number,
  integrationId?: number | null
): Promise<RowDataPacket | null> {
  const table = TABLE_BY_TYPE[type];

  if (integrationId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM ${table} WHERE Id = ? AND OrganizationId = ?`,
      [integrationId, organizationId]
    );
    return rows[0] || null;
  }

  const [defaults] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM ${table}
     WHERE OrganizationId = ? AND IsDefault = 1
     ORDER BY Id ASC`,
    [organizationId]
  );
  if (defaults[0]) return defaults[0];

  const [enabled] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM ${table}
     WHERE OrganizationId = ? AND IsEnabled = 1
     ORDER BY Id ASC`,
    [organizationId]
  );
  if (enabled[0]) return enabled[0];

  const [any] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM ${table} WHERE OrganizationId = ? ORDER BY Id ASC`,
    [organizationId]
  );
  return any[0] || null;
}

export function decryptTokenField(encrypted: string | null | undefined): string {
  if (!encrypted) return '';
  return decrypt(encrypted);
}

/** Clear IsDefault on other rows when setting a new default. */
export async function clearOtherVcsDefaults(
  type: VcsIntegrationType,
  organizationId: number,
  exceptId?: number
): Promise<void> {
  const table = TABLE_BY_TYPE[type];
  if (exceptId) {
    await pool.execute(
      `UPDATE ${table} SET IsDefault = 0 WHERE OrganizationId = ? AND Id <> ?`,
      [organizationId, exceptId]
    );
  } else {
    await pool.execute(`UPDATE ${table} SET IsDefault = 0 WHERE OrganizationId = ?`, [organizationId]);
  }
}

export async function nullApplicationFksForIntegration(
  type: VcsIntegrationType,
  integrationId: number
): Promise<void> {
  const col =
    type === 'github'
      ? 'GitHubIntegrationId'
      : type === 'gitea'
        ? 'GiteaIntegrationId'
        : 'BitbucketIntegrationId';
  await pool.execute(`UPDATE Applications SET ${col} = NULL WHERE ${col} = ?`, [integrationId]);
}
