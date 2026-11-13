import type { Page } from "@playwright/test";
import { test, expect } from "./session";
import { ROUTES } from "./rotas";
import { describeFound, runAxe } from "./axe";

/**
 * D-226: axe on every route the suite covers, in the real browser (the component
 * tests run axe in jsdom, which has no layout: no colour contrast, no scrollable
 * regions, no landmarks of a whole page). Two widths — a notebook and a phone —
 * because the shell (menu, bottom bar) and the figures differ.
 *
 * No rule is switched off. A violation fails the test with its rule, impact and
 * the first nodes, so the fix is in the component and not in this file.
 *
 * `axe-core` is already a dependency (the component tests use it); the script is
 * injected from the package instead of adding `@axe-core/playwright`.
 */

const WIDTHS = [
  { name: "notebook", width: 1280, height: 800 },
  { name: "telefone", width: 390, height: 844 },
] as const;

async function settle(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle");
  // Figures draw after the network goes quiet; axe must see them drawn.
  await page.waitForTimeout(600);
}

for (const [slug, path] of ROUTES) {
  test(`${path} passa no axe no notebook e no telefone`, async ({ page }) => {
    for (const { name, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await settle(page);
      const found = await runAxe(page);
      expect(found, `${slug} a ${width}px (${name}):\n${describeFound(found)}`).toEqual([]);
    }
  });
}

// D-235: the dark theme, which the loop above never saw — its contrast was only
// measured at token level (D-29), and a screen that overrides a token for its own
// section can break it (the Estilo specimen cards did). One width: axe's colour
// check does not depend on it, and the 1920 px layout is covered by `larguras`.
for (const [slug, path] of ROUTES) {
  test(`${path} passa no axe no tema escuro`, async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("materialselect:theme", "dark");
      } catch {
        /* a private window: the test then runs in whatever theme the browser gives */
      }
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const found = await runAxe(page);
    expect(found, `${slug} no tema escuro:\n${describeFound(found)}`).toEqual([]);
  });
}

test("a ficha de um material passa no axe (aberta, com os semelhantes)", async ({ page }) => {
  await page.goto("/app/catalogo");
  const firstMaterial = page.locator('main table a[href^="/app/materiais/"]').first();
  await expect(firstMaterial).toBeVisible({ timeout: 45_000 });
  const href = await firstMaterial.getAttribute("href");
  for (const { name, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto(href!);
    await settle(page);
    await page.locator("#semelhantes summary").first().click();
    const found = await runAxe(page);
    expect(found, `${href} a ${width}px (${name}):\n${describeFound(found)}`).toEqual([]);
  }
});
