import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fichaText } from "./i18n-ficha";

/**
 * `pathReason` repeats a sentence authored in Python (the 422 the API gives for
 * "read a value at one x" on a hysteresis loop). There is no endpoint serving it,
 * so the web copy is a copy, and this test keeps it honest (see `i18n.test.ts`).
 */
// A variable, not a literal: Vite rewrites `new URL("literal", import.meta.url)` as an asset.
function readPython(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function pythonConstant(source: string, name: string): string {
  const match = new RegExp(`^${name} = \\(([\\s\\S]*?)\\)$`, "m").exec(source);
  if (!match?.[1]) throw new Error(`Constante ${name} não encontrada no fonte Python.`);
  return [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
}

describe("textos da ficha compartilhados com o backend", () => {
  it("repete a razão da trajetória exatamente como o backend a declara (D-118)", () => {
    const python = readPython("../../api/app/domain/curves.py");
    expect(fichaText.curveValue.pathReason).toBe(pythonConstant(python, "PATH_AMBIGUOUS"));
  });
});
