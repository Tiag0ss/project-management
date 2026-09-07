import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../server/config/database';

jest.mock('../../server/config/database', () => ({
  pool: { execute: jest.fn() },
}));

jest.mock('../../server/services/cacheInvalidation', () => ({
  invalidateByEntity: jest.fn().mockResolvedValue(undefined),
}));

const JWT_SECRET = 'test-jwt-secret-key-do-not-use-in-production';

const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    { userId: 1, username: 'testuser', email: 'test@test.com', isAdmin: true, ...overrides },
    JWT_SECRET
  );

const mockExecute = pool.execute as jest.Mock;

let app: express.Application;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expensesRouter = require('../../server/modules/expenses/expenses').default;
  app = express();
  app.use(express.json());
  app.use('/api/expenses', expensesRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/expenses', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when expenses module is disabled', async () => {
    mockExecute.mockResolvedValueOnce([[{ SettingValue: 'false' }], []]);

    const res = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled/i);
  });

  it('returns expense list when enabled for admin', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ SettingValue: 'true' }], []]) // feature flag
      .mockResolvedValueOnce([[], []]); // list query

    const res = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${makeToken({ isAdmin: true })}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
