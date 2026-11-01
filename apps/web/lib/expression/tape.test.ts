import { describe, expect, it } from "vitest";
import {
  EMPTY_TAPE,
  backspace,
  closeParen,
  deleteForward,
  fold,
  insert,
  insertFunction,
  matches,
  moveCursor,
  moveToken,
  rankMatch,
  serialize,
  tapeFromText,
  tokenize,
  tokensInSpan,
  toText,
  typeDigit,
  type Vocabulary,
} from "./tape";

const vocabulary: Vocabulary = {
  functions: new Set(["sqrt", "cbrt", "min", "pow"]),
  constants: new Set(["pi", "e"]),
};

describe("fita da calculadora (D-191)", () => {
  it("lê e reescreve a gramática sem mudar o que ela diz", () => {
    for (const text of [
      "modulo_young / densidade",
      "sqrt(modulo_young) / densidade",
      "modulo_young ** (1 / 2) / densidade",
      "min(a, b) * pi",
      "-a + (-b)",
      "a * -2",
      "1.5e-3 * a",
    ]) {
      expect(toText(tokenize(text, vocabulary))).toBe(text);
    }
  });

  it("normaliza o espaçamento e lê ^ como potência", () => {
    expect(toText(tokenize("sqrt( E )/rho", vocabulary))).toBe("sqrt(E) / rho");
    expect(toText(tokenize("E^0.5", vocabulary))).toBe("E ** 0.5");
  });

  it("um nome só é função se vier seguido de parêntese e estiver no vocabulário", () => {
    expect(tokenize("sqrt(a)", vocabulary)[0]).toEqual({ kind: "fn", name: "sqrt" });
    expect(tokenize("sqrt", vocabulary)[0]).toEqual({ kind: "var", name: "sqrt" });
    expect(tokenize("foo(a)", vocabulary)[0]).toEqual({ kind: "var", name: "foo" });
    expect(tokenize("pi", vocabulary)[0]).toEqual({ kind: "const", name: "pi" });
  });

  it("o que não reconhece vira peça crua, mostrada como digitada", () => {
    expect(tokenize("a & b", vocabulary)).toContainEqual({ kind: "raw", text: "&" });
  });

  it("uma tecla de função abre e fecha o parêntese e deixa o cursor dentro", () => {
    let tape = insertFunction(EMPTY_TAPE, "sqrt");
    expect(toText(tape.tokens)).toBe("sqrt()");
    expect(tape.cursor).toBe(1);
    tape = insert(tape, [{ kind: "var", name: "E" }]);
    expect(toText(tape.tokens)).toBe("sqrt(E)");
    // ")" passa por cima do parêntese que a função já escreveu.
    tape = closeParen(tape);
    expect(toText(tape.tokens)).toBe("sqrt(E)");
    expect(tape.cursor).toBe(3);
  });

  it("dígitos e vírgula crescem o número antes do cursor", () => {
    let tape = typeDigit(EMPTY_TAPE, "1");
    tape = typeDigit(tape, ".");
    tape = typeDigit(tape, ".");
    tape = typeDigit(tape, "5");
    expect(toText(tape.tokens)).toBe("1.5");
    tape = backspace(tape);
    expect(toText(tape.tokens)).toBe("1.");
    expect(toText(typeDigit(EMPTY_TAPE, ".").tokens)).toBe("0.");
  });

  it("apaga antes e depois do cursor, e move o cursor com limite", () => {
    let tape = tapeFromText("a / b", vocabulary);
    tape = moveCursor(tape, 1);
    expect(toText(deleteForward(tape).tokens)).toBe("a b");
    expect(toText(backspace(tape).tokens)).toBe("/ b");
    expect(moveCursor(tape, -5).cursor).toBe(0);
    expect(moveCursor(tape, 99).cursor).toBe(3);
  });

  it("arrastar uma peça a reposiciona", () => {
    const tape = tapeFromText("a / b", vocabulary);
    expect(toText(moveToken(tape, 2, 0).tokens)).toBe("b a /");
    expect(toText(moveToken(tape, 0, 3).tokens)).toBe("/ b a");
  });

  it("o trecho do erro do servidor aponta as peças certas", () => {
    const tokens = tokenize("modulo_young / inexistente", vocabulary);
    const { spans } = serialize(tokens);
    expect(spans).toEqual([
      [0, 12],
      [13, 14],
      [15, 26],
    ]);
    expect([...tokensInSpan(tokens, 15, 26)]).toEqual([2]);
    // Expressão incompleta: o servidor aponta o fim, a fita marca a última peça.
    expect([...tokensInSpan(tokenize("a /", vocabulary), 3, 3)]).toEqual([1]);
    expect(tokensInSpan(tokens, null, null).size).toBe(0);
  });

  it("a busca ignora acento e caixa e ordena pelo começo do nome", () => {
    expect(fold("  Módulo de YOUNG ")).toBe("modulo de young");
    expect(matches("modulo", "Módulo de Young")).toBe(true);
    expect(matches("young mod", "Módulo de Young")).toBe(true);
    expect(matches("dens", "Módulo de Young")).toBe(false);
    expect(rankMatch("densidade", "Densidade")).toBe(0);
    expect(rankMatch("dens", "Densidade")).toBe(1);
    expect(rankMatch("young", "Módulo de Young")).toBe(2);
    expect(rankMatch("oung", "Módulo de Young")).toBe(3);
  });
});
