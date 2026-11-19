import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-254: a disabled control fades by `--state-disabled` (0.38, the M3 value),
 * never by a number of its own. A control at 0.5 and one at 0.35 side by side
 * read as two different "off"s; the token keeps them one.
 */
const root = resolve(__dirname, "../..");

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

const files = ["app", "components", "lib"].flatMap((d) => walk(join(root, d)));
const styles = files.filter((f) => f.endsWith(".css"));
const sources = files.filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

describe("estado desabilitado (D-254)", () => {
  it("nenhuma regra :disabled de CSS usa opacidade fixa de 40 a 50 %", () => {
    const offenders: string[] = [];
    for (const file of styles) {
      const css = readFileSync(file, "utf8");
      for (const rule of css.matchAll(/([^{}]*:disabled[^{}]*)\{([^{}]*)\}/g)) {
        const opacity = /(?:^|[\s;])opacity:\s*([0-9.]+)\s*;?/.exec(rule[2] ?? "");
        const value = opacity ? Number(opacity[1]) : null;
        if (value !== null && value >= 0.3 && value <= 0.55) {
          offenders.push(`${file.slice(root.length)}: ${rule[1]!.trim()} { opacity: ${value} }`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nenhum disabled:opacity-NN de Tailwind fixa 30 a 55 %", () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/disabled:opacity-(\d+)\b/g)) {
        const n = Number(m[1]);
        if (n >= 30 && n <= 55) offenders.push(`${file.slice(root.length)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("os botões e ícones que desbotam usam o token", () => {
    const msds = readFileSync(join(root, "lib/msds/msds.css"), "utf8");
    const figures = readFileSync(join(root, "components/charts/figures.css"), "utf8");
    for (const selector of [".msds-btn:disabled", ".msds-carousel-arrow:disabled", ".msds-fabmenu-item:disabled"]) {
      expect(msds).toMatch(new RegExp(`${selector.replace(/[.:]/g, "\\$&")} \\{[^}]*opacity: var\\(--state-disabled\\)`));
    }
    expect(figures).toMatch(/\.chart-icon-btn:disabled \{[^}]*opacity: var\(--state-disabled\)/);
    const builder = readFileSync(join(root, "components/expression/ExpressionBuilder.tsx"), "utf8");
    expect(builder).toContain("disabled:opacity-[var(--state-disabled)]");
  });
});
