# 露營區 4G/5G 訊號檢查器

輸入露營區名稱，自動查詢中華電信／台灣大哥大／遠傳電信在該地點的 4G/5G 涵蓋情況，加上 Google 評論中提到「網路／訊號」的內容（附評論時間），最後用白話文字給出「適不適合直播」的判斷。

詳細架構與設計決策見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 和 Phase 0 技術偵察筆記 [`docs/RECON_NOTES.md`](docs/RECON_NOTES.md)。

## 架構

- **前端**：`frontend/`，Vite + TypeScript 靜態網站，部署在 GitHub Pages。
- **後端**：`backend/`，Node.js + Express + Playwright，部署在 Render.com 免費 Web Service（需要跑真實的 headless Chromium，且單次查詢耗時可能落在 20-40 秒，不適合一般 serverless 平台的執行時間限制，見架構文件說明）。
- 前端呼叫後端的非同步 Job API：`POST /api/lookup` 送出查詢、`GET /api/lookup/:jobId` 輪詢結果。

## 本機開發

### 後端

```bash
cd backend
cp .env.example .env   # 填入 GOOGLE_MAPS_API_KEY，其餘可先留空
npm install
npx playwright install chromium   # 第一次需要下載瀏覽器執行檔
npm run dev
```

需要在 [Google Cloud Console](https://console.cloud.google.com/) 申請一組啟用 **Places API** 的 API 金鑰，填入 `GOOGLE_MAPS_API_KEY`。這把金鑰只在後端使用，不會出現在前端程式碼或瀏覽器裡。

> **`npx playwright install chromium` 下載失敗怎麼辦？**
> 如果出現 `ECONNREFUSED ... 127.0.0.1:443` 這種錯誤，通常是網路上有東西（路由器、Little Snitch/AdGuard/NextDNS 之類的過濾工具，或某些 AI coding agent 的沙盒環境）把 `playwright.dev` 這個下載網域擋掉了，可以用 `dscacheutil -q host -a name cdn.playwright.dev` 確認是不是被導向 `127.0.0.1`。這只影響「本機直接跑後端、用真的瀏覽器測試截圖/爬蟲功能」——**部署到 Render 不受影響**，因為 [`backend/Dockerfile`](backend/Dockerfile) 用的 `mcr.microsoft.com/playwright` 官方映像檔本身就已經內建好對應版本的 Chromium，不需要另外下載。想在本機測試的話，找出是什麼在擋這個網域（檢查路由器/防火牆/DNS 過濾設定，或換一個網路）排除掉即可；不想處理的話也可以直接跳過本機瀏覽器測試，把地理定位、Job API、前端這些不需要瀏覽器的部分測完，其餘留到部署後在 Render 上驗證。

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 是選填：沒填的話會自動 fallback 成記憶體內儲存，本機開發或還沒申請 [Upstash](https://upstash.com/) 帳號時可以先不填，但正式部署建議申請（免費額度足夠個人使用），否則 Render 免費方案重啟或休眠時查詢快取與進行中的 job 狀態會遺失。

### 前端

```bash
cd frontend
cp .env.example .env   # 指向本機後端網址，預設 http://localhost:3000
npm install
npm run dev
```

## 部署

### 後端（Render）

用 Render Dashboard 手動建立最不容易出錯：

1. 到 [Render Dashboard](https://dashboard.render.com/) → **New +** → **Web Service**，選擇 GitHub repo `HitoriGS/4g-camping-checker`（第一次要先授權 Render 存取你的 GitHub）。
2. **Root Directory** 填 `backend`；**Runtime** 選 `Docker`；Dockerfile Path 用預設的 `Dockerfile` 即可。
3. Instance Type 選 **Free**。
4. 設定環境變數：
   - `GOOGLE_MAPS_API_KEY`：你的金鑰
   - `ALLOWED_ORIGIN`：`https://hitorigs.github.io/4g-camping-checker`
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`：選填
5. 建立後等它 build 完成，記下服務網址（例如 `https://camping-signal-checker-backend.onrender.com`）。

（repo 根目錄也放了 `render.yaml`，如果你想改用 Blueprint 一鍵部署也可以，效果一樣，只是環境變數一樣要手動填。）

### 前端（GitHub Pages）

1. 到 repo 的 Settings → Pages，**Source** 選 "GitHub Actions"。
2. 到 Settings → Secrets and variables → Actions → **Variables** 分頁，新增 repository variable `VITE_API_BASE_URL`，填上一步拿到的 Render 後端網址（不要加結尾斜線）。
3. push 到 `main` 分支（或到 Actions 分頁手動觸發 `Deploy frontend to GitHub Pages`）會自動部署，完成後網址是 `https://hitorigs.github.io/4g-camping-checker/`。

### Phase 4 色票校正（首次部署前必做）

`backend/src/config/colorLegends.json` 目前的顏色都只是目測估計值。部署前請執行：

```bash
cd backend
npm run calibrate-colors
```

打開 `backend/tmp/calibration/` 底下產生的截圖，用取色工具讀出三家電信官網圖例色塊的實際 RGB 值，回填到 `colorLegends.json`，並把對應 band 的 `calibrated` 改成 `true`。電信官網改版時也需要重跑這個流程。

## 已知限制

- 電信涵蓋率是用截圖 + 顏色比對判讀，並非官方數字，僅供出發前參考。
- Google 評論擷取是對 Google 地圖頁面做自動化操作，可能違反其服務條款、可能因改版或防爬機制而失效；已加上快取（同地點 5 天內不重複爬取）降低風險，失敗時會清楚標示「暫時無法取得」而不會讓整頁掛掉。
- 三家電信官網改版會讓對應模組失效，需要人工維護；任一家查詢失敗不影響其他結果。
- Render 免費方案閒置會休眠，首次查詢可能要等 30-60 秒。
- 同名露營區可能對應多個 Google 地點，請務必核對結果頁顯示的正式地址與地圖連結是否正確。

正式訊號狀況請以現場實測為準。
