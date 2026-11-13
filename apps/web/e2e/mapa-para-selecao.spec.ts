import { test, expect } from "./session";

/**
 * D-232: o laço do mapa leva os materiais à Seleção como um estágio de lista, e
 * o funil conta só esses. O mesmo caminho de dados dos três pontos de origem
 * (laço, Dimensionar, catálogo): `?materiais=` → estágio `list` → `/api/selection`.
 */
test("laço no mapa, 'Abrir na Seleção' e o funil só com esses materiais", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/mapas");
  await expect(page.getByRole("heading", { name: "Mapas de propriedades" })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator(".chart-plotly .main-svg").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle");

  // O laço é um modo do cursor; a caixa, o padrão.
  await page.getByRole("button", { name: "Laço" }).click();
  const area = page.locator(".chart-plotly .nsewdrag").first();
  await expect(area).toBeVisible();
  const bounds = await area.boundingBox();
  expect(bounds).not.toBeNull();
  const { x, y, width, height } = bounds!;
  await page.mouse.move(x + width * 0.02, y + height * 0.02);
  await page.mouse.down();
  await page.mouse.move(x + width * 0.98, y + height * 0.02, { steps: 10 });
  await page.mouse.move(x + width * 0.98, y + height * 0.98, { steps: 10 });
  await page.mouse.move(x + width * 0.02, y + height * 0.98, { steps: 10 });
  await page.mouse.move(x + width * 0.02, y + height * 0.04, { steps: 10 });
  await page.mouse.up();

  await expect(page).toHaveURL(/sel=/, { timeout: 15_000 });
  const panel = page.getByRole("complementary").filter({ hasText: "Seleção no mapa" });
  const count = panel.getByText(/registros? selecionados?/);
  await expect(count).toBeVisible();
  const picked = Number.parseInt((await count.textContent()) ?? "", 10);
  expect(picked).toBeGreaterThan(0);

  // A mesma seleção vai para a Seleção como lista de materiais.
  await panel.getByRole("link", { name: "Abrir na Seleção →" }).click();
  await page.waitForURL(/\/app\/selecao/, { timeout: 30_000 });

  // O estágio de lista nomeia os materiais, e o endereço guarda só onde o leitor está.
  await expect(page.getByText(`${picked} ${picked === 1 ? "material na lista" : "materiais na lista"}`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Estágio 1 (lista)")).toBeVisible();
  await expect(page).toHaveURL(/etapa=restricoes/);
  expect(new URL(page.url()).searchParams.has("materiais")).toBe(false);

  // O funil, calculado no servidor, conta exatamente os materiais do laço.
  const actionBar = page.getByRole("group", { name: "Ações da etapa" });
  const counter = actionBar.locator('[aria-live="polite"]').filter({ hasText: "Candidatos restantes" });
  await expect(counter).toContainText(new RegExp(`Candidatos restantes\\s*${picked}\\s*de\\s*\\d+`), {
    timeout: 30_000,
  });
});
