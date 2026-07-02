import Redis from 'ioredis';
import dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config();

export type RedisStatus = 'connected' | 'disabled' | 'error';

let client: Redis | null = null;
let status: RedisStatus = 'disabled';
let initAttempted = false;

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

export const isRedisEnabled = (): boolean => parseBoolean(process.env.REDIS_ENABLED, false);

export const getRedisKeyPrefix = (): string => process.env.REDIS_KEY_PREFIX || 'pm:';

export const getRedisDefaultTtlSeconds = (): number => {
  const parsed = Number(process.env.REDIS_DEFAULT_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
};

export const getRedisClient = (): Redis | null => {
  if (!isRedisEnabled()) {
    return null;
  }

  if (client) {
    return client;
  }

  if (initAttempted) {
    return null;
  }

  initAttempted = true;
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    client.on('error', (error) => {
      status = 'error';
      logger.warn('Redis connection error', { error: error.message });
    });

    client.on('connect', () => {
      status = 'connected';
      logger.info('Redis connected');
    });

    void client.connect().catch((error: Error) => {
      status = 'error';
      logger.warn('Redis initial connect failed; cache will degrade to DB', { error: error.message });
    });
  } catch (error) {
    status = 'error';
    logger.warn('Redis client creation failed', { error });
    client = null;
  }

  return client;
};

export const getRedisStatus = (): RedisStatus => {
  if (!isRedisEnabled()) {
    return 'disabled';
  }
  if (client && client.status === 'ready') {
    return 'connected';
  }
  return status;
};

export const testRedisConnection = async (): Promise<boolean> => {
  if (!isRedisEnabled()) {
    return true;
  }

  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    const pong = await redis.ping();
    status = pong === 'PONG' ? 'connected' : 'error';
    return pong === 'PONG';
  } catch {
    status = 'error';
    return false;
  }
};
