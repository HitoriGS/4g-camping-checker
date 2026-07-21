import { v4 as uuidv4 } from "uuid";
import { getJob, saveJob } from "./jobStore.js";
import { runExclusive } from "./mutex.js";
import { withCache } from "./cache.js";
import { browserTaskLimit } from "../browser/launchBrowser.js";
import { geocodePlace, GeocodeNotFoundError } from "../services/geocode.js";
import { extractRegionParts } from "../config/taiwanRegions.js";
import { checkCHTCoverage } from "../services/carriers/cht.js";
import { checkTWMCoverage } from "../services/carriers/twm.js";
import { checkFETCoverage } from "../services/carriers/fet.js";
import { fetchGoogleReviewsAboutSignal } from "../services/googleReviews.js";
import { computeSuitability } from "../services/suitability.js";
import type { CarrierResult, Job, LookupResult, PlaceInfo } from "../types.js";
import { logger } from "../utils/logger.js";

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function toPublicPlace(place: PlaceInfo): LookupResult["place"] {
  const { addressComponents: _addressComponents, ...publicPlace } = place;
  return publicPlace;
}

async function patchJobResult(jobId: string, patch: Partial<LookupResult>): Promise<void> {
  await runExclusive(jobId, async () => {
    const job = await getJob(jobId);
    if (!job) return;
    job.result = { ...job.result, ...patch };
    job.updatedAt = Date.now();
    await saveJob(job);
  });
}

async function addCarrierResult(jobId: string, carrier: CarrierResult): Promise<void> {
  await runExclusive(jobId, async () => {
    const job = await getJob(jobId);
    if (!job) return;
    const existing = job.result?.carriers ?? [];
    job.result = { ...job.result, carriers: [...existing, carrier] };
    job.updatedAt = Date.now();
    await saveJob(job);
  });
}

async function updateJobMeta(
  jobId: string,
  patch: Partial<Pick<Job, "status" | "step" | "stepMessage" | "error">>,
): Promise<void> {
  await runExclusive(jobId, async () => {
    const job = await getJob(jobId);
    if (!job) return;
    Object.assign(job, patch);
    job.updatedAt = Date.now();
    await saveJob(job);
  });
}

/** 建立查詢 job 並在背景執行 pipeline，立即回傳 jobId 讓前端開始輪詢。 */
export async function createLookupJob(query: string): Promise<string> {
  const jobId = uuidv4();
  const now = Date.now();
  const job: Job = {
    id: jobId,
    query,
    status: "queued",
    step: "queued",
    createdAt: now,
    updatedAt: now,
  };
  await saveJob(job);

  void runJob(jobId, query).catch((err) => {
    logger.error("jobRunner", "背景任務發生未預期錯誤", { jobId, error: String(err) });
    void updateJobMeta(jobId, {
      status: "error",
      error: "查詢過程發生未預期錯誤，請稍後再試一次。",
    });
  });

  return jobId;
}

async function runJob(jobId: string, query: string): Promise<void> {
  await updateJobMeta(jobId, { status: "running", step: "geocoding", stepMessage: "地理定位中" });

  let place: PlaceInfo;
  try {
    place = await withCache(`geocode:${normalizeQuery(query)}`, () => geocodePlace(query));
  } catch (err) {
    const message =
      err instanceof GeocodeNotFoundError
        ? err.message
        : err instanceof Error
          ? err.message
          : "地理定位失敗，請確認地點名稱是否正確。";
    await updateJobMeta(jobId, { status: "error", error: message });
    return;
  }

  await patchJobResult(jobId, { place: toPublicPlace(place) });
  await updateJobMeta(jobId, { step: "carriers", stepMessage: "查詢電信涵蓋與評論中" });

  const region = extractRegionParts(place.addressComponents);

  const carrierTasks: Promise<void>[] = [
    browserTaskLimit(() =>
      withCache(`carrier:CHT:${place.placeId}`, () => checkCHTCoverage(place.lat, place.lng)),
    ).then((result) => addCarrierResult(jobId, result)),
    browserTaskLimit(() =>
      withCache(`carrier:TWM:${place.placeId}`, () => checkTWMCoverage(place.lat, place.lng)),
    ).then((result) => addCarrierResult(jobId, result)),
    browserTaskLimit(() =>
      withCache(`carrier:FET:${place.placeId}`, () => checkFETCoverage(region)),
    ).then((result) => addCarrierResult(jobId, result)),
  ];

  const reviewsTask = browserTaskLimit(() =>
    withCache(`reviews:${place.placeId}`, () => fetchGoogleReviewsAboutSignal(place.mapUrl)),
  ).then(async (reviewsResult) => {
    await updateJobMeta(jobId, { step: "reviews", stepMessage: "讀取評論中" });
    await patchJobResult(jobId, {
      reviews: reviewsResult.reviews,
      reviewsUnavailable: reviewsResult.unavailable,
      reviewsUnavailableReason: reviewsResult.reason,
    });
  });

  await Promise.allSettled([...carrierTasks, reviewsTask]);

  await updateJobMeta(jobId, { step: "aggregating", stepMessage: "彙整分析中" });

  const finalJob = await getJob(jobId);
  const carriers = finalJob?.result?.carriers ?? [];
  const reviews = finalJob?.result?.reviews ?? [];
  const suitability = computeSuitability(carriers, reviews);

  await patchJobResult(jobId, { suitability });
  await updateJobMeta(jobId, { status: "done", step: "done", stepMessage: "完成" });
}
