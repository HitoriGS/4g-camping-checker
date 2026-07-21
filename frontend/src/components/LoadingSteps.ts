import type { JobStep } from "../types";

const STEPS: { key: JobStep; label: string }[] = [
  { key: "geocoding", label: "地理定位中" },
  { key: "carriers", label: "查詢電信涵蓋中" },
  { key: "reviews", label: "讀取評論中" },
  { key: "aggregating", label: "彙整分析中" },
];

export function renderLoadingSteps(): HTMLElement {
  const container = document.createElement("ol");
  container.className = "loading-steps";
  for (const step of STEPS) {
    const li = document.createElement("li");
    li.className = "loading-step";
    li.dataset.step = step.key;
    li.textContent = step.label;
    container.appendChild(li);
  }
  return container;
}

export function updateLoadingSteps(
  container: HTMLElement,
  currentStep: JobStep | undefined,
  warmingUp: boolean,
): void {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  container.querySelectorAll<HTMLLIElement>(".loading-step").forEach((el, idx) => {
    el.classList.remove("is-active", "is-done");
    if (currentIndex === -1) return;
    if (idx < currentIndex) el.classList.add("is-done");
    if (idx === currentIndex) el.classList.add("is-active");
  });

  let warmNotice = container.parentElement?.querySelector<HTMLParagraphElement>(
    ".warmup-notice",
  );
  if (warmingUp) {
    if (!warmNotice) {
      warmNotice = document.createElement("p");
      warmNotice.className = "warmup-notice";
      warmNotice.textContent = "伺服器剛甦醒，可能需要多等一下…";
      container.after(warmNotice);
    }
  } else {
    warmNotice?.remove();
  }
}
