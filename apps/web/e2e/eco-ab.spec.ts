import { test, expect } from "./session";

/**
 * D-216: the eco audit's two scenarios live in the address. A link carrying A
 * and B opens the comparison already filled; editing one scenario rewrites only
 * its own parameter; the answer is the server's — per-phase differences and the
 * waterfall included.
 *
 * The scenarios are one real material and process at two masses, so the run does
 * not depend on which materials the seed happens to cover with eco data.
 */

const API = "http://127.0.0.1:8811";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function aluminiumCastingScenario(page: import("@playwright/test").Page) {
  const list = await page.request.get(`${API}/api/materials`);
  expect(list.ok()).toBe(true);
  const rows = (await list.json()) as { id: number; name: string }[];
  const aluminium = rows.find((row) => /Alumínio/.test(row.name));
  expect(aluminium, "seed carries an aluminium").toBeTruthy();
  const detail = await page.request.get(`${API}/api/materials/${aluminium!.id}`);
  const processes = ((await detail.json()) as { processes: { id: number; slug: string }[] }).processes;
  const casting = processes.find((p) => p.slug === "fundicao-areia");
  expect(casting, "aluminium has sand casting").toBeTruthy();
  return { material: String(aluminium!.id), process: String(casting!.id) };
}

test("eco: cenários A e B abrem pelo link, comparam e voltam do endereço", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const base = await aluminiumCastingScenario(page);
  const scenario = (mass: string) => ({
    ...base,
    mass,
    recycled: "0",
    endOfLife: "reciclagem",
  });
  const address = `/app/eco?modo=compare&a=${encodeJson(scenario("2"))}&b=${encodeJson(scenario("3"))}&modal=rodoviario&distancia=900`;

  await page.goto(address);
  // Both scenarios arrive filled from the link: two mass fields, 2 and 3.
  const masses = page.getByLabel("Massa da peça (kg)");
  await expect(masses).toHaveCount(2, { timeout: 45_000 });
  await expect(masses.nth(0)).toHaveValue("2");
  await expect(masses.nth(1)).toHaveValue("3");

  // D-219: no button — the comparison follows the scenarios. The server's answer: a table of phases with B − A, the winners, the premises
  // that fed both scenarios, and a waterfall for each scenario.
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible({ timeout: 45_000 });
  await expect(table.getByRole("row", { name: /Material/ }).first()).toBeVisible();
  await expect(page.getByText("Variação (B − A)")).toBeVisible();
  await expect(page.getByText("Menor pegada de carbono")).toBeVisible();
  await expect(page.getByRole("region", { name: "Premissas desta conta" })).toBeVisible();
  await page.getByText(/^Cascata do cenário A/).click();
  await expect(
    page.getByRole("figure", { name: "Cascata de energia por fase do ciclo de vida" }).first(),
  ).toBeVisible();

  // Editing B rewrites only B's parameter; A stays as the link said.
  await masses.nth(1).fill("4");
  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams;
      const decode = (key: string) =>
        JSON.parse(
          Buffer.from(
            (params.get(key) ?? "").replace(/-/g, "+").replace(/_/g, "/"),
            "base64",
          ).toString("utf-8"),
        ) as { mass: string };
      return `${decode("a").mass}/${decode("b").mass}`;
    })
    .toBe("2/4");

  // A reload keeps what was typed: the address is the state.
  await page.reload();
  await expect(page.getByLabel("Massa da peça (kg)").nth(1)).toHaveValue("4", { timeout: 45_000 });
  await expect(page.getByLabel("Massa da peça (kg)").nth(0)).toHaveValue("2");
});

test("eco: o produto e as premissas também vão no endereço, e um valor igual ao padrão sai dele", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const base = await aluminiumCastingScenario(page);
  await page.goto(`/app/eco?material=${base.material}&massa=2&vida=25`);

  // The solver's seed fills the first line; the premise comes from the link.
  await expect(page.getByLabel("Vida em serviço (anos)")).toHaveValue("25", { timeout: 45_000 });
  // D-219: the product is a table; the first line's mass names its column and row.
  await expect(page.getByLabel("Massa de uma unidade, Componente 1 (kg)")).toHaveValue("2");

  // Restoring the server's defaults takes the premise out of the address.
  await page.getByRole("button", { name: "Restaurar padrões do servidor" }).click();
  await expect(page.getByLabel("Vida em serviço (anos)")).toHaveValue("10");
  await expect(page).not.toHaveURL(/vida=/);
  await expect(page).toHaveURL(/massa=2/);
});
