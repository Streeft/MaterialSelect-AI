import { expect, type Page } from "@playwright/test";

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

  const option = page.getByRole("option", { name: optionName });
  await option.click();

  // Do not hand control back while the popup is still up. `md-menu` closes on
  // an animation, and this helper used to return mid-close: the spec's next
  // `click()` then landed on an `md-select-option` overlaying its target and
  // retried until the test timed out. It only showed up when the route was
  // already compiled (a spec running second in the same worker) — the slow
  // first-visit compile was hiding the race, not preventing it.
  //
  // The wait is on the *option*, not on the listbox: measured on this
  // component, `md-menu` (role=listbox) reports `visible=false` to Playwright
  // even while open, so asserting on it would be a no-op that waits for
  // nothing. The option is genuinely visible while the popup is up — and it is
  // what intercepts the next click — so it is the honest thing to wait on.
  await expect(option).toBeHidden();
}
