import type { Page } from "@playwright/test";
import { test, expect } from "./session";

/**
 * D-251 in a real browser against the real API: Eco with a third alternative (each
 * against A, its own difference cascade), Custo with the process of a curve chosen
 * by hand, the project assistant's proposal that survives leaving the page, and the
 * ordinal scale editor in Admin. The numbers are the server's; what is checked here is
 * that each piece reaches the screen and writes where it should (the address, the
 * request).
 */
const API = "http://127.0.0.1:8811";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function aluminiumCasting(page: Page) {
  const list = await page.request.get(`${API}/api/materials`);
  const rows = (await list.json()) as { id: number; name: string }[];
  const aluminium = rows.find((row) => /Alumínio/.test(row.name));
  expect(aluminium, "seed carries an aluminium").toBeTruthy();
  const detail = await page.request.get(`${API}/api/materials/${aluminium!.id}`);
  const processes = ((await detail.json()) as { processes: { id: number; slug: string }[] }).processes;
  const casting = processes.find((p) => p.slug === "fundicao-areia");
  expect(casting, "aluminium has sand casting").toBeTruthy();
  return { id: aluminium!.id, material: String(aluminium!.id), process: String(casting!.id) };
}

test("eco: a terceira alternativa chega com a cascata C − A e o menor total", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const base = await aluminiumCasting(page);
  const scenario = (mass: string) => ({ ...base, mass, recycled: "0", endOfLife: "reciclagem" });
  await page.goto(
    `/app/eco?modo=compare&a=${encodeJson(scenario("2"))}&b=${encodeJson(scenario("3"))}` +
      `&extras=${encodeJson([scenario("1")])}&modal=rodoviario&distancia=900`,
  );

  await expect(page.getByRole("heading", { name: "Material C" })).toBeVisible({ timeout: 45_000 });
  const extras = page.getByTestId("eco-extras");
  await expect(extras).toBeVisible({ timeout: 45_000 });
  // The lightest part (1 kg) is the lowest on both quantities, named by the server.
  await expect(extras.getByText("Menor energia entre todas: Material C")).toBeVisible();
  await expect(
    extras.getByRole("figure", { name: "Cascata da diferença C − A de energia por fase" }),
  ).toBeVisible();

  // A fourth alternative is the last one; the add button goes away.
  await page.getByRole("button", { name: "Adicionar outra alternativa" }).click();
  await expect(page.getByRole("heading", { name: "Material D" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar outra alternativa" })).toHaveCount(0);
  await expect(page).toHaveURL(/extras=/);
});

test("custo: escolher o processo de uma curva a redesenha com a curva dele", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const base = await aluminiumCasting(page);
  const list = await page.request.get(`${API}/api/materials`);
  const rows = (await list.json()) as { id: number }[];
  const other = rows.find((row) => row.id !== base.id)!;
  await page.goto(`/app/custo?material=${base.id}&comparar=${other.id}&massa=2&lote=500`);

  const picker = page.getByLabel(/^Processo de /).first();
  await expect(picker).toBeVisible({ timeout: 45_000 });
  const options = await picker.locator("option").allTextContents();
  expect(options[0]).toBe("Mais barato em cada lote");
  expect(options.length, "at least one process to choose").toBeGreaterThan(1);

  await picker.selectOption({ index: 1 });
  await expect(page).toHaveURL(/processos=\d+%3A\d+|processos=\d+:\d+/);
  await expect(
    page.getByRole("figure", { name: "Curva Custo versus Tamanho do Lote, um material por curva" }),
  ).toBeVisible({ timeout: 45_000 });
  // And back: the envelope again, the choice gone from the address.
  await picker.selectOption({ index: 0 });
  await expect(page).not.toHaveURL(/processos=/);
});

test("assistente: a proposta volta ao Início e um limite editado vira número seu, com a origem anotada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  const box = page.getByRole("textbox", { name: "Descreva o projeto ou a peça" });
  await expect(box).toBeVisible({ timeout: 45_000 });
  await box.fill("quero fazer uma roupa de esqui");
  await box.press("Control+Enter");

  const outer = page.getByRole("article", { name: "Camada externa" });
  await expect(outer).toBeVisible({ timeout: 60_000 });

  // Edit the first numeric limit: the number typed is the reader's, and the note keeps whose it was.
  await outer.getByRole("button", { name: /^Editar o limite de / }).first().click();
  const field = outer.getByLabel(/: novo valor/).first();
  const before = Number(await field.inputValue());
  await field.fill(String(before + 1));
  await outer.getByRole("button", { name: "Usar este valor" }).click();
  await expect(outer.getByText(/^Editado por você: era /)).toBeVisible({ timeout: 30_000 });

  // Leave and come back: the edited proposal is still there, nothing asked again.
  await page.goto("/app/materiais");
  await page.goBack();
  const again = page.getByRole("article", { name: "Camada externa" });
  await expect(again).toBeVisible({ timeout: 30_000 });
  await expect(again.getByText(/^Editado por você: era /)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Descreva o projeto ou a peça" })).toHaveValue(
    "quero fazer uma roupa de esqui",
  );
});

test("admin: a escala de uma propriedade ordinal abre no editor, com o que depende de cada nível", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const response = await page.request.get(`${API}/api/properties/ordinais`);
  const scales = (await response.json()) as { name: string }[];
  await page.goto("/app/admin/propriedades");
  await expect(page.getByRole("heading", { name: "Propriedades ordinais" })).toBeVisible({
    timeout: 45_000,
  });
  if (scales.length === 0) {
    await expect(page.getByText("Nenhuma propriedade ordinal cadastrada.")).toBeVisible();
    return;
  }
  await page.getByRole("button", { name: `Editar a escala de ${scales[0]!.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Escala de “${scales[0]!.name}”` });
  await expect(dialog).toBeVisible();
  // Nothing changed, nothing to save; the order and the levels are the server's.
  await expect(dialog.getByRole("button", { name: "Salvar a escala" })).toBeDisabled();
  await expect(dialog.getByLabel(/^Nível 1/)).toBeVisible({ timeout: 30_000 });
});
