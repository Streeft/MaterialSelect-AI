import type { Page } from "@playwright/test";
import { test, expect } from "./session";
import { describeFound, runAxe } from "./axe";

/**
 * D-258: the tray, in the real browser over the real API. What a reader carries is kept in the
 * account, so each test empties the tray first and leaves it empty.
 */
const OUT = process.env.E2E_SHOTS;

async function emptyTray(page: Page) {
  const response = await page.request.delete("http://127.0.0.1:8811/api/tray");
  expect(response.ok()).toBeTruthy();
}

async function openDrawer(page: Page) {
  await page.goto("/app/catalogo");
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  const front = page.getByRole("button", { name: /^Metais/ });
  await front.click();
  await expect(page.getByRole("region", { name: "Gaveta de Metais" }).getByRole("listitem").first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("msai.ambience", "oficina");
    } catch {
      /* private window */
    }
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  await emptyTray(page);
});

test.afterEach(async ({ page }) => {
  await emptyTray(page);
});

test("bandeja: levar pela gaveta, ver a contagem, recarregar, mover para Fixações e tirar com Desfazer", async ({ page }) => {
  await openDrawer(page);
  await page.getByRole("button", { name: "Levar Aço Demo B para a bandeja" }).click();
  await expect(page.getByText("Aço Demo B foi para a bandeja.")).toBeVisible();
  await page.getByRole("button", { name: "Levar Liga Alumínio Demo A para a bandeja" }).click();
  await expect(page.getByRole("button", { name: "Bandeja, 2 itens" }).first()).toBeVisible();
  // The command now says where the thing is.
  await expect(page.getByRole("button", { name: "Aço Demo B: na bandeja" })).toHaveAttribute("aria-pressed", "true");

  // It is in the account: a reload keeps it.
  await page.reload();
  await page.getByRole("button", { name: "Bandeja, 2 itens" }).first().click();
  const panel = page.getByRole("dialog", { name: "Bandeja" });
  const materials = panel.getByRole("region", { name: "Materiais" });
  await expect(materials.getByRole("link", { name: "Aço Demo B" })).toBeVisible();

  // The steel becomes a fixing.
  await panel.getByRole("button", { name: "Ações de Aço Demo B na bandeja" }).click();
  await page.getByRole("menuitem", { name: "Mover para Fixações" }).click();
  await expect(panel.getByRole("region", { name: "Fixações" }).getByRole("link", { name: "Aço Demo B" })).toBeVisible();

  // A calculator goes in from the panel.
  await panel.getByRole("button", { name: "Acrescentar ferramenta" }).click();
  await page.getByRole("menuitem", { name: "Custo" }).click();
  await expect(panel.getByRole("region", { name: "Ferramentas" }).getByRole("link", { name: "Custo" })).toHaveAttribute(
    "href",
    "/app/custo",
  );

  const found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/painel.png` });

  // Out at once, back with "Desfazer", in the compartment it was in.
  await panel.getByRole("button", { name: "Ações de Aço Demo B na bandeja" }).click();
  await page.getByRole("menuitem", { name: "Tirar da bandeja" }).click();
  await expect(panel.getByRole("link", { name: "Aço Demo B" })).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(panel.getByRole("region", { name: "Fixações" }).getByRole("link", { name: "Aço Demo B" })).toBeVisible();
});

test("bandeja: arrastar um envelope até a zona de soltar", async ({ page }) => {
  await openDrawer(page);
  const envelope = page.locator(".oficina-envelope", { hasText: "Aço Demo B" });
  // The zone exists only while something that can be carried is being dragged.
  await expect(page.getByRole("region", { name: "Solte aqui para levar à bandeja" })).toHaveCount(0);

  // The browser's own drag events, carrying one DataTransfer from the envelope to the zone. (A
  // synthetic mouse drag does not start an HTML5 drag in every headless build; `dragTo` cannot be
  // used either, because the zone does not exist before the drag starts.)
  const data = await page.evaluateHandle(() => new DataTransfer());
  await envelope.dispatchEvent("dragstart", { dataTransfer: data });
  const zone = page.getByRole("region", { name: "Solte aqui para levar à bandeja" });
  await expect(zone).toBeVisible();
  if (OUT) await page.screenshot({ path: `${OUT}/arrastando.png` });
  await zone.dispatchEvent("dragover", { dataTransfer: data });
  await expect(zone).toHaveAttribute("data-over", "true");
  await zone.dispatchEvent("drop", { dataTransfer: data });
  await envelope.dispatchEvent("dragend", { dataTransfer: data });

  await expect(page.getByText("Aço Demo B foi para a bandeja.")).toBeVisible();
  await expect(zone).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bandeja, 1 item" }).first()).toBeVisible();
});

test("bandeja: o material levado vai para a peça de um projeto, arrastando e pelo menu", async ({ page }) => {
  await openDrawer(page);
  await page.getByRole("button", { name: "Levar Liga Alumínio Demo A para a bandeja" }).click();
  await page.getByRole("button", { name: "Levar Aço Demo B para a bandeja" }).click();
  await expect(page.getByRole("button", { name: "Bandeja, 2 itens" }).first()).toBeVisible();

  await page.goto("/app/projetos");
  const name = `Mesa da bandeja ${Date.now()}`;
  await page.getByRole("textbox", { name: "Nome do novo projeto" }).fill(name);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/app\/projetos\/\d+$/);
  for (const part of ["Tampo", "Prego"]) {
    await page.getByRole("textbox", { name: "Nome da peça" }).last().fill(part);
    await page.getByRole("button", { name: "Acrescentar peça" }).click();
    await expect(page.getByRole("region", { name: `Peça ${part}` })).toBeVisible();
  }

  // Dragging: the aluminium from the strip onto the top.
  const strip = page.getByRole("group", { name: "Da bandeja" });
  const chip = strip.getByRole("listitem").filter({ hasText: "Liga Alumínio Demo A" });
  const top = page.getByRole("region", { name: "Peça Tampo" });
  await chip.dragTo(top);
  await expect(top.getByRole("link", { name: "Abrir a ficha de Liga Alumínio Demo A" })).toBeVisible();

  // The same by the menu, without a mouse drag: the steel for the nail.
  const nail = page.getByRole("region", { name: "Peça Prego" });
  await nail.getByRole("button", { name: "Ações da peça Prego" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Usar Aço Demo B, da bandeja" }).click();
  await expect(nail.getByRole("link", { name: "Abrir a ficha de Aço Demo B" })).toBeVisible();
  await expect(page.getByText("2 de 2 peças com material")).toBeVisible();

  // With a mass, the sum is the server's: 10 kg of the demo aluminium is 2.100 MJ.
  const mass = top.getByRole("spinbutton", { name: /Massa de cada uma/ });
  await mass.fill("10");
  await mass.blur();
  await expect(top.getByText("2.100 MJ")).toBeVisible();
  if (OUT) await page.screenshot({ path: `${OUT}/projeto.png`, fullPage: true });

  await page.getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Excluir projeto" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir projeto" }).click();
  await expect(page).toHaveURL(/\/app\/projetos$/);
});

test("bandeja no telefone: o botão fica no topo, o painel cabe e passa no axe", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openDrawer(page);
  // On a phone the list below shows cards with the same command; this is the envelope's.
  await page
    .getByRole("region", { name: "Gaveta de Metais" })
    .getByRole("button", { name: "Levar Aço Demo B para a bandeja" })
    .click();
  const button = page.getByRole("button", { name: "Bandeja, 1 item" });
  await expect(button).toBeVisible();
  const size = (await button.boundingBox())!;
  expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(24);
  await button.click();
  const panel = page.getByRole("dialog", { name: "Bandeja" });
  await expect(panel.getByRole("link", { name: "Aço Demo B" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const found = await runAxe(page);
  expect(found, describeFound(found)).toEqual([]);
  if (OUT) await page.screenshot({ path: `${OUT}/telefone.png` });
});
