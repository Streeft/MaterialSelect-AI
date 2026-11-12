import type { Page } from "@playwright/test";
import { test, expect } from "./session";

/**
 * D-225: the project assistant, from the home to the wizard, in a real browser
 * against the real backend with the `mock` provider (`AI_PROVIDER=mock`), whose
 * plan is the local rules' — deterministic. Whether a part finds materials
 * depends on the seeded catalogue, so the assertions are on the shape of the
 * proposal (three parts, each limit with its origin, each part with materials
 * or the honest "nenhum material") and on the hand-off to the wizard.
 */

async function ask(page: Page, text: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: "Assistente de projeto" })).toBeVisible({
    timeout: 45_000,
  });
  const box = page.getByRole("textbox", { name: "Descreva o projeto ou a peça" });
  await box.fill(text);
  // Ctrl+Enter sends; a plain Enter would only break the line.
  await box.press("Control+Enter");
}

test("roupa de esqui: três partes com a origem de cada número, e uma delas abre na Seleção já preenchida", async ({
  page,
}) => {
  await ask(page, "quero fazer uma roupa de esqui");

  const parts = page.getByRole("article");
  await expect(parts).toHaveCount(3, { timeout: 30_000 });
  for (const name of ["Camada externa", "Camada isolante", "Forro"]) {
    await expect(page.getByRole("article", { name })).toBeVisible();
  }

  const outer = page.getByRole("article", { name: "Camada externa" });
  // The numbers come from the scenario table here, and say so.
  await expect(outer.getByText(/^Cenário: /).first()).toBeVisible();
  await expect(outer.getByText(/Fonte: Referência didática do projeto/).first()).toBeVisible();
  // Every part answers with the server's materials or says honestly that none passed.
  for (const name of ["Camada externa", "Camada isolante", "Forro"]) {
    const part = page.getByRole("article", { name });
    const materials = part.locator('a[href^="/app/materiais/"]');
    const none = part.getByText("Nenhum material do catálogo atende aos limites aplicados.");
    await expect(materials.or(none).first()).toBeVisible();
  }

  await outer.getByRole("button", { name: /^Abrir na Seleção/ }).click();
  await expect(page).toHaveURL(/\/app\/selecao\?etapa=restricoes/);
  // The marker for the draft leaves the address once the wizard took it.
  await expect(page).not.toHaveURL(/rascunho=/);
  // The study is already filled: no "continue the draft?" question, and the
  // function the part carried is on the first step.
  await expect(page.getByRole("button", { name: "Continuar de onde parou" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Etapas" }).getByRole("button", { name: /Função/ }).click();
  await expect(page.getByLabel("Nome do estudo")).toHaveValue("Camada externa", { timeout: 30_000 });
  await expect(page.getByLabel("Função do componente").first()).not.toHaveValue("");
});

test("prédio para 50 pessoas: estrutura, vedação e isolamento, com materiais do catálogo", async ({ page }) => {
  await ask(page, "prédio para 50 pessoas");

  await expect(page.getByRole("article")).toHaveCount(3, { timeout: 30_000 });
  const structure = page.getByRole("article", { name: /^Estrutura/ });
  await expect(structure).toBeVisible();
  // At least one real material of the seeded catalogue, linking to its sheet.
  await expect(structure.locator('a[href^="/app/materiais/"]').first()).toBeVisible();
  // The 50 people are a premise of the sizing, not a limit on materials.
  await expect(page.getByText(/não filtram materiais/)).toBeVisible();

  await structure.getByRole("button", { name: /^Abrir na Seleção/ }).click();
  await expect(page).toHaveURL(/\/app\/selecao\?etapa=restricoes/);
  await page.getByRole("navigation", { name: "Etapas" }).getByRole("button", { name: /Função/ }).click();
  await expect(page.getByLabel("Nome do estudo")).toHaveValue(/Estrutura/, { timeout: 30_000 });
});

test("comparar os materiais de uma parte leva ao comparador com os registros", async ({ page }) => {
  await ask(page, "prédio para 50 pessoas");
  const structure = page.getByRole("article", { name: /^Estrutura/ });
  await expect(structure).toBeVisible({ timeout: 30_000 });
  await structure.getByRole("link", { name: /^Comparar estes materiais/ }).click();
  await expect(page).toHaveURL(/\/app\/comparar\?materiais=/);
});

test("na Seleção, o assistente interpreta o texto e só aplica ao estudo depois do clique", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/selecao");
  await expect(page.getByRole("heading", { name: "Seleção de materiais" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Assistente de projeto: descrever em texto (IA)" }).click();
  await page
    .getByLabel("Descreva o problema em português")
    .fill("viga leve e rígida que aguente frio extremo ao ar livre");
  // Interprets by itself after a pause; no click on "Interpretar".
  const part = page.getByRole("article").first();
  await expect(part).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Função do componente").first()).toHaveValue("");

  await part.getByRole("button", { name: "Aplicar ao estudo" }).click();
  await expect(page.getByText("Aplicado ao estudo. Revise os limites e o índice antes de executar.")).toBeVisible();
  await expect(page.getByLabel("Função do componente").first()).not.toHaveValue("");
});
