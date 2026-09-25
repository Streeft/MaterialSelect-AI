import { test, expect } from "./session";

/**
 * D-90: a notebook end to end — create it, paste a source, read the guide the
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
