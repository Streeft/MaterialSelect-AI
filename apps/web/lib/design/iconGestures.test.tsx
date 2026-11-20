import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentType, SVGProps } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as Icons from "@/components/ui/icons";
import { msdsIcon } from "@/lib/msds/icons";
import { APP_ICON_GESTURES, GESTURES, MSDS_ICON_GESTURES, gestureAttributes } from "./iconGestures";

/**
 * D-248: every icon has a gesture, and none of it moves under reduced motion.
 * jsdom does not run CSS animations, so the second half reads the stylesheet:
 * the place of a rule is what decides whether it can play.
 */

const ICONS = Object.entries(Icons as unknown as Record<string, ComponentType<SVGProps<SVGSVGElement>>>).filter(
  ([name]) => /^Icon[A-Z]/.test(name),
);

function svgOf(element: React.ReactElement): SVGSVGElement {
  const { container } = render(element);
  return container.querySelector("svg")!;
}

describe("every icon has a gesture (D-248)", () => {
  it("finds the whole set", () => {
    expect(ICONS.length).toBe(80);
  });

  it.each(ICONS)("%s carries the gesture of the table", (name, Icon) => {
    const svg = svgOf(<Icon />);
    const gesture = svg.getAttribute("data-gesture");
    expect(GESTURES).toContain(gesture);
    const spec = APP_ICON_GESTURES[name as keyof typeof APP_ICON_GESTURES];
    expect(spec, `${name} is missing from APP_ICON_GESTURES`).toBeDefined();
    expect(gestureAttributes(spec)["data-gesture"]).toBe(gesture);
    expect(svg.getAttribute("data-gesture-dir")).toBe(gestureAttributes(spec)["data-gesture-dir"] ?? null);
    if (gesture === "draw") {
      for (const part of Array.from(svg.children).filter((c) => c.tagName !== "title")) {
        expect(part.getAttribute("pathLength"), `${name} <${part.tagName}>`).toBe("1");
      }
    }
  });

  it("the table names no icon that does not exist", () => {
    const exported = new Set(ICONS.map(([name]) => name));
    expect(Object.keys(APP_ICON_GESTURES).filter((name) => !exported.has(name))).toEqual([]);
  });

  it("a caller can still name an icon for assistive technology", () => {
    const svg = svgOf(<Icons.IconGear title="Processos" />);
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("data-gesture", "spin");
  });

  it("every glyph of the MSDS set has one too", () => {
    const source = readFileSync(resolve(__dirname, "../msds/icons.tsx"), "utf8");
    const names = [...source.matchAll(/case "(\w+)":/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) {
      expect(MSDS_ICON_GESTURES[name], `${name} is missing from MSDS_ICON_GESTURES`).toBeDefined();
      const svg = svgOf(msdsIcon(name) as React.ReactElement);
      expect(GESTURES, name).toContain(svg.getAttribute("data-gesture"));
    }
    expect(msdsIcon("no-such-glyph")).toBeNull();
  });
});

describe("the gestures stand still under reduced motion (D-248)", () => {
  const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
  const start = css.indexOf("@media (prefers-reduced-motion: no-preference) {");
  const guard = css.slice(start, css.indexOf("\n}\n", start));

  it("every rule that animates an icon is inside the no-preference block and the reader's switch", () => {
    expect(start).toBeGreaterThan(0);
    const outside = css.slice(0, start) + css.slice(start + guard.length);
    // Outside the guard, `data-gesture` is never a selector.
    expect(outside).not.toMatch(/\[data-gesture[^\n]*\{/);
    const selectors = [...guard.matchAll(/^ {2}([^\n{}@]+)\{/gm)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^:root:not\(\[data-motion="reduced"\]\)/);
    }
  });

  it("each gesture has its keyframes and a trigger on hover, keyboard focus and press", () => {
    for (const gesture of GESTURES) {
      expect(guard, gesture).toMatch(new RegExp(`:is\\(:hover, :focus-visible, :active\\) \\[data-gesture="${gesture}"\\]`));
    }
    for (const name of ["icon-pop", "icon-spin", "icon-wobble", "icon-hop", "icon-slide", "icon-pulse", "icon-draw"]) {
      expect(css).toContain(`@keyframes ${name} {`);
      expect(guard).toContain(name);
    }
  });

  it("a gesture names only motion tokens, never a literal duration", () => {
    const animations = [...guard.matchAll(/animation(?:-duration|-delay)?: ([^;]+);/g)].map((m) => m[1]!);
    for (const value of animations) {
      expect(value, value).not.toMatch(/\b\d+m?s\b/);
    }
  });

  it("the reader's own switch (Aparência) also ends every other movement at once", () => {
    expect(css).toMatch(/:root\[data-motion="reduced"\] \*,[\s\S]*?animation-duration: 0\.01ms !important;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n {2}\.m3-fabmenu-fab, \.m3-ind \{ transition: none; \}/);
  });
});
