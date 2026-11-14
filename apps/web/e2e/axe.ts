import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/**
 * axe-core injected into the real browser, shared by `a11y.spec.ts` (every route) and the specs
 * of single figures (`figuras-custo-eco.spec.ts`). `axe-core` is already a dependency (the
 * component tests use it); the script is injected from the package instead of adding
 * `@axe-core/playwright`. No rule is switched off here.
 */
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export interface Found {
  id: string;
  impact: string | null;
  help: string;
  nodes: string[];
}

export async function runAxe(page: Page): Promise<Found[]> {
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async () => {
    // `window.axe` is injected by the script above.
    const axe = (window as unknown as { axe: { run: (c: Document) => Promise<{ violations: Array<{ id: string; impact: string | null; help: string; nodes: Array<{ target: unknown[]; html: string }> }> }> } }).axe;
    const result = await axe.run(document);
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ").slice(0, 100)} | ${n.html.slice(0, 120)}`),
    }));
  });
}

export function describeFound(found: Found[]): string {
  return found.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.join("\n    ")}`).join("\n");
}

