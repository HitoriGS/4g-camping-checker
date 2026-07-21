import type { Page } from "playwright";

/**
 * TWM/FET 的地址表單是 ARIA combobox 樣式的自訂下拉選單（非原生 <select>），
 * 用「點開 → 依可見文字點選項目」的通用流程操作，比硬寫 CSS class 選擇器更耐改版。
 * 找不到完全相符的選項時，退而求其次比對「包含」該文字的選項。
 */
export async function selectComboboxOption(
  page: Page,
  comboboxLabelOrPlaceholder: string,
  optionText: string,
  timeoutMs = 5000,
): Promise<void> {
  const trigger = page.getByRole("combobox", { name: comboboxLabelOrPlaceholder }).first();
  await trigger.click({ timeout: timeoutMs });

  const exactOption = page.getByRole("option", { name: optionText, exact: true }).first();
  const looseOption = page.getByText(optionText, { exact: false }).first();

  try {
    await exactOption.waitFor({ state: "visible", timeout: timeoutMs });
    await exactOption.click();
    return;
  } catch {
    await looseOption.click({ timeout: timeoutMs });
  }
}

export async function dismissCookieBanner(page: Page): Promise<void> {
  const candidates = ["我知道了", "同意", "接受", "Accept", "知道了"];
  for (const label of candidates) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click().catch(() => {});
      return;
    }
  }
}
