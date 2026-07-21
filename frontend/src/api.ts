import type { JobStatusResponse } from "./types";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";

export class LookupTimeoutError extends Error {
  constructor() {
    super("查詢逾時，請稍後再試一次");
    this.name = "LookupTimeoutError";
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function startLookup(name: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `查詢請求失敗 (${res.status})`);
  }
  const data = (await res.json()) as { jobId: string };
  return data.jobId;
}

const POLL_INTERVAL_MS = 2500;
// Render 免費方案冷啟動 + 3 家電信截圖判讀 + Google 評論擷取全部跑完，
// 實測可能落在 1-2 分鐘，100 秒太短會在真的查完之前就先逾時，
// 拉長到 3 分鐘給足夠的緩衝。
const MAX_POLL_MS = 180_000;

export async function pollLookup(
  jobId: string,
  onUpdate: (status: JobStatusResponse) => void,
): Promise<JobStatusResponse> {
  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      throw new LookupTimeoutError();
    }

    const res = await fetch(`${API_BASE_URL}/api/lookup/${jobId}`);
    if (!res.ok) {
      throw new Error(`查詢狀態讀取失敗 (${res.status})`);
    }
    const status = (await res.json()) as JobStatusResponse;
    onUpdate(status);

    if (status.status === "done" || status.status === "error") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
