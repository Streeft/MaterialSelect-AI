import { test, expect } from "./session";

/**
 * D-226: the phone (390 px, a touch screen) on the pages people use there. Two
 * rules, both measured in the real browser:
 *
 * 1. the page does not scroll sideways;
 * 2. every control a finger has to hit is at least 44 px in both directions —
 *    its own box, or the invisible hit area (`::after`) that `globals.css` gives
 *    buttons and links on a coarse pointer (D-206, D-226). Native fields and
 *    summaries grow to 44 px instead. Left out on purpose: Plotly's modebar (a
 *    third-party widget; the same actions sit in the toolbar above the figure),
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

async function smallTargets(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const selector =
      'a[href],button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,[role=button],[role=tab],[role=menuitem],[role=switch],summary,label:has(input[type=checkbox]),label:has(input[type=radio])';
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (!visible(el) || el.closest(".sr-only, .modebar")) continue;
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
