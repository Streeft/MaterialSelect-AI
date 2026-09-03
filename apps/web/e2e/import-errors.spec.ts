import path from "node:path";
import { test, expect } from "./session";
import { selectMwcOption } from "./mwc";

/**
 * A4 (Fase 7): the row-level validation path — a row that never becomes a
 * material — which the golden path never exercises because every row in it
 * is valid on purpose.
 */

const FIXTURE_CSV = path.resolve(__dirname, "fixtures/materiais-e2e-invalido.csv");

test("uma linha sem nome é rejeitada, não importada como vazio", async ({ page }) => {
  await page.goto("/app/importar");

  await page
    .getByLabel("Selecione um arquivo CSV ou XLSX (até 5 MB).")
    .setInputFiles(FIXTURE_CSV);

  await expect(page.getByRole("heading", { name: "Mapeie as colunas" })).toBeVisible();
  await selectMwcOption(page, "Classe padrão (quando a coluna estiver vazia)", "Metais");

  await page.getByRole("button", { name: "Validar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Relatório de validação" })).toBeVisible();
  await expect(page.getByText("Nome vazio.")).toBeVisible();

  // Nothing is importable: the commit button carries the valid count in its
  // own label and must be disabled, not just discouraged.
  //
  // getByRole pierces shadow DOM straight to `md-filled-button`'s internal
  // native <button> — its own `.textContent` is just the template's <slot>
  // fallback whitespace, not the projected label (slotted nodes aren't DOM
  // children of the slot they're assigned to). The accessible name, unlike
  // textContent, is computed off the flattened/rendered tree and does
  // include it — toHaveAccessibleName is the assertion that actually reads
  // what a screen reader (and toHaveText, if it worked here) would report.
  const commitButton = page.getByRole("button", { name: /Importar linhas válidas/ });
  await expect(commitButton).toHaveAccessibleName("Importar linhas válidas (0)");
  await expect(commitButton).toBeDisabled();
});
