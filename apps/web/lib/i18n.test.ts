import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ptBR } from "./i18n";

/**
 * Text authored in Python that the interface repeats. There is no endpoint
 * serving it, so the web copy is a copy.
 *
 * These tests are the thing that keeps a copy honest. Editing one side and not
 * the other fails the frontend suite, which is part of the CI gate.
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
  it("repete a regra da busca por composição exatamente como o backend a declara (D-105)", () => {
    const python = readPython("../../api/app/domain/composition.py");
    expect(ptBR.catalog.searchHelpRule).toBe(pythonConstant(python, "RULE_TEXT"));
  });
});
