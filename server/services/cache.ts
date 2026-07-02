import type Redis from 'ioredis';
import logger from '../utils/logger';
import {
  getRedisClient,
  getRedisDefaultTtlSeconds,
  getRedisKeyPrefix,
  isRedisEnabled,
} from '../config/redis';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
}

const fullKey = (key: string): string => `${getRedisKeyPrefix()}${key}`;

class NoopCache implements CacheService {
  async get<T>(): Promise<T | null> {
    return null;
  }

  async set(): Promise<void> {
    // no-op
  }

  async del(): Promise<void> {
    // no-op
  }

  async delByPrefix(): Promise<void> {
    // no-op
  }
}

class RedisCache implements CacheService {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(fullKey(key));
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.warn('Redis cache get failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const ttl = ttlSeconds ?? getRedisDefaultTtlSeconds();
      const payload = JSON.stringify(value);
      await this.redis.set(fullKey(key), payload, 'EX', ttl);
    } catch (error) {
      logger.warn('Redis cache set failed', { key, error });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(fullKey(key));
    } catch (error) {
      logger.warn('Redis cache del failed', { key, error });
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    const pattern = `${fullKey(prefix)}*`;
    let cursor = '0';

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.warn('Redis cache delByPrefix failed', { prefix, error });
    }
  }
}

let cacheInstance: CacheService | null = null;

export const getCache = (): CacheService => {
  if (cacheInstance) {
    return cacheInstance;
  }

  if (!isRedisEnabled()) {
    cacheInstance = new NoopCache();
    return cacheInstance;
  }

  const redis = getRedisClient();
  cacheInstance = redis ? new RedisCache(redis) : new NoopCache();
  return cacheInstance;
};

/** Singleton cache service — NoopCache when Redis is disabled or unavailable. */
export const cache: CacheService = {
  get: <T>(key: string) => getCache().get<T>(key),
  set: (key: string, value: unknown, ttlSeconds?: number) => getCache().set(key, value, ttlSeconds),
  del: (key: string) => getCache().del(key),
  delByPrefix: (prefix: string) => getCache().delByPrefix(prefix),
};
