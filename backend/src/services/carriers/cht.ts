import { openPage } from "../../browser/launchBrowser.js";
import { classifySamplePixels, samplePixelsAround } from "./colorMatcher.js";
import colorLegends from "../../config/colorLegends.json" with { type: "json" };
import type { CarrierResult } from "../../types.js";
import { logger } from "../../utils/logger.js";

const CHT_COVERAGE_URL = "https://coverage.cht.com.tw/coverage/tw.html";

/**
 * 中華電信涵蓋率頁面把圖層疊在 Google Maps 上，沒有查詢 API（見 docs/RECON_NOTES.md）。
 * 做法：在頁面載入前用 addInitScript 攔截 google.maps.Map 的建構子，抓到第一個
 * Map 實例存到 window.__capturedMap，之後就能直接呼叫 setCenter/setZoom 把地圖
 * 移到目標座標——這比自動打字進搜尋框、等自動完成選單、點選候選項目穩定得多，
 * 不需要依賴該站台自己的內部變數命名。
 */
export async function checkCHTCoverage(lat: number, lng: number): Promise<CarrierResult> {
  const displayName = "中華電信";
  let session: Awaited<ReturnType<typeof openPage>> | null = null;

  try {
    session = await openPage({ viewport: { width: 1000, height: 800 } });
    const { page } = session;

    await page.addInitScript(() => {
      const w = window as unknown as { __mapReady?: (map: unknown) => void };
      const install = () => {
        const g = (window as any).google;
        if (!g?.maps?.Map) {
          setTimeout(install, 20);
          return;
        }
        const OriginalMap = g.maps.Map;
        g.maps.Map = function PatchedMap(...args: unknown[]) {
          const instance = new OriginalMap(...args);
          (window as any).__capturedMap = instance;
          w.__mapReady?.(instance);
          return instance;
        };
        g.maps.Map.prototype = OriginalMap.prototype;
      };
      install();
    });

    await page.goto(CHT_COVERAGE_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });

    await page.waitForFunction(() => (window as any).__capturedMap !== undefined, {
      timeout: 15_000,
    });

    await page.evaluate(
      ({ lat, lng }) => {
        const map = (window as any).__capturedMap;
        map.setCenter({ lat, lng });
        map.setZoom(16);
      },
      { lat, lng },
    );

    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const mapElement = await page.$("#map, .map, [id*=map]");
    const box = await mapElement?.boundingBox();
    if (!box) {
      throw new Error("找不到地圖容器，無法截圖判讀");
    }

    const screenshot = await page.screenshot({
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });

    const centerX = Math.round(box.width / 2);
    const centerY = Math.round(box.height / 2);
    const pixels = await samplePixelsAround(screenshot, centerX, centerY, 9);

    if (pixels.length === 0) {
      throw new Error("像素取樣失敗");
    }

    const band4G = classifySamplePixels(pixels, colorLegends.CHT["4G"].levels as any);
    const band5G = classifySamplePixels(pixels, colorLegends.CHT["5G"].levels as any);

    return {
      carrier: "CHT",
      displayName,
      band4G: band4G.level,
      band5G: band5G.level,
      note: "以地圖疊圖顏色自動判讀，僅供參考",
    };
  } catch (err) {
    logger.warn("cht", "中華電信涵蓋率查詢失敗", { error: String(err) });
    return {
      carrier: "CHT",
      displayName,
      band4G: "unknown",
      band5G: "unknown",
      unavailable: true,
      reason: "暫時無法取得中華電信的涵蓋資料，可能是網站改版或連線逾時。",
    };
  } finally {
    await session?.close();
  }
}
