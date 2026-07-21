# 架構決策紀錄

## 為什麼不是純靜態 GitHub Pages？

三大電信的涵蓋率查詢頁面都沒有公開 API（見 [`RECON_NOTES.md`](RECON_NOTES.md)），涵蓋等級只能透過「打開頁面、操作表單、對地圖疊圖顏色做判讀」取得。Google 評論裡「提到訊號的內容」也沒有官方 API 能直接篩選。這兩件事都需要跑真實的 headless browser（Playwright），純瀏覽器端 JavaScript 做不到（會被瀏覽器同源政策擋下，而且不該把這種瀏覽器自動化邏輯丟給使用者的瀏覽器去跑）。因此最終架構是「GitHub Pages 前端 + 一個持久化的免費後端」。

## 為什麼後端選 Render 而不是一般 serverless（Vercel/Netlify Functions）？

一次完整查詢要開 4 個瀏覽器工作（3 家電信 + Google 評論），實測耗時容易落在 20-40 秒。一般 serverless 平台的免費方案有嚴格的單次請求時限（10-60 秒），而且每次呼叫都要重新啟動瀏覽器（無法保溫常駐），更容易超時。Render 免費 Web Service 是持久化容器，沒有這個限制，可以讓一個 Chromium 實例常駐、多個查詢共用（見 `backend/src/browser/launchBrowser.ts`），也能直接用完整版 Playwright/Chromium，不用處理 `@sparticuz/chromium` 這類 serverless 專用精簡瀏覽器常見的版本相容性問題。

代價是免費方案閒置會休眠，首次查詢可能要等 30-60 秒喚醒；`.github/workflows/keep-alive.yml` 在常見的直播規劃時段（傍晚到深夜）定期 ping，緩解這個問題但不是根治。

## 為什麼是非同步 Job + 輪詢，而不是一個同步 API？

同上，單次查詢耗時遠超使用者能忍受、也超過大多數 HTTP client/proxy 的預設逾時。`POST /api/lookup` 立即回傳 `jobId`，背景執行 pipeline，前端輪詢 `GET /api/lookup/:jobId`。每個子任務（3 家電信 + 評論）各自完成後立即把結果寫回 job（見 `backend/src/jobs/jobRunner.ts` 的 `addCarrierResult`/`patchJobResult`），前端因此能「部分結果先出」，不用整批等到全部做完才看到東西。

## 為什麼電信/評論結果要快取？

Google 評論擷取本質上是對 Google 地圖頁面的自動化操作，頻繁請求容易觸發防爬機制或違反服務條款風險；電信官網也不樂見被高頻查詢。`backend/src/jobs/cache.ts` 用地點的 Google `place_id` 當 key，快取 5 天，同一個地點短期內重複查詢會直接命中快取，不會再開瀏覽器。快取層優先用 Upstash Redis（免費額度、有 TTL、跨行程持久），沒設定的話 fallback 成記憶體內 Map（僅限單一 process 存活期間，重啟即遺失，適合本機開發）。

## 為什麼任何一家電信或評論失敗不會讓整頁掛掉？

三個電信模組與評論模組各自獨立 try/catch，失敗時回傳 `unavailable: true` 而不是拋出例外讓整個 job 失敗（見 `backend/src/services/carriers/*.ts` 與 `googleReviews.ts`）。這幾個外部網站的 DOM 結構本來就可能隨時改版、Google 地圖也可能出現驗證機制，把「單一資料源失敗」跟「整個查詢失敗」解耦，是讓這個工具長期堪用的關鍵設計。
