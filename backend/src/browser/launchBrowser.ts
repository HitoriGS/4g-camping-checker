import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import pLimit from "p-limit";
import { logger } from "../utils/logger.js";

let browserPromise: Promise<Browser> | null = null;

/**
 * 整個 process 共用一個常駐的 Chromium 實例（保溫），每個查詢任務各自開獨立的
 * BrowserContext，而不是每次都重新 launch 瀏覽器——這是選擇持久化伺服器（而非
 * serverless）的關鍵優勢，大幅降低啟動時間與記憶體開銷。
 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).then((browser) => {
      browser.on("disconnected", () => {
        logger.warn("browser", "Chromium 已中斷連線，下次使用時會重新啟動");
        browserPromise = null;
      });
      logger.info("browser", "Chromium 已啟動並保持常駐");
      return browser;
    });
  }
  return browserPromise;
}

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function openPage(options?: {
  viewport?: { width: number; height: number };
}): Promise<BrowserSession> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: options?.viewport ?? { width: 1280, height: 900 },
    locale: "zh-TW",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  return {
    context,
    page,
    close: async () => {
      await context.close().catch(() => {});
    },
  };
}

/**
 * 同一個 job 內的瀏覽器工作不要完全平行，避免 512MB RAM 被同時撐爆。
 * 全域最多同時 2 個 BrowserContext 在跑。
 */
export const browserTaskLimit = pLimit(2);

export async function shutdownBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close().catch(() => {});
  browserPromise = null;
}
