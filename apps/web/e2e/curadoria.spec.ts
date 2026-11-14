import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-233: "Citar fonte (ABNT)" na ficha e "Mover para…" na árvore de classes, no navegador de
 * verdade e contra o backend de verdade. A citação sai montada pelo servidor; a árvore muda só
 * o pai, sem apagar a prosa da família.
 *
 * D-236: editar a fonte pela ficha, arrastar uma classe para mover e "Esvaziar o arquivo".
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

test("admin/classes: arrastar uma linha sobre outra a move; a raiz recebe; um ciclo não é aceito", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  const create = async (body: Record<string, unknown>) => {
    const response = await page.request.post(`${API}/api/classes`, { data: body });
    expect(response.ok()).toBe(true);
    return (await response.json()) as { id: number; slug: string };
  };
  const top = await create({ name: `Topo Arrasta ${stamp}` });
  const middle = await create({ name: `Meio Arrasta ${stamp}`, parent_id: top.id });
  await create({ name: `Fundo Arrasta ${stamp}`, parent_id: middle.id });
  const other = await create({ name: `Outra Arrasta ${stamp}` });
  const parentOf = async (slug: string) =>
    ((await (await page.request.get(`${API}/api/classes/${slug}`)).json()) as { parent_id: number | null })
      .parent_id;

  await page.goto("/app/admin/classes");
  await expect(page.getByRole("heading", { name: "Classes de materiais" })).toBeVisible({ timeout: 45_000 });
  const row = (name: string) => page.getByRole("row").filter({ has: page.getByRole("rowheader", { name }) });
  const grip = (name: string) => row(name).locator("[draggable='true']");

  // Arrastar o Meio (com o Fundo dentro) para a Outra: o pai muda e a subárvore vai junto.
  await grip(`Meio Arrasta ${stamp}`).dragTo(row(`Outra Arrasta ${stamp}`));
  await expect(page.getByText(`“Meio Arrasta ${stamp}” agora está em “Outra Arrasta ${stamp}”.`)).toBeVisible();
  expect(await parentOf(middle.slug)).toBe(other.id);
  // The tree reloads after the move; the next drag starts only once the rows show the new place,
  // or it would begin on rows that are about to be replaced (and the browser drops the gesture).
  await expect(row(`Meio Arrasta ${stamp}`)).toContainText(`Outra Arrasta ${stamp}`);

  // Soltar o Meio na faixa da raiz o devolve à raiz.
  await grip(`Meio Arrasta ${stamp}`).dragTo(page.getByText("Solte aqui para tornar classe raiz"));
  await expect.poll(() => parentOf(middle.slug), { timeout: 15_000 }).toBeNull();
  // The notice queues behind the first one (one snackbar at a time), so it gets a longer wait.
  await expect(page.getByText(`“Meio Arrasta ${stamp}” agora é uma classe raiz.`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(row(`Meio Arrasta ${stamp}`)).toContainText("raiz");

  // Um ciclo (soltar o Meio sobre o próprio Fundo) não é aceito: nada muda no servidor.
  await grip(`Meio Arrasta ${stamp}`).dragTo(row(`Fundo Arrasta ${stamp}`));
  await page.waitForTimeout(500);
  expect(await parentOf(middle.slug)).toBeNull();

  // O teclado tem o seu caminho: o botão de cada linha continua lá.
  await expect(page.getByRole("button", { name: `Mover para…: Meio Arrasta ${stamp}` })).toBeVisible();

  const found = await runAxe(page);
  expect(found, `admin/classes com a faixa da raiz:\n${describeFound(found)}`).toEqual([]);
});

test("ficha: o curador edita a fonte e a citação ABNT segue o que ele cadastrou", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const rows = (await (await page.request.get(`${API}/api/materials`)).json()) as { id: number }[];
  let id: number | null = null;
  let source: { id: number; label: string } | null = null;
  for (const row of rows.slice(0, 20)) {
    const sheet = (await (await page.request.get(`${API}/api/materials/${row.id}`)).json()) as {
      sources?: { id: number; label: string }[];
    };
    if (sheet.sources && sheet.sources.length > 0) {
      id = row.id;
      source = sheet.sources[0]!;
      break;
    }
  }
  expect(source).not.toBeNull();

  await page.goto(`/app/materiais/${id}`);
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: `Editar fonte: ${source!.label}` }).click();
  const dialog = page.getByRole("dialog", { name: `Editar a fonte “${source!.label}”` });
  await expect(dialog).toBeVisible();

  // Validação ao lado do campo, sem ir ao servidor.
  await dialog.getByLabel("Ano de publicação").fill("3000");
  await dialog.getByLabel("Endereço (URL)").fill("exemplo.org");
  await dialog.getByRole("button", { name: "Salvar fonte" }).click();
  await expect(dialog.getByText(/Informe um ano inteiro entre 1000 e/)).toBeVisible();
  await expect(dialog.getByText(/comece com http:\/\/ ou https:\/\//).first()).toBeVisible();

  await dialog.getByLabel("Autores").fill("ASHBY, Michael F.");
  await dialog.getByLabel("Título").fill("Materials selection in mechanical design");
  await dialog.getByLabel("Ano de publicação").fill("2011");
  await dialog.getByLabel("Endereço (URL)").fill("https://exemplo.org/livro");
  await dialog.getByRole("button", { name: "Salvar fonte" }).click();

  await expect(page.getByText(`Fonte “${source!.label}” atualizada.`)).toBeVisible();
  // A ficha mostra a citação que o servidor montou com os campos novos.
  const abnt = page.getByLabel("Citação em ABNT").filter({ hasText: "ASHBY, Michael F." });
  await expect(abnt.first()).toContainText("Materials selection in mechanical design");
  await expect(abnt.first()).toContainText("Disponível em: https://exemplo.org/livro.");
  // Sem data de acesso cadastrada, a citação não escreve "Acesso em".
  await expect(abnt.first()).not.toContainText("Acesso em");
});

test("cadernos: Esvaziar o arquivo apaga só os arquivados, depois de confirmar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  const create = async (title: string) => {
    const response = await page.request.post(`${API}/api/notebooks`, { data: { title } });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { id: number }).id;
  };
  const old = await create(`Velho E2E ${stamp}`);
  const kept = await create(`Ativo E2E ${stamp}`);
  const archive = await page.request.post(`${API}/api/notebooks/batch-archive`, {
    data: { ids: [old], archived: true },
  });
  expect(archive.ok()).toBe(true);
  const archivedNow = (await (await page.request.get(`${API}/api/notebooks?archived=true`)).json()) as {
    id: number;
  }[];

  await page.goto("/app/cadernos?arquivados=1");
  await expect(page.getByRole("link", { name: new RegExp(`Velho E2E ${stamp}`) })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Esvaziar o arquivo" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText(String(archivedNow.length));
  // Cancelar não apaga.
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  expect((await page.request.get(`${API}/api/notebooks/${old}`)).status()).toBe(200);

  await page.getByRole("button", { name: "Esvaziar o arquivo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar de vez" }).click();
  await expect(page.getByText(/apagados? de vez\./)).toBeVisible();

  expect((await page.request.get(`${API}/api/notebooks/${old}`)).status()).toBe(404);
  // O caderno ativo continua lá.
  expect((await page.request.get(`${API}/api/notebooks/${kept}`)).status()).toBe(200);
});
