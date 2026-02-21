import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../server/config/database';

// ── Mocks ──────────────────────────────────────────────────────────────────────
jest.mock('../../server/config/database', () => ({
  pool: { execute: jest.fn() },
}));

jest.mock('../../server/routes/notifications', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../server/routes/activityLogs', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../server/utils/sanitize', () => ({
  sanitizeRichText: jest.fn((v: string) => v),
  sanitizePlainText: jest.fn((v: string) => v),
}));

jest.mock('../../server/utils/taskCompletion', () => ({
  computeCompletionPercentages: jest.fn((tasks: any[]) => tasks),
}));

jest.mock('../../server/utils/emailService', () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
const JWT_SECRET = 'test-jwt-secret-key-do-not-use-in-production';

const makeToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign({ userId: 1, username: 'testuser', email: 'test@test.com', isAdmin: false, ...overrides }, JWT_SECRET);

const mockExecute = pool.execute as jest.Mock;

// ── App setup ──────────────────────────────────────────────────────────────────
let app: express.Application;

beforeAll(() => {
  // Import router after mocks are in place
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tasksRouter = require('../../server/routes/tasks').default;
  app = express();
  app.use(express.json());
  app.use('/api/tasks', tasksRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/tasks/my-tasks ────────────────────────────────────────────────────
describe('GET /api/tasks/my-tasks', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/tasks/my-tasks');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/tasks/my-tasks')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(403);
  });

  it('returns tasks for an authenticated user', async () => {
    const mockTasks = [
      { Id: 1, TaskName: 'Task A', ProjectId: 10, AssigneesJson: null },
      { Id: 2, TaskName: 'Task B', ProjectId: 10, AssigneesJson: null },
    ];
    mockExecute.mockResolvedValueOnce([mockTasks, []]);

    const res = await request(app)
      .get('/api/tasks/my-tasks')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks[0].TaskName).toBe('Task A');
  });

  it('returns an empty list when user has no tasks', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .get('/api/tasks/my-tasks')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tasks).toHaveLength(0);
  });

  it('returns 500 when the database throws', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/tasks/my-tasks')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/tasks ────────────────────────────────────────────────────────────
describe('POST /api/tasks', () => {
  const validBody = { projectId: 10, taskName: 'New Task', estimatedHours: 4 };

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/tasks').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 when taskName is missing', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ projectId: 10 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ taskName: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when user does not have access to the project', async () => {
    // Org membership check returns empty
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/access denied/i);
  });

  it('creates a task and returns 201 with the new taskId', async () => {
    // 1. org membership check
    mockExecute.mockResolvedValueOnce([[{ Id: 10 }], []]);
    // 2. COALESCE max display order
    mockExecute.mockResolvedValueOnce([[{ maxOrder: 5 }], []]);
    // 3. INSERT INTO Tasks
    mockExecute.mockResolvedValueOnce([{ insertId: 42, affectedRows: 1 }, []]);
    // 4. createTaskHistory INSERT
    mockExecute.mockResolvedValueOnce([{ insertId: 1, affectedRows: 1 }, []]);
    // 5. logActivity INSERT (inside logActivity mock, so no extra execute needed)

    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.taskId).toBe(42);
  });
});

// ── DELETE /api/tasks/:id ──────────────────────────────────────────────────────
describe('DELETE /api/tasks/:id', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).delete('/api/tasks/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when task does not exist or user lacks access', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .delete('/api/tasks/99')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});
