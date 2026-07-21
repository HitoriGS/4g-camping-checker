import { getRedisClient } from "./redisClient.js";
import type { Job } from "../types.js";

const JOB_TTL_SECONDS = 15 * 60;
const JOB_KEY_PREFIX = "job:";

const memoryStore = new Map<string, Job>();

export async function saveJob(job: Job): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(JOB_KEY_PREFIX + job.id, JSON.stringify(job), { ex: JOB_TTL_SECONDS });
    return;
  }
  memoryStore.set(job.id, job);
}

export async function getJob(id: string): Promise<Job | null> {
  const redis = getRedisClient();
  if (redis) {
    const raw = await redis.get<string>(JOB_KEY_PREFIX + id);
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as Job) : (raw as unknown as Job);
  }
  return memoryStore.get(id) ?? null;
}
