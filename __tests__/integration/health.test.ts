import request from 'supertest';
import express from 'express';
import { registerHealthRoute, buildHealthPayload } from '../../server/health';

jest.mock('../../server/config/database', () => ({
  testConnection: jest.fn(),
}));

jest.mock('../../server/config/redis', () => ({
  getRedisStatus: jest.fn(),
  testRedisConnection: jest.fn(),
}));

import { testConnection } from '../../server/config/database';
import { getRedisStatus, testRedisConnection } from '../../server/config/redis';

const mockedTestConnection = testConnection as jest.MockedFunction<typeof testConnection>;
const mockedGetRedisStatus = getRedisStatus as jest.MockedFunction<typeof getRedisStatus>;
const mockedTestRedisConnection = testRedisConnection as jest.MockedFunction<typeof testRedisConnection>;

describe('Health Check Endpoint', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    registerHealthRoute(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedTestConnection.mockResolvedValue(true);
    mockedGetRedisStatus.mockReturnValue('disabled');
    mockedTestRedisConnection.mockResolvedValue(true);
  });

  it('should return 200 when database is connected', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.database).toBe('connected');
    expect(response.body.redis).toBe('disabled');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });

  it('should return 503 when database is disconnected', async () => {
    mockedTestConnection.mockResolvedValue(false);
    const response = await request(app).get('/health');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.database).toBe('disconnected');
  });

  it('should ping redis when enabled', async () => {
    mockedGetRedisStatus.mockReturnValue('connected');
    await request(app).get('/health');
    expect(mockedTestRedisConnection).toHaveBeenCalled();
  });

  it('buildHealthPayload returns structured body', async () => {
    mockedGetRedisStatus.mockReturnValue('connected');
    const { httpStatus, body } = await buildHealthPayload();
    expect(httpStatus).toBe(200);
    expect(body.redis).toBe('connected');
  });
});
