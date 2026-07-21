import type { CarrierResult, CoverageLevel } from "../types";

const LEVEL_LABEL: Record<CoverageLevel, string> = {
  good: "良好",
  fair: "普通",
  weak: "偏弱",
  unknown: "無法判讀",
};

const LEVEL_CLASS: Record<CoverageLevel, string> = {
  good: "level-good",
  fair: "level-fair",
  weak: "level-weak",
  unknown: "level-unknown",
};

function bandBadge(label: string, level: CoverageLevel): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "band-badge";

  const bandLabel = document.createElement("span");
  bandLabel.className = "band-label";
  bandLabel.textContent = label;

  const levelPill = document.createElement("span");
  levelPill.className = `level-pill ${LEVEL_CLASS[level]}`;
  levelPill.textContent = LEVEL_LABEL[level];

  wrap.append(bandLabel, levelPill);
  return wrap;
}

export function renderCarrierCard(result: CarrierResult): HTMLElement {
  const card = document.createElement("div");
  card.className = "carrier-card";

  const title = document.createElement("h3");
  title.textContent = result.displayName;
  card.appendChild(title);

  if (result.unavailable) {
    const notice = document.createElement("p");
    notice.className = "carrier-unavailable";
    notice.textContent = result.reason ?? "暫時無法取得這家電信的涵蓋資料";
    card.appendChild(notice);
    return card;
  }

  const bands = document.createElement("div");
  bands.className = "band-row";
  bands.append(
    bandBadge("4G", result.band4G),
    bandBadge("5G", result.band5G),
  );
  card.appendChild(bands);

  if (result.note) {
    const note = document.createElement("p");
    note.className = "carrier-note";
    note.textContent = result.note;
    card.appendChild(note);
  }

  return card;
}

export function renderCarrierSkeleton(displayName: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "carrier-card carrier-card--skeleton";
  const title = document.createElement("h3");
  title.textContent = displayName;
  const loading = document.createElement("p");
  loading.className = "skeleton-text";
  loading.textContent = "查詢中…";
  card.append(title, loading);
  return card;
}
