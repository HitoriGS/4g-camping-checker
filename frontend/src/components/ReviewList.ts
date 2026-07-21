import type { ReviewItem } from "../types";

function renderStars(rating: number | null): string {
  if (rating === null) return "評分未知";
  const full = "★".repeat(Math.round(rating));
  const empty = "☆".repeat(5 - Math.round(rating));
  return full + empty;
}

function renderReviewItem(review: ReviewItem): HTMLElement {
  const item = document.createElement("li");
  item.className = `review-item review-item--${review.sentiment}`;

  const meta = document.createElement("div");
  meta.className = "review-meta";

  const stars = document.createElement("span");
  stars.className = "review-stars";
  stars.textContent = renderStars(review.rating);

  const time = document.createElement("span");
  time.className = "review-time";
  time.textContent = review.approxDate
    ? `${review.relativeTime}（約 ${review.approxDate}）`
    : review.relativeTime;

  meta.append(stars, time);

  const keywords = document.createElement("div");
  keywords.className = "review-keywords";
  for (const kw of review.matchedKeywords) {
    const tag = document.createElement("span");
    tag.className = "keyword-tag";
    tag.textContent = kw;
    keywords.appendChild(tag);
  }

  const text = document.createElement("p");
  text.className = "review-text";
  text.textContent = review.text;

  const author = document.createElement("span");
  author.className = "review-author";
  author.textContent = review.author;

  item.append(meta, keywords, text, author);
  return item;
}

export function renderReviewList(
  reviews: ReviewItem[],
  unavailable: boolean,
  unavailableReason?: string,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "review-list-container";

  const heading = document.createElement("h3");
  heading.textContent = "評論中提到網路／訊號的內容";
  container.appendChild(heading);

  if (unavailable) {
    const notice = document.createElement("p");
    notice.className = "reviews-unavailable";
    notice.textContent = unavailableReason ?? "評論資料暫時無法取得";
    container.appendChild(notice);
    return container;
  }

  if (reviews.length === 0) {
    const empty = document.createElement("p");
    empty.className = "reviews-empty";
    empty.textContent = "目前沒有找到明確提到網路／訊號狀況的評論。";
    container.appendChild(empty);
    return container;
  }

  const list = document.createElement("ul");
  list.className = "review-list";
  for (const review of reviews) {
    list.appendChild(renderReviewItem(review));
  }
  container.appendChild(list);
  return container;
}
