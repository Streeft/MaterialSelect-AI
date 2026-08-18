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

/**
 * `md-radio` (and any other form-associated Material Web element) sets its
 * ARIA role via `ElementInternals` — `this[internals].role = 'radio'` in
 * `@material/web/radio/internal/radio.js` — never as a `role` attribute and
 * never on a node inside the shadow DOM (the shadow root there is
 * `aria-hidden`). axe-core's role computation ignores `ElementInternals`
 * unless this flag is set (see `axe.js`'s `elementInternals` getter, gated on
 * `axe._enableElementInternals`), so by default it sees an element with no
 * known role and reports `aria-prohibited-attr` on its `aria-label` —
 * confirmed a false positive by reading the real accessibility tree via CDP
 * (`Accessibility.getFullAXTree`) in an actual Chromium: `md-radio` there is
 * `role="radio"` with the correct accessible name and checked state, in both
 * jsdom and a real browser. Undocumented (`axe.d.ts` has no type for it,
 * `_`-prefixed), but it is what `axe.js` itself checks before reading
 * `vNode.elementInternals.role` — no public config API does the same for a
 * same-realm run (the public `getElementInternals` callback in
 * `externalAPIs` exists for cross-realm cases, e.g. a browser extension,
 * which this is not). Revisit if an axe-core upgrade removes it — the two
 * a11y suites (`app/routes.a11y.test.tsx`, `components/ui/ui.test.tsx`) will
 * fail loudly with the same `aria-prohibited-attr` node if it does.
 */
(axe as unknown as { _enableElementInternals: boolean })._enableElementInternals = true;

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
