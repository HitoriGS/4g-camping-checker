import type { SuitabilityResult } from "../types";

const LEVEL_META: Record<
  SuitabilityResult["level"],
  { label: string; className: string }
> = {
  good: { label: "適合直播", className: "suitability-good" },
  ok: { label: "勉強可以，建議準備備援方案", className: "suitability-ok" },
  bad: { label: "不建議，訊號風險高", className: "suitability-bad" },
};

export function renderSuitabilityBadge(result: SuitabilityResult): HTMLElement {
  const wrap = document.createElement("div");
  const meta = LEVEL_META[result.level];
  wrap.className = `suitability-badge ${meta.className}`;

  const label = document.createElement("div");
  label.className = "suitability-label";
  label.textContent = meta.label;

  const summary = document.createElement("p");
  summary.className = "suitability-summary";
  summary.textContent = result.summary;

  wrap.append(label, summary);
  return wrap;
}
