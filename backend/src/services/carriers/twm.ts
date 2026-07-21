import { openPage } from "../../browser/launchBrowser.js";
import { classifyJointSamplePixels, samplePixelsAround } from "./colorMatcher.js";
import colorLegends from "../../config/colorLegends.json" with { type: "json" };
import type { CarrierResult } from "../../types.js";
import { logger } from "../../utils/logger.js";
import { dismissCookieBanner } from "./formHelpers.js";

const TWM_COVERAGE_URL = "https://www.taiwanmobile.com/mobile/calculate/cover_map.html";

/**
 * 實測確認台灣大哥大的涵蓋率地圖跟中華電信一樣，是疊在 Google Maps 上的彩色圖層
 * （見 docs/RECON_NOTES.md），開頁就能看到全台疊圖，下拉選單只是把地圖 pan/zoom
 * 到選定地址。因此沿用跟 CHT 相同的「攔截 google.maps.Map 建構子」策略，直接
 * setCenter 到目標座標，不需要真的去操作那個自訂下拉選單（更穩定）。
 */
export async function checkTWMCoverage(lat: number, lng: number): Promise<CarrierResult> {
  const displayName = "台灣大哥大";
  let session: Awaited<ReturnType<typeof openPage>> | null = null;

  try {
    session = await openPage({ viewport: { width: 1200, height: 1000 } });
    const { page } = session;

    await page.addInitScript(() => {
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
          return instance;
        };
        g.maps.Map.prototype = OriginalMap.prototype;
      };
      install();
    });

    await page.goto(TWM_COVERAGE_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await dismissCookieBanner(page);

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

    const classified = classifyJointSamplePixels(pixels, colorLegends.TWM.tiers as any);

    return {
      carrier: "TWM",
      displayName,
      band4G: classified.band4G,
      band5G: classified.band5G,
      note: "以地圖疊圖顏色自動判讀，僅供參考",
    };
  } catch (err) {
    logger.warn("twm", "台灣大哥大涵蓋率查詢失敗", { error: String(err) });
    return {
      carrier: "TWM",
      displayName,
      band4G: "unknown",
      band5G: "unknown",
      unavailable: true,
      reason: "暫時無法取得台灣大哥大的涵蓋資料，可能是網站改版或連線逾時。",
    };
  } finally {
    await session?.close();
  }
}
