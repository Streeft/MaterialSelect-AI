import { test, expect } from "./session";

/**
 * D-148: opening a material from its row (desktop) or card (phone) grows a surface out of the card (the
 * container transform), and does not under `prefers-reduced-motion`. The surface
 * is an empty `<div data-container-transform>` on `<body>` for ~350 ms.
 * D-185: on a wide list the row opens the preview pane first; the sheet is opened
 * from its "Abrir ficha completa" link, which marks the same origin.
 */

const SURFACE = "[data-container-transform]";

async function openFirstCard(page: import("@playwright/test").Page) {
  await page.goto("/app/catalogo");
  const link = page.locator("a[href^='/app/materiais/']:not([href='/app/materiais/novo']):visible").first();
  await expect(link).toBeVisible({ timeout: 45_000 });
  // `next dev` compiles the detail route on its first visit, which can outlast the
  // freshness window of the origin (1.5 s) and so would, correctly, skip the
  // animation. Visit it once so the click below is a warm client-side navigation.
  const href = await link.getAttribute("href");
  await page.goto(href!);
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  await page.goBack();
  await expect(link).toBeVisible({ timeout: 45_000 });
  return link;
}

async function openSheet(page: import("@playwright/test").Page, link: import("@playwright/test").Locator) {
  await link.click();
  const openFull = page.getByRole("link", { name: "Abrir ficha completa" });
  await expect(openFull).toBeVisible({ timeout: 45_000 });
  await openFull.click();
}

test("abrir um material pelo cartão faz a superfície nascer do cartão e sumir", async ({ page }) => {
  // The surface lives ~350 ms: watch for it from inside the page, or the check races it.
  await page.addInitScript(() => {
    (window as unknown as { __surfaceSeen: boolean }).__surfaceSeen = false;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.hasAttribute("data-container-transform")) {
            (window as unknown as { __surfaceSeen: boolean }).__surfaceSeen = true;
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const link = await openFirstCard(page);
  await openSheet(page, link);
  await page.waitForURL(/\/app\/materiais\/\d+/, { timeout: 45_000 });
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  expect(await page.evaluate(() => (window as unknown as { __surfaceSeen: boolean }).__surfaceSeen)).toBe(true);
  await expect(page.locator(SURFACE)).toHaveCount(0);
});

test("com redução de movimento nenhuma superfície aparece", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    (window as unknown as { __surfaceSeen: boolean }).__surfaceSeen = false;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.hasAttribute("data-container-transform")) {
            (window as unknown as { __surfaceSeen: boolean }).__surfaceSeen = true;
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const link = await openFirstCard(page);
  await openSheet(page, link);
  await page.waitForURL(/\/app\/materiais\/\d+/, { timeout: 45_000 });
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  expect(await page.evaluate(() => (window as unknown as { __surfaceSeen: boolean }).__surfaceSeen)).toBe(false);
});
