import { test, expect } from "./session";

/**
 * D-233: "Citar fonte (ABNT)" na ficha e "Mover para…" na árvore de classes, no navegador de
 * verdade e contra o backend de verdade. A citação sai montada pelo servidor; a árvore muda só
 * o pai, sem apagar a prosa da família.
 */

const API = "http://127.0.0.1:8811";

test("ficha: 'Citar fonte (ABNT)' copia, com um clique, o texto que o servidor montou", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3011" });
  await page.setViewportSize({ width: 1280, height: 900 });

  // Um material cuja ficha cita ao menos uma fonte.
  const rows = (await (await page.request.get(`${API}/api/materials`)).json()) as { id: number }[];
  let id: number | null = null;
  let abnt = "";
  let label = "";
  for (const row of rows.slice(0, 20)) {
    const sheet = (await (await page.request.get(`${API}/api/materials/${row.id}`)).json()) as {
      sources?: { label: string; abnt: string }[];
    };
    if (sheet.sources && sheet.sources.length > 0) {
      id = row.id;
      abnt = sheet.sources[0]!.abnt;
      label = sheet.sources[0]!.label;
      break;
    }
  }
  expect(id).not.toBeNull();
  expect(abnt).not.toBe("");

  await page.goto(`/app/materiais/${id}`);
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });

  // A seção já vem aberta: um clique, não dois.
  const button = page.getByRole("button", { name: `Citar fonte (ABNT): ${label}` });
  await expect(button).toBeVisible();
  // O texto que vai ser copiado está à vista, igual ao do servidor.
  await expect(page.getByText(abnt, { exact: true }).first()).toBeVisible();

  await button.click();
  await expect(page.getByText("Citação ABNT copiada.").first()).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(abnt);
  // Nada inventado: sem "s.d." onde ninguém cadastrou ano.
  expect(copied).not.toMatch(/s\.d\./);
});

test("admin/classes: 'Mover para…' troca só o pai e não apaga o texto da família", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  const nameA = `Pasta E2E A ${stamp}`;
  const nameB = `Pasta E2E B ${stamp}`;
  const nameChild = `Filha E2E ${stamp}`;

  const create = async (body: Record<string, unknown>) => {
    const response = await page.request.post(`${API}/api/classes`, { data: body });
    expect(response.ok()).toBe(true);
    return (await response.json()) as { id: number; slug: string };
  };
  const a = await create({ name: nameA });
  const b = await create({ name: nameB });
  const child = await create({
    name: nameChild,
    parent_id: a.id,
    applications: "Usos da família de teste",
    characteristics: "Características da família de teste",
  });

  await page.goto("/app/admin/classes");
  await expect(page.getByRole("heading", { name: "Classes de materiais" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: `Mover para…: ${nameChild}` }).click();
  const dialog = page.getByRole("dialog", { name: `Mover “${nameChild}”` });
  await expect(dialog).toBeVisible();
  // Não se oferece a própria classe como destino.
  await expect(dialog.getByRole("option", { name: nameChild })).toHaveCount(0);
  await dialog.getByLabel("Nova classe pai").selectOption({ label: nameB });
  await dialog.getByRole("button", { name: "Mover", exact: true }).click();

  await expect(page.getByText(`“${nameChild}” agora está em “${nameB}”.`)).toBeVisible();

  // No servidor: o pai mudou e a prosa da família continua lá.
  const record = (await (await page.request.get(`${API}/api/classes/${child.slug}`)).json()) as {
    parent_id: number;
    applications: string | null;
    characteristics: string | null;
  };
  expect(record.parent_id).toBe(b.id);
  expect(record.applications).toBe("Usos da família de teste");
  expect(record.characteristics).toBe("Características da família de teste");

  // Mover a pasta A para dentro da filha (sua descendente, agora de B) não é possível: ela não aparece.
  await page.getByRole("button", { name: `Mover para…: ${nameB}` }).click();
  const second = page.getByRole("dialog", { name: `Mover “${nameB}”` });
  await expect(second.getByRole("option", { name: nameChild })).toHaveCount(0);
  await expect(second.getByRole("option", { name: nameA })).toHaveCount(1);
});
