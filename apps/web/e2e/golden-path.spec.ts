import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * A4 (Fase 7): the one flow no unit or component test can reach on its own —
 * importar → selecionar → visualizar → exportar as a single continuous
 * session in a real browser, against the real backend and a real (throwaway)
 * database (see `playwright.config.ts`).
 *
 * The two fixture materials have a deliberately large rigidez-específica
 * (E/ρ) contrast — 200 vs 6.25 — so the ranking assertion below doesn't
 * depend on exact seed-data values, only on the two materials this test
 * itself imports.
 */

const FIXTURE_CSV = path.resolve(__dirname, "fixtures/materiais-e2e.csv");
const MATERIAL_RIGIDO = "Material E2E Rigido";
const MATERIAL_FLEXIVEL = "Material E2E Flexivel";
const STUDY_NAME = "Estudo E2E Rigidez";

async function rankOf(page: Page, materialName: string): Promise<number> {
  const row = page.getByRole("row").filter({ hasText: materialName });
  const rankText = await row.getByRole("cell").first().innerText();
  return Number(rankText.trim());
}

test("importar, selecionar, visualizar e exportar um estudo", async ({ page }) => {
  // --- Importar --------------------------------------------------------
  await page.goto("/importar");
  await expect(page.getByRole("heading", { name: "Importar materiais" })).toBeVisible();

  await page
    .getByLabel("Selecione um arquivo CSV ou XLSX (até 5 MB).")
    .setInputFiles(FIXTURE_CSV);

  // The upload auto-suggests every column (both headers carry a bracketed
  // unit the backend already recognises) except the class, which the fixture
  // has no column for — that one needs a default.
  await expect(page.getByRole("heading", { name: "Mapeie as colunas" })).toBeVisible();
  await page
    .getByLabel("Classe padrão (quando a coluna estiver vazia)")
    .selectOption({ label: "Metais" });

  await page.getByRole("button", { name: "Validar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Relatório de validação" })).toBeVisible();

  await page.getByRole("button", { name: /Importar linhas válidas/ }).click();
  const doneAlert = page.getByText("Importação concluída").locator("..");
  await expect(doneAlert).toContainText("2 materiais importados; 0 linhas ignoradas.");

  await page.getByRole("link", { name: "Ver no catálogo" }).click();
  await expect(page).toHaveURL(/\/catalogo/);
  await expect(page.getByText(MATERIAL_RIGIDO)).toBeVisible();
  await expect(page.getByText(MATERIAL_FLEXIVEL)).toBeVisible();

  // --- Selecionar --------------------------------------------------------
  await page.goto("/selecao");
  await expect(page.getByRole("heading", { name: "Seleção de materiais" })).toBeVisible();

  await page.getByLabel("Nome do estudo").fill(STUDY_NAME);

  const actionBar = page.getByRole("group", { name: "Ações da etapa" });
  await actionBar.getByRole("button", { name: "Restrições" }).click();
  await actionBar.getByRole("button", { name: "Objetivo" }).click();

  await page.getByRole("radio", { name: "Rigidez específica" }).check();
  await page.getByRole("button", { name: "Adicionar critério" }).click();

  await actionBar.getByRole("button", { name: "Executar seleção" }).click();
  await expect(page.getByRole("heading", { name: "Ranking", exact: true })).toBeVisible();

  const rankRigido = await rankOf(page, MATERIAL_RIGIDO);
  const rankFlexivel = await rankOf(page, MATERIAL_FLEXIVEL);
  expect(rankRigido).toBeLessThan(rankFlexivel);

  // --- Save, then visualize on the map ------------------------------------
  await actionBar.getByRole("button", { name: "Salvar estudo" }).click();
  await expect(page.getByText("Estudo salvo.")).toBeVisible();

  // First visit to /mapas in a fresh `next dev` process compiles that route
  // on demand — several seconds, well past a default expect timeout — before
  // the client-side transition completes.
  await page.getByRole("link", { name: "Ver candidatos no mapa" }).click();
  await page.waitForURL(/\/mapas/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Mapas de propriedades" })).toBeVisible();
  await expect(page.locator(".js-plotly-plot .main-svg").first()).toBeVisible({
    timeout: 15_000,
  });

  // --- Exportar ------------------------------------------------------------
  // Fresh load: the saved study lives server-side, and this proves the
  // "Estudos salvos" list is populated from a clean page, not from wizard
  // state left over from the run above.
  await page.goto("/selecao");
  const savedRow = page.getByRole("row").filter({ hasText: STUDY_NAME });
  await expect(savedRow).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    savedRow.getByRole("link", { name: "CSV", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);

  const [laudoPopup] = await Promise.all([
    page.waitForEvent("popup"),
    savedRow.getByRole("link", { name: "Gerar laudo" }).click(),
  ]);
  await laudoPopup.waitForLoadState();
  expect(laudoPopup.url()).toContain("/laudo.html");
  await laudoPopup.close();
});
