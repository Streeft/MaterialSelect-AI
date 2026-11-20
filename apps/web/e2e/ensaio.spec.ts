import type { Page } from "@playwright/test";
import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-260: the trial of a project, in the real browser over the real API. The study and the project
 * are made through the API (their screens have their own specs); the trial is run on the page.
 */
const OUT = process.env.E2E_SHOTS;
const API = "http://127.0.0.1:8811";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(`${API}${path}`, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("ensaio: cada peça contra os limites do seu estudo, e o carimbo quando todas passam", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  const materials: { id: number; name: string }[] = await (await page.request.get(`${API}/api/materials`)).json();
  const steel = materials.find((m) => m.name === "Aço Demo B")!;
  const aluminium = materials.find((m) => m.name === "Liga Alumínio Demo A")!;
  const stamp = Date.now();
  const study = await post(page, "/api/selection/studies", {
    name: `Leve ${stamp}`,
    constraints: [
      { operator: "lte", property_slug: "densidade", value: 5, unit: "g/cm**3" },
      { operator: "gte", property_slug: "modulo_young", value: 1, unit: "GPa" },
    ],
  });
  const project = await post(page, "/api/assemblies", { name: `Mesa do ensaio ${stamp}` });
  await post(page, `/api/assemblies/${project.id}/parts`, { name: "Tampo", material_id: aluminium.id, study_id: study.id });
  await post(page, `/api/assemblies/${project.id}/parts`, { name: "Perna", material_id: steel.id, study_id: study.id });

  await page.goto(`/app/projetos/${project.id}`);
  await expect(page.getByRole("region", { name: "Peça Perna" })).toBeVisible({ timeout: 45_000 });
  // Nothing is tried until it is asked for.
  await expect(page.getByRole("region", { name: "Resultado do ensaio" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ensaiar o projeto" }).click();

  const result = page.getByRole("region", { name: "Resultado do ensaio" });
  await expect(result.getByText("Ainda não solucionado")).toBeVisible();
  await expect(result.getByText("De 2: 1 peça passa, 1 não passa.")).toBeVisible();
  const leg = result.getByRole("list", { name: "Requisitos de Perna" }).getByRole("listitem");
  await expect(leg).toHaveCount(2);
  await expect(leg.first()).toContainText("Não passa");
  await expect(leg.last()).toContainText("Passa");
  let found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await result.screenshot({ path: `${OUT}/ensaio-falha.png` });

  // The leg takes the aluminium: the trial follows the project and the stamp changes.
  const part = page.getByRole("region", { name: "Peça Perna" });
  await part.getByRole("combobox", { name: /Material/ }).click();
  await page.getByRole("option", { name: /Liga Alumínio Demo A/ }).click();
  await expect(result.getByText("Solucionado", { exact: true })).toBeVisible();
  await expect(result.getByText("As 2 peças passam em todos os requisitos.")).toBeVisible();
  found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await result.screenshot({ path: `${OUT}/ensaio-solucionado.png` });

  // On a phone the result still fits.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(result.getByText("Solucionado", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.request.delete(`${API}/api/assemblies/${project.id}`);
  await page.request.delete(`${API}/api/selection/studies/${study.id}`);
});

test("ensaio com caso de carga: a massa informada contra a massa mínima do Dimensionar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  const materials: { id: number; name: string }[] = await (await page.request.get(`${API}/api/materials`)).json();
  const aluminium = materials.find((m) => m.name === "Liga Alumínio Demo A")!;
  const project = await post(page, "/api/assemblies", { name: `Tirante do ensaio ${Date.now()}` });
  // A tie far too light for the stiffness that will be asked of it.
  await post(page, `/api/assemblies/${project.id}/parts`, { name: "Tirante", material_id: aluminium.id, unit_mass: 0.001 });

  await page.goto(`/app/projetos/${project.id}`);
  const part = page.getByRole("region", { name: "Peça Tirante" });
  await expect(part).toBeVisible({ timeout: 45_000 });
  await part.getByRole("button", { name: "Declarar caso de carga" }).click();
  const form = part.getByRole("form", { name: "Caso de carga de Tirante" });
  await form.getByRole("combobox", { name: "Caso" }).selectOption("tirante-rigidez");
  await form.getByRole("spinbutton", { name: /Comprimento/ }).fill("1");
  await form.getByRole("spinbutton", { name: /Rigidez/ }).fill("1000000");
  await form.getByRole("button", { name: "Salvar caso" }).click();
  await expect(part.getByText("Tirante em tração, rigidez especificada")).toBeVisible();

  await page.getByRole("button", { name: "Ensaiar o projeto" }).click();
  const result = page.getByRole("region", { name: "Resultado do ensaio" });
  const line = result.getByRole("list", { name: "Requisitos de Tirante" }).getByRole("listitem");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Caso de carga: Tirante em tração, rigidez especificada");
  await expect(line).toContainText(/Massa mínima: [\d.,]+ kg; massa informada: 0,001 kg\./);
  await expect(line).toContainText("Não passa");
  await expect(result.getByText("Ainda não solucionado")).toBeVisible();
  let found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/carga-falha.png`, fullPage: true });

  // Heavier at the same length is more section: the part now holds, and the trial follows.
  const mass = part.getByRole("spinbutton", { name: /Massa de cada uma/ });
  await mass.fill("100000");
  await mass.blur();
  await expect(line).toContainText("Passa");
  await expect(result.getByText("Solucionado", { exact: true })).toBeVisible();
  found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await result.screenshot({ path: `${OUT}/carga-passa.png` });

  // Without the mass there is nothing to compare, and that is said.
  await mass.fill("");
  await mass.blur();
  await expect(line).toContainText("massa informada: não informada");
  await expect(line).toContainText("Sem dado");

  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.request.delete(`${API}/api/assemblies/${project.id}`);
});
