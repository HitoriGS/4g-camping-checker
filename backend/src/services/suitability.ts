import type { CarrierResult, CoverageLevel, ReviewItem, SuitabilityResult } from "../types.js";

const LEVEL_SCORE: Record<CoverageLevel, number> = {
  good: 2,
  fair: 0,
  weak: -2,
  unknown: -1,
};

function bestCarrierScore(carriers: CarrierResult[]): { score: number; allWeak: boolean } {
  const usable = carriers.filter((c) => !c.unavailable);
  if (usable.length === 0) return { score: -1, allWeak: true };

  const perCarrierBest = usable.map((c) =>
    Math.max(LEVEL_SCORE[c.band4G], LEVEL_SCORE[c.band5G]),
  );
  const best = Math.max(...perCarrierBest);
  const allWeak = usable.every((c) => c.band4G === "weak" && c.band5G === "weak");
  return { score: best, allWeak };
}

function reviewScore(reviews: ReviewItem[]): number {
  if (reviews.length === 0) return 0;

  let total = 0;
  for (const review of reviews) {
    const base = review.sentiment === "negative" ? -2 : review.sentiment === "positive" ? 1 : 0;
    total += base * recencyWeightFromApproxDate(review.approxDate);
  }
  return total / reviews.length;
}

function recencyWeightFromApproxDate(approxDate: string | null): number {
  if (!approxDate) return 0.5;
  const match = approxDate.match(/(\d+)年(\d+)月/);
  if (!match) return 0.5;
  const [, yearStr, monthStr] = match;
  const reviewDate = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  const ageMs = Date.now() - reviewDate.getTime();
  const threeMonthsMs = 90 * 86_400_000;
  const oneYearMs = 365 * 86_400_000;
  if (ageMs <= threeMonthsMs) return 1;
  if (ageMs <= oneYearMs) return 0.5;
  return 0.25;
}

/**
 * 電信端取三家中「最佳一家」（能連上一家夠強的即可），評論端依情緒與新舊加權，
 * 兩者加權合併成燈號。三家全弱/無資料時額外扣分並特別警示。對應計畫中的適合度設計。
 */
export function computeSuitability(
  carriers: CarrierResult[],
  reviews: ReviewItem[],
): SuitabilityResult {
  const { score: carrierScoreRaw, allWeak } = bestCarrierScore(carriers);
  const carrierScore = allWeak ? carrierScoreRaw - 1.5 : carrierScoreRaw;
  const reviewScoreValue = reviewScore(reviews);

  const finalScore = carrierScore * 0.6 + reviewScoreValue * 0.4;

  const negativeReviewCount = reviews.filter((r) => r.sentiment === "negative").length;

  let level: SuitabilityResult["level"];
  if (finalScore >= 1) level = "good";
  else if (finalScore >= -0.5) level = "ok";
  else level = "bad";

  const summary = buildSummary({
    carriers,
    allWeak,
    negativeReviewCount,
    totalReviews: reviews.length,
    level,
  });

  return { score: Number(finalScore.toFixed(2)), level, summary };
}

function buildSummary(params: {
  carriers: CarrierResult[];
  allWeak: boolean;
  negativeReviewCount: number;
  totalReviews: number;
  level: SuitabilityResult["level"];
}): string {
  const { carriers, allWeak, negativeReviewCount, totalReviews, level } = params;

  const available = carriers.filter((c) => !c.unavailable);
  const carrierPhrase =
    available.length === 0
      ? "三家電信的涵蓋資料目前都無法取得"
      : allWeak
        ? "三家電信在這個地點的涵蓋都偏弱"
        : available
            .map((c) => `${c.displayName} 4G ${levelLabel(c.band4G)}／5G ${levelLabel(c.band5G)}`)
            .join("；");

  const reviewPhrase =
    totalReviews === 0
      ? "目前沒有找到明確提到網路狀況的評論"
      : negativeReviewCount > 0
        ? `有 ${negativeReviewCount} 則評論提到訊號不佳`
        : `找到的 ${totalReviews} 則相關評論多為正面`;

  const verdictPhrase =
    level === "good"
      ? "整體來說適合安排直播。"
      : level === "ok"
        ? "建議準備備援方案（行動電源、備用 SIM、或先下載離線地圖）。"
        : "訊號風險較高，建議直播前先有備案或現場實測。";

  return `${carrierPhrase}；${reviewPhrase}。${verdictPhrase}`;
}

function levelLabel(level: CoverageLevel): string {
  return { good: "良好", fair: "普通", weak: "偏弱", unknown: "未知" }[level];
}
