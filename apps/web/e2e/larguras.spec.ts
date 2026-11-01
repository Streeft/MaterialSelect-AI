import type { Page } from "@playwright/test";
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
 *
 * D-190 added what `scrollWidth` of the document cannot see: a card with
 * `overflow: hidden` that cuts its own content (the "Materiais semelhantes"
 * rows at 1280/1920), a tab indicator wider than its tab strip (the primary
 * line that crossed the whole page), and a Plotly figure that spills out of its
 * box (the map after switching to Nível 2). It also visits screens that only
 * exist with state: a material sheet, the results step and a depth level.
 */

/**
 * Every visible element that hides horizontal overflow and has more content
 * than width. An ellipsis is a deliberate cut and is left alone, as are the
 * screen-reader-only labels (1 px boxes) and the figures' own internals.
 */
async function clippedBoxes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
      if (el.closest(".js-plotly-plot, svg, [aria-hidden='true'], .sr-only")) continue;
      const style = getComputedStyle(el);
      if (style.overflowX !== "hidden" && style.overflowX !== "clip") continue;
      if (style.textOverflow === "ellipsis" || style.visibility === "hidden") continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 2 || box.height <= 2) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        const name = typeof el.className === "string" ? el.className.slice(0, 60) : "";
        found.push(`<${el.tagName.toLowerCase()} class="${name}"> ${el.scrollWidth}px em ${el.clientWidth}px`);
      }
    }
    return found;
  });
}

/**
 * The `::after` indicator is absolutely positioned with 8 px insets, so its
 * width is that of its containing block minus 16: the tab itself when the tab
 * is positioned, otherwise whatever positioned ancestor is nearest.
 */
async function strayTabIndicators(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const tab of Array.from(document.querySelectorAll<HTMLElement>(".msds-tab"))) {
      const list = tab.closest(".msds-tablist");
      if (!list) continue;
      const block = getComputedStyle(tab).position !== "static" ? tab : tab.offsetParent;
      if (!block) continue;
      const indicator = block.getBoundingClientRect().width - 16;
      const strip = list.getBoundingClientRect().width;
      if (indicator > strip + 1) {
        found.push(`"${tab.textContent?.trim()}": ${Math.round(indicator)}px numa faixa de ${Math.round(strip)}px`);
      }
    }
    return found;
  });
}

async function expectNothingCut(page: Page, where: string) {
  expect(await clippedBoxes(page), `${where}: conteúdo cortado por overflow:hidden`).toEqual([]);
  expect(await strayTabIndicators(page), `${where}: indicador de aba maior que a faixa`).toEqual([]);
}

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
  ["glossario-familias", "/app/glossario/familias"],
  ["importar", "/app/importar"],
  ["meus-registros", "/app/meus-registros"],
  ["admin-classes", "/app/admin/classes"],
  ["admin-propriedades", "/app/admin/propriedades"],
  ["estilo", "/app/estilo"],
  // D-190: screens that only exist with state in the address.
  ["selecao-resultados", "/app/selecao?etapa=resultados"],
  ["mapas-nivel-2", "/app/mapas?nivel=2"],
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
      await expectNothingCut(page, `${path} a ${width}px`);
    }
  });
}

test("a ficha de um material não corta nada em nenhuma das quatro larguras", async ({ page }) => {
  await page.goto("/app/catalogo");
  // A sheet link, not "Novo material" (`/app/materiais/novo`).
  const firstMaterial = page.locator('main table a[href^="/app/materiais/"]').first();
  await expect(firstMaterial).toBeVisible({ timeout: 45_000 });
  const href = await firstMaterial.getAttribute("href");
  expect(href).toMatch(/^\/app\/materiais\/\d+/);
  for (const { name, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto(href!);
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
    // "Materiais semelhantes" draws its weight rows once a basis is chosen.
    await expect(page.locator("#semelhantes")).toBeVisible({ timeout: 45_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test-results/larguras/material-${name}.png`, fullPage: true });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${href} a ${width}px`).toBeLessThanOrEqual(width);
    await expectNothingCut(page, `${href} a ${width}px`);
  }
});

test("o mapa continua dentro do cartão ao trocar para o Nível 2", async ({ page }) => {
  for (const { name, width, height } of WIDTHS.filter((w) => w.width >= 1280)) {
    await page.setViewportSize({ width, height });
    await page.goto("/app/mapas?nivel=1");
    const figure = page.locator(".chart-plotly .main-svg").first();
    await expect(figure).toBeVisible({ timeout: 45_000 });
    await page.waitForLoadState("networkidle");
    // The reader's path, not a fresh load: the collapse came from re-rendering
    // the figure after the address changed (D-190).
    await page.getByRole("button", { name: "Nível 2" }).click();
    await expect(page).toHaveURL(/nivel=2/);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/larguras/mapas-troca-nivel-2-${name}.png`, fullPage: true });

    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      return {
        wrapper: rect(".chart-plotly"),
        container: rect(".chart-plotly .svg-container"),
        svg: rect(".chart-plotly .main-svg"),
        excluded: rect("#excluidos"),
      };
    });
    expect(boxes.wrapper && boxes.container && boxes.svg).toBeTruthy();
    const { wrapper, container, svg, excluded } = boxes as {
      wrapper: { top: number; bottom: number; height: number };
      container: { top: number; bottom: number; height: number };
      svg: { top: number; bottom: number; height: number };
      excluded: { top: number; bottom: number; height: number } | null;
    };
    expect(container.height, `a ${width}px o .svg-container do Plotly colapsou`).toBeGreaterThan(100);
    expect(svg.bottom, `a ${width}px a figura passa do próprio contêiner`).toBeLessThanOrEqual(
      container.bottom + 1,
    );
    expect(svg.bottom, `a ${width}px a figura passa do cartão`).toBeLessThanOrEqual(wrapper.bottom + 1);
    if (excluded) {
      expect(svg.bottom, `a ${width}px a figura cobre "Materiais fora do mapa"`).toBeLessThanOrEqual(
        excluded.top,
      );
    }
  }
});
