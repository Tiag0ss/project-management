import { pool } from '../../server/config/database';
import {
  resolveLeaveCalendarUserIds,
  userCanViewOthersLeaveCalendar,
} from '../../server/utils/leaveCalendarScope';

jest.mock('../../server/config/database', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const mockExecute = pool.execute as jest.Mock;

describe('leaveCalendarScope', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('allows requested colleagues when user has CanViewOthersPlanning via role', async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM Users WHERE Id = ?')) {
        return [[{ IsDeveloper: 1, IsSupport: 0, IsManager: 0, isAdmin: 0 }], []];
      }
      if (sql.includes('FROM RolePermissions')) {
        return [[{ CanViewOthersPlanning: 1 }], []];
      }
      if (sql.includes('FROM PermissionGroups')) {
        return [[], []];
      }
      if (sql.includes('TeamLeaderId')) {
        return [[], []];
      }
      return [[], []];
    });

    const canViewOthers = await userCanViewOthersLeaveCalendar(5, false);
    expect(canViewOthers).toBe(true);

    const userIds = await resolveLeaveCalendarUserIds(5, false, '5,9,12');
    expect(userIds).toEqual([5, 9, 12]);
  });

  it('restricts non-planning viewers to self and subordinates', async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('TeamLeaderId')) {
        return [[{ Id: 7 }], []];
      }
      if (sql.includes('FROM Users WHERE Id = ?')) {
        return [[{ IsDeveloper: 1, IsSupport: 0, IsManager: 0, isAdmin: 0 }], []];
      }
      if (sql.includes('FROM RolePermissions')) {
        return [[{ CanViewOthersPlanning: 0 }], []];
      }
      if (sql.includes('FROM PermissionGroups')) {
        return [[], []];
      }
      return [[], []];
    });

    const userIds = await resolveLeaveCalendarUserIds(5, false, '5,9,12');
    expect(userIds).toEqual([5]);
  });
});
