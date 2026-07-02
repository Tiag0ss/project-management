import { cache } from '../services/cache';
import { AGGREGATE_TTL_SECONDS, ENTITY_TTL_SECONDS } from '../services/cacheKeys';

export { ENTITY_TTL_SECONDS, AGGREGATE_TTL_SECONDS };

/**
 * Read-through cache helper. On miss, runs fetcher, stores result, returns it.
 * When Redis is disabled, always runs fetcher directly.
 */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = await fetcher();
  await cache.set(key, data, ttlSeconds);
  return data;
}
