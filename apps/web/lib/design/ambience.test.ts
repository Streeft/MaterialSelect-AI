import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AMBIENCE_BOOTSTRAP_SCRIPT,
  AMBIENCE_STORAGE_KEY,
  applyAmbience,
  parseAmbience,
  setAmbience,
} from "@/lib/ambience";

/**
 * D-256: the "Oficina" ambience repaints surfaces and nothing else, so what can go wrong is
 * contrast. These tests hold the three rules written at the top of its block in `globals.css`.
 */
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
const handwritten = css.slice(0, css.indexOf("/* m3-roles:begin"));

type Rgb = [number, number, number];

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

interface Block {
  selector: string;
  vars: Record<string, Rgb>;
}

/** Every rule of the hand-written CSS, with the colour triples it declares. */
const BLOCKS: Block[] = [...handwritten.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  (rule) => {
    const vars: Record<string, Rgb> = {};
    for (const m of rule[2]!.matchAll(/(--[a-z0-9-]+)\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
      vars[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
    return { selector: rule[1]!.replace(/@tailwind [a-z]+;/g, "").trim(), vars };
  },
);

const oficina = BLOCKS.find((b) => "--oficina-bench" in b.vars)!.vars;
/** The tokens text is written in, in every palette that defines them. */
const TEXT = ["--ink", "--ink-muted", "--ink-subtle", "--accent", "--brand-700"];

function textTokens(dark: boolean) {
  return BLOCKS.filter((b) => b.selector.includes('data-theme="dark"') === dark)
    .filter((b) => !/data-contrast|data-rail|data-surface/.test(b.selector))
    .flatMap((b) => TEXT.filter((token) => token in b.vars).map((token) => ({ where: b.selector, token, rgb: b.vars[token]! })));
}

describe('ambiente "Oficina": contraste (D-256)', () => {
  for (const dark of [false, true]) {
    for (const surface of ["bench", "paper", "kraft"]) {
      it(`todo token de texto ${dark ? "escuro" : "claro"} fica a 4,5:1 sobre ${surface}`, () => {
        const background = oficina[`--oficina-${surface}${dark ? "-dark" : ""}`]!;
        const tokens = textTokens(dark);
        // Guards the parser: the section palettes are there (17 light, 17 dark).
        expect(tokens.length).toBeGreaterThan(30);
        const failing = tokens
          .map((t) => `${t.token} em ${t.where}: ${ratio(t.rgb, background).toFixed(2)}`)
          .filter((line) => Number(line.split(": ")[1]) < 4.5);
        expect(failing).toEqual([]);
      });
    }
  }

  it("a borda de campo continua a 3:1 sobre papel e bancada (D-34)", () => {
    for (const dark of [false, true]) {
      const edge = BLOCKS.find(
        (b) => "--edge-control" in b.vars && b.selector.includes('data-theme="dark"') === dark,
      )!.vars["--edge-control"]!;
      for (const surface of ["bench", "paper"]) {
        const background = oficina[`--oficina-${surface}${dark ? "-dark" : ""}`]!;
        expect(ratio(edge, background)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("o veio só se afasta do texto: claro sobre claro, escuro sobre escuro", () => {
    const value = (name: string) => decodeURIComponent(new RegExp(`${name}:\\s*url\\("([^"]+)"\\)`).exec(css)![1]!);
    // feColorMatrix: the first three rows fix the colour (1 = white, 0 = black).
    expect(value("--oficina-grain-lighter")).toContain("values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ");
    expect(value("--oficina-steel-lighter")).toContain("values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ");
    expect(value("--oficina-grain-darker")).toContain("values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ");
    expect(value("--oficina-steel-darker")).toContain("values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ");
    // And each theme wears the right one.
    expect(handwritten).toMatch(/:root\s*\{[^}]*--oficina-grain:\s*var\(--oficina-grain-lighter\)/);
    expect(handwritten).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--oficina-grain:\s*var\(--oficina-grain-darker\)/);
  });

  it("textura só na página, no trilho, no poço e na madeira do arquivo e da bandeja; nunca num painel", () => {
    const textured = [...handwritten.matchAll(/([^{}]+)\{[^{}]*background-image:[^;{}]*oficina-[^{}]*\}/g)].map((m) =>
      m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    );
    expect(textured.length).toBeGreaterThanOrEqual(5);
    for (const selector of textured) {
      // D-258: the tray's compartments are wood too; the things on them are paper (next test).
      expect(selector).toMatch(
        / body$|\[data-surface="rail"\]\.bg-rail$| \.well$| \.ds-tray-compartment$|^\.oficina-(cabinet|drawer-front)$/,
      );
    }
  });

  it("nenhum texto é escrito sobre a madeira: a gaveta tem etiqueta de papel", () => {
    expect(handwritten).toMatch(/\.oficina-drawer-label\s*\{[^}]*background:\s*rgb\(var\(--surface-panel\)\)/);
    expect(handwritten).toMatch(/\.oficina-envelope\s*\{[^}]*background:\s*rgb\(var\(--surface-panel\)\)/);
    expect(handwritten).toMatch(/\.ds-tray-item\s*\{[^}]*background:\s*rgb\(var\(--surface-panel\)\)/);
  });

  it("a gaveta só se move fora do movimento reduzido", () => {
    const motion = /@media \(prefers-reduced-motion: no-preference\) \{\s*:root:not\(\[data-motion="reduced"\]\) \.oficina-drawer-body \{[^}]*animation:/;
    expect(handwritten).toMatch(motion);
    // The only animation of the body is the gated one.
    expect(handwritten.match(/\.oficina-drawer-body \{[^}]*animation:/g)).toHaveLength(1);
  });
});

describe("ambiente: escolha no aparelho (D-256)", () => {
  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.ambience;
  });

  it("só aceita o valor conhecido", () => {
    expect(parseAmbience("oficina")).toBe("oficina");
    expect(parseAmbience("marcenaria")).toBe("engenharia");
    expect(parseAmbience(null)).toBe("engenharia");
  });

  it("escreve o atributo só para a Oficina", () => {
    const el = document.createElement("html");
    applyAmbience("oficina", el);
    expect(el.dataset.ambience).toBe("oficina");
    applyAmbience("engenharia", el);
    expect(el.dataset.ambience).toBeUndefined();
  });

  it("guarda a escolha e veste o documento", () => {
    setAmbience("oficina");
    expect(window.localStorage.getItem(AMBIENCE_STORAGE_KEY)).toBe("oficina");
    expect(document.documentElement.dataset.ambience).toBe("oficina");
    setAmbience("engenharia");
    expect(document.documentElement.dataset.ambience).toBeUndefined();
  });

  it("o script da cabeça veste antes da primeira pintura", () => {
    window.localStorage.setItem(AMBIENCE_STORAGE_KEY, "oficina");
    new Function(AMBIENCE_BOOTSTRAP_SCRIPT)();
    expect(document.documentElement.dataset.ambience).toBe("oficina");
  });
});
