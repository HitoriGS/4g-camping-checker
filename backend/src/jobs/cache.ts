import { getRedisClient } from "./redisClient.js";

const CACHE_TTL_SECONDS = 5 * 24 * 60 * 60; // 5 天，降低對電信網站/Google 地圖的重複請求頻率
const CACHE_KEY_PREFIX = "cache:";

const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis) {
    const raw = await redis.get<string>(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as unknown as T);
  }

  const entry = memoryCache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(CACHE_KEY_PREFIX + key, JSON.stringify(value), { ex: CACHE_TTL_SECONDS });
    return;
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 });
}

export async function withCache<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached !== null) return cached;
  const value = await compute();
  await setCached(key, value);
  return value;
}
