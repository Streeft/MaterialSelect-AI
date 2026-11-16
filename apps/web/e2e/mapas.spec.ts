import { test, expect } from "./session";

/**
 * D-213: the map's reading path in a real browser against the real backend —
 * a classic Ashby chart applied with one click (`GET /api/charts/presets`), a
 * box drawn on the real Plotly figure, and the records inside it sent to the
 * comparator. The ids in the comparator's address are the ones the box held.
 */
test("mapa clássico, caixa no gráfico e Comparar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/mapas");
  await expect(page.getByRole("heading", { name: "Mapas de propriedades" })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator(".chart-plotly .main-svg").first()).toBeVisible({ timeout: 45_000 });

  // One click: axes, scale and index line of the classic chart.
  const preset = page.getByRole("button", { name: "Limite de escoamento × Densidade" });
  await preset.click({ timeout: 30_000 });
  await expect(preset).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: /Limite de escoamento × Densidade/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/estado=/);
  await page.waitForLoadState("networkidle");

  // A box over the whole plotting area ("Região" is the default
  // cursor): every plotted record falls inside it.
  const area = page.locator(".chart-plotly .nsewdrag").first();
  await expect(area).toBeVisible();
  const bounds = await area.boundingBox();
  expect(bounds).not.toBeNull();
  const { x, y, width, height } = bounds!;
  await page.mouse.move(x + width * 0.02, y + height * 0.02);
  await page.mouse.down();
  await page.mouse.move(x + width * 0.5, y + height * 0.5, { steps: 8 });
  await page.mouse.move(x + width * 0.98, y + height * 0.98, { steps: 8 });
  await page.mouse.up();

  await expect(page).toHaveURL(/caixa=/, { timeout: 15_000 });
  const panel = page.getByRole("complementary").filter({ hasText: "Seleção no mapa" });
  await expect(panel.getByText(/registros? selecionados?/)).toBeVisible();

  await panel.getByRole("link", { name: "Comparar →" }).click();
  await page.waitForURL(/\/app\/comparar\?materiais=/, { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("materiais")).toMatch(/^\d/);
});

/**
 * D-240: the report figure goes on white paper even when the page is dark —
 * the background and the ink of the exported file are the light theme's.
 */
test("figura para relatório sai no tema claro mesmo com a tela escura", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("materialselect:theme", "dark");
    } catch {
      /* a private window */
    }
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/mapas");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".chart-plotly .main-svg").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle");

  const exportMenu = page.getByRole("button", { name: "Exportar" }).first();
  await exportMenu.click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /SVG para relatório/ }).click(),
  ]);
  const path = await download.path();
  const fs = await import("node:fs");
  const svg = fs.readFileSync(path, "utf8");

  const colours = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.setAttribute("data-theme", "light");
    document.body.appendChild(probe);
    const light = getComputedStyle(probe);
    const dark = getComputedStyle(document.documentElement);
    const read = (style: CSSStyleDeclaration, name: string) =>
      style.getPropertyValue(name).trim().split(/[\s,]+/).join(", ");
    const out = {
      lightSurface: read(light, "--surface-raised"),
      darkSurface: read(dark, "--surface-raised"),
      darkInk: read(dark, "--ink"),
    };
    probe.remove();
    return out;
  });
  // The background rectangle is the first fill after the root; it is light.
  const background = /<rect[^>]*fill="rgb\(([^)]*)\)"/.exec(svg)?.[1];
  expect(background).not.toBe(colours.darkSurface);
  expect(svg).not.toContain(`rgb(${colours.darkInk})`);
});
