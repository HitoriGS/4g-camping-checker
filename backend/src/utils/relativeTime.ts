const UNIT_TO_MS: Record<string, number> = {
  分鐘: 60_000,
  小時: 3_600_000,
  天: 86_400_000,
  週: 7 * 86_400_000,
  周: 7 * 86_400_000,
  個月: 30 * 86_400_000,
  月: 30 * 86_400_000,
  年: 365 * 86_400_000,
};

const RELATIVE_PATTERN = /(\d+)\s*(分鐘|小時|天|個月|週|周|月|年)前/;

/**
 * Google Maps 評論的相對時間是概略字串（如「4 個月前」），這裡只能反推出「大約」的絕對日期，
 * 精確度以月為單位即可，不追求到日。
 */
export function parseRelativeTime(relative: string, now: Date = new Date()): Date | null {
  const trimmed = relative.trim();
  if (trimmed.includes("剛剛") || trimmed.includes("今天")) {
    return now;
  }

  const match = trimmed.match(RELATIVE_PATTERN);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs = UNIT_TO_MS[unit];
  if (!unitMs || Number.isNaN(amount)) return null;

  return new Date(now.getTime() - amount * unitMs);
}

export function formatApproxDate(date: Date | null): string | null {
  if (!date) return null;
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/**
 * 評論新舊加權：3 個月內全權重、3-12 個月半權重、超過 1 年四分之一權重。
 * 對應 docs 計畫中「適合度計分」的評論時間加權設計。
 */
export function recencyWeight(date: Date | null, now: Date = new Date()): number {
  if (!date) return 0.5;
  const ageMs = now.getTime() - date.getTime();
  const threeMonthsMs = 90 * 86_400_000;
  const oneYearMs = 365 * 86_400_000;
  if (ageMs <= threeMonthsMs) return 1;
  if (ageMs <= oneYearMs) return 0.5;
  return 0.25;
}
