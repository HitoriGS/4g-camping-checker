# Handoff — 2026-07-21 18:30

## 現在在做什麼
「露營區 4G/5G 訊號檢查器」專案第一天開發：前端（GitHub Pages）＋後端（Render）已上線並跑通，中華電信涵蓋率判讀已驗證正確。

## 馬上要做的事（優先順序）
1. **除錯台灣大哥大（TWM）涵蓋率查詢** — 目前一律回傳 `unavailable`。懷疑是 `backend/src/services/carriers/twm.ts` 裡攔截 `google.maps.Map` 建構子的技巧沒生效（`waitForFunction` 等 `__capturedMap` 逾時）。建議用遠端瀏覽器工具實際打開 https://www.taiwanmobile.com/mobile/calculate/cover_map.html，在 console 執行 `typeof google !== "undefined"` 之類的檢查，確認地圖底層是否真的是 Google Maps JS API，或是其他技術（例如 Leaflet + 自家 WMS）。
2. **除錯遠傳電信（FET）涵蓋率查詢** — 同樣回傳 `unavailable`。`backend/src/services/carriers/fet.ts` 走的是「選縣市→選區域→填路名→查詢」表單流程，`docs/RECON_NOTES.md` 裡註明 Phase 0 時沒有真正跑完一次查詢確認結果格式（文字或圖形）。下次要先手動跑一次真實查詢，確認查詢後出現的是地圖還是純文字結果，再決定要修 `classifyJointSamplePixels` 那條路還是改成文字解析。
3. 確認 Upstash Redis 生效後，Render 重新部署不會再遺失查詢中的 job（今天有實測到一次重新部署把 in-memory 的查詢紀錄清空的狀況，使用者已經在 Render 填好 Redis 環境變數，但還沒重新驗證過）。

## 注意事項 / 踩坑紀錄
- **CORS 的 `ALLOWED_ORIGIN` 絕對不能加路徑**：瀏覽器送出的 `Origin` header 只有 `scheme://host`，不含路徑。今天踩過一次，錯誤設成 `https://hitorigs.github.io/4g-camping-checker` 導致 CORS preflight 沒有 `Access-Control-Allow-Origin`，前端一律 `Failed to fetch`。正確值是 `https://hitorigs.github.io`。
- **這個 Claude Code 沙盒環境會擋掉 `playwright.dev` 網域**（DNS 導向 127.0.0.1），本機無法 `npx playwright install chromium`。不影響 Render 部署（`backend/Dockerfile` 用 `mcr.microsoft.com/playwright` 官方映像檔，已內建對應版本瀏覽器）。要在本機測試瀏覽器自動化邏輯的話，改用 Claude 內建的遠端瀏覽器工具（`mcp__Claude_Browser__*`），可以直接對目標網站執行 JavaScript 讀 DOM/顏色，不需要本機 Chromium。
- **Google Places API 回 `REQUEST_DENIED`** 十之八九是 Google Cloud 專案沒啟用 Billing，不是金鑰打錯或 API 沒開。今天卡過這個，重點檢查 https://console.cloud.google.com/project/_/billing/enable 。
- **三家電信的涵蓋率圖例其實是「一個顏色同時代表一組 4G+5G 等級」的聯合色階**，不是 4G/5G 各自獨立的色票（今天發現並重構過，見 `docs/RECON_NOTES.md` 的「Phase 4 色票校正結果」章節，裡面有三家精確色碼）。以後如果要重新校色，直接用瀏覽器工具在頁面上執行 `getComputedStyle(...).backgroundColor` 讀圖例色塊，比截圖後人工取色快很多也準很多。
- Render 免費方案閒置會休眠，第一次查詢可能要等 30-60 秒喚醒。
- `backend/render.yaml` 放在 repo 根目錄（不是 `backend/` 底下），有 `rootDir: backend` 欄位指向 Dockerfile 實際位置。

## 相關檔案
- `docs/RECON_NOTES.md` — 三家電信與 Google 評論的技術偵察記錄，含今天新增的色票校正結果，除錯 TWM/FET 前務必先看這份
- `docs/ARCHITECTURE.md` — 架構決策紀錄（為什麼是 Render 不是 serverless、為什麼要非同步 Job 等）
- `backend/src/services/carriers/{cht.ts,twm.ts,fet.ts}` — 三家電信各自的截圖判讀邏輯，cht.ts 已驗證正確，可以當作 twm.ts/fet.ts 除錯時的參考基準
- `backend/src/services/carriers/colorMatcher.ts` — 聯合色階分類邏輯（`classifyJointSamplePixels`）
- `backend/src/config/colorLegends.json` — 三家電信的精確校正色票（`calibrated: true`）
- `README.md` — 完整的本機開發與部署步驟

## 最後狀態
- Branch: `main`，工作目錄乾淨，所有變更都已 push 到 `origin/main`（最新 commit `2a749d5`）
- 前端已上線：https://hitorigs.github.io/4g-camping-checker/
- 後端已上線：https://fourg-camping-checker.onrender.com
- 沒有正在跑一半的任務，可以直接從「除錯 TWM/FET」接著做
