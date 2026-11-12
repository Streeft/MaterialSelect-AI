import { test, expect } from "./session";

/**
 * D-219: a matriz material × processo, o filtro por capacidade (feito no
 * backend), a comparação lado a lado, o link do Glossário para a Seleção e o
 * estado de Meus registros no endereço — num navegador de verdade, contra a
 * API e o seed de demonstração.
 */

test("processos: matriz, filtro de massa no backend e comparação guardada no endereço", async ({
  page,
}) => {
  await page.goto("/app/processos?modo=matriz");
  const region = page.getByRole("region", { name: "Matriz material × processo" });
  await expect(region).toBeVisible({ timeout: 45_000 });
  const rows = region.getByRole("row");
  const all = await rows.count();
  expect(all).toBeGreaterThan(2);
  // Uma célula sem material diz "nenhum", e capacidade sem dado diz "Ausente".
  await expect(region.getByText("nenhum").first()).toBeVisible();

  await page.getByLabel("Massa da peça").fill("5000");
  await page.getByLabel("Unidade").first().selectOption("kg");
  await expect(page).toHaveURL(/massa=5000/);
  await expect(async () => {
    expect(await region.getByRole("row").count()).toBeLessThan(all);
  }).toPass({ timeout: 20_000 });

  // Comparar dois processos: a escolha vai para o endereço e a tabela lado a lado aparece.
  const boxes = region.getByRole("checkbox");
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page).toHaveURL(/comparar=/);
  await expect(page.getByRole("heading", { name: "Comparação lado a lado" })).toBeVisible();
});

test("glossário: do verbete para a Seleção com a propriedade", async ({ page }) => {
  await page.goto("/app/glossario#densidade");
  const link = page.getByRole("link", { name: "Usar como restrição na Seleção" });
  await expect(link).toBeVisible({ timeout: 45_000 });
  await link.click();
  await expect(page).toHaveURL(/\/app\/selecao\?.*restricao=densidade/);
});

test("meus registros: a busca e o filtro ficam no endereço", async ({ page }) => {
  await page.goto("/app/meus-registros?q=zzzz&tipo=material");
  await expect(page.getByRole("searchbox", { name: "Buscar nos seus registros" })).toHaveValue(
    "zzzz",
    { timeout: 45_000 },
  );
  await expect(page.getByText("Nenhum registro bate com a busca e os filtros.").first()).toBeVisible();
});
