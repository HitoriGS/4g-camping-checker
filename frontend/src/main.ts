import "./styles.css";
import { checkHealth, LookupTimeoutError, pollLookup, startLookup } from "./api";
import { renderCarrierCard, renderCarrierSkeleton } from "./components/CarrierCard";
import { renderReviewList } from "./components/ReviewList";
import { renderSuitabilityBadge } from "./components/SuitabilityBadge";
import { renderLoadingSteps, updateLoadingSteps } from "./components/LoadingSteps";
import type { CarrierId, JobStatusResponse } from "./types";

const CARRIER_DISPLAY_NAMES: Record<CarrierId, string> = {
  CHT: "中華電信",
  TWM: "台灣大哥大",
  FET: "遠傳電信",
};

const THROTTLE_MS = 30_000;
const lastQueryAt = new Map<string, number>();

const form = document.querySelector<HTMLFormElement>("#lookup-form")!;
const input = document.querySelector<HTMLInputElement>("#campsite-input")!;
const submitButton = document.querySelector<HTMLButtonElement>("#lookup-submit")!;
const throttleNotice = document.querySelector<HTMLParagraphElement>("#throttle-notice")!;
const resultSection = document.querySelector<HTMLElement>("#result-section")!;

function normalizeQuery(name: string): string {
  return name.trim().toLowerCase();
}

function showThrottleNotice(remainingSeconds: number) {
  throttleNotice.hidden = false;
  throttleNotice.textContent = `這個地點剛查過，請 ${remainingSeconds} 秒後再試（避免對外部網站造成過多請求）。`;
}

function hideThrottleNotice() {
  throttleNotice.hidden = true;
  throttleNotice.textContent = "";
}

function renderLoadingState(name: string): { loadingSteps: HTMLElement } {
  resultSection.hidden = false;
  resultSection.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = `正在查詢「${name}」…`;
  resultSection.appendChild(heading);

  const loadingSteps = renderLoadingSteps();
  resultSection.appendChild(loadingSteps);

  const skeletonGrid = document.createElement("div");
  skeletonGrid.className = "carrier-grid";
  skeletonGrid.id = "carrier-grid";
  for (const carrier of Object.values(CARRIER_DISPLAY_NAMES)) {
    skeletonGrid.appendChild(renderCarrierSkeleton(carrier));
  }
  resultSection.appendChild(skeletonGrid);

  return { loadingSteps };
}

function renderError(message: string) {
  resultSection.hidden = false;
  resultSection.innerHTML = "";
  const errorBox = document.createElement("div");
  errorBox.className = "error-box";
  errorBox.textContent = message;
  resultSection.appendChild(errorBox);
}

function renderResult(status: JobStatusResponse) {
  resultSection.innerHTML = "";
  const result = status.result;
  if (!result) return;

  if (result.place) {
    const placeHeader = document.createElement("div");
    placeHeader.className = "place-header";

    const name = document.createElement("h2");
    name.textContent = result.place.name;

    const address = document.createElement("p");
    address.className = "place-address";
    address.textContent = result.place.formattedAddress;

    const link = document.createElement("a");
    link.href = result.place.mapUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "place-map-link";
    link.textContent = "在 Google 地圖開啟";

    placeHeader.append(name, address, link);

    if (typeof result.place.rating === "number") {
      const rating = document.createElement("p");
      rating.className = "place-rating";
      rating.textContent = `Google 評分 ${result.place.rating}（${result.place.userRatingsTotal ?? 0} 則評論）`;
      placeHeader.appendChild(rating);
    }

    resultSection.appendChild(placeHeader);
  }

  if (result.suitability) {
    resultSection.appendChild(renderSuitabilityBadge(result.suitability));
  }

  const carrierGrid = document.createElement("div");
  carrierGrid.className = "carrier-grid";
  const carriers = result.carriers ?? [];
  if (carriers.length > 0) {
    for (const carrier of carriers) {
      carrierGrid.appendChild(renderCarrierCard(carrier));
    }
  } else {
    for (const carrier of Object.values(CARRIER_DISPLAY_NAMES)) {
      carrierGrid.appendChild(renderCarrierSkeleton(carrier));
    }
  }
  resultSection.appendChild(carrierGrid);

  resultSection.appendChild(
    renderReviewList(
      result.reviews ?? [],
      result.reviewsUnavailable ?? false,
      result.reviewsUnavailableReason,
    ),
  );
}

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault();
  const rawName = input.value;
  const name = rawName.trim();
  if (!name) return;

  const key = normalizeQuery(name);
  const now = Date.now();
  const last = lastQueryAt.get(key);
  if (last && now - last < THROTTLE_MS) {
    showThrottleNotice(Math.ceil((THROTTLE_MS - (now - last)) / 1000));
    return;
  }
  hideThrottleNotice();
  lastQueryAt.set(key, now);

  submitButton.disabled = true;
  const { loadingSteps } = renderLoadingState(name);

  try {
    const isHealthy = await checkHealth();
    const jobId = await startLookup(name);

    const finalStatus = await pollLookup(jobId, (status) => {
      updateLoadingSteps(loadingSteps, status.step, !isHealthy && status.status !== "done");
      if (status.result) {
        renderResult(status);
        resultSection.appendChild(loadingSteps);
      }
    });

    if (finalStatus.status === "error") {
      renderError(finalStatus.error ?? "查詢時發生錯誤，請稍後再試。");
      return;
    }
    renderResult(finalStatus);
  } catch (err) {
    if (err instanceof LookupTimeoutError) {
      renderError("查詢超過等待時間，伺服器可能忙碌中，請稍後再試一次。");
    } else {
      const message = err instanceof Error ? err.message : "發生未知錯誤";
      renderError(message);
    }
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  void handleSubmit(event as SubmitEvent);
});
