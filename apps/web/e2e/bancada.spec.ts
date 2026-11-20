import type { Page } from "@playwright/test";
import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-259: the bench, in the real browser over the real API. Two materials go into the tray by the
 * drawer; each screen then takes them from the strip "Da bandeja", by the button and by dragging.
 */
const OUT = process.env.E2E_SHOTS;
const STEEL = "Aço Demo B";
const ALUMINIUM = "Liga Alumínio Demo A";

async function emptyTray(page: Page) {
  const response = await page.request.delete("http://127.0.0.1:8811/api/tray");
  expect(response.ok()).toBeTruthy();
}

async function fillTray(page: Page) {
  await page.goto("/app/catalogo");
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /^Metais/ }).click();
  const drawer = page.getByRole("region", { name: "Gaveta de Metais" });
  for (const name of [STEEL, ALUMINIUM]) {
    await drawer.getByRole("button", { name: `Levar ${name} para a bandeja` }).click();
  }
  await expect(page.getByRole("button", { name: "Bandeja, 2 itens" }).first()).toBeVisible();
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  const strip = page.getByRole("group", { name: "Da bandeja" });
  await expect(strip.getByRole("listitem")).toHaveCount(2);
  return strip;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("msai.ambience", "oficina");
    } catch {
      /* private window */
    }
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  await emptyTray(page);
  await fillTray(page);
});

test.afterEach(async ({ page }) => {
  await emptyTray(page);
});

test("bancada: destacar no mapa pelo botão e arrastando", async ({ page }) => {
  const strip = await open(page, "/app/mapas");
  const button = strip.getByRole("button", { name: `Destacar ${STEEL} no mapa` });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(page).toHaveURL(/destaque=\d+/);
  await expect(button).toHaveAttribute("aria-pressed", "true");

  // Dragging the other one onto the map adds it; nothing is removed by a drop.
  // The browser's own drag events with one DataTransfer: over Plotly's layer the emulated mouse
  // drag of `dragTo` never becomes an HTML5 drag.
  const chip = strip.getByRole("listitem").filter({ hasText: ALUMINIUM });
  const plot = page.locator(".js-plotly-plot").first();
  const data = await page.evaluateHandle(() => new DataTransfer());
  await chip.dispatchEvent("dragstart", { dataTransfer: data });
  await plot.dispatchEvent("dragover", { dataTransfer: data });
  await expect(page.locator("[data-drop-over]")).toHaveCount(1);
  await plot.dispatchEvent("drop", { dataTransfer: data });
  await chip.dispatchEvent("dragend", { dataTransfer: data });
  await expect(strip.getByRole("button", { name: `Destacar ${ALUMINIUM} no mapa` })).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/mapa.png` });

  // The button takes it off again.
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("bancada: os materiais entram na comparação", async ({ page }) => {
  const strip = await open(page, "/app/comparar");
  const bar = page.locator("#controles");
  await strip.getByRole("button", { name: `Acrescentar ${STEEL} à comparação` }).click();
  await expect(bar.getByText(STEEL).first()).toBeVisible();
  await strip.getByRole("listitem").filter({ hasText: ALUMINIUM }).dragTo(bar);
  await expect(bar.getByText(ALUMINIUM).first()).toBeVisible();
  // What is already there says so, and stays reachable by the keyboard.
  const again = strip.getByRole("button", { name: `Acrescentar ${STEEL} à comparação` });
  await expect(again).toHaveAttribute("aria-disabled", "true");
  await expect(again).toHaveAttribute("title", "Já está na comparação.");
  const found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/comparar.png` });
});

test("bancada: o material da bandeja vira o da estimativa de custo e o do Eco", async ({ page }) => {
  // The demo steel is the calculator's first material, so the aluminium is the one to take there.
  let strip = await open(page, "/app/custo");
  await expect(strip.getByRole("button", { name: `Estimar o custo de ${STEEL}` })).toHaveAttribute("aria-disabled", "true");
  await strip.getByRole("button", { name: `Estimar o custo de ${ALUMINIUM}` }).click();
  await expect(page).toHaveURL(/material=\d+/);
  await expect(strip.getByRole("button", { name: `Estimar o custo de ${ALUMINIUM}` })).toHaveAttribute("aria-disabled", "true");
  await strip.getByRole("button", { name: `Comparar o custo com ${STEEL}` }).click();
  await expect(strip.getByRole("button", { name: `Comparar o custo com ${STEEL}` })).toHaveAttribute(
    "title",
    "Já está na comparação.",
  );
  let found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/custo.png` });

  strip = await open(page, "/app/eco");
  const before = await page.getByRole("combobox").count();
  await strip.getByRole("button", { name: `Acrescentar ${STEEL} ao produto` }).click();
  await expect.poll(() => page.getByRole("combobox").count()).toBeGreaterThan(before);
  found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/eco.png` });
});

test("bancada: do painel, o material vai ao mapa por comando; e a faixa cabe no telefone", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Bandeja, 2 itens" }).first().click();
  const panel = page.getByRole("dialog", { name: "Bandeja" });
  await panel.getByRole("button", { name: `Ações de ${STEEL} na bandeja` }).click();
  await page.getByRole("menuitem", { name: "Ver no mapa" }).click();
  await expect(page).toHaveURL(/\/app\/mapas\?destaque=\d+/);
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Da bandeja" }).getByRole("button", { name: `Destacar ${STEEL} no mapa` }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, "/app/comparar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  if (OUT) await page.screenshot({ path: `${OUT}/telefone.png` });
});
