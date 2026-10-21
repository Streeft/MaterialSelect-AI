import { configure } from "@testing-library/react";
import { vi } from "vitest";

/**
 * Headroom for the few files whose tests are long, CPU-bound jsdom walks.
 *
 * A wizard test that clicks through four steps, or an axe pass over the
 * densest page in the product, takes 1-3 s on an idle machine — jsdom has no
 * layout engine, so every role query and every axe rule asks it for computed
 * style, node by node. That is fine on its own and past the 5 s default when
 * the runner is shared (CI with the API suite beside it, or a laptop with the
 * backend tests running): the work is the same, the CPU slice is a third of it.
 * The failure that results names a test that did nothing wrong.
 *
 * So these files opt in, one by one. It is NOT a global default on purpose: a
 * test that hangs for a real reason should still fail fast everywhere else,
 * and an opt-in line is a visible record of which files are heavy. Nothing is
 * skipped and no assertion is relaxed — only how long the same assertion may
 * wait. `findBy*`/`waitFor` get the same treatment because, loaded, their
 * default 1 s expires while the screen is still rendering.
 */
export function allowLoadedRunner(): void {
  vi.setConfig({ testTimeout: 30_000 });
  configure({ asyncUtilTimeout: 5_000 });
}
