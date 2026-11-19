import { readFile } from "node:fs/promises";
import { test, expect } from "./session";

/**
 * D-249: o CSV do catálogo é buscado pelo app (para ver como terminou) e salvo com o nome que o
 * servidor deu. Um arquivo inteiro termina sem a linha `# ERRO:` e a tela não alarma; um que o
 * servidor interrompeu mostra o aviso na tela. O download real, no navegador de verdade e contra o
 * backend de verdade.
 */

test("catálogo: o CSV baixa inteiro, com o nome do servidor, e a tela não avisa de corte", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/catalogo");
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Exportar catálogo" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.getByRole("menuitem", { name: "CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const text = await readFile((await download.path())!, "utf8");
  expect(text.length).toBeGreaterThan(200);
  expect(text.trimEnd().split(/\r?\n/).pop()).not.toMatch(/^# ERRO:/);
  await expect(page.getByText(/^Arquivo gerado: .*\.csv\.$/)).toBeVisible();
  await expect(page.getByText("O arquivo do catálogo veio cortado")).toHaveCount(0);
});

test("catálogo: um CSV que o servidor interrompeu mostra o aviso na tela", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const marker = "# ERRO: exportação interrompida; este arquivo está incompleto. Baixe novamente.";
  // O corte de verdade é uma falha no meio do servidor; aqui o mesmo arquivo cortado chega à tela.
  await page.route("**/api/exports/catalogo.csv", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/csv; charset=utf-8",
      headers: {
        "content-disposition": 'attachment; filename="catalogo-de-materiais.csv"',
        "access-control-allow-origin": "http://127.0.0.1:3011",
        "access-control-allow-credentials": "true",
        "access-control-expose-headers": "Content-Disposition",
      },
      body: `﻿Material;Classe\r\nAço;Metais\r\n\r\n${marker}\r\n`,
    });
  });
  await page.goto("/app/catalogo");
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Exportar catálogo" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("menuitem", { name: "CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("catalogo-de-materiais.csv");
  const alert = page.getByRole("alert").filter({ hasText: "O arquivo do catálogo veio cortado" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Baixe de novo antes de usar os dados");
});
