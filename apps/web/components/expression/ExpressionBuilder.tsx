"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  ExpressionDescription,
  ExpressionPalette,
  ExpressionUniverse,
  ExpressionVariable,
} from "@materialselect/shared-types";
import { ButtonGroup, ButtonGroupItem, Input } from "@/components/ui";
import { useAnnounce } from "@/components/ui/Announcer";
import { cn } from "@/lib/cn";
import { prettyUnit } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { EXPRESSION_EXAMPLES, expressionText as t } from "@/lib/i18n-expression";
import { useDebounced } from "@/lib/useDebounced";
import {
  EMPTY_TAPE,
  backspace,
  closeParen,
  deleteForward,
  insert,
  insertFunction,
  matches,
  moveCursor,
  moveToken,
  rankMatch,
  serialize,
  tapeFromText,
  tokensInSpan,
  typeDigit,
  type Operator,
  type Tape,
  type Token,
  type Vocabulary,
} from "@/lib/expression/tape";
import { MathTex } from "./MathTex";
import { useExpressionDescription, useExpressionPalette } from "./useExpression";

/** Drag payloads. A card carries a token; a tape piece carries its position. */
const DRAG_TOKEN = "application/x-materialselect-token";
const DRAG_INDEX = "application/x-materialselect-tape-index";

/** Before the palette arrives: enough to read a saved expression back as cards. */
const FALLBACK_VOCABULARY: Vocabulary = {
  functions: new Set(["sqrt", "cbrt", "abs", "sq", "inv", "pow", "min", "max", "ln", "log10", "exp"]),
  constants: new Set(["pi", "e"]),
};

/** How a function reads on a tape piece, before its "(". */
const FUNCTION_CHIP: Record<string, string> = {
  sqrt: "√",
  cbrt: "∛",
  abs: "abs",
  sq: "quadrado",
  inv: "inverso",
  pow: "potência",
  ln: "ln",
  log10: "log",
  exp: "exp",
  min: "mín",
  max: "máx",
};

const OPERATOR_CHIP: Record<Operator, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "**": "^",
};

const HISTORY_LIMIT = 50;

export interface ExpressionBuilderProps {
  /** The expression in grammar form; the builder never shows it outside "Digitar". */
  value: string;
  onChange: (expression: string) => void;
  universe?: ExpressionUniverse;
  /** Visible title of the calculator (the field's label). */
  label?: string;
  /** Label of the text field in "Digitar" mode. */
  typedLabel?: string;
  /** Start in "Digitar" (a screen whose reader is known to prefer the syntax). */
  defaultMode?: "build" | "type";
  /** A message from the screen that owns the field (e.g. the server refused it). */
  error?: string;
  className?: string;
}

/**
 * The visual calculator for performance-index expressions (D-191).
 *
 * Property cards (from `/api/expressions/palette`, grouped by category, found
 * by an accent-insensitive search) are dragged — or clicked, or chosen with
 * Enter — onto a tape; a scientific keypad adds operators, functions, numbers
 * and constants. The display typesets what the backend says the expression is
 * (`/api/expressions/describe`): friendly LaTeX, validity, dimension and unit,
 * and the piece an error is about. Nothing is evaluated here (principle 2);
 * the grammar text is written only to be sent. "Digitar" keeps a plain text
 * field for whoever prefers the syntax.
 */
export function ExpressionBuilder({
  value,
  onChange,
  universe = "material",
  label = t.title,
  typedLabel = t.typeLabel,
  defaultMode = "build",
  error,
  className,
}: ExpressionBuilderProps) {
  const titleId = useId();
  const tapeHintId = useId();
  const announce = useAnnounce();
  const palette = useExpressionPalette(universe);
  const vocabulary = useMemo<Vocabulary>(
    () =>
      palette.data
        ? {
            functions: new Set(palette.data.functions.map((f) => f.name)),
            constants: new Set(palette.data.constants.map((c) => c.name)),
          }
        : FALLBACK_VOCABULARY,
    [palette.data],
  );
  const variables = useMemo(() => {
    const map = new Map<string, ExpressionVariable>();
    for (const v of palette.data?.variables ?? []) map.set(v.variable, v);
    return map;
  }, [palette.data]);

  const [mode, setMode] = useState<"build" | "type">(defaultMode);
  const [notation, setNotation] = useState<"names" | "symbols">("names");
  const vocabularyReady = palette.data !== undefined;
  const [tape, setTape] = useState<Tape>(() => tapeFromText(value, vocabulary));
  /** The text the tape was read from or last wrote, and with which vocabulary. */
  const [source, setSource] = useState({ text: value, ready: vocabularyReady });
  const [history, setHistory] = useState<Tape[]>([]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);

  // Adjusting state while rendering (react.dev, "you might not need an
  // effect"): an outside change of `value` — an example, a saved study, a
  // reset, the typed mode — rebuilds the tape; the palette's arrival re-reads
  // it with the real function names. The builder's own writes update `source`
  // in the same batch, so they are never mistaken for an outside change.
  if (source.text !== value || source.ready !== vocabularyReady) {
    const outside = source.text !== value;
    setSource({ text: value, ready: vocabularyReady });
    if (outside) {
      setTape(tapeFromText(value, vocabulary));
      setHistory([]);
    } else {
      setTape({ ...tapeFromText(serialize(tape.tokens).text, vocabulary), cursor: tape.cursor });
    }
  }

  const text = value;
  const debounced = useDebounced(text, 300);
  const described = useExpressionDescription(debounced, universe, { keepPrevious: true });
  const description = text.trim() ? described.data : undefined;
  const stale = description !== undefined && description.expression.trim() !== text.trim();

  function commit(next: Tape) {
    setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), tape]);
    setTape(next);
    const nextText = serialize(next.tokens).text;
    setSource({ text: nextText, ready: vocabularyReady });
    onChange(nextText);
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setTape(previous);
    const nextText = serialize(previous.tokens).text;
    setSource({ text: nextText, ready: vocabularyReady });
    onChange(nextText);
    announce(t.undone);
  }

  function insertVariable(variable: ExpressionVariable) {
    if (mode === "type") {
      const glue = value.trim() === "" || /[\s(*/+,-]$/.test(value) ? "" : " ";
      onChange(`${value}${glue}${variable.variable}`);
    } else {
      commit(insert(tape, [{ kind: "var", name: variable.variable }]));
    }
    announce(t.inserted(variable.name));
  }

  function insertFn(name: string, spoken: string) {
    if (mode === "type") {
      onChange(`${value}${name}(`);
    } else {
      commit(insertFunction(tape, name));
    }
    announce(t.inserted(spoken));
  }

  function insertConst(name: string, spoken: string) {
    if (mode === "type") onChange(`${value}${name}`);
    else commit(insert(tape, [{ kind: "const", name }]));
    announce(t.inserted(spoken));
  }

  function loadExample(expression: string) {
    const next = tapeFromText(expression, vocabulary);
    setHistory((h) => [...h, tape]);
    setTape(next);
    setSource({ text: expression, ready: vocabularyReady });
    onChange(expression);
  }

  // --- keyboard on the tape ------------------------------------------------

  function onTapeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const handled = keyAction(key);
    if (handled) {
      event.preventDefault();
      return;
    }
    if (/^\p{L}$/u.test(key)) {
      // A letter opens the search with it: "type and the card comes".
      event.preventDefault();
      setQuery(key);
      searchRef.current?.focus();
    }
  }

  function keyAction(key: string): boolean {
    switch (key) {
      case "ArrowLeft":
        setTape(moveCursor(tape, tape.cursor - 1));
        return true;
      case "ArrowRight":
        setTape(moveCursor(tape, tape.cursor + 1));
        return true;
      case "Home":
        setTape(moveCursor(tape, 0));
        return true;
      case "End":
        setTape(moveCursor(tape, tape.tokens.length));
        return true;
      case "Backspace":
        commit(backspace(tape));
        announce(t.removed);
        return true;
      case "Delete":
        commit(deleteForward(tape));
        announce(t.removed);
        return true;
      case "+":
      case "-":
      case "*":
      case "/":
        commit(insert(tape, [{ kind: "op", op: key }]));
        return true;
      case "^":
        commit(insert(tape, [{ kind: "op", op: "**" }]));
        return true;
      case "(":
        commit(insert(tape, [{ kind: "lparen" }]));
        return true;
      case ")":
        commit(closeParen(tape));
        return true;
      case ";":
        commit(insert(tape, [{ kind: "comma" }]));
        return true;
      case ",":
      case ".":
        commit(typeDigit(tape, "."));
        return true;
      default:
        if (/^[0-9]$/.test(key)) {
          commit(typeDigit(tape, key));
          return true;
        }
        return false;
    }
  }

  // --- drag and drop ---------------------------------------------------------

  const [dropAt, setDropAt] = useState<number | null>(null);

  function dropIndexFor(event: DragEvent<HTMLElement>, index: number): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return rect.width > 0 && event.clientX > rect.left + rect.width / 2 ? index + 1 : index;
  }

  function handleDrop(event: DragEvent<HTMLElement>, at: number) {
    event.preventDefault();
    event.stopPropagation();
    setDropAt(null);
    const moved = event.dataTransfer.getData(DRAG_INDEX);
    if (moved !== "") {
      commit(moveToken(tape, Number(moved), at));
      return;
    }
    const raw = event.dataTransfer.getData(DRAG_TOKEN);
    if (!raw) return;
    let token: Token;
    try {
      token = JSON.parse(raw) as Token;
    } catch {
      return;
    }
    const placed = { ...tape, cursor: at };
    const next =
      token.kind === "fn" ? insertFunction(placed, token.name) : insert(placed, [token]);
    commit(next);
    if (token.kind === "var") announce(t.inserted(variables.get(token.name)?.name ?? token.name));
  }

  // --- error position ------------------------------------------------------

  const firstError = description && !stale ? description.errors[0] : undefined;
  const flagged = useMemo(
    () =>
      firstError ? tokensInSpan(tape.tokens, firstError.start, firstError.end) : new Set<number>(),
    [firstError, tape.tokens],
  );

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className={cn("flex min-w-0 flex-col gap-3", className)}
      data-testid="expression-builder"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={titleId} className="text-sm font-semibold text-ink">
          {label}
        </p>
        <ButtonGroup label={t.modeLabel}>
          <ButtonGroupItem
            selected={mode === "build"}
            label={t.modeBuild}
            onClick={() => {
              setTape(tapeFromText(value, vocabulary));
              setSource({ text: value, ready: vocabularyReady });
              setMode("build");
            }}
          >
            {t.modeBuild}
          </ButtonGroupItem>
          <ButtonGroupItem
            selected={mode === "type"}
            label={t.modeType}
            onClick={() => setMode("type")}
          >
            {t.modeType}
          </ButtonGroupItem>
        </ButtonGroup>
      </div>

      <Display
        text={text}
        description={description}
        stale={stale || (described.isFetching && !description)}
        failed={described.isError}
        notation={notation}
        onNotation={setNotation}
      />

      {mode === "build" ? (
        <div className="flex flex-col gap-1">
          <div
            ref={tapeRef}
            role="group"
            tabIndex={0}
            aria-label={t.tapeLabel}
            aria-describedby={tapeHintId}
            onKeyDown={onTapeKeyDown}
            onDragOver={(e) => {
              e.preventDefault();
              setDropAt(tape.tokens.length);
            }}
            onDragLeave={() => setDropAt(null)}
            onDrop={(e) => handleDrop(e, tape.tokens.length)}
            className={cn(
              "flex min-h-14 flex-wrap items-center gap-1 rounded-control border-2 border-dashed border-edge-control bg-panel p-2",
              "focus-visible:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              dropAt !== null && "border-brand bg-brand-50",
            )}
            data-testid="expression-tape"
          >
            {tape.tokens.length === 0 && (
              <span className="px-1 text-support text-ink-subtle">{t.tapeEmpty}</span>
            )}
            {tape.tokens.map((token, index) => (
              <TapePiece
                key={index}
                token={token}
                index={index}
                variables={variables}
                cursorBefore={tape.cursor === index}
                dropBefore={dropAt === index}
                flagged={flagged.has(index)}
                onPlaceCursor={() => {
                  setTape(moveCursor(tape, index + 1));
                  tapeRef.current?.focus();
                }}
                onDragOverPiece={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropAt(dropIndexFor(e, index));
                }}
                onDropPiece={(e) => handleDrop(e, dropIndexFor(e, index))}
              />
            ))}
            {tape.cursor === tape.tokens.length && tape.tokens.length > 0 && <Cursor />}
            {dropAt === tape.tokens.length && tape.tokens.length > 0 && <DropMark />}
          </div>
          <p id={tapeHintId} className="text-caption text-ink-subtle">
            {t.tapeHint}
          </p>
        </div>
      ) : (
        <TypedField
          label={typedLabel}
          value={value}
          onChange={onChange}
          description={description}
          stale={stale}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
        <PalettePanel
          universe={universe}
          palette={palette.data}
          loading={palette.isPending}
          failed={palette.isError}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          onInsertVariable={insertVariable}
          onInsertFunction={insertFn}
          onInsertConstant={insertConst}
        />
        {mode === "build" && (
          <Keypad
            palette={palette.data}
            onKey={(key) => keyAction(key)}
            onFunction={insertFn}
            onConstant={insertConst}
            onClear={() => {
              commit(EMPTY_TAPE);
              announce(t.cleared);
            }}
            onUndo={undo}
            canUndo={history.length > 0}
          />
        )}
      </div>

      <Examples variables={variables} onLoad={loadExample} />
      <Help />
    </div>
  );
}

// --- display -----------------------------------------------------------------

function Display({
  text,
  description,
  stale,
  failed,
  notation,
  onNotation,
}: {
  text: string;
  description: ExpressionDescription | undefined;
  stale: boolean;
  failed: boolean;
  notation: "names" | "symbols";
  onNotation: (n: "names" | "symbols") => void;
}) {
  const latex =
    notation === "symbols"
      ? (description?.latex_symbols ?? description?.latex)
      : description?.latex;
  const empty = text.trim() === "";
  return (
    <section
      aria-label={t.displayLabel}
      className="well flex min-w-0 flex-col gap-2"
      data-testid="expression-display"
    >
      <div className="flex justify-end">
        <ButtonGroup label={t.notationLabel}>
          <ButtonGroupItem
            selected={notation === "names"}
            label={t.showNames}
            onClick={() => onNotation("names")}
          >
            {t.showNames}
          </ButtonGroupItem>
          <ButtonGroupItem
            selected={notation === "symbols"}
            label={t.showSymbols}
            onClick={() => onNotation("symbols")}
          >
            {t.showSymbols}
          </ButtonGroupItem>
        </ButtonGroup>
      </div>
      <div
        className={cn(
          "min-h-12 min-w-0 overflow-x-auto py-1 text-xl text-ink transition-opacity",
          stale && "opacity-60",
        )}
      >
        {empty ? (
          <p className="text-sm text-ink-muted">{t.displayEmpty}</p>
        ) : latex ? (
          <MathTex latex={latex} label={description?.label ?? text} display />
        ) : null}
      </div>
      <div aria-live="polite" className="min-h-5 text-support">
        {empty ? null : failed ? (
          <p className="text-danger-fg">{t.describeFailed}</p>
        ) : !description || stale ? (
          <p className="text-ink-muted">{t.checking}</p>
        ) : description.valid ? (
          <Verdict description={description} />
        ) : (
          <ul className="flex flex-col gap-0.5 text-danger-fg" aria-label={t.invalid}>
            {description.errors.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Verdict({ description }: { description: ExpressionDescription }) {
  const unit =
    description.unit === "dimensionless" || !description.unit
      ? t.dimensionless
      : prettyUnit(description.unit);
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-medium text-success-fg">{t.valid}</p>
      <p className="text-ink-muted">
        {t.unit}: <span className="font-medium text-ink">{unit}</span>
      </p>
      {description.is_multiplicative !== null && (
        <p className="text-ink-subtle">
          {description.is_multiplicative ? t.powerLaw : t.notPowerLaw}
        </p>
      )}
    </div>
  );
}

// --- tape --------------------------------------------------------------------

function Cursor() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 inline-block h-6 w-0.5 rounded bg-brand motion-safe:animate-pulse"
      data-testid="expression-cursor"
    />
  );
}

function DropMark() {
  return <span aria-hidden="true" className="mx-0.5 inline-block h-7 w-1 rounded bg-brand" />;
}

function pieceText(
  token: Token,
  variables: Map<string, ExpressionVariable>,
): { text: string; spoken: string; tone: "var" | "fn" | "op" | "num" | "raw" } {
  switch (token.kind) {
    case "var": {
      const v = variables.get(token.name);
      return v
        ? { text: v.name, spoken: t.tokenProperty(v.name), tone: "var" }
        : { text: token.name, spoken: t.tokenUnknown(token.name), tone: "raw" };
    }
    case "fn": {
      const label = FUNCTION_CHIP[token.name] ?? token.name;
      return { text: `${label}(`, spoken: t.tokenFunction(label), tone: "fn" };
    }
    case "const":
      return {
        text: token.name === "pi" ? "π" : token.name,
        spoken: token.name === "pi" ? "pi" : token.name,
        tone: "num",
      };
    case "num": {
      const shown = token.text.replace(".", ",");
      return { text: shown, spoken: t.tokenNumber(shown), tone: "num" };
    }
    case "op":
      return { text: OPERATOR_CHIP[token.op], spoken: operatorSpoken(token.op), tone: "op" };
    case "lparen":
      return { text: "(", spoken: t.keys.open, tone: "op" };
    case "rparen":
      return { text: ")", spoken: t.keys.close, tone: "op" };
    case "comma":
      return { text: ";", spoken: t.keys.separator, tone: "op" };
    case "raw":
      return { text: token.text, spoken: t.tokenUnknown(token.text), tone: "raw" };
  }
}

function operatorSpoken(op: Operator): string {
  return {
    "+": t.keys.plus,
    "-": t.keys.minus,
    "*": t.keys.times,
    "/": t.keys.divide,
    "**": t.keys.power,
  }[op];
}

function TapePiece({
  token,
  index,
  variables,
  cursorBefore,
  dropBefore,
  flagged,
  onPlaceCursor,
  onDragOverPiece,
  onDropPiece,
}: {
  token: Token;
  index: number;
  variables: Map<string, ExpressionVariable>;
  cursorBefore: boolean;
  dropBefore: boolean;
  flagged: boolean;
  onPlaceCursor: () => void;
  onDragOverPiece: (e: DragEvent<HTMLElement>) => void;
  onDropPiece: (e: DragEvent<HTMLElement>) => void;
}) {
  const piece = pieceText(token, variables);
  const variable = token.kind === "var" ? variables.get(token.name) : undefined;
  return (
    <>
      {dropBefore && <DropMark />}
      {cursorBefore && <Cursor />}
      <button
        type="button"
        tabIndex={-1}
        draggable
        onClick={onPlaceCursor}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_INDEX, String(index));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={onDragOverPiece}
        onDrop={onDropPiece}
        aria-label={t.tokenPiece(piece.spoken, index + 1)}
        title={t.tokenRemoveHint}
        data-flagged={flagged ? "true" : undefined}
        className={cn(
          "inline-flex min-h-8 cursor-grab items-center gap-1 rounded-control border px-2 text-sm",
          piece.tone === "var" && "border-brand bg-brand-50 font-medium text-brand-800",
          piece.tone === "fn" && "border-edge-control bg-well font-medium text-ink",
          piece.tone === "op" && "border-transparent bg-transparent px-1 text-base text-ink",
          piece.tone === "num" && "border-edge-control bg-panel tabular-nums text-ink",
          piece.tone === "raw" && "border-danger bg-danger-soft font-mono text-danger-fg",
          flagged && "ring-2 ring-danger",
        )}
      >
        {variable?.symbol && (
          <MathTex latex={variable.symbol_latex} label="" className="text-xs text-ink-muted" />
        )}
        <span>{piece.text}</span>
      </button>
    </>
  );
}

// --- typed mode --------------------------------------------------------------

function TypedField({
  label,
  value,
  onChange,
  description,
  stale,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  description: ExpressionDescription | undefined;
  stale: boolean;
}) {
  const issue = description && !stale ? description.errors[0] : undefined;
  const start = issue?.start ?? null;
  return (
    <div className="flex flex-col gap-1">
      <Input
        label={label}
        hint={t.typeHint}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
      />
      {start !== null && value && (
        <p className="font-mono text-xs text-ink-muted" aria-hidden="true">
          {value.slice(0, start)}
          <mark className="rounded bg-danger-soft text-danger-fg">
            {value.slice(start, Math.max(start + 1, issue?.end ?? start + 1)) || " "}
          </mark>
          {value.slice(Math.max(start + 1, issue?.end ?? start + 1))}
        </p>
      )}
    </div>
  );
}

// --- palette -----------------------------------------------------------------

function categoryLabel(category: string): string {
  if (category === "PROCESSO") return t.processCategory;
  return (ptBR.categories as Record<string, string>)[category] ?? category;
}

function PalettePanel({
  universe,
  palette,
  loading,
  failed,
  query,
  onQuery,
  searchRef,
  onInsertVariable,
  onInsertFunction,
  onInsertConstant,
}: {
  universe: ExpressionUniverse;
  palette: ExpressionPalette | undefined;
  loading: boolean;
  failed: boolean;
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  onInsertVariable: (v: ExpressionVariable) => void;
  onInsertFunction: (name: string, spoken: string) => void;
  onInsertConstant: (name: string, spoken: string) => void;
}) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const variables = useMemo(() => palette?.variables ?? [], [palette]);

  const found = useMemo(() => {
    if (!query.trim()) return [];
    return variables
      .filter((v) =>
        matches(
          query,
          `${v.name} ${v.symbol ?? ""} ${v.slug} ${categoryLabel(v.category)} ${v.description ?? ""}`,
        ),
      )
      .sort((a, b) => rankMatch(query, a.name) - rankMatch(query, b.name) || a.name.localeCompare(b.name, "pt-BR"));
  }, [query, variables]);

  const foundFunctions = useMemo(() => {
    if (!query.trim() || !palette) return [];
    return palette.functions.filter((f) => matches(query, `${f.name} ${f.label} ${f.description}`));
  }, [query, palette]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, ExpressionVariable[]>();
    for (const v of variables) {
      const list = byCategory.get(v.category) ?? [];
      list.push(v);
      byCategory.set(v.category, list);
    }
    return [...byCategory.entries()];
  }, [variables]);

  function focusFirstResult() {
    listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }

  return (
    <section aria-label={t.paletteLabel} className="flex min-w-0 flex-col gap-2">
      <Input
        ref={searchRef}
        type="search"
        label={t.searchLabel}
        hint={t.searchHint}
        placeholder={t.searchPlaceholder}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        aria-controls={listId}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = found[0];
            if (first) {
              onInsertVariable(first);
              onQuery("");
            } else if (foundFunctions[0]) {
              onInsertFunction(foundFunctions[0].name, foundFunctions[0].label);
              onQuery("");
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusFirstResult();
          } else if (e.key === "Escape") {
            onQuery("");
          }
        }}
      />
      <div
        id={listId}
        ref={listRef}
        className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1"
        data-testid="expression-palette"
      >
        {loading ? (
          <p className="text-support text-ink-muted">{t.paletteLoading}</p>
        ) : failed ? (
          <p className="text-support text-danger-fg">{t.paletteError}</p>
        ) : variables.length === 0 ? (
          <p className="text-support text-ink-muted">{t.paletteEmpty}</p>
        ) : query.trim() ? (
          <>
            <p className="text-caption text-ink-subtle" aria-live="polite">
              {t.results(found.length + foundFunctions.length)}
            </p>
            {found.length + foundFunctions.length === 0 && (
              <p className="text-support text-ink-muted">{t.noResults}</p>
            )}
            <ul className="flex flex-col gap-1">
              {found.map((v) => (
                <li key={v.variable}>
                  <PropertyCard variable={v} onInsert={() => onInsertVariable(v)} />
                </li>
              ))}
            </ul>
            {foundFunctions.length > 0 && (
              <ul className="flex flex-wrap gap-1" aria-label={t.functionsGroup}>
                {foundFunctions.map((f) => (
                  <li key={f.name}>
                    <KeyButton
                      label={f.label}
                      spoken={`${f.label}: ${f.description}`}
                      onPress={() => onInsertFunction(f.name, f.label)}
                      tone="fn"
                      dragToken={{ kind: "fn", name: f.name }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          groups.map(([category, list], i) => (
            <details key={category} open={i === 0 || universe === "process"} className="group">
              <summary className="cursor-pointer select-none rounded-control px-1 py-1 text-sm font-semibold text-ink">
                {t.categoryCount(categoryLabel(category), list.length)}
              </summary>
              <ul className="mt-1 flex flex-col gap-1">
                {list.map((v) => (
                  <li key={v.variable}>
                    <PropertyCard variable={v} onInsert={() => onInsertVariable(v)} />
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
        {palette && !query.trim() && palette.constants.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t.constantsGroup}>
            <span className="text-caption text-ink-subtle">{t.constantsGroup}:</span>
            {palette.constants.map((c) => (
              <KeyButton
                key={c.name}
                label={c.label}
                spoken={c.description}
                onPress={() => onInsertConstant(c.name, c.label)}
                tone="num"
                dragToken={{ kind: "const", name: c.name }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PropertyCard({
  variable,
  onInsert,
}: {
  variable: ExpressionVariable;
  onInsert: () => void;
}) {
  const unit = variable.display_unit ?? variable.unit;
  const shownUnit = unit && unit !== "dimensionless" ? prettyUnit(unit) : t.dimensionless;
  return (
    <button
      type="button"
      draggable
      onClick={onInsert}
      onDragStart={(e) => {
        const token: Token = { kind: "var", name: variable.variable };
        e.dataTransfer.setData(DRAG_TOKEN, JSON.stringify(token));
        e.dataTransfer.setData("text/plain", variable.name);
        e.dataTransfer.effectAllowed = "copy";
      }}
      aria-label={t.insertCard(variable.name)}
      title={t.dragHint}
      className="pressable m3-state flex w-full cursor-grab items-center gap-2 rounded-control border border-edge-control bg-panel px-2 py-1.5 text-left active:cursor-grabbing"
      data-variable={variable.variable}
    >
      <span className="flex h-8 min-w-8 items-center justify-center rounded bg-brand-50 px-1 text-brand-800">
        <MathTex latex={variable.symbol_latex} label="" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-ink">{variable.name}</span>
        <span className="truncate text-caption text-ink-subtle">{shownUnit}</span>
      </span>
    </button>
  );
}

// --- keypad --------------------------------------------------------------------

function KeyButton({
  label,
  spoken,
  onPress,
  tone = "plain",
  dragToken,
  disabled,
  wide,
}: {
  label: ReactNode;
  spoken: string;
  onPress: () => void;
  tone?: "plain" | "op" | "fn" | "num" | "danger";
  dragToken?: Token;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={spoken}
      title={spoken}
      draggable={Boolean(dragToken)}
      onDragStart={
        dragToken
          ? (e) => {
              e.dataTransfer.setData(DRAG_TOKEN, JSON.stringify(dragToken));
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined
      }
      className={cn(
        "pressable m3-state inline-flex min-h-10 min-w-10 items-center justify-center rounded-control border px-2 text-sm font-medium disabled:opacity-40",
        tone === "plain" && "border-edge-control bg-panel text-ink",
        tone === "num" && "border-edge-control bg-panel tabular-nums text-ink",
        tone === "op" && "border-edge-control bg-well text-ink",
        tone === "fn" && "border-brand bg-brand-50 text-brand-800",
        tone === "danger" && "border-edge-control bg-panel text-danger-fg",
        wide && "col-span-2",
      )}
    >
      {label}
    </button>
  );
}

function Keypad({
  palette,
  onKey,
  onFunction,
  onConstant,
  onClear,
  onUndo,
  canUndo,
}: {
  palette: ExpressionPalette | undefined;
  onKey: (key: string) => void;
  onFunction: (name: string, spoken: string) => void;
  onConstant: (name: string, spoken: string) => void;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const digits: Array<[string, string]> = [
    ["7", "7"],
    ["8", "8"],
    ["9", "9"],
    ["4", "4"],
    ["5", "5"],
    ["6", "6"],
    ["1", "1"],
    ["2", "2"],
    ["3", "3"],
    ["0", "0"],
  ];
  return (
    <section aria-label={t.keypadLabel} className="flex min-w-0 flex-col gap-2" data-testid="expression-keypad">
      {palette && (
        <div role="group" aria-label={t.functionsGroup} className="grid grid-cols-4 gap-1 sm:grid-cols-6">
          {palette.functions.map((f) => (
            <KeyButton
              key={f.name}
              label={f.label}
              spoken={`${f.label}: ${f.description}`}
              tone="fn"
              onPress={() => onFunction(f.name, f.label)}
              dragToken={{ kind: "fn", name: f.name }}
            />
          ))}
          {palette.constants.map((c) => (
            <KeyButton
              key={c.name}
              label={c.label}
              spoken={c.description}
              tone="fn"
              onPress={() => onConstant(c.name, c.label)}
              dragToken={{ kind: "const", name: c.name }}
            />
          ))}
        </div>
      )}
      <div className="grid grid-cols-5 gap-1">
        {digits.slice(0, 3).map(([k, l]) => (
          <KeyButton key={k} label={l} spoken={l} tone="num" onPress={() => onKey(k)} />
        ))}
        <KeyButton label="(" spoken={t.keys.open} tone="op" onPress={() => onKey("(")} />
        <KeyButton label=")" spoken={t.keys.close} tone="op" onPress={() => onKey(")")} />
        {digits.slice(3, 6).map(([k, l]) => (
          <KeyButton key={k} label={l} spoken={l} tone="num" onPress={() => onKey(k)} />
        ))}
        <KeyButton label="×" spoken={t.keys.times} tone="op" onPress={() => onKey("*")} />
        <KeyButton label="÷" spoken={t.keys.divide} tone="op" onPress={() => onKey("/")} />
        {digits.slice(6, 9).map(([k, l]) => (
          <KeyButton key={k} label={l} spoken={l} tone="num" onPress={() => onKey(k)} />
        ))}
        <KeyButton label="+" spoken={t.keys.plus} tone="op" onPress={() => onKey("+")} />
        <KeyButton label="−" spoken={t.keys.minus} tone="op" onPress={() => onKey("-")} />
        <KeyButton label="0" spoken="0" tone="num" onPress={() => onKey("0")} />
        <KeyButton label="," spoken={t.keys.decimal} tone="num" onPress={() => onKey(",")} />
        <KeyButton label="^" spoken={t.keys.power} tone="op" onPress={() => onKey("^")} />
        <KeyButton label=";" spoken={t.keys.separator} tone="op" onPress={() => onKey(";")} />
        <KeyButton label="⌫" spoken={t.keys.backspace} tone="danger" onPress={() => onKey("Backspace")} />
      </div>
      <div className="flex flex-wrap gap-1">
        <KeyButton label="◀" spoken={t.keys.left} onPress={() => onKey("ArrowLeft")} />
        <KeyButton label="▶" spoken={t.keys.right} onPress={() => onKey("ArrowRight")} />
        <KeyButton label={t.undo} spoken={t.keys.undo} onPress={onUndo} disabled={!canUndo} />
        <KeyButton label={t.clear} spoken={t.keys.clear} tone="danger" onPress={onClear} />
      </div>
    </section>
  );
}

// --- examples and help ---------------------------------------------------------

function Examples({
  variables,
  onLoad,
}: {
  variables: Map<string, ExpressionVariable>;
  onLoad: (expression: string) => void;
}) {
  const usable = EXPRESSION_EXAMPLES.filter((e) => e.variables.every((v) => variables.has(v)));
  if (usable.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-ink">{t.examples}</p>
      <p className="text-caption text-ink-subtle">{t.examplesHint}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t.examples}>
        {usable.map((example) => (
          <button
            key={example.expression}
            type="button"
            onClick={() => onLoad(example.expression)}
            className="pressable m3-state inline-flex items-center gap-1.5 rounded-full border border-edge-control bg-panel px-3 py-1 text-sm text-ink"
          >
            <span>{example.title}</span>
            <span className="text-ink-subtle">{example.reading}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Help() {
  return (
    <details className="rounded-control text-support text-ink-muted">
      <summary className="cursor-pointer select-none font-medium text-ink">{t.helpTitle}</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {t.helpSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-2">{t.helpStudent}</p>
      <p className="mt-1">{t.helpEngineer}</p>
    </details>
  );
}
