import type { Page } from "@playwright/test";
import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-236: the two figures D-234 added to the calculators, walked in the real browser —
 * "Curva Custo × Lote de cada material" on `/app/custo` and the waterfall of the B − A
 * difference on `/app/eco`. Both are drawn from numbers the server computed (ADR 0004); what
 * is checked here is that they reach the screen: one curve per material with the current
 * batch marked, a step per phase and a total bar, nothing drawn as zero, and axe finds
 * nothing (colour contrast and the scrollable regions need a real layout).
 */

const API = "http://127.0.0.1:8811";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // Figures draw after the network goes quiet; axe must see them drawn.
  await page.waitForTimeout(600);
}

/** Two catalogue materials the cost model can price, found by asking the server, not by name. */
async function twoPricedMaterials(page: Page): Promise<{ id: number; name: string }[]> {
  const list = await page.request.get(`${API}/api/materials`);
  expect(list.ok()).toBe(true);
  const rows = (await list.json()) as { id: number; name: string }[];
  const found: { id: number; name: string }[] = [];
  for (const row of rows.slice(0, 40)) {
    const response = await page.request.post(`${API}/api/custo/curvas`, {
      data: { material_ids: [row.id], part_mass: 2, batch_size: 500 },
    });
    if (!response.ok()) continue;
    const body = (await response.json()) as { curves: { points: unknown[] }[] };
    if ((body.curves[0]?.points.length ?? 0) > 0) found.push(row);
    if (found.length === 2) break;
  }
  expect(found, "the seed prices at least two materials").toHaveLength(2);
  return found;
}

test("custo: a curva por material mostra uma curva por material e marca o lote atual", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const [first, second] = await twoPricedMaterials(page);
  await page.goto(`/app/custo?material=${first!.id}&comparar=${second!.id}&massa=2&lote=500`);

  const figure = page.getByRole("figure", {
    name: "Curva Custo versus Tamanho do Lote, um material por curva",
  });
  await expect(figure).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Curva Custo × Lote de cada material" })).toBeVisible();

  // One curve per material, each a mark that names its cost at the current batch and the
  // process that wins there — both from the server.
  const curves = figure.getByRole("img", { name: /no lote atual de 500: custo .+, no processo .+/ });
  await expect(curves).toHaveCount(2);
  await expect(figure.getByRole("img", { name: new RegExp(`^${first!.name}\\b`) })).toHaveCount(1);
  await expect(figure.getByRole("img", { name: new RegExp(`^${second!.name}\\b`) })).toHaveCount(1);

  // The marker of the current batch is drawn, with its words, once on the plot.
  await expect(figure.getByText("Lote atual (500 un)")).toHaveCount(1);

  // Both materials are in the legend, as toggles, so a curve can be isolated.
  const legend = page.getByRole("button", { name: new RegExp(first!.name) });
  await expect(legend.first()).toBeVisible();

  const found = await runAxe(page);
  expect(found, `custo com duas curvas:\n${describeFound(found)}`).toEqual([]);
});

test("custo: sem o segundo material não há curva por material", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const [first] = await twoPricedMaterials(page);
  await page.goto(`/app/custo?material=${first!.id}&massa=2&lote=500`);
  // The single material's own cost curve is there; the per-material figure needs two or more.
  await expect(page.getByRole("heading", { name: "Custo da peça" })).toBeVisible({ timeout: 45_000 });
  await settle(page);
  await expect(
    page.getByRole("figure", { name: "Curva Custo versus Tamanho do Lote, um material por curva" }),
  ).toHaveCount(0);
});

test("eco: a cascata da diferença B − A mostra um degrau por fase e a barra do total", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const list = await page.request.get(`${API}/api/materials`);
  const rows = (await list.json()) as { id: number; name: string }[];
  const aluminium = rows.find((row) => /Alumínio/.test(row.name));
  expect(aluminium, "seed carries an aluminium").toBeTruthy();
  const detail = await page.request.get(`${API}/api/materials/${aluminium!.id}`);
  const processes = ((await detail.json()) as { processes: { id: number; slug: string }[] }).processes;
  const casting = processes.find((p) => p.slug === "fundicao-areia");
  expect(casting, "aluminium has sand casting").toBeTruthy();
  const scenario = (mass: string) => ({
    material: String(aluminium!.id),
    process: String(casting!.id),
    mass,
    recycled: "0",
    endOfLife: "reciclagem",
  });

  // The same material and process at 2 and 3 kg: B spends more in every phase that has data.
  await page.goto(
    `/app/eco?modo=compare&a=${encodeJson(scenario("2"))}&b=${encodeJson(scenario("3"))}&modal=rodoviario&distancia=900`,
  );
  await expect(page.getByText("Cascata da diferença B − A, fase por fase")).toBeVisible({
    timeout: 45_000,
  });

  for (const quantity of ["energia", "carbono"]) {
    const figure = page.getByRole("figure", {
      name: `Cascata da diferença B − A de ${quantity} por fase`,
    });
    await expect(figure).toBeVisible();
    // Every phase step reads as a difference with its running total, and B costing more is said
    // in words, not only in colour.
    const steps = figure.getByRole("img", { name: /: diferença de .+; acumulado / });
    expect(await steps.count()).toBeGreaterThanOrEqual(2);
    await expect(steps.filter({ hasText: /./ })).toHaveCount(await steps.count());
    const above = figure.getByRole("img", { name: /\(B acima de A\)/ });
    expect(await above.count()).toBeGreaterThanOrEqual(1);
    // The total bar closes the figure (one more mark than the phase steps), and a phase the server
    // could not compute would be written as "sem dado", never as a zero-height bar.
    const marks = figure.getByRole("img");
    expect(await marks.count()).toBe((await steps.count()) + (await figure.getByRole("img", { name: /: sem dado/ }).count()) + 1);
  }

  const found = await runAxe(page);
  expect(found, `eco com a cascata da diferença:\n${describeFound(found)}`).toEqual([]);
});
