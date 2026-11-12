import path from "node:path";
import { test, expect } from "./session";

/**
 * D-222: o erro por célula na validação da importação, o "Voltar" entre os passos,
 * e o Início com o guia de primeiros passos e os atalhos — num navegador de verdade.
 */

const CELL_CSV = path.resolve(__dirname, "fixtures/materiais-e2e-celula.csv");

test("importar: a célula com erro vem marcada e dá para voltar sem reenviar", async ({ page }) => {
  await page.goto("/app/importar");
  await page.locator('input[type="file"]').setInputFiles(CELL_CSV);
  await expect(page.getByRole("heading", { name: "Mapeie as colunas" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Validar", exact: true }).click();
  const grid = page.getByRole("region", { name: "Células com problema" });
  await expect(grid).toBeVisible();
  const row = grid.getByRole("row").filter({ hasText: "Liga E2E Celula" });
  await expect(row.getByText("abc")).toBeVisible();
  await expect(row.getByText("Problema nesta célula")).toBeAttached();

  // Voltar ao mapeamento e ao arquivo: o arquivo continua lá, sem novo envio.
  await page.getByRole("button", { name: /Voltar ao mapeamento/ }).click();
  await page.getByRole("button", { name: /Voltar ao arquivo/ }).click();
  await expect(page.getByText(/Arquivo enviado: materiais-e2e-celula\.csv/)).toBeVisible();
  await page.getByRole("button", { name: "Continuar com este arquivo" }).click();
  await expect(page.getByRole("heading", { name: "Mapeie as colunas" })).toBeVisible();
});

test("início: guia de primeiros passos dispensável e atalhos de tarefa", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Primeiros passos" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("link", { name: /Importar uma planilha/ })).toHaveAttribute("href", "/app/importar");

  await page.getByLabel("Descreva a função da peça").check({ force: true });
  await expect(page.getByText("1 de 3 passos feitos")).toBeVisible();

  await page.getByRole("button", { name: "Dispensar o guia" }).click();
  await expect(page.getByRole("heading", { name: "Primeiros passos" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "O que você quer fazer?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Primeiros passos" })).toHaveCount(0);
});
