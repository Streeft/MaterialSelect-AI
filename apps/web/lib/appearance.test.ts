import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_BOOTSTRAP_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  APP_COLOR_SECTION,
  DEFAULT_APPEARANCE,
  paletteSection,
  parseAppearance,
  prefersReducedMotion,
  readAppearance,
  setAppearance,
  subscribeAppearance,
} from "./appearance";

const globals = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
const root = document.documentElement;

afterEach(() => {
  window.localStorage.clear();
  delete root.dataset.contrast;
  delete root.dataset.motion;
  delete root.dataset.section;
});

describe("aparência guardada (D-196)", () => {
  it("lê só valores conhecidos e cai no padrão no resto", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("não é json")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('{"color":"violeta","contrast":"altíssimo","motion":"reduced"}')).toEqual({
      color: "violeta",
      contrast: "standard",
      motion: "reduced",
    });
  });

  it("escolhe a paleta: a da tela por padrão, a escolhida em todas as telas", () => {
    expect(paletteSection("route", "mapas")).toBe("mapas");
    expect(paletteSection("violeta", "mapas")).toBe("selecao");
  });

  it("aplica, guarda e avisa quem escuta", () => {
    const listener = vi.fn();
    const stop = subscribeAppearance(listener);
    setAppearance({ contrast: "high", motion: "reduced" });
    expect(root.dataset.contrast).toBe("high");
    expect(root.dataset.motion).toBe("reduced");
    expect(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)!)).toMatchObject({ contrast: "high" });
    expect(listener).toHaveBeenCalled();
    expect(readAppearance()).toBe(readAppearance());

    setAppearance({ contrast: "standard", motion: "standard" });
    expect(root.dataset.contrast).toBeUndefined();
    expect(root.dataset.motion).toBeUndefined();
    stop();
  });

  it("movimento reduzido vale pela escolha daqui, mesmo com o sistema sem pedir", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
    root.dataset.motion = "reduced";
    expect(prefersReducedMotion()).toBe(true);
  });

  it("o script do <head> aplica a escolha antes do primeiro quadro", () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ color: "verde-azulado", contrast: "medium", motion: "reduced" }),
    );
    new Function(APPEARANCE_BOOTSTRAP_SCRIPT)();
    expect(root.dataset.section).toBe("mapas");
    expect(root.dataset.contrast).toBe("medium");
    expect(root.dataset.motion).toBe("reduced");
  });

  it("o script não quebra com o armazenamento estragado", () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "{");
    expect(() => new Function(APPEARANCE_BOOTSTRAP_SCRIPT)()).not.toThrow();
    expect(root.dataset.contrast).toBeUndefined();
  });
});

describe("cores do app só de paletas que existem (D-196)", () => {
  it.each(Object.entries(APP_COLOR_SECTION))("%s usa um bloco claro e um escuro já verificados", (_color, section) => {
    expect(globals).toContain(`\n[data-section="${section}"] {`);
    expect(globals).toContain(`\n[data-theme="dark"][data-section="${section}"] {`);
  });

  it("contraste médio e alto só apontam um token para outro, sem cor nova", () => {
    const start = globals.indexOf('/* D-196: contrast levels');
    const block = globals.slice(start, globals.indexOf("/* D-196: \"Movimento reduzido\"", start));
    expect(block).toContain(':root[data-contrast="high"][data-theme]');
    expect(block).toContain("@media (prefers-contrast: more)");
    for (const line of block.split("\n").filter((l) => /^\s+--[\w-]+:/.test(l))) {
      expect(line).toMatch(/^\s+--[\w-]+: var\(--[\w-]+\);$/);
    }
  });

  it("movimento reduzido daqui zera animação e transição", () => {
    expect(globals).toMatch(/:root\[data-motion="reduced"\] \*,[\s\S]*?transition-duration: 0\.01ms !important;/);
  });
});
