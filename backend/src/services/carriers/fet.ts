import { openPage } from "../../browser/launchBrowser.js";
import { classifySamplePixels, samplePixelsAround } from "./colorMatcher.js";
import colorLegends from "../../config/colorLegends.json" with { type: "json" };
import type { CarrierResult } from "../../types.js";
import { logger } from "../../utils/logger.js";
import { dismissCookieBanner, selectComboboxOption } from "./formHelpers.js";
import type { RegionParts } from "../../config/taiwanRegions.js";

const FET_COVERAGE_URL =
  "https://ecare.fetnet.net/DigService/serviceCoverageController/serviceCoveragePage";

/**
 * 遠傳的表單流程與 CHT/TWM 不同（見 docs/RECON_NOTES.md：Phase 0 時尚未完整跑完一次
 * 查詢確認結果格式）。這裡採「選縣市 → 選區域 → 填路名 → 查詢」的表單流程，查詢後
 * 嘗試用跟 CHT/TWM 相同的地圖截圖判讀（如果底層也是 Google Maps）；任何一步失敗都
 * 直接回傳 unavailable，不影響其他電信商的結果。Phase 4 實作時第一件事就是手動跑一次
 * 確認這個流程是否正確、結果究竟是圖形還是文字，再依實況調整這支模組。
 */
export async function checkFETCoverage(region: RegionParts): Promise<CarrierResult> {
  const displayName = "遠傳電信";

  if (!region.county) {
    return {
      carrier: "FET",
      displayName,
      band4G: "unknown",
      band5G: "unknown",
      unavailable: true,
      reason: "無法從地址解析出縣市，略過遠傳電信查詢。",
    };
  }

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

    await page.goto(FET_COVERAGE_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await dismissCookieBanner(page);

    await selectComboboxOption(page, "選擇縣市", region.county);
    if (region.district) {
      await selectComboboxOption(page, "選擇區域", region.district).catch((err) => {
        logger.warn("fet", "選擇區域失敗，繼續用縣市層級結果", { error: String(err) });
      });
    }
    if (region.road) {
      const roadInput = page.getByPlaceholder("ex.瑞光路").first();
      await roadInput.fill(region.road).catch(() => {});
    }

    const submitButton = page.getByRole("button", { name: "查詢" }).first();
    await submitButton.click({ timeout: 5000 }).catch(() => {});

    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const mapRegion = page.getByRole("region", { name: "地圖" }).first();
    const box = await mapRegion.boundingBox().catch(() => null);
    if (!box) {
      throw new Error("查詢後找不到地圖區塊，可能是結果改為文字呈現，需另行處理");
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

    const band4G = classifySamplePixels(pixels, colorLegends.FET["4G"].levels as any);
    const band5G = classifySamplePixels(pixels, colorLegends.FET["5G"].levels as any);

    return {
      carrier: "FET",
      displayName,
      band4G: band4G.level,
      band5G: band5G.level,
      note: "以地圖疊圖顏色自動判讀，僅供參考",
    };
  } catch (err) {
    logger.warn("fet", "遠傳電信涵蓋率查詢失敗", { error: String(err) });
    return {
      carrier: "FET",
      displayName,
      band4G: "unknown",
      band5G: "unknown",
      unavailable: true,
      reason: "暫時無法取得遠傳電信的涵蓋資料，可能是網站改版或連線逾時。",
    };
  } finally {
    await session?.close();
  }
}
