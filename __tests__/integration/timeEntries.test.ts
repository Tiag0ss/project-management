import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../server/config/database';

// ── Mocks ──────────────────────────────────────────────────────────────────────
jest.mock('../../server/config/database', () => ({
  pool: { execute: jest.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
const JWT_SECRET = 'test-jwt-secret-key-do-not-use-in-production';

const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign({ userId: 1, username: 'testuser', email: 'test@test.com', isAdmin: false, ...overrides }, JWT_SECRET);

const mockExecute = pool.execute as jest.Mock;

// ── App setup ──────────────────────────────────────────────────────────────────
let app: express.Application;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const timeEntriesRouter = require('../../server/routes/timeEntries').default;
  app = express();
  app.use(express.json());
  app.use('/api/time-entries', timeEntriesRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/time-entries/my-entries ───────────────────────────────────────────
describe('GET /api/time-entries/my-entries', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/time-entries/my-entries');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/time-entries/my-entries')
      .set('Authorization', 'Bearer bad.token');
    expect(res.status).toBe(403);
  });

  it('returns all time entries for the current user', async () => {
    const mockEntries = [
      { Id: 1, TaskId: 10, UserId: 1, WorkDate: '2024-03-01', Hours: 2.5, TaskName: 'Task A', ProjectName: 'Project X' },
      { Id: 2, TaskId: 11, UserId: 1, WorkDate: '2024-03-02', Hours: 4.0, TaskName: 'Task B', ProjectName: 'Project X' },
    ];
    mockExecute.mockResolvedValueOnce([mockEntries, []]);

    const res = await request(app)
      .get('/api/time-entries/my-entries')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].Hours).toBe(2.5);
  });

  it('returns 500 when the database throws', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB failure'));

    const res = await request(app)
      .get('/api/time-entries/my-entries')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/time-entries/project/:projectId ───────────────────────────────────
describe('GET /api/time-entries/project/:projectId', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/time-entries/project/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when user lacks access to the project', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .get('/api/time-entries/project/99')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns project time entries when user has access', async () => {
    const mockEntries = [
      { Id: 5, TaskId: 20, Hours: 3.0, WorkDate: '2024-03-05', TaskName: 'API work' },
    ];
    // 1. access check
    mockExecute.mockResolvedValueOnce([[{ Id: 10 }], []]);
    // 2. entries query
    mockExecute.mockResolvedValueOnce([mockEntries, []]);

    const res = await request(app)
      .get('/api/time-entries/project/10')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].TaskName).toBe('API work');
  });
});

// ── GET /api/time-entries/task/:taskId ─────────────────────────────────────────
describe('GET /api/time-entries/task/:taskId', () => {
  it('returns 404 when task is not accessible', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .get('/api/time-entries/task/999')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns entries for an accessible task', async () => {
    mockExecute.mockResolvedValueOnce([[{ Id: 5 }], []]);
    mockExecute.mockResolvedValueOnce([[{ Id: 1, Hours: 2.0, TaskId: 5 }], []]);

    const res = await request(app)
      .get('/api/time-entries/task/5')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entries[0].Hours).toBe(2.0);
  });
});

// ── POST /api/time-entries ─────────────────────────────────────────────────────
describe('POST /api/time-entries', () => {
  const validBody = { taskId: 5, workDate: '2024-03-10', hours: 3.0, description: 'Fixing bugs' };

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/time-entries').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/time-entries')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ taskId: 5 }); // missing workDate and hours

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when user has no access to the task', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .post('/api/time-entries')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(404);
  });

  it('creates a time entry and returns its new ID', async () => {
    // 1. task access check
    mockExecute.mockResolvedValueOnce([[{ Id: 5, IsHobby: 0 }], []]);
    // 2. INSERT INTO TimeEntries
    mockExecute.mockResolvedValueOnce([{ insertId: 77, affectedRows: 1 }, []]);

    const res = await request(app)
      .post('/api/time-entries')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entryId).toBe(77);
  });

  it('auto-approves time entry for hobby projects', async () => {
    mockExecute.mockResolvedValueOnce([[{ Id: 5, IsHobby: 1 }], []]);
    mockExecute.mockResolvedValueOnce([{ insertId: 88, affectedRows: 1 }, []]);

    const res = await request(app)
      .post('/api/time-entries')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify the INSERT was called with 'approved' status
    const insertCall = mockExecute.mock.calls[1];
    expect(insertCall[1]).toContain('approved');
  });
});
