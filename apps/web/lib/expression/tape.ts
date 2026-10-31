/**
 * The calculator's "tape" (D-191): an expression as a row of pieces.
 *
 * The reader builds an expression out of cards and keys, never out of the
 * grammar's spelling, so the calculator keeps it as tokens — a property, an
 * operator, a function, a number — and only *writes* the grammar text when it
 * talks to the backend. Nothing here evaluates, simplifies or checks anything
 * numeric (principle 2): validation, LaTeX and dimension all come from
 * `POST /api/expressions/describe`. The tokenizer below exists only so that a
 * typed (advanced-mode) or saved expression can be shown as cards again.
 */

export type Operator = "+" | "-" | "*" | "/" | "**";

export type Token =
  | { kind: "var"; name: string }
  | { kind: "num"; text: string }
  | { kind: "op"; op: Operator }
  | { kind: "fn"; name: string }
  | { kind: "const"; name: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "raw"; text: string };

export interface Tape {
  tokens: Token[];
  /** Insertion point: 0 is before the first token, `tokens.length` after the last. */
  cursor: number;
}

export const EMPTY_TAPE: Tape = { tokens: [], cursor: 0 };

/** What the grammar knows by name: functions and constants, from the palette. */
export interface Vocabulary {
  functions: ReadonlySet<string>;
  constants: ReadonlySet<string>;
}

// --- writing ----------------------------------------------------------------

function tokenText(token: Token): string {
  switch (token.kind) {
    case "var":
    case "fn":
    case "const":
      return token.kind === "fn" ? `${token.name}(` : token.name;
    case "num":
      return token.text;
    case "op":
      return token.op;
    case "lparen":
      return "(";
    case "rparen":
      return ")";
    case "comma":
      return ",";
    case "raw":
      return token.text;
  }
}

/** Whether the sign at `index` is unary ("-E", "(−E", "E * -2"), not a subtraction. */
function isUnarySign(tokens: readonly Token[], index: number): boolean {
  const token = tokens[index];
  if (token?.kind !== "op" || (token.op !== "-" && token.op !== "+")) return false;
  const previous = tokens[index - 1];
  return (
    previous === undefined ||
    previous.kind === "op" ||
    previous.kind === "lparen" ||
    previous.kind === "fn" ||
    previous.kind === "comma"
  );
}

/** Whether a space goes before the token at `index`: around binary operators and after commas. */
function spaced(tokens: readonly Token[], index: number): boolean {
  const previous = tokens[index - 1];
  const token = tokens[index] as Token;
  if (!previous) return false;
  if (token.kind === "op") {
    return !isUnarySign(tokens, index) || previous.kind === "op" || previous.kind === "comma";
  }
  if (previous.kind === "op") return !isUnarySign(tokens, index - 1);
  if (previous.kind === "comma") return true;
  // Two operands side by side stay apart, so "a" and "b" never fuse into the
  // name "ab": the backend then refuses the missing operator at that spot.
  const endsOperand = ["var", "num", "const", "rparen", "raw"].includes(previous.kind);
  const startsOperand = ["var", "num", "const", "fn", "lparen", "raw"].includes(token.kind);
  return endsOperand && startsOperand;
}

/** The grammar text and, for each token, its `[start, end)` span in that text. */
export function serialize(tokens: readonly Token[]): { text: string; spans: [number, number][] } {
  let text = "";
  const spans: [number, number][] = [];
  tokens.forEach((token, i) => {
    if (spaced(tokens, i)) text += " ";
    const start = text.length;
    text += tokenText(token);
    spans.push([start, text.length]);
  });
  return { text, spans };
}

export function toText(tokens: readonly Token[]): string {
  return serialize(tokens).text;
}

/** Indices of the tokens that overlap the character span `[start, end)`. */
export function tokensInSpan(
  tokens: readonly Token[],
  start: number | null,
  end: number | null,
): Set<number> {
  const hit = new Set<number>();
  if (start === null) return hit;
  const stop = end === null || end <= start ? start + 1 : end;
  const { spans } = serialize(tokens);
  spans.forEach(([a, b], i) => {
    if (a < stop && b > start) hit.add(i);
  });
  // A span at the very end (an incomplete expression) points past the last token.
  if (hit.size === 0 && tokens.length > 0 && start >= (spans[spans.length - 1]?.[1] ?? 0)) {
    hit.add(tokens.length - 1);
  }
  return hit;
}

// --- reading ----------------------------------------------------------------

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

/**
 * Split grammar text into tape tokens. Never fails: what it does not
 * recognise becomes a `raw` token, shown as typed and refused by the backend
 * with its own written message. `^` is read as `**` — it is what a reader
 * means by it, and the backend would only refuse it with that same advice.
 */
export function tokenize(text: string, vocabulary: Vocabulary): Token[] {
  const tokens: Token[] = [];
  let rest = text;
  while (rest.length > 0) {
    const space = /^\s+/.exec(rest);
    if (space) {
      rest = rest.slice(space[0].length);
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      tokens.push({ kind: "num", text: number[0] });
      rest = rest.slice(number[0].length);
      continue;
    }
    const ident = IDENT.exec(rest);
    if (ident) {
      const name = ident[0];
      const after = rest.slice(name.length);
      const call = /^\s*\(/.exec(after);
      if (call && vocabulary.functions.has(name)) {
        tokens.push({ kind: "fn", name });
        rest = after.slice(call[0].length);
        continue;
      }
      tokens.push(vocabulary.constants.has(name) ? { kind: "const", name } : { kind: "var", name });
      rest = after;
      continue;
    }
    if (rest.startsWith("**")) {
      tokens.push({ kind: "op", op: "**" });
      rest = rest.slice(2);
      continue;
    }
    const char = rest[0] as string;
    rest = rest.slice(1);
    if (char === "^") tokens.push({ kind: "op", op: "**" });
    else if (char === "+" || char === "-" || char === "*" || char === "/")
      tokens.push({ kind: "op", op: char });
    else if (char === "(") tokens.push({ kind: "lparen" });
    else if (char === ")") tokens.push({ kind: "rparen" });
    else if (char === ",") tokens.push({ kind: "comma" });
    else {
      const last = tokens[tokens.length - 1];
      if (last?.kind === "raw") last.text += char;
      else tokens.push({ kind: "raw", text: char });
    }
  }
  return tokens;
}

export function tapeFromText(text: string, vocabulary: Vocabulary): Tape {
  const tokens = tokenize(text, vocabulary);
  return { tokens, cursor: tokens.length };
}

// --- editing ----------------------------------------------------------------

function clampCursor(tape: Tape, cursor: number): number {
  return Math.max(0, Math.min(tape.tokens.length, cursor));
}

/** Insert `tokens` at the cursor; the cursor ends after them (or at `cursorOffset`). */
export function insert(tape: Tape, inserted: readonly Token[], cursorOffset?: number): Tape {
  const cursor = clampCursor(tape, tape.cursor);
  const tokens = [...tape.tokens.slice(0, cursor), ...inserted, ...tape.tokens.slice(cursor)];
  return { tokens, cursor: cursor + (cursorOffset ?? inserted.length) };
}

/** A function key: `name(` and its `)`, with the cursor left between them. */
export function insertFunction(tape: Tape, name: string): Tape {
  return insert(tape, [{ kind: "fn", name }, { kind: "rparen" }], 1);
}

/**
 * The `)` key: steps over a `)` already waiting at the cursor (the one a
 * function key wrote) instead of writing a second one.
 */
export function closeParen(tape: Tape): Tape {
  if (tape.tokens[tape.cursor]?.kind === "rparen") return { ...tape, cursor: tape.cursor + 1 };
  return insert(tape, [{ kind: "rparen" }]);
}

/** A digit or the decimal separator: extends the number just before the cursor. */
export function typeDigit(tape: Tape, digit: string): Tape {
  const before = tape.tokens[tape.cursor - 1];
  if (before?.kind === "num") {
    if (digit === "." && before.text.includes(".")) return tape;
    const tokens = [...tape.tokens];
    tokens[tape.cursor - 1] = { kind: "num", text: before.text + digit };
    return { tokens, cursor: tape.cursor };
  }
  return insert(tape, [{ kind: "num", text: digit === "." ? "0." : digit }]);
}

/** Backspace: the last digit of a number, or the whole token before the cursor. */
export function backspace(tape: Tape): Tape {
  if (tape.cursor === 0) return tape;
  const before = tape.tokens[tape.cursor - 1];
  if (before?.kind === "num" && before.text.length > 1) {
    const tokens = [...tape.tokens];
    tokens[tape.cursor - 1] = { kind: "num", text: before.text.slice(0, -1) };
    return { tokens, cursor: tape.cursor };
  }
  return removeAt(tape, tape.cursor - 1);
}

/** Delete the token after the cursor. */
export function deleteForward(tape: Tape): Tape {
  if (tape.cursor >= tape.tokens.length) return tape;
  return removeAt(tape, tape.cursor);
}

export function removeAt(tape: Tape, index: number): Tape {
  if (index < 0 || index >= tape.tokens.length) return tape;
  const tokens = tape.tokens.filter((_, i) => i !== index);
  const cursor = tape.cursor > index ? tape.cursor - 1 : tape.cursor;
  return { tokens, cursor: Math.min(cursor, tokens.length) };
}

export function moveCursor(tape: Tape, to: number): Tape {
  return { ...tape, cursor: clampCursor(tape, to) };
}

/** Move the token at `from` so it lands before what is now at `to` (drag to reorder). */
export function moveToken(tape: Tape, from: number, to: number): Tape {
  if (from < 0 || from >= tape.tokens.length) return tape;
  const token = tape.tokens[from] as Token;
  const without = tape.tokens.filter((_, i) => i !== from);
  const target = Math.max(0, Math.min(without.length, to > from ? to - 1 : to));
  const tokens = [...without.slice(0, target), token, ...without.slice(target)];
  return { tokens, cursor: target + 1 };
}

// --- search -----------------------------------------------------------------

/** Lower case without accents: "Módulo" and "modulo" find the same card. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Whether every word of `query` starts a word of (or is contained in) the
 * haystack. Word starts rank above plain containment in {@link rankMatch}.
 */
export function matches(query: string, haystack: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const target = fold(haystack);
  return words.every((word) => target.includes(word));
}

/** Smaller is better: exact name, then name start, then word start, then anywhere. */
export function rankMatch(query: string, name: string): number {
  const q = fold(query);
  const n = fold(name);
  if (!q) return 3;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[\s()/-]+/).some((word) => word.startsWith(q))) return 2;
  return 3;
}
