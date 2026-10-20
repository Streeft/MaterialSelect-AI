import { test, expect } from "./session";

/**
 * D-152: a sheet opened with a connection is kept as text, and `/offline.html`
 * (what the service worker answers a failed navigation with) prints it under a
 * fixed notice, with the day it was read beside every value. `next dev` does not
 * register the service worker, so the page is opened by its URL — the same file.
 */

test("uma ficha aberta com conexão aparece em /offline.html, com a data da leitura em cada valor", async ({ page }) => {
  await page.goto("/app/catalogo");
  const link = page.locator("a[href^='/app/materiais/']:not([href='/app/materiais/novo']):visible").first();
  await expect(link).toBeVisible({ timeout: 45_000 });
  const name = (await link.textContent())!.trim();
  await link.click();
  await page.waitForURL(/\/app\/materiais\/\d+/, { timeout: 45_000 });
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  // The sheet is kept once the server has answered for it.
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("msai.offline.sheets")), { timeout: 15_000 })
    .not.toBeNull();

  await page.goto("/offline.html");
  const entry = page.getByRole("button", { name: new RegExp(name) });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("lida em");
  await entry.click();

  const today = await page.evaluate(() => new Date().toLocaleDateString("pt-BR"));
  const notice = page.locator("#notice");
  await expect(notice).toContainText(`Dados lidos em ${today}`);
  await expect(notice).toContainText("desatualizados");
  // The notice is fixed: it is still on screen after scrolling to the end.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(notice).toBeInViewport();

  const firstValue = page.locator("tbody tr").first();
  await expect(firstValue).toContainText("lido em " + today);
  await expect(firstValue).toContainText(/Medido|Importado|Estimado|Ausente/);
  await page.screenshot({ path: "test-results/offline-ficha.png", fullPage: true });
});
