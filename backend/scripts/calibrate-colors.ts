/**
 * 手動執行用的校色工具（Phase 4）：`npm run calibrate-colors`
 *
 * 這支腳本會分別打開三家電信的涵蓋率頁面，把整頁截圖存到 tmp/calibration/，
 * 讓人用圖片編輯軟體（或任何取色工具）打開截圖、對著圖例色塊讀出實際 RGB 值，
 * 再手動回填到 src/config/colorLegends.json 對應的 hex 欄位，並把該 band 的
 * "calibrated" 改成 true。目前 colorLegends.json 裡的顏色都只是目測估計值，
 * 正式使用前一定要跑過這支腳本校正一次；電信網站改版後也要重跑。
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.cwd(), "tmp/calibration");

const TARGETS = [
  { name: "CHT", url: "https://coverage.cht.com.tw/coverage/tw.html" },
  { name: "TWM", url: "https://www.taiwanmobile.com/mobile/calculate/cover_map.html" },
  {
    name: "FET",
    url: "https://ecare.fetnet.net/DigService/serviceCoverageController/serviceCoveragePage",
  },
];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const target of TARGETS) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
    console.log(`打開 ${target.name}: ${target.url}`);
    try {
      await page.goto(target.url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(2000);
      const outputPath = path.join(OUTPUT_DIR, `${target.name}.png`);
      await page.screenshot({ path: outputPath, fullPage: true });
      console.log(`已儲存截圖：${outputPath}`);
    } catch (err) {
      console.error(`${target.name} 截圖失敗：`, err);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log("完成。請打開 tmp/calibration/ 底下的截圖，手動取色後更新 src/config/colorLegends.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
