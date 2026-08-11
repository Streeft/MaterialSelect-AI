import axe, { type RunOptions } from "axe-core";

/**
 * Automated accessibility checking for component tests.
 *
 * An audit nobody repeats is worth less than a test that fails on the next pull
 * request, which is why this runs inside `npm run test` — the same command the
 * CI gate already blocks on — rather than as a separate manual pass.
 *
 * It does not replace keyboard and screen-reader checks. Automated rules catch
 * roughly a third of real barriers: missing names, broken relationships, bad
 * roles. They cannot tell whether the focus order makes sense.
 */

const DEFAULTS: RunOptions = {
  rules: {
    // jsdom has no layout engine, so every colour is computed as transparent and
    // this rule reports nothing but false positives. Contrast is enforced at the
    // token level instead — see the ratios recorded in app/globals.css.
    "color-contrast": { enabled: false },
    // Component fragments are mounted without a page shell on purpose. The
    // landmark rules are checked on the real routes, not on a button.
    region: { enabled: false },
  },
};

export interface A11yViolation {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

/** Run axe over a mounted fragment and return violations in a readable shape. */
export async function findA11yViolations(
  container: Element,
  options: RunOptions = {},
): Promise<A11yViolation[]> {
  const results = await axe.run(container, { ...DEFAULTS, ...options });
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? "unknown",
    help: v.help,
    nodes: v.nodes.map((n) => n.html),
  }));
}

/** One-line summary per violation, so a failing assertion is self-explanatory. */
export function describeViolations(violations: A11yViolation[]): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.join("\n    ")}`)
    .join("\n");
}
