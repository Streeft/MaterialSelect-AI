import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ptBR } from "./i18n";

/**
 * The two notices the proposal requires are authored in Python — they have to
 * be, because every exported file carries them — and the interface has to show
 * the same sentences (§3.6 for the limitation, item 6 for the demonstration
 * data). There is no endpoint serving them, so the web copy is a copy.
 *
 * These tests are the thing that keeps a copy honest. Editing one side and not
 * the other now fails the frontend suite, which is part of the CI gate.
 */

function readPython(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

/** Join Python's implicit concatenation of adjacent string literals. */
function pythonConstant(source: string, name: string): string {
  const parenthesised = new RegExp(`^${name} = \\(([\\s\\S]*?)\\)$`, "m").exec(source);
  const single = new RegExp(`^${name} = ("(?:[^"\\\\]|\\\\.)*")$`, "m").exec(source);
  const body = parenthesised?.[1] ?? single?.[1];
  if (!body) throw new Error(`Constante ${name} não encontrada no fonte Python.`);
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
}

describe("textos compartilhados com o backend", () => {
  it("repete o aviso de limitação exatamente como o exportador o escreve", () => {
    const python = readPython("../../api/app/exporters/report.py");
    expect(ptBR.limitation.full).toBe(pythonConstant(python, "LIMITATION_NOTICE"));
  });

  it("repete o aviso de dados demonstrativos exatamente como o seed o escreve", () => {
    const python = readPython("../../api/app/db/seed.py");
    expect(ptBR.demoWarning).toBe(pythonConstant(python, "DEMO_WARNING"));
  });
});
