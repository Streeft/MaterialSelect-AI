import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-257: a project with parts, end to end over the real API and the demo catalogue. The numbers
 * asserted here are the server's — the screen only prints them — so this is where "a part is its
 * mass times what the catalogue says" is seen through the whole stack.
 */
const OUT = process.env.E2E_SHOTS;

test("projeto com peças: criar, dar material e massa, ver a soma e a recusa do total", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/projetos");
  await expect(page.locator("main h1")).toHaveText("Projetos");

  const name = `Mesa de jantar ${Date.now()}`;
  await page.getByRole("textbox", { name: "Nome do novo projeto" }).fill(name);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/app\/projetos\/\d+$/);
  await expect(page.getByText("Nenhuma peça ainda", { exact: false })).toBeVisible();

  // First part: the top, in the demo aluminium, 10 kg.
  await page.getByRole("textbox", { name: "Nome da peça" }).fill("Tampo");
  await page.getByRole("button", { name: "Acrescentar peça" }).click();
  const top = page.getByRole("region", { name: "Peça Tampo" });
  await expect(top).toBeVisible();
  await expect(top.getByText("Sem massa unitária informada.").first()).toBeVisible();

  const material = top.getByRole("combobox", { name: "Material" });
  await material.fill("Alumínio");
  await page.getByRole("option", { name: /Liga Alumínio Demo A/ }).click();
  await expect(top.getByRole("link", { name: /Abrir a ficha de Liga Alumínio Demo A/ })).toBeVisible();

  const mass = top.getByRole("spinbutton", { name: /Massa de cada uma/ });
  await mass.fill("10");
  await mass.blur();
  // 10 kg × 210 MJ/kg and × 12,5 kg CO₂/kg, from the demo catalogue.
  await expect(top.getByText("2.100 MJ")).toBeVisible();
  await expect(top.getByText("125 kg de CO₂")).toBeVisible();

  const totals = page.locator("#soma");
  await expect(totals.getByText("10 kg", { exact: true })).toBeVisible();

  // Second part with nothing chosen: every total is refused, with the partial sum named.
  await page.getByRole("textbox", { name: "Nome da peça" }).last().fill("Perna");
  await page.getByRole("button", { name: "Acrescentar peça" }).click();
  await expect(page.getByRole("region", { name: "Peça Perna" })).toBeVisible();
  await expect(totals.getByText("Sem total: falta dado em Perna.").first()).toBeVisible();
  await expect(totals.getByText("Soma parcial, de 1 peça: 10 kg.")).toBeVisible();
  await expect(page.getByText("1 de 2 peças com material")).toBeVisible();

  const found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/projeto.png`, fullPage: true });

  // Phone: nothing scrolls sideways.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  if (OUT) await page.screenshot({ path: `${OUT}/projeto-telefone.png`, fullPage: true });

  // The list shows how far along it is; a reload keeps everything (it is on the account).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/projetos");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText("1 de 2 peças com material");
});

test("projeto com peças: remover uma peça tem Desfazer, e excluir o projeto pede confirmação", async ({ page }) => {
  await page.goto("/app/projetos");
  const name = `Estante ${Date.now()}`;
  await page.getByRole("textbox", { name: "Nome do novo projeto" }).fill(name);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/app\/projetos\/\d+$/);
  await page.getByRole("textbox", { name: "Nome da peça" }).fill("Prateleira");
  await page.getByRole("button", { name: "Acrescentar peça" }).click();
  const shelf = page.getByRole("region", { name: "Peça Prateleira" });
  await expect(shelf).toBeVisible();

  await shelf.getByRole("button", { name: "Ações da peça Prateleira" }).click();
  await page.getByRole("menuitem", { name: "Remover a peça" }).click();
  await expect(shelf).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("region", { name: "Peça Prateleira" })).toBeVisible();

  await page.getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Excluir projeto" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir projeto" }).click();
  await expect(page).toHaveURL(/\/app\/projetos$/);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
});

test("projeto: o campo de material no pé da tela abre a lista onde ela cabe (D-261)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  const materials: { id: number; name: string }[] = await (await page.request.get(`http://127.0.0.1:8811/api/materials`)).json();
  const steel = materials.find((m) => m.name === "Aço Demo B")!;
  const made = await page.request.post(`http://127.0.0.1:8811/api/assemblies`, { data: { name: `Repro ${Date.now()}` } });
  const project = await made.json();
  await page.request.post(`http://127.0.0.1:8811/api/assemblies/${project.id}/parts`, { data: { name: "Perna", material_id: steel.id } });
  await page.goto(`/app/projetos/${project.id}`);
  const part = page.getByRole("region", { name: "Peça Perna" });
  const field = part.getByRole("combobox", { name: /Material/ });
  await expect(field).toBeVisible({ timeout: 30_000 });
  // Put the field at the very bottom of the viewport, as a long page does.
  // A viewport that ends just under the field, and a page with nothing left to scroll.
  const bottom = await field.evaluate((el) => el.getBoundingClientRect().bottom);
  await page.setViewportSize({ width: 1280, height: Math.ceil(bottom) + 12 });
  await field.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await field.click();
  // The list is fixed to the viewport: it has to open where a pointer can reach it.
  await page.getByRole("option", { name: /Liga Alumínio Demo A/ }).click({ timeout: 15_000 });
  await expect(part.getByRole("link", { name: "Abrir a ficha de Liga Alumínio Demo A" })).toBeVisible();
  await page.request.delete(`http://127.0.0.1:8811/api/assemblies/${project.id}`);
});
