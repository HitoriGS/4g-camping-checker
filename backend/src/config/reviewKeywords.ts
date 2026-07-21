/** 用來在 Google 評論主題標籤或全文中比對「網路／訊號」相關內容的關鍵字。 */
export const SIGNAL_KEYWORDS = [
  "訊號",
  "信號",
  "網路",
  "收訊",
  "4G",
  "5G",
  "斷線",
  "收不到",
  "WIFI",
  "Wifi",
  "wifi",
  "熱點",
  "沒網",
];

export const NEGATIVE_SIGNAL_WORDS = [
  "沒訊號",
  "沒有訊號",
  "收不到訊號",
  "收不到網路",
  "沒有網路",
  "沒網路",
  "沒網",
  "訊號差",
  "收訊差",
  "訊號不穩",
  "收訊不穩",
  "網路不穩",
  "斷線",
  "訊號很差",
  "完全沒訊號",
  "無訊號",
];

export const POSITIVE_SIGNAL_WORDS = [
  "訊號穩定",
  "收訊良好",
  "網路順",
  "訊號好",
  "收訊佳",
  "網路穩定",
  "有訊號",
  "訊號不錯",
  "收訊不錯",
  "網路很好",
  "訊號良好",
];

export function findMatchedKeywords(text: string): string[] {
  const matched = new Set<string>();
  for (const keyword of SIGNAL_KEYWORDS) {
    if (text.includes(keyword)) matched.add(keyword);
  }
  return [...matched];
}

export function classifySentiment(text: string): "positive" | "negative" | "neutral" {
  const hasNegative = NEGATIVE_SIGNAL_WORDS.some((w) => text.includes(w));
  if (hasNegative) return "negative";
  const hasPositive = POSITIVE_SIGNAL_WORDS.some((w) => text.includes(w));
  if (hasPositive) return "positive";
  return "neutral";
}
