import { test, expect } from "./session";

/**
 * REDESIGN §3 / §10: the four widths the design answers to — a phone (375), a
 * tablet (768), a notebook (1280) and a desktop (1920) — and the rule that no
 * route scrolls sideways on any of them. One test per route walks the four
 * widths on the same page, so a route is compiled once by `next dev`.
 *
 * What it checks is the document, not its parts: a table or a map may scroll
 * inside its own box (that is what the box is for), but `scrollWidth` of the
 * page itself must never exceed the window. Each width leaves a screenshot in
 * `test-results/larguras/`, which CI uploads with the rest of the evidence when
 * the job fails — a picture to look at, not a baseline to diff: a pixel baseline
 * differs per operating system and would fail on every font update.
 */

const WIDTHS = [
  { name: "telefone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "notebook", width: 1280, height: 800 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

// Routes that open without an id. The ones that need a record are reached from
// these by their own specs; here the point is the shell and each tool's screen.
const ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["inicio", "/app"],
  ["catalogo", "/app/catalogo"],
  ["selecao", "/app/selecao"],
  ["mapas", "/app/mapas"],
  ["comparar", "/app/comparar"],
  ["painel", "/app/painel"],
  ["processos", "/app/processos"],
  ["cadernos", "/app/cadernos"],
  ["eco", "/app/eco"],
  ["custo", "/app/custo"],
  ["dimensionar", "/app/dimensionar"],
  ["sintetizar", "/app/sintetizar"],
  ["baterias", "/app/baterias"],
  ["glossario", "/app/glossario"],
  ["importar", "/app/importar"],
  ["meus-registros", "/app/meus-registros"],
  ["admin-classes", "/app/admin/classes"],
  ["admin-propriedades", "/app/admin/propriedades"],
  ["estilo", "/app/estilo"],
];

for (const [slug, path] of ROUTES) {
  test(`${path} não rola na horizontal em nenhuma das quatro larguras`, async ({ page }) => {
    for (const { name, width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      // The route has rendered once its page title is on screen; a skeleton or
      // the shell alone would measure a layout the reader never sees.
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
      await page.waitForLoadState("networkidle");

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      await page.screenshot({
        path: `test-results/larguras/${slug}-${name}.png`,
        fullPage: true,
      });
      expect(
        scrollWidth,
        `${path} a ${width}px: a página tem ${scrollWidth}px de largura em uma janela de ${innerWidth}px`,
      ).toBeLessThanOrEqual(innerWidth);
    }
  });
}
