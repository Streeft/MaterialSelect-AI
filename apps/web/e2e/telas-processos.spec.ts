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
  await boxes.nth(0).check({ force: true });
  await boxes.nth(1).check({ force: true });
  await expect(page).toHaveURL(/comparar=/);
  await expect(page.getByRole("heading", { name: "Comparação lado a lado" })).toBeVisible();
});

test("glossário: do verbete para a Seleção com a propriedade", async ({ page }) => {
  await page.goto("/app/glossario#densidade");
  const link = page.getByRole("link", { name: "Usar como restrição na Seleção" });
  await expect(link).toBeVisible({ timeout: 45_000 });
  await link.click();
  await expect(page).toHaveURL(/\/app\/selecao\?.*restricao=densidade/, { timeout: 60_000 });
});

test("meus registros: a busca e o filtro ficam no endereço", async ({ page }) => {
  await page.goto("/app/meus-registros?q=zzzz&tipo=material");
  await expect(page.getByRole("searchbox", { name: "Buscar nos seus registros" })).toHaveValue(
    "zzzz",
    { timeout: 45_000 },
  );
  await expect(page.getByText("Nenhum registro bate com a busca e os filtros.").first()).toBeVisible();
});

// D-254: o cartão de Conformação passa de 100 processos; agrupa por subfamília e a tabela ordena.
test("processos: a família grande agrupa por subfamília, com seções que abrem e recolhem", async ({
  page,
}) => {
  await page.goto("/app/processos");
  const region = page.getByRole("group", { name: "Subfamílias de Conformação" });
  await expect(region).toBeVisible({ timeout: 45_000 });
  const sections = region.locator("details");
  expect(await sections.count()).toBeGreaterThan(2);
  // Nascem fechadas, e cada cabeça diz quantos processos guarda.
  await expect(region.locator("details[open]")).toHaveCount(0);
  await expect(sections.first().locator("summary")).toContainText(/\d+ processos?/);

  await sections.first().locator("summary").click();
  await expect(region.locator("details[open]")).toHaveCount(1);
  await expect(sections.first().getByRole("link").first()).toBeVisible();

  await region.getByRole("button", { name: "Abrir todas" }).click();
  await expect(region.locator("details[open]")).toHaveCount(await sections.count());
  await region.getByRole("button", { name: "Recolher todas" }).click();
  await expect(region.locator("details[open]")).toHaveCount(0);
});

test("processos: na tabela o cabeçalho ordena por nome e por número de materiais", async ({ page }) => {
  await page.goto("/app/processos?visao=table");
  const nameHead = page.getByRole("columnheader", { name: "Processo" });
  await expect(nameHead).toBeVisible({ timeout: 45_000 });
  await expect(nameHead).toHaveAttribute("aria-sort", "none");

  await nameHead.getByRole("button").click();
  await expect(nameHead).toHaveAttribute("aria-sort", "ascending");
  const names = await page.getByRole("rowheader").allTextContents();
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  expect([...names].sort((a, b) => collator.compare(a, b))).toEqual(names);

  // Pelo teclado, na coluna dos números: do menor para o maior.
  const countHead = page.getByRole("columnheader", { name: "Materiais" });
  await countHead.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(countHead).toHaveAttribute("aria-sort", "ascending");
  await expect(nameHead).toHaveAttribute("aria-sort", "none");
  const counts = (await page.locator("tbody tr td:last-child").allTextContents()).map(Number);
  expect([...counts].sort((a, b) => a - b)).toEqual(counts);
});
