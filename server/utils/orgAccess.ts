import { pool, RowDataPacket } from '../config/database';

/**
 * Read access to org ticket catalogs (statuses/priorities).
 * Internal users: OrganizationMembers. Customer users: CustomerOrganizations.
 */
export async function canReadOrgTicketCatalog(
  orgId: number,
  userId: number | undefined,
  customerId: number | null | undefined
): Promise<boolean> {
  if (!Number.isFinite(orgId) || orgId <= 0) return false;

  if (customerId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 as ok
       FROM CustomerOrganizations
       WHERE CustomerId = ? AND OrganizationId = ?
       LIMIT 1`,
      [customerId, orgId]
    );
    return rows.length > 0;
  }

  if (!userId) return false;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 as ok
     FROM OrganizationMembers
     WHERE OrganizationId = ? AND UserId = ?
     LIMIT 1`,
    [orgId, userId]
  );
  return rows.length > 0;
}
