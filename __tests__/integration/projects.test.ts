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

jest.mock('../../server/utils/changeLog', () => ({
  logProjectHistory: jest.fn().mockResolvedValue(undefined),
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
  const projectsRouter = require('../../server/routes/projects').default;
  app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/projects ──────────────────────────────────────────────────────────
describe('GET /api/projects', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer invalid.token.x');
    expect(res.status).toBe(403);
  });

  it('returns all projects for the authenticated user', async () => {
    const mockProjects = [
      { Id: 1, ProjectName: 'Alpha', OrganizationId: 10, TotalTasks: 5, CompletedTasks: 2 },
      { Id: 2, ProjectName: 'Beta', OrganizationId: 10, TotalTasks: 8, CompletedTasks: 8 },
    ];
    mockExecute.mockResolvedValueOnce([mockProjects, []]);

    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projects).toHaveLength(2);
    expect(res.body.projects[0].ProjectName).toBe('Alpha');
  });

  it('returns an empty list when the user has no projects', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projects).toHaveLength(0);
  });

  it('returns 500 when the database throws', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/projects/:id ──────────────────────────────────────────────────────
describe('GET /api/projects/:id', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/projects/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the project does not exist or user lacks access', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .get('/api/projects/999')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('returns the project when the user has access', async () => {
    const mockProject = { Id: 10, ProjectName: 'My Project', OrganizationId: 5, Budget: 10000 };
    mockExecute.mockResolvedValueOnce([[mockProject], []]);

    const res = await request(app)
      .get('/api/projects/10')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.project.ProjectName).toBe('My Project');
    expect(res.body.project.Budget).toBe(10000);
  });
});

// ── POST /api/projects ─────────────────────────────────────────────────────────
describe('POST /api/projects', () => {
  const validBody = { organizationId: 5, projectName: 'New Project', description: 'Test' };

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/projects').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 when projectName is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ organizationId: 5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/required/i);
  });

  it('returns 400 when organizationId is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ projectName: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when user is not a member of the organization', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not a member/i);
  });

  it('creates a project and returns 201 with the new projectId', async () => {
    // 1. org membership check
    mockExecute.mockResolvedValueOnce([[{ Id: 50 }], []]);
    // 2. INSERT INTO Projects
    mockExecute.mockResolvedValueOnce([{ insertId: 15, affectedRows: 1 }, []]);

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.projectId).toBe(15);
  });
});

// ── DELETE /api/projects/:id ───────────────────────────────────────────────────
describe('DELETE /api/projects/:id', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).delete('/api/projects/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when project does not exist or was not created by user', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .delete('/api/projects/99')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('deletes the project and returns success', async () => {
    // 1. SELECT project (existence + owner check)
    mockExecute.mockResolvedValueOnce([[{ ProjectName: 'My Project' }], []]);
    // 2. DELETE FROM Projects
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const res = await request(app)
      .delete('/api/projects/10')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/deleted/i);
  });
});
