import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { cn } from "../cn";
import config from "../../tailwind.config";
import { M3_ROLES } from "./m3Roles";

const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root,"), css.indexOf('[data-theme="dark"] {'));

function token(name: string): string {
  const m = new RegExp(`^\\s+${name}: (.+);$`, "m").exec(root);
  if (!m) throw new Error(`missing ${name}`);
  return m[1]!;
}

/** Every number below is a row of docs/21-material3-referencia.md. */
describe("M3 foundations (D-133)", () => {
  it("shape scale", () => {
    const px = (n: string) => token(`--shape-${n}`);
    expect(px("none")).toBe("0");
    expect(
      ["extra-small", "small", "medium", "large", "large-increased", "extra-large", "extra-large-increased", "extra-extra-large"].map(px),
    ).toEqual(["4px", "8px", "12px", "16px", "20px", "28px", "32px", "48px"]);
  });

  it("elevation has levels 0 to 5, each stronger than the last", () => {
    expect(token("--elevation-0")).toBe("none");
    const blur = (n: number) => Number(/, 0 (\d+)px (\d+)px (\d+)px/.exec(token(`--elevation-${n}`))![2]);
    for (let n = 2; n <= 5; n++) expect(blur(n)).toBeGreaterThan(blur(n - 1));
  });

  it("state layers follow the page, not the npm package", () => {
    expect([token("--state-hover"), token("--state-focus"), token("--state-pressed"), token("--state-dragged")]).toEqual([
      "0.08", "0.1", "0.1", "0.16",
    ]);
  });

  it("motion durations and the standard curve", () => {
    expect(["short1", "short2", "short3", "short4", "medium1", "medium4"].map((n) => token(`--m3-dur-${n}`))).toEqual([
      "50ms", "100ms", "150ms", "200ms", "250ms", "400ms",
    ]);
    expect(token("--m3-ease-standard")).toBe("cubic-bezier(0.2, 0, 0, 1)");
    expect(token("--m3-ease-emphasized-decelerate")).toBe("cubic-bezier(0.05, 0.7, 0.1, 1)");
  });

  // D-248: the whole duration scale of `_md-sys-motion.scss`, 50 to 1000 ms.
  it("has all sixteen durations, 50 ms apart up to long4 and 100 ms after", () => {
    const steps = ["short", "medium", "long"].flatMap((g) => [1, 2, 3, 4].map((i) => `${g}${i}`));
    const all = [...steps, ...[1, 2, 3, 4].map((i) => `extra-long${i}`)];
    expect(all.map((n) => token(`--m3-dur-${n}`))).toEqual([
      "50ms", "100ms", "150ms", "200ms", "250ms", "300ms", "350ms", "400ms",
      "450ms", "500ms", "550ms", "600ms", "700ms", "800ms", "900ms", "1000ms",
    ]);
  });

  it("emphasized resolves to standard on the web, and disabled is 38 %", () => {
    expect(token("--m3-ease-emphasized")).toBe(token("--m3-ease-standard"));
    expect(token("--m3-ease-emphasized-accelerate")).toBe("cubic-bezier(0.3, 0, 0.8, 0.15)");
    expect(token("--state-disabled")).toBe("0.38");
  });

  describe("expressive springs as linear() (D-248)", () => {
    // Compose `ExpressiveMotionTokens.kt`: the six springs and their settling time.
    const SPRINGS = [
      ["fast-spatial", 359, true],
      ["default-spatial", 435, true],
      ["slow-spatial", 599, true],
      ["fast-effects", 150, false],
      ["default-effects", 231, false],
      ["slow-effects", 326, false],
    ] as const;

    it.each(SPRINGS)("%s runs from 0 to 1 in its settling time", (name, ms, spatial) => {
      const curve = token(`--m3-spring-expressive-${name}-linear`);
      const points = /^linear\((.+)\)$/.exec(curve)![1]!.split(", ").map(Number);
      expect(points.length).toBeGreaterThan(30);
      expect(points[0]).toBe(0);
      expect(points.at(-1)).toBe(1);
      // Spatial overshoots (bounce); effects never pass the target.
      expect(Math.max(...points) > 1).toBe(spatial);
      expect(token(`--m3-spring-expressive-${name}-linear-dur`)).toBe(`${ms}ms`);
    });

    it("the semantic tokens switch to them only where linear() is drawn, curve and duration together", () => {
      const block = css.slice(css.indexOf("@supports (transition-timing-function: linear(0, 1))"));
      const body = block.slice(0, block.indexOf("\n}\n"));
      for (const [semantic, spring] of [
        ["spatial-fast", "fast-spatial"],
        ["spatial", "default-spatial"],
        ["spatial-slow", "slow-spatial"],
        ["effects-fast", "fast-effects"],
        ["effects", "default-effects"],
        ["effects-slow", "slow-effects"],
      ]) {
        expect(body).toContain(`--motion-${semantic}: var(--m3-spring-expressive-${spring}-linear);`);
        expect(body).toContain(`--motion-${semantic}-dur: var(--m3-spring-expressive-${spring}-linear-dur);`);
      }
      // The fallback stays the cubic-bezier conversion of the M3 page (D-183).
      expect(token("--motion-spatial")).toBe("var(--m3-spring-expressive-default-spatial)");
    });
  });

  it("Tailwind exposes exactly the generated roles", () => {
    const colors = (config.theme!.extend!.colors as Record<string, Record<string, string>>).m3!;
    expect(Object.keys(colors)).toEqual(M3_ROLES);
  });

  it("Tailwind exposes the 15 type roles", () => {
    const sizes = Object.keys(config.theme!.extend!.fontSize as object).filter((k) => k.startsWith("m3-"));
    expect(sizes).toHaveLength(15);
  });

  it("cn lets a later M3 utility override an earlier one of the same group", () => {
    expect(cn("rounded-card", "rounded-m3-xl")).toBe("rounded-m3-xl");
    expect(cn("shadow-card", "shadow-elev-2")).toBe("shadow-elev-2");
    expect(cn("text-body", "text-m3-label-large")).toBe("text-m3-label-large");
    expect(cn("text-m3-label-large", "text-m3-on-primary")).toBe("text-m3-label-large text-m3-on-primary");
  });
});
