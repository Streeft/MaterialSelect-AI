import type { Page } from "@playwright/test";

/**
 * Picks an option on an `md-outlined-select` in an E2E spec.
 *
 * Playwright's `.selectOption()` only knows how to drive a native `<select>`
 * (it reaches for `.options`/`.selectedOptions` internally) — `md-outlined-
 * select` has neither, so that method throws on this control regardless of
 * how the locator is written.
 *
 * `getByLabel(comboboxName)` is ambiguous on this component for a second,
 * independent reason: the select's own `label` is mirrored as `aria-label`
 * onto *two* elements in its shadow DOM — the visible `md-outlined-field`
 * (`role="combobox"`) and the `md-menu` popup (`role="listbox"`) — so a
 * label-based locator resolves to both and Playwright's strict mode rejects
 * it. `getByRole("combobox", {name})` is unambiguous, matching only the
 * field.
 *
 * This drives the control the way a user would: open the popup, then click
 * the option by its own accessible role (`md-select-option` reports
 * `role="option"` — see `menuItemController.js`), so the same `click`-driven
 * path that fires the select's real `input`/`change` events runs, instead of
 * calling an imperative API that skips them.
 */
export async function selectMwcOption(page: Page, comboboxName: string, optionName: string) {
  await page.getByRole("combobox", { name: comboboxName }).click();
  await page.getByRole("option", { name: optionName }).click();
}
