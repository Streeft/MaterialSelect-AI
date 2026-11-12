import { test, expect } from "./session";

/**
 * D-214: the comparator and the material sheet in a real browser, against the
 * real backend. The comparator says who is best per property (the backend's
 * `best_material_ids`), hides the columns that separate nobody on request, keeps
 * its view in the address.
 * The sheet opens short: one primary action, a "⋯" menu, an outline, the long
 * blocks folded and loaded only when opened.
 */

const API = "http://127.0.0.1:8811";

async function materialIds(page: import("@playwright/test").Page, count: number): Promise<number[]> {
  const response = await page.request.get(`${API}/api/materials`);
  expect(response.ok()).toBe(true);
  const rows = (await response.json()) as { id: number }[];
  expect(rows.length).toBeGreaterThanOrEqual(count);
  return rows.slice(0, count).map((row) => row.id);
}

test("comparar: estado vazio com atalhos, melhor por propriedade, só diferenças e visão no link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // Nothing chosen: the page says what to do instead of a bare "nenhum material".
  await page.goto("/app/comparar");
  await expect(
    page.getByRole("heading", { name: "Escolha 2 ou mais materiais para comparar" }),
  ).toBeVisible({ timeout: 45_000 });

  // A table, with the best of a property marked by the backend's own verdict.
  const ids = await materialIds(page, 4);
  await page.goto(`/app/comparar?materiais=${ids.slice(0, 4).join(",")}`);
  await expect(page.getByRole("table").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Melhor", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  // "Só diferenças" travels in the address and says what it hid.
  await page.locator("label", { hasText: "Só diferenças" }).click();
  await expect(page).toHaveURL(/diferencas=1/);

  // A view travels too: the address opens on it and changing it rewrites the address.
  // (The radar's advice for a crowd needs more materials than the E2E seed has;
  // the component test covers it with 20.)
  await page.goto(`/app/comparar?materiais=${ids.join(",")}&visao=heatmap`);
  await expect(page.getByRole("tab", { name: "Heatmap" })).toHaveAttribute("aria-selected", "true", {
    timeout: 45_000,
  });
  await page.getByRole("tab", { name: "Tabela" }).click();
  await expect(page).not.toHaveURL(/visao=/);
});

test("ficha: abre curta, com sumário, ações agrupadas e blocos longos dobrados", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const [id] = await materialIds(page, 1);
  await page.goto(`/app/materiais/${id}`);
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });

  const outline = page.getByRole("navigation", { name: "Seções da ficha" });
  await expect(outline).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumo da ficha" })).toBeVisible();

  // The long blocks are folded, and the sheet is a fraction of the 7.000 px it was.
  for (const section of ["semelhantes", "curvas", "equivalencias", "ordinais"]) {
    await expect(page.locator(`#${section} details`).first()).not.toHaveAttribute("open", "");
  }
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThan(5000);

  // Nothing scrolls sideways at the widths the sheet is read in.
  for (const width of [1920, 1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `largura ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // The outline opens the folded section it points to.
  await outline.getByRole("link", { name: "Curvas" }).click();
  await expect(page.locator("#curvas details").first()).toHaveAttribute("open", "");

  // One primary, the rest under "⋯".
  await page.getByRole("button", { name: "Mais ações" }).click();
  await expect(page.getByRole("menuitem", { name: /Ver no mapa/ })).toBeVisible();
});
