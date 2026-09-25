"use client";

import { useMemo, useState } from "react";
import type {
  MindMapLayout,
  NotebookCitation,
  StudioFlashcardsContent,
  StudioMindMapContent,
  StudioMindMapNode,
  StudioQuizContent,
  StudioReportContent,
  StudioTableContent,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import {
  Button,
  ButtonGroup,
  ButtonGroupItem,
  IconButton,
  RichText,
  Table,
  TableCaption,
  TableScroll,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { IconArrowLeft, IconArrowRight, IconCheck, IconClose } from "@/components/ui/icons";
import { CitationChips } from "../AnswerView";

const t = ptBR.notebooks.studio;

/** What every viewer needs to draw a citation chip. */
export interface Cites {
  byNumber: ReadonlyMap<number, NotebookCitation>;
  liveSourceIds: ReadonlySet<number>;
}

function Chips({ numbers, cites }: { numbers: number[]; cites: Cites }) {
  return <CitationChips numbers={numbers} byNumber={cites.byNumber} liveSourceIds={cites.liveSourceIds} />;
}

// --- Relatório ------------------------------------------------------------------

export function ReportView({
  content,
  bullets,
  cites,
}: {
  content: StudioReportContent;
  /** The "Tópicos" format: each paragraph is an item. */
  bullets: boolean;
  cites: Cites;
}) {
  return (
    <div className="flex flex-col gap-4">
      {content.sections.map((section, index) => (
        <section key={index} className="flex flex-col gap-2">
          <h4 className="text-base font-semibold text-ink">{section.heading}</h4>
          {bullets ? (
            <ul className="ml-5 list-disc space-y-1.5">
              {section.paragraphs.map((paragraph, i) => (
                <li key={i}>
                  <RichText
                    text={paragraph.text}
                    trailing={<Chips numbers={paragraph.citations} cites={cites} />}
                  />
                </li>
              ))}
            </ul>
          ) : (
            section.paragraphs.map((paragraph, i) => (
              <RichText
                key={i}
                text={paragraph.text}
                trailing={<Chips numbers={paragraph.citations} cites={cites} />}
              />
            ))
          )}
        </section>
      ))}
    </div>
  );
}

// --- Cartões didáticos ----------------------------------------------------------

function shuffled(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order;
}

/**
 * One card at a time, flipped by a click on it or by the Virar button. The
 * turn is CSS (`rotateY`), switched off under `prefers-reduced-motion`; the
 * hidden face is `aria-hidden`, so a screen reader reads only the side shown.
 * The chips sit below the card, not on it — a chip is a button, and a button
 * inside the clickable card would be two controls in one.
 */
export function FlashcardsView({ content, cites }: { content: StudioFlashcardsContent; cites: Cites }) {
  const total = content.cards.length;
  const [order, setOrder] = useState(() => Array.from({ length: total }, (_, i) => i));
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = content.cards[order[position] ?? 0];
  if (!card) return null;

  const go = (next: number) => {
    setPosition(Math.max(0, Math.min(total - 1, next)));
    setFlipped(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink-muted" aria-live="polite">
        {t.cardPosition(position + 1, total)} · {flipped ? t.backFace : t.frontFace}
      </p>
      <div className="[perspective:1200px]">
        <div
          onClick={() => setFlipped((v) => !v)}
          className={cn(
            "relative min-h-[11rem] cursor-pointer transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none",
            flipped && "[transform:rotateY(180deg)]",
          )}
        >
          <Face hidden={flipped} label={t.frontFace}>
            <p className="text-lg font-semibold text-ink">{card.front}</p>
          </Face>
          <Face hidden={!flipped} label={t.backFace} back>
            <p className="text-ink">{card.back}</p>
          </Face>
        </div>
      </div>
      {flipped && card.citations.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1 text-caption text-ink-muted">
          {t.sources} <Chips numbers={card.citations} cites={cites} />
        </p>
      ) : (
        <p className="text-caption text-ink-muted">{t.cardHint}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label={t.previous}
          icon={<IconArrowLeft />}
          disabled={position === 0}
          onClick={() => go(position - 1)}
        />
        <Button variant="secondary" size="sm" onClick={() => setFlipped((v) => !v)}>
          {t.flip}
        </Button>
        <IconButton
          label={t.next}
          icon={<IconArrowRight />}
          disabled={position === total - 1}
          onClick={() => go(position + 1)}
        />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setOrder(shuffled(total));
            go(0);
          }}
        >
          {t.shuffle}
        </Button>
      </div>
    </div>
  );
}

function Face({
  hidden,
  label,
  back = false,
  children,
}: {
  hidden: boolean;
  label: string;
  back?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className={cn(
        "absolute inset-0 flex flex-col justify-center gap-2 overflow-y-auto rounded-card border p-4 [backface-visibility:hidden]",
        back
          ? "border-brand bg-brand-50 [transform:rotateY(180deg)]"
          : "border-line bg-panel shadow-card",
      )}
    >
      <span className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </span>
      {children}
    </div>
  );
}

// --- Teste ----------------------------------------------------------------------

const letter = (index: number) => String.fromCharCode(97 + index);

/**
 * One question at a time. Choosing locks the question and says, in words and
 * not only in colour, which option was right; "Explicar" opens the
 * explanation with its citations. The score is a count of this screen's own
 * clicks — nothing about the sources is computed here.
 */
export function QuizView({ content, cites }: { content: StudioQuizContent; cites: Cites }) {
  const total = content.questions.length;
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [hints, setHints] = useState<Record<number, boolean>>({});
  const [explained, setExplained] = useState<Record<number, boolean>>({});
  const [finished, setFinished] = useState(false);

  const right = content.questions.filter((q, i) => answers[i] === q.answer_index).length;

  if (finished) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-lg font-semibold text-ink" role="status">
          {t.score(right, total)}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setAnswers({});
            setHints({});
            setExplained({});
            setPosition(0);
            setFinished(false);
          }}
        >
          {t.retake}
        </Button>
      </div>
    );
  }

  const question = content.questions[position];
  if (!question) return null;
  const chosen = answers[position];
  const answered = chosen !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink-muted">{t.questionPosition(position + 1, total)}</p>
      <p className="font-semibold text-ink">{question.prompt}</p>
      <ul className="flex flex-col gap-2" aria-label={t.options}>
        {question.options.map((option, index) => {
          const isRight = index === question.answer_index;
          const isChosen = index === chosen;
          return (
            <li key={index}>
              <button
                type="button"
                disabled={answered}
                aria-pressed={isChosen}
                onClick={() => setAnswers((all) => ({ ...all, [position]: index }))}
                className={cn(
                  "flex w-full items-start gap-2 rounded-control border px-3 py-2 text-left text-sm transition",
                  !answered && "border-edge-control hover:border-brand hover:bg-brand-50",
                  answered && isRight && "border-success bg-success-soft",
                  answered && isChosen && !isRight && "border-danger bg-danger-soft",
                  answered && !isRight && !isChosen && "border-line opacity-70",
                )}
              >
                <span className="font-semibold">{letter(index)})</span>
                <span className="flex-1">{option}</span>
                {answered && isRight ? (
                  <span className="inline-flex items-center gap-1 text-caption font-semibold text-success-fg">
                    <IconCheck className="h-4 w-4" /> {t.rightAnswer}
                  </span>
                ) : null}
                {answered && isChosen && !isRight ? (
                  <span className="inline-flex items-center gap-1 text-caption font-semibold text-danger-fg">
                    <IconClose className="h-4 w-4" /> {t.yourAnswer}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="text-sm font-semibold text-ink">
        {answered
          ? chosen === question.answer_index
            ? t.correct
            : t.wrong(letter(question.answer_index))
          : ""}
      </p>
      {!answered && question.hint ? (
        hints[position] ? (
          <p className="well text-support text-ink">{question.hint}</p>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setHints((all) => ({ ...all, [position]: true }))}
          >
            {t.hint}
          </Button>
        )
      ) : null}
      {answered ? (
        explained[position] ? (
          <div className="well flex flex-col gap-1 text-support text-ink">
            {question.explanation ? <p>{question.explanation}</p> : null}
            <p className="flex flex-wrap items-center gap-1 text-caption text-ink-muted">
              {t.sources} <Chips numbers={question.citations} cites={cites} />
            </p>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setExplained((all) => ({ ...all, [position]: true }))}
          >
            {t.explain}
          </Button>
        )
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={position === 0}
          onClick={() => setPosition(position - 1)}
        >
          {t.previousQuestion}
        </Button>
        {position < total - 1 ? (
          <Button variant="secondary" size="sm" onClick={() => setPosition(position + 1)}>
            {t.nextQuestion}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setFinished(true)}>
            {t.finish}
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Tabela de dados ------------------------------------------------------------

/** Every cell says what it is: a value with its source, the sources' silence,
 * or the check's refusal — never an empty cell (D-24). */
export function TableView({
  content,
  title,
  cites,
}: {
  content: StudioTableContent;
  title: string;
  cites: Cites;
}) {
  return (
    <TableScroll label={t.tableLabel(title)}>
      <Table>
        <TableCaption>{t.tableLabel(title)}</TableCaption>
        <THead>
          <Tr>
            {content.columns.map((column) => (
              <Th key={column} scope="col">
                {column}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {content.rows.map((row, r) => (
            <Tr key={r}>
              {row.cells.map((cell, c) => (
                <Td key={c}>
                  {cell.status === "ok" ? (
                    <>
                      {cell.text} <Chips numbers={cell.citations} cites={cites} />
                    </>
                  ) : (
                    <span
                      className={cn(
                        "text-caption italic",
                        cell.status === "omitida" ? "text-warning-fg" : "text-ink-subtle",
                      )}
                    >
                      {cell.status === "omitida" ? t.withheldCell : t.absent}
                    </span>
                  )}
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

// --- Mapa mental ----------------------------------------------------------------

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5];

/**
 * The map drawn from the API's layout — node boxes, wrapped lines and edge end
 * points all come computed; this only draws them. Its text alternative is the
 * list (D-31), a toggle away. A branch is a button: it brings a question about
 * itself to the chat box, without sending it (sending spends the day's quota).
 */
export function MindMapView({
  content,
  layout,
  title,
  cites,
  onAsk,
}: {
  content: StudioMindMapContent;
  layout: MindMapLayout;
  title: string;
  cites: Cites;
  onAsk?: (question: string) => void;
}) {
  const [view, setView] = useState<"map" | "list">("map");
  const [zoom, setZoom] = useState(2);
  const scale = ZOOMS[zoom] ?? 1;
  const ask = onAsk ? (label: string) => onAsk(t.askPrompt(label)) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonGroup label={t.viewLabel}>
          <ButtonGroupItem selected={view === "map"} label={t.viewMap} onClick={() => setView("map")} />
          <ButtonGroupItem selected={view === "list"} label={t.viewList} onClick={() => setView("list")} />
        </ButtonGroup>
        {view === "map" ? (
          <span className="ml-auto flex items-center gap-1">
            <IconButton
              size="sm"
              label={t.zoomOut}
              icon={<span aria-hidden>−</span>}
              disabled={zoom === 0}
              onClick={() => setZoom(zoom - 1)}
            />
            <IconButton
              size="sm"
              label={t.zoomIn}
              icon={<span aria-hidden>+</span>}
              disabled={zoom === ZOOMS.length - 1}
              onClick={() => setZoom(zoom + 1)}
            />
          </span>
        ) : null}
      </div>
      {ask ? <p className="text-caption text-ink-muted">{t.mapHint}</p> : null}
      {view === "map" ? (
        <MindMapDrawing layout={layout} title={title} scale={scale} onAsk={ask} />
      ) : content.root ? (
        <ul className="flex flex-col gap-1">
          <MindMapItem node={content.root} cites={cites} onAsk={ask} />
        </ul>
      ) : null}
    </div>
  );
}

function MindMapDrawing({
  layout,
  title,
  scale,
  onAsk,
}: {
  layout: MindMapLayout;
  title: string;
  scale: number;
  onAsk?: (label: string) => void;
}) {
  const levels = useMemo(
    () => [
      "fill-action stroke-action",
      "fill-brand-100 stroke-brand-500",
      "fill-brand-50 stroke-brand-300",
      "fill-panel stroke-line",
    ],
    [],
  );
  return (
    <div className="well max-h-[60vh] overflow-auto p-0">
      <svg
        role="group"
        aria-label={t.mapLabel(title)}
        width={layout.width * scale}
        height={layout.height * scale}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block"
      >
        {layout.edges.map((edge) => {
          const bend = (edge.x2 - edge.x1) / 2;
          return (
            <path
              key={`${edge.source}-${edge.target}`}
              d={`M ${edge.x1} ${edge.y1} C ${edge.x1 + bend} ${edge.y1}, ${edge.x2 - bend} ${edge.y2}, ${edge.x2} ${edge.y2}`}
              className="fill-none stroke-ink-subtle"
              strokeWidth={1.5}
            />
          );
        })}
        {layout.nodes.map((node) => {
          const root = node.depth === 0;
          const box = (
            <>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={10}
                className={levels[Math.min(node.depth, levels.length - 1)]}
              />
              {node.lines.map((line, i) => (
                <text
                  key={i}
                  x={node.x + 12}
                  y={node.y + 22 + i * 17}
                  fontSize={13}
                  className={root ? "fill-action-ink" : "fill-ink"}
                >
                  {line}
                </text>
              ))}
              {node.citations.length > 0 ? (
                <text
                  x={node.x + node.width - 6}
                  y={node.y + node.height - 5}
                  fontSize={9}
                  textAnchor="end"
                  className={root ? "fill-action-ink" : "fill-ink-muted"}
                >
                  {node.citations.map((n) => `[${n}]`).join(" ")}
                </text>
              ) : null}
            </>
          );
          if (!onAsk) return <g key={node.id}>{box}</g>;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={t.askAbout(node.label)}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3px] hover:opacity-90"
              onClick={() => onAsk(node.label)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onAsk(node.label);
                }
              }}
            >
              {box}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MindMapItem({
  node,
  cites,
  onAsk,
}: {
  node: StudioMindMapNode;
  cites: Cites;
  onAsk?: (label: string) => void;
}) {
  return (
    <li>
      <span className="inline-flex flex-wrap items-center gap-1">
        {onAsk ? (
          <button
            type="button"
            aria-label={t.askAbout(node.label)}
            onClick={() => onAsk(node.label)}
            className="rounded-control px-1 text-left text-sm text-ink hover:bg-brand-50 hover:text-brand-800"
          >
            {node.label}
          </button>
        ) : (
          <span className="text-sm text-ink">{node.label}</span>
        )}
        <Chips numbers={node.citations} cites={cites} />
      </span>
      {node.children.length > 0 ? (
        <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-line pl-3">
          {node.children.map((child, i) => (
            <MindMapItem key={i} node={child} cites={cites} onAsk={onAsk} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
