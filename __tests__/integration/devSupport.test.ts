import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../server/config/database';

jest.mock('../../server/config/database', () => ({
  pool: { execute: jest.fn() },
}));

const JWT_SECRET = 'test-jwt-secret-key-do-not-use-in-production';

const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign({ userId: 1, username: 'testuser', email: 'test@test.com', isAdmin: false, ...overrides }, JWT_SECRET);

const mockExecute = pool.execute as jest.Mock;

let app: express.Application;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const devSupportRouter = require('../../server/modules/users/devSupport').default;
  app = express();
  app.use(express.json());
  app.use('/api/dev-support', devSupportRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/dev-support/my', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/dev-support/my');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns dev support entries for the current user', async () => {
    const mockEntries = [
      { Id: 1, UserId: 1, DevSupportDate: '2026-06-10', Notes: 'On-call', CreatedBy: 1 },
    ];

    mockExecute
      .mockResolvedValueOnce([[{ Id: 1 }], []])
      .mockResolvedValueOnce([mockEntries, []]);

    const res = await request(app)
      .get('/api/dev-support/my?year=2026')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalDays).toBe(1);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].DevSupportDate).toBe('2026-06-10');
  });
});

describe('POST /api/dev-support/my/request', () => {
  it('returns 403 for regular users', async () => {
    mockExecute.mockResolvedValueOnce([[{ Count: 0 }], []]);

    const res = await request(app)
      .post('/api/dev-support/my/request')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ startDate: '2026-06-09', endDate: '2026-06-09', notes: 'Support' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid date range', async () => {
    mockExecute.mockResolvedValueOnce([[{ Count: 1 }], []]);

    const res = await request(app)
      .post('/api/dev-support/my/request')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ startDate: '2026-06-12', endDate: '2026-06-10' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('creates rows for working days in range when user can manage', async () => {
    const workHoursRow = {
      WorkHoursMonday: 8,
      WorkHoursTuesday: 8,
      WorkHoursWednesday: 8,
      WorkHoursThursday: 8,
      WorkHoursFriday: 8,
      WorkHoursSaturday: 0,
      WorkHoursSunday: 0,
    };

    mockExecute
      .mockResolvedValueOnce([[{ Count: 1 }], []])
      .mockResolvedValueOnce([[workHoursRow], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ insertId: 10, affectedRows: 1 }, []]);

    const res = await request(app)
      .post('/api/dev-support/my/request')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ startDate: '2026-06-09', endDate: '2026-06-09', notes: 'Support' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(0);
  });
});

describe('GET /api/dev-support/calendar', () => {
  it('returns entries for allowed users in date range', async () => {
    const mockEntries = [
      { Id: 2, UserId: 1, DevSupportDate: '2026-06-15', Notes: null },
    ];

    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([mockEntries, []]);

    const res = await request(app)
      .get('/api/dev-support/calendar?startDate=2026-06-01&endDate=2026-06-30&userIds=1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].UserId).toBe(1);
  });

  it('returns 400 for invalid date range', async () => {
    const res = await request(app)
      .get('/api/dev-support/calendar?startDate=bad&endDate=2026-06-30')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/dev-support/manage-scope', () => {
  it('returns canManage for admin', async () => {
    const res = await request(app)
      .get('/api/dev-support/manage-scope')
      .set('Authorization', `Bearer ${makeToken({ isAdmin: true })}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.canManage).toBe(true);
  });

  it('returns canManage false for user without subordinates', async () => {
    mockExecute.mockResolvedValueOnce([[{ Count: 0 }], []]);

    const res = await request(app)
      .get('/api/dev-support/manage-scope')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.canManage).toBe(false);
  });
});

describe('GET /api/dev-support/team-members', () => {
  it('returns 403 for users without team manage scope', async () => {
    mockExecute.mockResolvedValueOnce([[{ Count: 0 }], []]);

    const res = await request(app)
      .get('/api/dev-support/team-members?year=2026')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns team members for admin', async () => {
    const members = [{ Id: 2, Username: 'dev2', FirstName: 'Dev', LastName: 'Two', DevSupportDays: 3 }];
    mockExecute.mockResolvedValueOnce([members, []]);

    const res = await request(app)
      .get('/api/dev-support/team-members?year=2026')
      .set('Authorization', `Bearer ${makeToken({ isAdmin: true })}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].DevSupportDays).toBe(3);
  });
});

describe('POST /api/dev-support/team-members/:userId/configure', () => {
  it('returns 403 when manager cannot manage target user', async () => {
    mockExecute.mockResolvedValueOnce([[{ TeamLeaderId: 50 }], []]);

    const res = await request(app)
      .post('/api/dev-support/team-members/99/configure')
      .set('Authorization', `Bearer ${makeToken({ userId: 1 })}`)
      .send({ startDate: '2026-06-09', endDate: '2026-06-09' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('creates rows for a managed user', async () => {
    const workHoursRow = {
      WorkHoursMonday: 8,
      WorkHoursTuesday: 8,
      WorkHoursWednesday: 8,
      WorkHoursThursday: 8,
      WorkHoursFriday: 8,
      WorkHoursSaturday: 0,
      WorkHoursSunday: 0,
    };

    mockExecute
      .mockResolvedValueOnce([[{ TeamLeaderId: 1 }], []])
      .mockResolvedValueOnce([[workHoursRow], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ insertId: 11, affectedRows: 1 }, []]);

    const res = await request(app)
      .post('/api/dev-support/team-members/2/configure')
      .set('Authorization', `Bearer ${makeToken({ userId: 1 })}`)
      .send({ startDate: '2026-06-09', endDate: '2026-06-09', notes: 'Coverage' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(1);
  });
});

describe('DELETE /api/dev-support/:id', () => {
  it('allows owner to delete own entry', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ Id: 5, UserId: 1 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const res = await request(app)
      .delete('/api/dev-support/5')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when user cannot manage entry', async () => {
    mockExecute.mockResolvedValueOnce([[{ Id: 5, UserId: 99 }], []]);
    mockExecute.mockResolvedValueOnce([[{ TeamLeaderId: 50 }], []]);

    const res = await request(app)
      .delete('/api/dev-support/5')
      .set('Authorization', `Bearer ${makeToken({ userId: 1 })}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
