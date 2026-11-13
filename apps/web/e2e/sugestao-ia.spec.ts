import { test, expect } from "./session";

/**
 * D-229: the "Sugestão da IA" panel in a real browser against the real backend
 * with the `mock` provider (`AI_PROVIDER=mock`), whose cards are the local
 * rules' — deterministic. The labels of the buttons are written by the server
 * ("Eixos: A × B", "Filtrar classe: X"), so the assertions match their shape.
 * Nothing is asked until the button is pressed, and nothing is applied until a
 * suggestion's own button is.
 */

function mapState(url: string): { xAxis?: { property?: string }; yAxis?: { property?: string } } | null {
  const raw = new URL(url).searchParams.get("estado");
  if (!raw) return null;
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

test("Mapas: pedir a sugestão e usar os eixos sugeridos troca os eixos no endereço", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/suggest")) asked.push(request.url());
  });
  await page.goto("/app/mapas");
  await expect(page.getByRole("heading", { name: "Mapas de propriedades" })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".chart-plotly .main-svg").first()).toBeVisible({ timeout: 45_000 });
  // The landing map keeps the address clean, and nothing was asked of the AI.
  expect(new URL(page.url()).searchParams.get("estado")).toBeNull();
  expect(asked).toHaveLength(0);

  await page.getByRole("button", { name: "Sugestão da IA" }).click();
  const axes = page.getByRole("button", { name: /^Eixos: / }).first();
  await expect(axes).toBeVisible({ timeout: 30_000 });
  expect(asked).toHaveLength(1);

  await axes.click();
  await expect(page).toHaveURL(/estado=/, { timeout: 20_000 });
  const state = mapState(page.url());
  expect(state?.xAxis?.property).toBe("densidade");
  expect(state?.yAxis?.property).toBeTruthy();
  expect(state?.yAxis?.property).not.toBe("modulo_young");
});

test("Catálogo: uma sugestão aplica um filtro de classe e a lista segue o endereço", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/catalogo");
  await expect(page.getByRole("heading", { name: "Catálogo de materiais" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Sugestão da IA" }).click();
  const filter = page.getByRole("button", { name: /^Filtrar classe: / }).first();
  await expect(filter).toBeVisible({ timeout: 30_000 });
  await filter.click();
  await expect(page).toHaveURL(/classe=[a-z0-9-]+/, { timeout: 20_000 });
});
