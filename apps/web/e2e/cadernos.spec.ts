import { test, expect } from "./session";

/**
 * D-92: a notebook end to end — create it, paste a source, read the guide the
 * (simulated) AI writes, ask, and open the passage a citation points at. The
 * backend runs `AI_PROVIDER=mock`, which quotes the passages it cites, so the
 * figures below are the source's own.
 */

const SOURCE =
  "O aço carbono tem densidade de 7850 kg/m³ e módulo de elasticidade de 210 GPa. " +
  "É o material estrutural mais usado na construção civil.";

test("criar um caderno, colar uma fonte, perguntar e abrir a citação", async ({ page }) => {
  await page.goto("/app/cadernos");
  await expect(page.getByRole("heading", { name: "Cadernos", level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Criar caderno" }).first().click();
  await page.waitForURL(/\/app\/cadernos\/\d+/, { timeout: 20_000 });

  // Adicionar fontes → Colar texto.
  await page.getByRole("button", { name: "Adicionar fontes" }).click();
  await page.getByRole("tab", { name: "Colar texto" }).click();
  await page.getByLabel("Título").fill("Aula de aços");
  await page.getByRole("textbox", { name: "Texto" }).fill(SOURCE);
  await page.getByRole("button", { name: "Adicionar texto" }).click();

  // The source is listed and the guide is written from it.
  await expect(page.getByRole("button", { name: "Ler a fonte “Aula de aços”" })).toBeVisible();
  await expect(page.getByText("Perguntas sugeridas")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "test-results/cadernos-guia.png", fullPage: true });

  // Ask, and open the passage the answer cites.
  const box = page.getByRole("textbox", { name: "Pergunta às fontes" });
  await box.fill("Qual a densidade do aço?");
  await box.press("Enter");
  const log = page.getByRole("log", { name: "Conversa com as fontes" });
  await expect(log.getByText("Segundo as fontes", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await log.getByRole("button", { name: "Trecho 1, de “Aula de aços”" }).last().click();
  const passage = page.getByRole("dialog", { name: "Trecho 1, de “Aula de aços”" });
  await expect(passage).toContainText("7850 kg/m³");
  await page.screenshot({ path: "test-results/cadernos-citacao.png", fullPage: true });
  await page.keyboard.press("Escape");

  // On a phone the three panels become one at a time, and the conversation
  // survives switching to the sources and back.
  await page.setViewportSize({ width: 390, height: 844 });
  const panels = page.getByRole("group", { name: "Painéis do caderno" });
  await panels.getByRole("button", { name: "Fontes" }).click();
  await expect(page.getByRole("button", { name: "Adicionar fontes" })).toBeVisible();
  await expect(log).toBeHidden();
  await page.screenshot({ path: "test-results/cadernos-telefone.png", fullPage: true });
  await panels.getByRole("button", { name: "Conversa" }).click();
  await expect(log.getByText("Segundo as fontes", { exact: false })).toBeVisible();
});

/**
 * D-94: the Studio end to end — the generation runs after the response, in the
 * API's background, and the panel polls until it is ready. The mock quotes the
 * passages, so every item passes the figure check with the source's own
 * numbers.
 */
test("gerar um relatório e cartões no Estúdio, abrir e exportar", async ({ page }) => {
  await page.goto("/app/cadernos");
  await page.getByRole("button", { name: "Criar caderno" }).first().click();
  await page.waitForURL(/\/app\/cadernos\/\d+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Adicionar fontes" }).click();
  await page.getByRole("tab", { name: "Colar texto" }).click();
  await page.getByLabel("Título").fill("Aula de aços");
  await page.getByRole("textbox", { name: "Texto" }).fill(SOURCE);
  await page.getByRole("button", { name: "Adicionar texto" }).click();
  await expect(page.getByRole("button", { name: "Ler a fonte “Aula de aços”" })).toBeVisible();

  // Relatórios → "Criar relatório": format, template with its pencil, Gerar.
  await page.getByRole("button", { name: /^Relatórios/ }).click();
  const dialog = page.getByRole("dialog", { name: "Criar relatório" });
  await expect(dialog.getByRole("radio", { name: "Texto corrido" })).toBeChecked();
  await dialog.getByRole("button", { name: "Editar o modelo “Guia de estudo”" }).click();
  await expect(dialog.getByRole("textbox", { name: "Instruções do modelo" })).toHaveValue(
    /guia de estudo/,
  );
  await page.screenshot({ path: "test-results/estudio-criar.png", fullPage: true });
  await dialog.getByRole("button", { name: "Gerar" }).click();
  await expect(dialog).toBeHidden();

  // It lands in the list when the background job ends, and opens in the panel.
  const report = page.getByRole("button", { name: /^Abrir “Guia de estudo/ });
  await expect(report).toBeVisible({ timeout: 30_000 });
  await report.click();
  await expect(page.getByRole("button", { name: "Trecho 1, de “Aula de aços”" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Exportar" }).click();
  await expect(page.getByRole("menuitem", { name: "DOCX (Word)" })).toHaveAttribute(
    "href",
    /\/studio\/\d+\/export\.docx$/,
  );
  await page.screenshot({ path: "test-results/estudio-relatorio.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Voltar ao Estúdio" }).click();

  // Cartões didáticos, with the defaults, then turned over.
  await page.getByRole("button", { name: /^Cartões didáticos/ }).click();
  await page.getByRole("dialog", { name: "Criar cartões didáticos" }).getByRole("button", { name: "Gerar" }).click();
  const cards = page.getByRole("button", { name: /^Abrir “Cartões didáticos/ });
  await expect(cards).toBeVisible({ timeout: 30_000 });
  await cards.click();
  await page.getByRole("button", { name: "Virar" }).click();
  await expect(page.getByText(/Cartão 1 de \d+ · Verso/)).toBeVisible();
  await page.screenshot({ path: "test-results/estudio-cartoes.png", fullPage: true });
});
