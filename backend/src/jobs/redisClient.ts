import { Redis } from "@upstash/redis";
import { logger } from "../utils/logger.js";

let client: Redis | null | undefined;

/**
 * 沒設定 Upstash 環境變數時回傳 null，呼叫端會 fallback 成記憶體內的 Map。
 * 本機開發、或還沒申請 Upstash 帳號時都能直接跑起來。
 */
export function getRedisClient(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn("redis", "未設定 UPSTASH_REDIS_REST_URL/TOKEN，改用記憶體內儲存（重啟後會遺失）");
    client = null;
    return client;
  }

  client = new Redis({ url, token });
  return client;
}
