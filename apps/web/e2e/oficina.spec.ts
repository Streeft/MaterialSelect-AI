import type { Page } from "@playwright/test";
import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-256: the "Oficina" ambience in the real browser. The component tests measure the tokens;
 * only here are the textures actually painted, the drawer actually opened and the page actually
 * measured — in both themes, and on a phone.
 */
const SCREENS = ["/app", "/app/catalogo", "/app/selecao", "/app/aparencia"] as const;

async function wear(page: Page, theme: "light" | "dark") {
  await page.addInitScript((chosen) => {
    try {
      window.localStorage.setItem("msai.ambience", "oficina");
      window.localStorage.setItem("materialselect:theme", chosen);
    } catch {
      /* a private window: the assertions below then say so */
    }
  }, theme);
}

async function settle(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
}

for (const theme of ["light", "dark"] as const) {
  test(`Oficina no tema ${theme}: a página veste a bancada e passa no axe`, async ({ page }) => {
    await wear(page, theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const path of SCREENS) {
      await page.goto(path);
      await settle(page);
      await expect(page.locator("html")).toHaveAttribute("data-ambience", "oficina");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      // The bench is painted: the grain is on the body, never on a panel.
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain("data:image/svg+xml");
      const found = await runAxe(page);
      expect(found, `${path} (${theme}):\n${describeFound(found)}`).toEqual([]);
    }
  });

  test(`Oficina no tema ${theme}: a gaveta abre, mostra os envelopes e passa no axe`, async ({ page }) => {
    await wear(page, theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app/catalogo");
    await settle(page);

    const front = page.getByRole("button", { name: /^Metais/ });
    await expect(front).toHaveAttribute("aria-expanded", "false");
    await front.click();
    await expect(front).toHaveAttribute("aria-expanded", "true");
    const tray = page.getByRole("region", { name: "Gaveta de Metais" });
    await expect(tray.getByRole("listitem").first()).toBeVisible();
    // An envelope is paper: its own solid background, whatever the wood around it.
    const envelope = tray.locator(".oficina-envelope").first();
    expect(await envelope.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");

    const found = await runAxe(page);
    expect(found, `gaveta aberta (${theme}):\n${describeFound(found)}`).toEqual([]);

    // The envelope leads to the sheet.
    await tray.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/app\/materiais\/\d+/);
  });
}

test("Oficina no telefone: o arquivo cabe em 375 px, sem rolagem lateral, com alvos de 44 px", async ({ page }) => {
  await wear(page, "light");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/app/catalogo");
  await settle(page);
  await page.getByRole("button", { name: /^Metais/ }).click();
  const tray = page.getByRole("region", { name: "Gaveta de Metais" });
  await expect(tray.getByRole("listitem").first()).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const front = await page.getByRole("button", { name: /^Metais/ }).boundingBox();
  expect(front!.height).toBeGreaterThanOrEqual(44);
  const found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
});

test("sem movimento: a gaveta abre sem animação", async ({ page }) => {
  await wear(page, "light");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/catalogo");
  await settle(page);
  await page.getByRole("button", { name: /^Metais/ }).click();
  const tray = page.getByRole("region", { name: "Gaveta de Metais" });
  await expect(tray).toBeVisible();
  expect(await tray.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
