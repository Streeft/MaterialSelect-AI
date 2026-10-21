import { screen as domScreen, within as domWithin } from "@testing-library/react";

/**
 * Stand-in for `shadow-dom-testing-library`, wired in by `vitest.config.ts`.
 *
 * Why it exists: the test suite was written when the primitives were
 * `@material/web` custom elements, whose roles live inside a shadow root that
 * the plain `screen` cannot reach — hence the `getByShadowRole` family. Since
 * D-80 no component renders a shadow root, so those queries have nothing to
 * traverse; but the library still walks the whole tree, serialises it and
 * re-runs the role query once per root, and measured profile put 40-60% of the
 * wizard tests' time there. Under CPU contention that is what pushed single
 * tests past the 5 s default (selecao, routes.a11y).
 *
 * What it does: every `*ByShadow*` query is the same query on the light DOM,
 * which is what it was already resolving to. The call sites keep their names
 * and their assertions are untouched. The cost is that a future component with
 * a real shadow root would not be found through these names — if one is ever
 * added, drop the alias in `vitest.config.ts` for the files that need it.
 *
 * Only test code imports this (through the alias); production never does.
 */
const SHADOW = /^(get|query|find)(All)?ByShadow(\w+)$/;

type Queries = typeof domScreen;

function lightDom<T extends object>(queries: T): T {
  return new Proxy(queries, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const match = SHADOW.exec(prop);
        if (match) {
          const [, verb, all, kind] = match;
          return Reflect.get(target, `${verb}${all ?? ""}By${kind}`, receiver);
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export const screen: Queries = lightDom(domScreen);

export function within(element: HTMLElement): ReturnType<typeof domWithin> {
  return lightDom(domWithin(element));
}
