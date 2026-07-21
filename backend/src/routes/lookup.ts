import { Router, type RequestHandler } from "express";
import { createLookupJob } from "../jobs/jobRunner.js";
import { getJob } from "../jobs/jobStore.js";

/**
 * 限流只套在 POST（送出新查詢，會觸發昂貴的瀏覽器工作）身上，
 * GET（前端輪詢查詢狀態）不受限，否則輪詢自己就會把自己的結果擋掉。
 */
export function lookupRouter(submitLimiter: RequestHandler): Router {
  const router = Router();

  router.post("/lookup", submitLimiter, async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "請提供露營區名稱 (name)" });
      return;
    }
    if (name.length > 100) {
      res.status(400).json({ error: "地點名稱過長" });
      return;
    }

    const jobId = await createLookupJob(name);
    res.status(202).json({ jobId });
  });

  router.get("/lookup/:jobId", async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "找不到這個查詢任務，可能已過期" });
      return;
    }

    res.json({
      status: job.status,
      step: job.step,
      stepMessage: job.stepMessage,
      result: job.result,
      error: job.error,
    });
  });

  return router;
}
