import { test, expect } from "./session";

/**
 * D-249: a aparência (cor, contraste, movimento e barra lateral) fica na conta. A escolha feita
 * na tela de Aparência vai para `PUT /api/me/appearance`; num aparelho "novo" (sem nada guardado
 * no navegador) o app entra e veste o que a conta tem. A cópia local segue valendo para a primeira
 * pintura, sem piscar.
 */

const API = "http://127.0.0.1:8811";
const KEY = "msai.appearance";

test("aparência: a escolha vai para a conta e vale num aparelho sem nada guardado", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Começa limpa, na conta e no aparelho.
  await page.request.put(`${API}/api/me/appearance`, {
    data: { color: "route", contrast: "standard", motion: "standard", rail: "dark" },
  });

  await page.goto("/app/aparencia");
  await expect(page.getByRole("heading", { name: "Aparência", level: 1 })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Guardado na sua conta|ficam guardados na sua conta/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("radio", { name: "Violeta" }).click();
  await page.getByRole("group", { name: "Contraste" }).getByRole("button", { name: "Alto" }).click();
  await expect(page.getByText("Guardado na sua conta: vale em todos os aparelhos em que você entrar.")).toBeVisible({
    timeout: 30_000,
  });

  // O servidor tem a escolha, inteira.
  const stored = (await (await page.request.get(`${API}/api/me/appearance`)).json()) as Record<string, unknown>;
  expect(stored).toMatchObject({ color: "violeta", contrast: "high", motion: "standard", rail: "dark", saved: true });

  // "Outro aparelho": nada guardado no navegador; ao entrar, a conta decide.
  await page.evaluate((key) => window.localStorage.removeItem(key), KEY);
  await page.goto("/app/aparencia");
  await expect(page.getByRole("radio", { name: "Violeta" })).toHaveAttribute("aria-checked", "true", {
    timeout: 45_000,
  });
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  await expect(page.locator("html")).toHaveAttribute("data-section", "selecao");
  // E a cópia local foi refeita: a próxima pintura já sai certa.
  const local = await page.evaluate((key) => window.localStorage.getItem(key), KEY);
  expect(JSON.parse(local!)).toMatchObject({ color: "violeta", contrast: "high" });

  // Desfaz para não deixar a conta de teste colorida.
  await page.getByRole("radio", { name: "Uma cor por tela" }).click();
  await page.getByRole("group", { name: "Contraste" }).getByRole("button", { name: "Padrão" }).click();
  await expect
    .poll(async () => ((await (await page.request.get(`${API}/api/me/appearance`)).json()) as { color: string }).color)
    .toBe("route");
});

test("aparência: uma escolha inválida é recusada pelo servidor e nada é gravado", async ({ page }) => {
  await page.request.put(`${API}/api/me/appearance`, {
    data: { color: "route", contrast: "standard", motion: "standard", rail: "dark" },
  });
  const refused = await page.request.put(`${API}/api/me/appearance`, {
    data: { color: "magenta", contrast: "standard", motion: "standard", rail: "dark" },
  });
  expect(refused.status()).toBe(422);
  const stored = (await (await page.request.get(`${API}/api/me/appearance`)).json()) as { color: string };
  expect(stored.color).toBe("route");
});
