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

/**
 * D-252: the "interpretar enunciado" panel and its route left in D-234, and its texts lingered in
 * `ptBR.ai` for three entregas. What the namespace holds now is what the explanation of a study
 * and the notice about the search read; a key added here without a reader is dead text again.
 */
describe("ptBR.ai", () => {
  it("holds only the explanation of a study and the notice about the search", () => {
    expect(Object.keys(ptBR.ai).sort()).toEqual(
      [
        "caveats",
        "close",
        "explain",
        "explainError",
        "explaining",
        "explainingWithKnowledge",
        "explanationTitle",
        "retrievalDegraded",
        "sourcesConsulted",
      ].sort(),
    );
  });
});
