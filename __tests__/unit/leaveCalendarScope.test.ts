import { pool } from '../config/database';
import {
  resolveLeaveCalendarUserIds,
  userCanViewOthersLeaveCalendar,
} from '../../server/utils/leaveCalendarScope';

jest.mock('../config/database', () => ({
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
    mockExecute
      .mockResolvedValueOnce([[{ IsDeveloper: 1, IsSupport: 0, IsManager: 0, isAdmin: 0 }], []])
      .mockResolvedValueOnce([[{ CanViewOthersPlanning: 1 }], []])
      .mockResolvedValueOnce([[], []]);

    const canViewOthers = await userCanViewOthersLeaveCalendar(5, false);
    expect(canViewOthers).toBe(true);

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ IsDeveloper: 1, IsSupport: 0, IsManager: 0, isAdmin: 0 }], []])
      .mockResolvedValueOnce([[{ CanViewOthersPlanning: 1 }], []])
      .mockResolvedValueOnce([[], []]);

    const userIds = await resolveLeaveCalendarUserIds(5, false, '5,9,12');
    expect(userIds).toEqual([5, 9, 12]);
  });

  it('restricts non-planning viewers to self and subordinates', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ Id: 7 }], []])
      .mockResolvedValueOnce([[{ IsDeveloper: 1, IsSupport: 0, IsManager: 0, isAdmin: 0 }], []])
      .mockResolvedValueOnce([[{ CanViewOthersPlanning: 0 }], []])
      .mockResolvedValueOnce([[], []]);

    const userIds = await resolveLeaveCalendarUserIds(5, false, '5,9,12');
    expect(userIds).toEqual([5]);
  });
});
