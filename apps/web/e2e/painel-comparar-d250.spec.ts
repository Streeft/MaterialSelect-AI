import { test, expect } from "./session";

/**
 * D-250 in a real browser against the real API: the panel filters by two
 * subclasses at once (both in the address), shows the catalogue's history by
 * release and one correlation matrix per class; the comparator's "último estudo
 * executado" explains itself while no run is kept, then turns the last kept run
 * into a comparison without running anything again.
 */
const API = "http://127.0.0.1:8811";

test("painel: duas subclasses no filtro, histórico por versão e correlação por classe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/painel");
  const chip = page.getByRole("button", { name: /^Subclasse: / });
  await expect(chip).toBeVisible({ timeout: 45_000 });

  await chip.click();
  await page.getByRole("button", { name: "Liga leve", exact: true }).click();
  // The options stay open: the second subclass is one more click.
  await page.getByRole("button", { name: "Aço estrutural", exact: true }).click();
  await expect(page).toHaveURL(/subclasse=Liga\+leve&subclasse=A%C3%A7o\+estrutural/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Subclasse: Liga leve \+ 1/ })).toBeVisible();
  await expect(page.getByText(/2 materiais passam pelos filtros/)).toBeVisible({ timeout: 30_000 });

  // The history card is on the overview; the E2E seed imports no release, so it says so.
  await expect(page.getByRole("heading", { name: "O catálogo, versão a versão" })).toBeVisible();
  await expect(page.getByText("Nenhuma versão do catálogo foi importada ainda.")).toBeVisible();

  // One matrix per class, side by side, under the whole-catalogue one.
  await page.goto("/app/painel?aba=propriedades");
  const region = page.getByRole("region", { name: "Correlação por classe, uma matriz por classe" });
  await expect(region).toBeVisible({ timeout: 45_000 });
  await expect(region.getByRole("figure", { name: /Matriz de correlação de Spearman — Metais/ })).toBeVisible({
    timeout: 30_000,
  });
});

test("comparar: o último estudo executado vira a comparação, sem executar de novo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const before = await page.request.get(`${API}/api/selection/runs/latest`);
  expect(before.ok()).toBe(true);
  const nothingKept = (await before.json()) === null;

  if (nothingKept) {
    await page.goto("/app/comparar");
    await expect(page.getByText("Nenhuma execução guardada ainda")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("link", { name: "Abrir a Seleção" })).toHaveAttribute("href", "/app/selecao");
  }

  const name = `Último estudo E2E ${Date.now()}`;
  const created = await page.request.post(`${API}/api/selection/studies`, {
    data: {
      name,
      constraints: [{ operator: "lte", property_slug: "densidade", value: 9, unit: "g/cm**3" }],
      index: { name: "Rigidez", expression: "modulo_young / densidade", goal: "maximize" },
      criteria: [{ key: "__index__", weight: 1 }],
    },
  });
  expect(created.status()).toBe(201);
  const studyId = (await created.json()).id as number;

  try {
    const kept = await page.request.post(`${API}/api/selection/studies/${studyId}/runs`, {
      data: { label: "para o comparador" },
    });
    expect(kept.status()).toBe(201);
    const latest = await (await page.request.get(`${API}/api/selection/runs/latest`)).json();
    const ids = (latest.top as { record_id: number }[]).map((entry) => entry.record_id);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    await page.goto("/app/comparar");
    await page.getByRole("button", { name: `Comparar o top do estudo ${name}` }).click({ timeout: 45_000 });
    await expect(page).toHaveURL(new RegExp(`materiais=${ids.join("%2C")}`), { timeout: 30_000 });
    await expect(page.getByRole("table").first()).toBeVisible({ timeout: 45_000 });
  } finally {
    await page.request.delete(`${API}/api/selection/studies/${studyId}`);
  }
});
