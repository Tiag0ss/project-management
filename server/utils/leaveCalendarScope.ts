import { pool, RowDataPacket } from '../config/database';

const parseUserIds = (rawUserIds: string): number[] => {
  return Array.from(
    new Set(
      rawUserIds
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
};

export async function userCanViewOthersLeaveCalendar(userId: number, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) {
    return true;
  }

  const [userRows] = await pool.execute<RowDataPacket[]>(
    'SELECT IsDeveloper, IsSupport, IsManager, isAdmin FROM Users WHERE Id = ?',
    [userId],
  );

  if (!userRows.length) {
    return false;
  }

  const user = userRows[0];
  if (Number(user.isAdmin) === 1) {
    return true;
  }

  const roles: string[] = [];
  if (Number(user.IsDeveloper) === 1) roles.push('Developer');
  if (Number(user.IsSupport) === 1) roles.push('Support');
  if (Number(user.IsManager) === 1) roles.push('Manager');

  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const [rolePermissions] = await pool.execute<RowDataPacket[]>(
      `SELECT CanViewOthersPlanning FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles,
    );

    if (rolePermissions.some((perm) => Number(perm.CanViewOthersPlanning) === 1)) {
      return true;
    }
  }

  const [groupPermissions] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.CanViewOthersPlanning
     FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ?`,
    [userId],
  );

  return groupPermissions.some((perm) => Number(perm.CanViewOthersPlanning) === 1);
}

export async function resolveLeaveCalendarUserIds(
  currentUserId: number,
  isAdmin: boolean,
  requestedUserIdsRaw: string,
): Promise<number[]> {
  const uniqueRequestedUserIds = parseUserIds(requestedUserIdsRaw);

  const [subordinateRows] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM Users WHERE TeamLeaderId = ? AND IsActive = 1',
    [currentUserId],
  );
  const subordinateIds = subordinateRows.map((row) => Number(row.Id));
  const allowedUserIds = new Set<number>([currentUserId, ...subordinateIds]);

  const canViewTeamLeave = await userCanViewOthersLeaveCalendar(currentUserId, isAdmin);

  const effectiveUserIds = (canViewTeamLeave
    ? (uniqueRequestedUserIds.length > 0 ? uniqueRequestedUserIds : [currentUserId])
    : (uniqueRequestedUserIds.length > 0
      ? uniqueRequestedUserIds.filter((id) => allowedUserIds.has(id))
      : [currentUserId, ...subordinateIds]))
    .filter((id) => Number.isInteger(id) && id > 0);

  return Array.from(new Set(effectiveUserIds));
}
