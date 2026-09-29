import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { installFakeSpeech } from "../lib/testing/fakeSpeech";
import { test, expect } from "./session";

/**
 * D-92: a notebook end to end — create it, paste a source, read the guide the
 * (simulated) AI writes, ask, and open the passage a citation points at. The
 * backend runs `AI_PROVIDER=mock`, which quotes the passages it cites, so the
 * figures below are the source's own.
 */

const SOURCE =
  "O aço carbono tem densidade de 7850 kg/m³ e módulo de elasticidade de 210 GPa. " +
  "É o material estrutural mais usado na construção civil.";

test("criar um caderno, colar uma fonte, perguntar e abrir a citação", async ({ page }) => {
  await page.goto("/app/cadernos");
  await expect(page.getByRole("heading", { name: "Cadernos", level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Criar caderno" }).first().click();
  await page.waitForURL(/\/app\/cadernos\/\d+/, { timeout: 20_000 });

  // Adicionar fontes → Colar texto.
  await page.getByRole("button", { name: "Adicionar fontes" }).click();
  await page.getByRole("tab", { name: "Colar texto" }).click();
  await page.getByLabel("Título").fill("Aula de aços");
  await page.getByRole("textbox", { name: "Texto" }).fill(SOURCE);
  await page.getByRole("button", { name: "Adicionar texto" }).click();

  // The source is listed and the guide is written from it.
  await expect(page.getByRole("button", { name: "Ler a fonte “Aula de aços”" })).toBeVisible();
  await expect(page.getByText("Perguntas sugeridas")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "test-results/cadernos-guia.png", fullPage: true });

  // Ask, and open the passage the answer cites.
  const box = page.getByRole("textbox", { name: "Pergunta às fontes" });
  await box.fill("Qual a densidade do aço?");
  await box.press("Enter");
  const log = page.getByRole("log", { name: "Conversa com as fontes" });
  await expect(log.getByText("Segundo as fontes", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await log.getByRole("button", { name: "Trecho 1, de “Aula de aços”" }).last().click();
  const passage = page.getByRole("dialog", { name: "Trecho 1, de “Aula de aços”" });
  await expect(passage).toContainText("7850 kg/m³");
  await page.screenshot({ path: "test-results/cadernos-citacao.png", fullPage: true });
  await page.keyboard.press("Escape");

  // On a phone the three panels become one at a time, and the conversation
  // survives switching to the sources and back.
  await page.setViewportSize({ width: 390, height: 844 });
  const panels = page.getByRole("group", { name: "Painéis do caderno" });
  await panels.getByRole("button", { name: "Fontes" }).click();
  await expect(page.getByRole("button", { name: "Adicionar fontes" })).toBeVisible();
  await expect(log).toBeHidden();
  await page.screenshot({ path: "test-results/cadernos-telefone.png", fullPage: true });
  await panels.getByRole("button", { name: "Conversa" }).click();
  await expect(log.getByText("Segundo as fontes", { exact: false })).toBeVisible();
});

/**
 * D-94: the Studio end to end — the generation runs after the response, in the
 * API's background, and the panel polls until it is ready. The mock quotes the
 * passages, so every item passes the figure check with the source's own
 * numbers.
 */
test("gerar um relatório e cartões no Estúdio, abrir e exportar", async ({ page }) => {
  await page.goto("/app/cadernos");
  await page.getByRole("button", { name: "Criar caderno" }).first().click();
  await page.waitForURL(/\/app\/cadernos\/\d+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Adicionar fontes" }).click();
  await page.getByRole("tab", { name: "Colar texto" }).click();
  await page.getByLabel("Título").fill("Aula de aços");
  await page.getByRole("textbox", { name: "Texto" }).fill(SOURCE);
  await page.getByRole("button", { name: "Adicionar texto" }).click();
  await expect(page.getByRole("button", { name: "Ler a fonte “Aula de aços”" })).toBeVisible();

  // Relatórios → "Criar relatório": format, template with its pencil, Gerar.
  await page.getByRole("button", { name: /^Relatórios/ }).click();
  const dialog = page.getByRole("dialog", { name: "Criar relatório" });
  await expect(dialog.getByRole("radio", { name: "Texto corrido" })).toBeChecked();
  await dialog.getByRole("button", { name: "Editar o modelo “Guia de estudo”" }).click();
  await expect(dialog.getByRole("textbox", { name: "Instruções do modelo" })).toHaveValue(
    /guia de estudo/,
  );
  await page.screenshot({ path: "test-results/estudio-criar.png", fullPage: true });
  await dialog.getByRole("button", { name: "Gerar" }).click();
  await expect(dialog).toBeHidden();

  // It lands in the list when the background job ends, and opens in the panel.
  const report = page.getByRole("button", { name: /^Abrir “Guia de estudo/ });
  await expect(report).toBeVisible({ timeout: 30_000 });
  await report.click();
  await expect(page.getByRole("button", { name: "Trecho 1, de “Aula de aços”" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Exportar" }).click();
  await expect(page.getByRole("menuitem", { name: "DOCX (Word)" })).toHaveAttribute(
    "href",
    /\/studio\/\d+\/export\.docx$/,
  );
  await page.screenshot({ path: "test-results/estudio-relatorio.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Voltar ao Estúdio" }).click();

  // Cartões didáticos, with the defaults, then turned over.
  await page.getByRole("button", { name: /^Cartões didáticos/ }).click();
  await page.getByRole("dialog", { name: "Criar cartões didáticos" }).getByRole("button", { name: "Gerar" }).click();
  const cards = page.getByRole("button", { name: /^Abrir “Cartões didáticos/ });
  await expect(cards).toBeVisible({ timeout: 30_000 });
  await cards.click();
  await page.getByRole("button", { name: "Virar" }).click();
  await expect(page.getByText(/Cartão 1 de \d+ · Verso/)).toBeVisible();
  await page.screenshot({ path: "test-results/estudio-cartoes.png", fullPage: true });
});

/**
 * D-97: sources from outside — a link, a video, a search. The E2E API must
 * never depend on the internet, so every scenario below stays on a path the
 * server decides without it:
 *
 * - The video is fictitious (`E2Eoffline0`). The only request that leaves the
 *   server is YouTube's oEmbed, for the title, and it cannot answer with one:
 *   offline it fails to connect, online a made-up id is not found. Either way
 *   the failure is not fatal (the title falls back to "Vídeo do YouTube (id)")
 *   and the pasted transcript is the source — so the title is asserted only
 *   loosely, and nothing else waits on YouTube.
 * - `127.0.0.1` is refused by the address policy before any request is sent.
 * - Article and web search are off in the E2E API (`playwright.config.ts` pins
 *   the configuration), and being off is exactly what is asserted: the
 *   written reason, with no search run.
 */

const VIDEO = "https://www.youtube.com/watch?v=E2Eoffline0";

/** A transcript above the server's minimum (200 characters of text). */
const TRANSCRIPT =
  "Nesta aula vamos comparar o aço carbono com as ligas de alumínio na escolha de um " +
  "quadro de bicicleta. O aço é mais denso, mas também mais rígido; o alumínio é mais " +
  "leve e exige tubos de diâmetro maior para chegar à mesma rigidez. No fim, o índice " +
  "de desempenho decide qual dos dois leva a vantagem para cada requisito do projeto.";

async function newNotebook(page: Page) {
  await page.goto("/app/cadernos");
  await page.getByRole("button", { name: "Criar caderno" }).first().click();
  await page.waitForURL(/\/app\/cadernos\/\d+/, { timeout: 20_000 });
}

test("Link: um vídeo do YouTube pede a transcrição e vira fonte com ela", async ({ page }) => {
  await newNotebook(page);
  await page.getByRole("button", { name: "Adicionar fontes" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar fontes" });
  await dialog.getByRole("tab", { name: "Link" }).click();
  await dialog.getByRole("textbox", { name: "Endereço" }).fill(VIDEO);
  await expect(dialog.getByText("Vídeo do YouTube: o texto da fonte é a transcrição.")).toBeVisible();

  // Sent without the transcript: nothing is stored, and the server answers
  // why it needs the text (and a title — the video's own or the fallback).
  await dialog.getByRole("button", { name: "Adicionar vídeo" }).click();
  await expect(
    dialog.getByText("O YouTube não permite que o servidor obtenha a transcrição", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole("status").filter({ hasText: /^Vídeo: “.+”$/ })).toBeVisible();
  const transcript = dialog.getByRole("textbox", { name: "Transcrição" });
  await expect(transcript).toBeFocused();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "test-results/cadernos-link-youtube.png", fullPage: true });

  // Pasted, it becomes the source: the dialog closes and the list has it.
  await transcript.fill(TRANSCRIPT);
  await dialog.getByRole("button", { name: "Adicionar vídeo" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  const source = page.getByRole("button", { name: /^Ler a fonte “.+”$/ });
  await expect(source).toHaveCount(1);

  // The reader says where the text came from.
  await source.click();
  await expect(page.getByText("Transcrição colada pelo aluno")).toBeVisible();
});

test("Link: um endereço da rede interna é recusado sem sair do servidor", async ({ page }) => {
  await newNotebook(page);
  const usage = page.getByText(/^\d+ de 30 buscas hoje$/);
  await expect(usage).toBeVisible({ timeout: 20_000 });
  const before = await usage.textContent();

  await page.getByRole("button", { name: "Adicionar fontes" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar fontes" });
  await dialog.getByRole("tab", { name: "Link" }).click();
  await dialog.getByRole("textbox", { name: "Endereço" }).fill("http://127.0.0.1/");
  await dialog.getByRole("button", { name: "Adicionar site" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Este endereço aponta para uma rede interna ou reservada e não pode ser lido.",
    { timeout: 20_000 },
  );
  await page.screenshot({ path: "test-results/cadernos-link-recusado.png", fullPage: true });

  // Refused before any request left the server: nothing stored, nothing
  // counted against the day's quota.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^Ler a fonte/ })).toHaveCount(0);
  await expect(usage).toHaveText(before ?? "");
});

test("Pesquisa: artigos e web desligados dizem por quê, e a cota aparece", async ({ page }) => {
  await newNotebook(page);
  const panel = page.getByRole("region", { name: "Pesquisar novas fontes" });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText(/^\d+ de 30 buscas hoje$/)).toBeVisible();

  const providers = panel.getByRole("group", { name: "Onde pesquisar" });
  const articles = providers.getByRole("button", { name: "Artigos" });
  const wiki = providers.getByRole("button", { name: "Wikipédia" });
  const web = providers.getByRole("button", { name: "Web" });

  // The first provider that is on is the one selected; the ones that are off
  // stay focusable and carry their reason as a description.
  await expect(wiki).toHaveAttribute("aria-pressed", "true");
  await expect(articles).toHaveAttribute("aria-disabled", "true");
  await expect(articles).toHaveAccessibleDescription(/chave gratuita do OpenAlex/);
  await expect(web).toHaveAttribute("aria-disabled", "true");
  await expect(web).toHaveAccessibleDescription("A busca na web não está ligada neste servidor.");

  // Choosing one that is off shows the reason, and searching does nothing.
  // By keyboard: `aria-disabled` is not `disabled`, so it is reachable and
  // pressable (Playwright's click refuses an aria-disabled element).
  await articles.focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByText("Artigos: desligado")).toBeVisible();
  await expect(panel.getByText(/chave gratuita do OpenAlex/)).toBeVisible();
  const submit = panel.getByRole("button", { name: "Pesquisar" });
  await panel.getByRole("searchbox", { name: "O que pesquisar" }).fill("fadiga em alumínio");
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("status")).toHaveCount(0);

  await web.focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByText("Web: desligado")).toBeVisible();
  await expect(panel.getByText("A busca na web não está ligada neste servidor.")).toBeVisible();
  await expect(panel.getByText(/^Não pesquise com material sigiloso/)).toBeVisible();
  await page.screenshot({ path: "test-results/cadernos-pesquisa.png", fullPage: true });
});

/**
 * D-98: the Studio's phase-4 tools — slides, infographic and audio. Still the
 * mock provider, still no internet: the deck's PPTX and the infographic's SVG
 * come from the API, the PNG is rasterised in this browser, and the audio is
 * read by a scripted `speechSynthesis` (headless Chromium has one with no
 * voices at all). The notebook gets two pasted sources, one passage each, so
 * the mock's deck has two slides and its audio two lines per source.
 */

const SECOND_SOURCE =
  "A liga de alumínio 6061 tem densidade de 2700 kg/m³ e módulo de elasticidade de 69 GPa. " +
  "É usada em quadros de bicicleta e em estruturas leves.";

async function pasteSource(page: Page, title: string, text: string) {
  await page.getByRole("button", { name: "Adicionar fontes" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar fontes" });
  await dialog.getByRole("tab", { name: "Colar texto" }).click();
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByRole("textbox", { name: "Texto" }).fill(text);
  await dialog.getByRole("button", { name: "Adicionar texto" }).click();
  await expect(page.getByRole("button", { name: `Ler a fonte “${title}”` })).toBeVisible({
    timeout: 20_000,
  });
}

/** A notebook with the two sources, the tool generated with its defaults and
 * opened once the background job is done. */
async function generateAndOpen(page: Page, tile: RegExp, dialogName: string) {
  await newNotebook(page);
  await pasteSource(page, "Aula de aços", SOURCE);
  await pasteSource(page, "Aula de alumínio", SECOND_SOURCE);
  await page.getByRole("button", { name: tile }).click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog.getByRole("button", { name: "Gerar" }).click();
  await expect(dialog).toBeHidden();
  // "Pronto": the list's entry turns into the button that opens it.
  const open = page.getByRole("button", { name: /^Abrir “/ });
  await expect(open).toHaveCount(1, { timeout: 30_000 });
  await open.click();
  await expect(page.getByRole("button", { name: "Voltar ao Estúdio" })).toBeVisible();
}

/** Picks one item of "Exportar ▾" and returns the file the browser saved. */
async function exportAs(page: Page, item: string): Promise<{ download: Download; bytes: Buffer }> {
  await page.getByRole("button", { name: "Exportar" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.getByRole("menuitem", { name: item }).click(),
  ]);
  const path = await download.path();
  return { download, bytes: await readFile(path) };
}

test("Estúdio: apresentação de slides — avançar o slide e baixar o PPTX", async ({ page }) => {
  await generateAndOpen(page, /^Apresentação de slides/, "Criar apresentação de slides");

  const position = page.getByText(/^Slide \d+ de \d+$/);
  await expect(position).toHaveText(/^Slide 1 de ([2-9]|\d{2,})$/);
  const total = (await position.textContent())?.match(/de (\d+)$/)?.[1];
  await page.getByRole("button", { name: "Próximo slide" }).click();
  await expect(position).toHaveText(`Slide 2 de ${total}`);
  await expect(page.getByRole("button", { name: "Slide anterior" })).toBeEnabled();
  await page.screenshot({ path: "test-results/estudio-slides.png", fullPage: true });

  const { download, bytes } = await exportAs(page, "PPTX (apresentação)");
  expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  expect(bytes.length).toBeGreaterThan(0);
  // A PPTX is a ZIP package: "PK\x03\x04".
  expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
});

test("Estúdio: infográfico — baixar o SVG da API e o PNG feito no navegador", async ({ page }) => {
  await generateAndOpen(page, /^Infográfico/, "Criar infográfico");
  await expect(page.getByRole("img", { name: /^Infográfico “.+”$/ })).toBeVisible();
  await page.screenshot({ path: "test-results/estudio-infografico.png", fullPage: true });

  const svg = await exportAs(page, "SVG (imagem)");
  expect(svg.download.suggestedFilename()).toMatch(/\.svg$/);
  expect(svg.bytes.toString("utf-8")).toContain("<svg");

  const png = await exportAs(page, "PNG (imagem)");
  expect(png.download.suggestedFilename()).toMatch(/\.png$/);
  // The PNG signature: 89 50 4E 47 0D 0A 1A 0A.
  expect([...png.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // No failure sentence (the page's only other alert is Next's route announcer).
  await expect(page.getByText("Não foi possível gerar a imagem neste navegador")).toHaveCount(0);
});

test("Estúdio: resumo em áudio — a voz lê e a fala destacada avança", async ({ page }) => {
  // One pt-BR voice whose every utterance ends by itself shortly after it
  // starts: the player walks the whole script without a real engine.
  await page.addInitScript(installFakeSpeech, {
    voices: [{ name: "Voz de teste", lang: "pt-BR" }],
    autoEndMs: 150,
  });
  await generateAndOpen(page, /^Resumo em Áudio/, "Criar resumo em áudio");

  const transcript = page.getByRole("region", { name: "Transcrição" });
  const lines = transcript.getByRole("listitem");
  const count = await lines.count();
  expect(count).toBeGreaterThanOrEqual(2);
  const current = transcript.locator('li[aria-current="true"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("data-line", "0");
  await expect(page.getByText(`Fala 1 de ${count}`)).toBeVisible();

  const play = page.getByRole("button", { name: "Reproduzir", exact: true });
  await expect(play).toBeEnabled({ timeout: 10_000 });
  await play.click();

  // The highlight walks to the last line as each utterance ends, and the
  // player stops there, ready to play again.
  await expect(current).toHaveAttribute("data-line", String(count - 1), { timeout: 20_000 });
  await expect(page.getByText(`Fala ${count} de ${count}`)).toBeVisible();
  await expect(play).toBeVisible();
  const spoken = await page.evaluate(
    () =>
      (window as unknown as { __fakeSpeech: { spoken: { lang: string }[] } }).__fakeSpeech.spoken
        .map((u) => u.lang),
  );
  expect(spoken.length).toBeGreaterThanOrEqual(count);
  expect(new Set(spoken)).toEqual(new Set(["pt-BR"]));
  await page.screenshot({ path: "test-results/estudio-audio.png", fullPage: true });
});
