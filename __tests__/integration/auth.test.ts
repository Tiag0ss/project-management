import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../server/middleware/auth';

jest.mock('../../server/config/database', () => ({
  pool: { execute: jest.fn() },
}));

jest.mock('../../server/services/cache', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

import { pool } from '../../server/config/database';

const mockedExecute = pool.execute as jest.Mock;

describe('Auth middleware', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.get('/protected', authenticateToken, (_req, res) => {
      res.json({ success: true });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 without Authorization header', async () => {
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
  });

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(401);
  });

  it('should allow valid JWT', async () => {
    const secret = process.env.JWT_SECRET || 'test-jwt-secret-key-do-not-use-in-production';
    const token = jwt.sign(
      { userId: 1, username: 'testuser', isAdmin: false },
      secret,
      { expiresIn: '1h' }
    );

    mockedExecute.mockResolvedValueOnce([[{ Id: 1, IsActive: 1 }], []]);

    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
