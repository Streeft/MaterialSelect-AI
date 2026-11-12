import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { tok } from "@/components/charts/figureKit";

const t = ptBR.solver.diagram;

type Kind = keyof typeof t.kinds;

/** The geometry a case belongs to, from its catalogue key (`viga-rigidez`, `coluna-circular-flambagem`…). */
export function loadCaseKind(caseKey: string): Kind | null {
  if (caseKey.startsWith("tirante")) return "tie";
  if (caseKey.startsWith("placa")) return "plate";
  if (caseKey.startsWith("viga")) return "beam";
  if (caseKey.startsWith("coluna")) return "column";
  return null;
}

const W = 320;
const H = 150;
const INK = tok("--ink");
const MUTED = tok("--ink-muted");
const LOAD = tok("--brand-600");

type End = "fixed" | "pin" | "free";

/** Which end of the member is held how, by the catalogue's support key. */
function ends(kind: Kind, support: string | null): { a: End; b: End; centre: boolean } {
  if (kind === "beam" || kind === "plate") {
    if (support === "biapoiada-central") return { a: "pin", b: "pin", centre: true };
    if (support === "biengastada-central") return { a: "fixed", b: "fixed", centre: true };
    return { a: "fixed", b: "free", centre: false };
  }
  if (kind === "column") {
    if (support === "engastada-livre") return { a: "fixed", b: "free", centre: false };
    if (support === "engastada-rotulada") return { a: "fixed", b: "pin", centre: false };
    if (support === "biengastada") return { a: "fixed", b: "fixed", centre: false };
    return { a: "pin", b: "pin", centre: false };
  }
  return { a: "fixed", b: "free", centre: false };
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  label,
  lx,
  ly,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  lx?: number;
  ly?: number;
}) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 8;
  const p = (a: number) => `${x2 - head * Math.cos(angle - a)},${y2 - head * Math.sin(angle - a)}`;
  return (
    <g stroke={LOAD} strokeWidth={2.5} fill={LOAD}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polygon points={`${x2},${y2} ${p(0.45)} ${p(-0.45)}`} stroke="none" />
      {label ? (
        <text x={lx ?? x1} y={ly ?? y1} stroke="none" fontSize={13} fontWeight={600} textAnchor="middle">
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** A wall: a vertical bar with hatching on its far side. */
function Wall({ x, y, h, side }: { x: number; y: number; h: number; side: 1 | -1 }) {
  const lines: ReactNode[] = [];
  for (let i = 0; i <= h; i += 10) {
    lines.push(
      <line key={i} x1={x} y1={y + i} x2={x + side * 9} y2={y + i + 9} stroke={MUTED} strokeWidth={1} />,
    );
  }
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + h} stroke={INK} strokeWidth={3} />
      {lines}
    </g>
  );
}

function Pin({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={INK} strokeWidth={2} fill="none">
      <polygon points={`${x},${y} ${x - 9},${y + 16} ${x + 9},${y + 16}`} />
      <line x1={x - 14} y1={y + 18} x2={x + 14} y2={y + 18} stroke={MUTED} />
    </g>
  );
}

function Dimension({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g stroke={MUTED} strokeWidth={1} fill={MUTED}>
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 5} x2={x1} y2={y + 5} />
      <line x1={x2} y1={y - 5} x2={x2} y2={y + 5} />
      <text x={(x1 + x2) / 2} y={y - 6} stroke="none" fontSize={12} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function Horizontal({ kind, support }: { kind: Kind; support: string | null }) {
  const { a, b, centre } = ends(kind, support);
  const left = 40;
  const right = 280;
  const y = 70;
  const mid = (left + right) / 2;
  return (
    <>
      {kind === "plate" ? (
        <rect x={left} y={y - 5} width={right - left} height={10} fill={tok("--surface-sunken")} stroke={INK} strokeWidth={2} />
      ) : (
        <line x1={left} y1={y} x2={right} y2={y} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      )}
      {a === "fixed" ? <Wall x={left} y={y - 24} h={48} side={-1} /> : <Pin x={left} y={y + 4} />}
      {b === "fixed" ? <Wall x={right} y={y - 24} h={48} side={1} /> : null}
      {b === "pin" ? <Pin x={right} y={y + 4} /> : null}
      {kind === "tie" ? (
        <>
          <Arrow x1={right} y1={y} x2={right + 28} y2={y} label={t.load} lx={right + 18} ly={y - 10} />
          <Dimension x1={left} x2={right} y={y + 36} label={t.span} />
        </>
      ) : (
        <>
          <Arrow
            x1={centre ? mid : right}
            y1={y - 44}
            x2={centre ? mid : right}
            y2={y - 8}
            label={t.load}
            lx={(centre ? mid : right) + 14}
            ly={y - 30}
          />
          <Dimension x1={left} x2={right} y={y + 46} label={t.span} />
        </>
      )}
    </>
  );
}

function Vertical({ support }: { support: string | null }) {
  const { a, b } = ends("column", support);
  const x = 160;
  const top = 26;
  const bottom = 112;
  return (
    <>
      <line x1={x} y1={top} x2={x} y2={bottom} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      {a === "fixed" ? (
        <g>
          <line x1={x - 22} y1={bottom + 2} x2={x + 22} y2={bottom + 2} stroke={INK} strokeWidth={3} />
          {[-18, -8, 2, 12].map((dx) => (
            <line key={dx} x1={x + dx} y1={bottom + 2} x2={x + dx - 8} y2={bottom + 11} stroke={MUTED} />
          ))}
        </g>
      ) : (
        <Pin x={x} y={bottom + 2} />
      )}
      {b === "fixed" ? <line x1={x - 16} y1={top} x2={x + 16} y2={top} stroke={INK} strokeWidth={3} /> : null}
      {b === "pin" ? <circle cx={x} cy={top} r={4} fill="none" stroke={INK} strokeWidth={2} /> : null}
      <Arrow x1={x} y1={4} x2={x} y2={top - 4} label={t.load} lx={x + 14} ly={16} />
      <g stroke={MUTED} strokeWidth={1} fill={MUTED}>
        <line x1={x + 48} y1={top} x2={x + 48} y2={bottom} />
        <line x1={x + 43} y1={top} x2={x + 53} y2={top} />
        <line x1={x + 43} y1={bottom} x2={x + 53} y2={bottom} />
        <text x={x + 62} y={(top + bottom) / 2 + 4} stroke="none" fontSize={12}>
          {t.span}
        </text>
      </g>
    </>
  );
}

/**
 * A static sketch of the chosen load case (D-216): where the span, the support
 * and the load are, in the one picture an engineer expects to see before typing
 * numbers. It is illustration only — no value is drawn to scale, no number is
 * computed here — and it says so in its caption.
 *
 * The case's geometry comes from its catalogue key and the support from the
 * support condition the reader chose, so changing "Apoio e carregamento" redraws
 * the picture. A case whose key this does not know draws nothing rather than a
 * wrong sketch.
 */
export function LoadCaseDiagram({
  caseKey,
  supportKey = null,
  supportLabel = null,
}: {
  caseKey: string;
  supportKey?: string | null;
  supportLabel?: string | null;
}) {
  const kind = loadCaseKind(caseKey);
  if (kind === null) return null;
  const name = t.kinds[kind];
  return (
    <figure className="flex flex-col gap-1">
      <svg
        role="img"
        aria-label={t.aria(name, supportLabel)}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-sm"
        data-diagram={kind}
      >
        {kind === "column" ? <Vertical support={supportKey} /> : <Horizontal kind={kind} support={supportKey} />}
      </svg>
      <figcaption className="text-caption text-ink-muted">{t.caption}</figcaption>
    </figure>
  );
}
