import path from "node:path";
import { test, expect } from "./session";

/**
 * A4 (Fase 7): the row-level validation path — a row that never becomes a
 * material — which the golden path never exercises because every row in it
 * is valid on purpose.
 */

const FIXTURE_CSV = path.resolve(__dirname, "fixtures/materiais-e2e-invalido.csv");

test("uma linha sem nome é rejeitada, não importada como vazio", async ({ page }) => {
  await page.goto("/importar");

  await page
    .getByLabel("Selecione um arquivo CSV ou XLSX (até 5 MB).")
    .setInputFiles(FIXTURE_CSV);

  await expect(page.getByRole("heading", { name: "Mapeie as colunas" })).toBeVisible();
  await page
    .getByLabel("Classe padrão (quando a coluna estiver vazia)")
    .selectOption({ label: "Metais" });

  await page.getByRole("button", { name: "Validar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Relatório de validação" })).toBeVisible();
  await expect(page.getByText("Nome vazio.")).toBeVisible();

  // Nothing is importable: the commit button carries the valid count in its
  // own label and must be disabled, not just discouraged.
  const commitButton = page.getByRole("button", { name: /Importar linhas válidas/ });
  await expect(commitButton).toHaveText("Importar linhas válidas (0)");
  await expect(commitButton).toBeDisabled();
});
