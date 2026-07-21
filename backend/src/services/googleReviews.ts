import { openPage } from "../browser/launchBrowser.js";
import type { Locator, Page } from "playwright";
import type { ReviewItem } from "../types.js";
import { logger } from "../utils/logger.js";
import { classifySentiment, findMatchedKeywords, SIGNAL_KEYWORDS } from "../config/reviewKeywords.js";
import { formatApproxDate, parseRelativeTime } from "../utils/relativeTime.js";

const MAX_REVIEWS = 15;
const TIME_BUDGET_MS = 25_000;
const MAX_LOAD_MORE_CLICKS = 6;

export interface GoogleReviewsResult {
  reviews: ReviewItem[];
  unavailable: boolean;
  reason?: string;
}

/**
 * 到該地點的 Google 地圖頁面，先試「評論摘要主題標籤」（見 docs/RECON_NOTES.md，
 * 例如某露營區會顯示「風景 37」「兔子 34」這種自動生成的關鍵字標籤，點擊可篩選
 * 該主題的評論）比對訊號相關關鍵字；標籤沒命中就 fallback 到「捲動載入更多評論
 * 後在全文中關鍵字比對」。兩者互為備援，任何一步失敗都回傳 unavailable 而不拋錯，
 * 避免拖垮整個查詢 job。
 */
export async function fetchGoogleReviewsAboutSignal(
  mapUrl: string,
): Promise<GoogleReviewsResult> {
  const deadline = Date.now() + TIME_BUDGET_MS;
  let session: Awaited<ReturnType<typeof openPage>> | null = null;

  try {
    session = await openPage({ viewport: { width: 1280, height: 900 } });
    const { page } = session;

    await page.goto(mapUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await dismissConsentIfPresent(page);

    const reviewsTab = page.getByRole("tab", { name: /評論/ }).first();
    if (await reviewsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reviewsTab.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    const matchedTopicChip = await findMatchingTopicChip(page);
    if (matchedTopicChip) {
      await matchedTopicChip.click().catch(() => {});
      await page.waitForTimeout(1200);
    } else {
      await loadMoreReviews(page, deadline);
    }

    const reviews = await extractMatchingReviews(page);

    return { reviews: reviews.slice(0, MAX_REVIEWS), unavailable: false };
  } catch (err) {
    logger.warn("googleReviews", "Google 評論擷取失敗", { error: String(err) });
    return {
      reviews: [],
      unavailable: true,
      reason: "評論資料暫時無法取得，可能是 Google 地圖頁面結構改版或連線逾時。",
    };
  } finally {
    await session?.close();
  }
}

async function dismissConsentIfPresent(page: Page): Promise<void> {
  const labels = ["全部接受", "接受全部", "我同意", "Accept all"];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
      await button.click().catch(() => {});
      return;
    }
  }
}

async function findMatchingTopicChip(page: Page): Promise<Locator | null> {
  for (const keyword of SIGNAL_KEYWORDS) {
    const chip = page.getByRole("button", { name: new RegExp(keyword) }).first();
    if (await chip.isVisible({ timeout: 800 }).catch(() => false)) {
      return chip;
    }
  }
  return null;
}

async function loadMoreReviews(page: Page, deadline: number): Promise<void> {
  const moreButton = page.getByRole("button", { name: /更多評論/ }).first();
  if (await moreButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await moreButton.click().catch(() => {});
    await page.waitForTimeout(1200);
  }

  for (let i = 0; i < MAX_LOAD_MORE_CLICKS && Date.now() < deadline; i++) {
    const before = await page.locator('[role="article"], [data-review-id]').count();
    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(900);
    const after = await page.locator('[role="article"], [data-review-id]').count();
    if (after <= before) break;
  }
}

async function extractMatchingReviews(page: Page): Promise<ReviewItem[]> {
  const cards = page.locator('[role="article"], [data-review-id]');
  const count = Math.min(await cards.count(), 80);
  const results: ReviewItem[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const text = (await card.innerText().catch(() => "")).trim();
    if (!text) continue;

    const matchedKeywords = findMatchedKeywords(text);
    if (matchedKeywords.length === 0) continue;

    const relativeTimeMatch = text.match(/\d+\s*(分鐘|小時|天|個月|週|周|月|年)前|剛剛/);
    const relativeTime = relativeTimeMatch?.[0] ?? "時間未知";
    const parsedDate = parseRelativeTime(relativeTime);

    const ratingMatch = text.match(/([1-5])\s*(顆星|星)/);
    const rating = ratingMatch ? Number(ratingMatch[1]) : null;

    const lines = text.split("\n").filter(Boolean);
    const author = lines[0] ?? "匿名使用者";
    const reviewBody = lines.slice(1).join(" ").trim() || text;

    results.push({
      author,
      rating,
      relativeTime,
      approxDate: formatApproxDate(parsedDate),
      text: reviewBody.slice(0, 500),
      matchedKeywords,
      sentiment: classifySentiment(text),
    });
  }

  return results;
}
