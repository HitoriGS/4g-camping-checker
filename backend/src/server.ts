import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { lookupRouter } from "./routes/lookup.js";
import { shutdownBrowser } from "./browser/launchBrowser.js";
import { logger } from "./utils/logger.js";

const PORT = Number(process.env.PORT ?? 3000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGIN ? ALLOWED_ORIGIN.split(",") : true,
  }),
);
app.use(express.json({ limit: "10kb" }));

// 只限制「送出新查詢」，不能套用到整個 /api，否則前端每 2.5 秒一次的輪詢
// （GET /api/lookup/:jobId）自己就會超過額度，把自己的查詢結果擋掉。
const submitLookupLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "查詢太頻繁，請稍後再試。" },
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", lookupRouter(submitLookupLimiter));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("server", "未攔截的錯誤", { error: String(err) });
  res.status(500).json({ error: "伺服器發生未預期錯誤" });
});

const server = app.listen(PORT, () => {
  logger.info("server", `後端已啟動，監聽 port ${PORT}`);
});

async function gracefulShutdown(signal: string) {
  logger.info("server", `收到 ${signal}，準備關閉`);
  server.close();
  await shutdownBrowser();
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
