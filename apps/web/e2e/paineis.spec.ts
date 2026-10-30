import { test, expect } from "./session";

/**
 * D-182: `PaneScaffold` decides one or two panes by its own width (container
 * queries), which jsdom does not evaluate. The specimens on `/app/estilo` are
 * measured here: below 840 px of block width the list-detail shows one pane
 * and the supporting pane stacks; from 840 px up both sit side by side.
 */
async function measure(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".m3-scaffold")).map((el) => {
      const grid = el.firstElementChild as HTMLElement;
      return {
        width: el.getBoundingClientRect().width,
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        shown: Array.from(grid.children).map((pane) => getComputedStyle(pane).display !== "none"),
      };
    }),
  );
}

test("dois painéis lado a lado quando o bloco tem 840 px ou mais", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/estilo");
  await expect(page.locator(".m3-scaffold").first()).toBeAttached({ timeout: 45_000 });

  const [listDetail, supporting] = await measure(page);
  expect(listDetail!.width).toBeGreaterThanOrEqual(840);
  expect(listDetail).toMatchObject({ columns: 2, shown: [true, true] });
  expect(supporting).toMatchObject({ columns: 2, shown: [true, true] });
});

test("um painel por vez no celular; o apoio desce para baixo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/estilo");
  await expect(page.locator(".m3-scaffold").first()).toBeAttached({ timeout: 45_000 });

  const [listDetail, supporting] = await measure(page);
  expect(listDetail).toMatchObject({ columns: 1, shown: [true, false] });
  expect(supporting).toMatchObject({ columns: 1, shown: [true, true] });
});
