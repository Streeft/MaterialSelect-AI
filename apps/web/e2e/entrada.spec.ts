import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./session";

/**
 * D-236: the two pages before the app — the landing and /entrar — live outside
 * `ROUTES` (that list is the app shell). Each one at a phone and a notebook
 * width: no sideways scroll, axe clean, and the landing's captures loaded.
 */

const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const PAGES = [
  ["inicio-publico", "/"],
  ["entrar", "/entrar"],
] as const;
const WIDTHS = [
  { name: "telefone", width: 375, height: 812 },
  { name: "notebook", width: 1280, height: 800 },
] as const;

async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: { run: (c: Document) => Promise<{ violations: Array<{ id: string; nodes: Array<{ html: string }> }> }> };
    }).axe;
    const result = await axe.run(document);
    return result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120) ?? ""}`);
  });
}

for (const [slug, path] of PAGES) {
  for (const size of WIDTHS) {
    test(`${slug} a ${size.width}px: sem rolagem lateral e sem violação do axe`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 45_000 });
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} rola ${overflow}px na horizontal`).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.screenshot({ path: `test-results/entrada/${slug}-${size.name}.png`, fullPage: true });
    });
  }
}

test("as capturas da página inicial carregam (D-236)", async ({ page }) => {
  await page.goto("/");
  const images = page.locator("main figure img");
  await expect(images).toHaveCount(3);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))
      .toBe(true);
  }
});
