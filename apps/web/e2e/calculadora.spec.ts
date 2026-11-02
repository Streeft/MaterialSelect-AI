import { test, expect } from "./session";

/**
 * D-191: the visual expression calculator, in a real browser against the real
 * backend. E^(1/2)/ρ — the light, stiff beam — is built by clicks and by the
 * quick search only; the display shows what `/api/expressions/describe`
 * answered, and the comparator accepts the index named by its reading. The
 * grammar spelling (`modulo_young`) never reaches the screen.
 */
test("monta E^(1/2)/ρ por cliques e busca, e o servidor valida", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/comparar?materiais=1");
  const calc = page.getByTestId("expression-builder");
  await expect(calc).toBeVisible({ timeout: 45_000 });
  const search = calc.getByLabel("Buscar propriedade ou função");
  await expect(calc.getByTestId("expression-palette").getByRole("button").first()).toBeVisible({
    timeout: 30_000,
  });

  await search.fill("módulo de young");
  await search.press("Enter");
  const keypad = calc.getByTestId("expression-keypad");
  await keypad.getByRole("button", { name: "elevado a", exact: true }).click();
  await keypad.getByRole("button", { name: "abre parêntese", exact: true }).click();
  await keypad.getByRole("button", { name: "1", exact: true }).click();
  await keypad.getByRole("button", { name: "dividido por", exact: true }).click();
  await keypad.getByRole("button", { name: "2", exact: true }).click();
  await keypad.getByRole("button", { name: "fecha parêntese", exact: true }).click();
  await keypad.getByRole("button", { name: "dividido por", exact: true }).click();
  await search.fill("densidade");
  await search.press("Enter");

  const display = calc.getByTestId("expression-display");
  await expect(display.getByText("Expressão válida")).toBeVisible({ timeout: 15_000 });
  await expect(
    display.getByRole("img", { name: "(Módulo de Young)^(1/2) / Densidade" }),
  ).toBeVisible();
  await expect(calc.getByTestId("expression-tape")).not.toContainText("modulo_young");

  await page.getByRole("button", { name: "Adicionar à tabela" }).click();
  await expect(
    page.getByRole("button", { name: "Remover expressão: (Módulo de Young)^(1/2) / Densidade" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#computadas")).not.toContainText("modulo_young");
});

test("a calculadora cabe no celular sem rolar a página na horizontal", async ({ page }) => {
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/comparar?materiais=1");
    const calc = page.getByTestId("expression-builder");
    await expect(calc).toBeVisible({ timeout: 45_000 });
    await expect(calc.getByTestId("expression-palette").getByRole("button").first()).toBeVisible({
      timeout: 30_000,
    });
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `${width} px`).toBeLessThanOrEqual(innerWidth);
    if (process.env.E2E_SHOTS) {
      await calc.screenshot({ path: `${process.env.E2E_SHOTS}/calculadora-${width}.png` });
    }
  }
});
