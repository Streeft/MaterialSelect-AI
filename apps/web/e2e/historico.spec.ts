import { test, expect } from "./session";

/**
 * D-245: a saved study's run history in a real browser against the real API —
 * run the study from "Meus estudos", keep two named versions, and read their
 * comparison, which the server makes from what each version stored.
 */
const API = "http://127.0.0.1:8811";

test("histórico do estudo: guardar duas versões e compará-las", async ({ page }) => {
  const name = `Histórico E2E ${Date.now()}`;
  const created = await page.request.post(`${API}/api/selection/studies`, {
    data: {
      name,
      constraints: [{ operator: "lte", property_slug: "densidade", value: 5, unit: "g/cm**3" }],
      index: { name: "Rigidez", expression: "modulo_young / densidade", goal: "maximize" },
      criteria: [{ key: "__index__", weight: 1 }],
    },
  });
  expect(created.status()).toBe(201);
  const studyId = (await created.json()).id as number;

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app/selecao");
    await page.getByRole("button", { name: /Meus estudos/ }).click({ timeout: 45_000 });
    const card = page.getByRole("listitem").filter({ hasText: name });
    await card.getByRole("button", { name: "Executar" }).click();

    const history = page.locator("#historico");
    await expect(history).toBeVisible({ timeout: 30_000 });
    await expect(history.getByText("Nenhuma execução guardada ainda.")).toBeVisible();

    const label = history.getByLabel("Nome da versão (opcional)");
    await label.fill("primeira");
    await history.getByRole("button", { name: "Guardar no histórico" }).click();
    await expect(history.getByRole("region", { name: "Execuções guardadas" })).toContainText("primeira");

    await label.fill("segunda");
    await history.getByRole("button", { name: "Guardar no histórico" }).click();
    await expect(history.getByRole("region", { name: "Execuções guardadas" })).toContainText("segunda");

    // Same catalogue both times: the server says nothing changed.
    await expect(history.getByText(/O vencedor continua/)).toBeVisible({ timeout: 20_000 });
    await expect(history.getByText("0 entraram, 0 saíram, 0 mudaram de posição.")).toBeVisible();
  } finally {
    await page.request.delete(`${API}/api/selection/studies/${studyId}`);
  }
});
