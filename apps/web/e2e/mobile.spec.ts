import { test, expect } from "./session";

/**
 * D-226: the phone (390 px, a touch screen) on the pages people use there. Two
 * rules, both measured in the real browser:
 *
 * 1. the page does not scroll sideways;
 * 2. every control a finger has to hit is at least 44 px in both directions —
 *    its own box, or the invisible hit area (`::after`) that `globals.css` gives
 *    buttons and links on a coarse pointer (D-206, D-226). Native fields and
 *    summaries grow to 44 px instead. Plotly's modebar is measured too since D-249
 *    (`figures.css` grows its buttons on a coarse pointer). Left out on purpose:
 *    a link inside a sentence (WCAG 2.5.8 inline exception) and screen-reader
 *    only text.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const PAGES: ReadonlyArray<readonly [string, string]> = [
  ["inicio", "/app"],
  ["selecao", "/app/selecao"],
  ["mapas", "/app/mapas"],
  ["comparar", "/app/comparar"],
  ["catalogo", "/app/catalogo"],
  ["cadernos", "/app/cadernos"],
  ["dimensionar", "/app/dimensionar"],
  ["custo", "/app/custo"],
  ["eco", "/app/eco"],
  ["baterias", "/app/baterias"],
  ["sintetizar", "/app/sintetizar"],
  ["processos", "/app/processos"],
  ["importar", "/app/importar"],
];

/**
 * Pages whose first screen carries a Plotly figure: its modebar draws after the library loads,
 * later than the page settles, so the test waits for it (D-249) instead of measuring before it
 * exists and passing for the wrong reason.
 */
const WITH_FIGURE = new Set(["mapas"]);

async function smallTargets(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const selector =
      'a[href],a.modebar-btn,button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,[role=button],[role=tab],[role=menuitem],[role=switch],summary,label:has(input[type=checkbox]),label:has(input[type=radio])';
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (!visible(el) || el.closest(".sr-only")) continue;
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
      const box = el.getBoundingClientRect();
      let width = box.width;
      let height = box.height;
      const after = getComputedStyle(el, "::after");
      if (after.content !== "none" && after.position === "absolute") {
        width = Math.max(width, parseFloat(after.width) || 0);
        height = Math.max(height, parseFloat(after.height) || 0);
      }
      if (width < 43.5 || height < 43.5) {
        const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40);
        found.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(width)}x${Math.round(height)}`);
      }
    }
    return found;
  });
}

for (const [slug, path] of PAGES) {
  test(`${path} no telefone: sem rolagem lateral e alvos de toque de 44 px`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    if (WITH_FIGURE.has(slug)) {
      await expect(page.locator(".modebar-btn").first()).toBeVisible({ timeout: 30_000 });
    }
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `${slug}: rolagem lateral`).toBeLessThanOrEqual(innerWidth);
    const small = await smallTargets(page);
    expect(small.slice(0, 15), `${slug}: ${small.length} alvos abaixo de 44 px`).toEqual([]);
  });
}

test("a ficha de um material no telefone: alvos de toque de 44 px", async ({ page }) => {
  await page.goto("/app/catalogo");
  const link = page.locator('main a[href^="/app/materiais/"]').first();
  await expect(link).toBeVisible({ timeout: 45_000 });
  await page.goto((await link.getAttribute("href"))!);
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle");
  const small = await smallTargets(page);
  expect(small.slice(0, 15), `ficha: ${small.length} alvos abaixo de 44 px`).toEqual([]);
});

// D-254: no telefone a tabela some e os cartões são tudo o que há; eles agora têm a caixa.
test("o catálogo no telefone: marca dois cartões e a barra leva ao Comparar", async ({ page }) => {
  await page.goto("/app/catalogo");
  const boxes = page.getByRole("checkbox", { name: /^Selecionar (?!todos)/ });
  await expect(boxes.first()).toBeVisible({ timeout: 45_000 });
  // The box is drawn by a span over the input, as in the matrix (telas-processos): force skips
  // the "intercepts pointer events" check that the design itself causes.
  await boxes.nth(0).check({ force: true });
  await boxes.nth(1).check({ force: true });

  const bar = page.getByRole("region", { name: "Ações para os materiais selecionados" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("status")).toHaveText("2 materiais selecionados");
  expect(await smallTargets(page)).toEqual([]);

  await bar.getByRole("link", { name: "Comparar selecionados" }).click();
  await expect(page).toHaveURL(/\/app\/comparar\?materiais=\d+,\d+/, { timeout: 60_000 });
});

test("processos no telefone: a seção de uma subfamília aberta tem alvos de 44 px", async ({ page }) => {
  await page.goto("/app/processos");
  const region = page.getByRole("group", { name: "Subfamílias de Conformação" });
  await expect(region).toBeVisible({ timeout: 45_000 });
  await region.getByRole("button", { name: "Abrir todas" }).click();
  await expect(region.locator("details[open]").first()).toBeVisible();
  const small = await smallTargets(page);
  expect(small.slice(0, 15), `processos: ${small.length} alvos abaixo de 44 px`).toEqual([]);
});
