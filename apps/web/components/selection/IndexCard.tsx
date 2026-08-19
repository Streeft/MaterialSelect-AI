"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { formatScore, prettyUnit } from "@/lib/format";
import { Alert, Badge } from "@/components/ui";
import { IconBook } from "@/components/ui/icons";
import type { PerformanceIndex } from "@/lib/types";

const t = ptBR.indexCard;

/**
 * A performance index as the interface needs to talk about it, whether it came
 * from the catalogue or the user typed it.
 *
 * An index is only valid under the conditions it was derived from — function,
 * geometry, objective and constraint. The API has always carried them in
 * `assumptions`; until now the screen threw them away and showed a bare
 * expression in an `<option>`, which is exactly the "black box" the proposal
 * commits not to be.
 */
export interface IndexDescriptor {
  name: string;
  expression: string;
  /** "maximize" | "minimize" — widened because a run result types it loosely. */
  goal: string;
  description: string | null;
  assumptions: Record<string, string> | null;
  /** Dimension of the result, in canonical units. Always computed server-side. */
  dimension: string | null;
  isCustom: boolean;
}

export function describeIndex(index: PerformanceIndex): IndexDescriptor {
  return {
    name: index.name,
    expression: index.expression,
    goal: index.goal,
    description: index.description,
    assumptions: index.assumptions,
    dimension: index.dimension,
    isCustom: false,
  };
}

/**
 * A user-typed expression. Its assumptions are `null` rather than invented:
 * nobody declared them, and a card that filled them in with something plausible
 * would be asserting a validity condition the system does not know.
 */
export function describeCustomIndex(expression: string, goal: string): IndexDescriptor {
  return {
    name: t.custom,
    expression,
    goal,
    description: null,
    assumptions: null,
    dimension: null,
    isCustom: true,
  };
}

/** The four conditions of validity, in the order an engineer checks them. */
const ASSUMPTION_ORDER: ReadonlyArray<readonly [string, string]> = [
  ["funcao", t.assumptionFuncao],
  ["geometria", t.assumptionGeometria],
  ["objetivo", t.assumptionObjetivo],
  ["restricao", t.assumptionRestricao],
];

const REFERENCE_KEY = "referencia";

interface AssumptionRow {
  key: string;
  label: string;
  value: string;
}

/**
 * Split `assumptions` into the four known conditions, the reference, and
 * whatever else the record happens to carry.
 *
 * Unknown keys are shown rather than dropped: the field is free-form, and an
 * index that declares one more condition would otherwise have it silently
 * hidden — the interface would be claiming the index says less than it does.
 */
function readAssumptions(assumptions: Record<string, string> | null): {
  rows: AssumptionRow[];
  reference: string | null;
} {
  const entries = Object.entries(assumptions ?? {}).filter(([, value]) => value.trim() !== "");
  const byKey = new Map(entries);
  const known = new Set<string>([...ASSUMPTION_ORDER.map(([key]) => key), REFERENCE_KEY]);

  const rows: AssumptionRow[] = [];
  for (const [key, label] of ASSUMPTION_ORDER) {
    const value = byKey.get(key);
    if (value) rows.push({ key, label, value });
  }
  for (const [key, value] of entries) {
    if (!known.has(key)) rows.push({ key, label: humanizeKey(key), value });
  }

  return { rows, reference: byKey.get(REFERENCE_KEY) ?? null };
}

/** For a key nobody translated: `carga_axial` → `Carga axial`. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function goalLabel(goal: string): string {
  return goal === "minimize" ? t.minimize : t.maximize;
}

/** `prettyUnit` renders a dimension; "dimensionless" has no symbol to render. */
function dimensionLabel(dimension: string | null): string | null {
  if (!dimension || dimension === "dimensionless") return null;
  return prettyUnit(dimension);
}

function Expression({ children }: { children: string }) {
  return (
    <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink">
      {children}
    </code>
  );
}

/** Label/value pair, used for both assumptions and derived facts. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-0.5 sm:grid-cols-[8.5rem_1fr]">
      {/* `ink-subtle` clears AA on plain `surface` but not on the brand tint
          this card sits on — measured 4.46:1. The term is small and uppercase,
          so no large-text exemption applies. */}
      <dt className="text-2xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="text-xs text-ink">{children}</dd>
    </div>
  );
}

/** What the map knows about the index contour on the two chosen axes. */
export interface IndexLineFacts {
  available: boolean;
  orientation: "oblique" | "vertical" | null;
  slope: number | null;
  unavailableReason: string | null;
}

/** The slope line, or the reason there is none. Never both, never neither. */
function slopeText(line: IndexLineFacts): ReactNode {
  if (!line.available) return line.unavailableReason ?? t.slopeUnavailable;
  if (line.orientation === "vertical") return t.slopeVertical;
  if (line.slope === null) return t.slopeUnavailable;
  return <span className="tabular-nums">{formatScore(line.slope, 3)}</span>;
}

/**
 * The validity conditions of the selected index, shown without asking for a
 * click.
 *
 * `indexLine` is only passed on the map, and only ever as the backend computed
 * it — the inclination of an index line is calculation, not presentation
 * (ADR 0004).
 */
export function IndexCard({
  index,
  dimension,
  indexLine,
  className,
}: {
  index: IndexDescriptor;
  /** Dimension from a computed result, when there is one. Overrides the catalogue. */
  dimension?: string | null;
  /** The index contour on the current axes, as returned by the map endpoint. */
  indexLine?: IndexLineFacts | null;
  className?: string;
}) {
  const { rows, reference } = readAssumptions(index.assumptions);
  const shownDimension = dimensionLabel(dimension !== undefined ? dimension : index.dimension);

  return (
    <div
      className={cn("rounded-card border border-brand-200 bg-brand-50/60 p-4", className)}
      data-testid="index-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-ink">{index.name}</h3>
        <Badge tone={index.goal === "minimize" ? "info" : "brand"}>{goalLabel(index.goal)}</Badge>
      </div>

      {index.description ? (
        <p className="mt-1 text-xs text-ink-muted">{index.description}</p>
      ) : null}

      <dl className="mt-3 space-y-1.5">
        <Row label={t.expression}>
          <Expression>{index.expression}</Expression>
        </Row>
        {shownDimension ? <Row label={t.dimension}>{shownDimension}</Row> : null}
        {indexLine ? <Row label={t.slope}>{slopeText(indexLine)}</Row> : null}
      </dl>

      {rows.length > 0 ? (
        <>
          <p className="mt-4 text-2xs font-semibold uppercase tracking-wide text-brand-700">
            {t.validity}
          </p>
          <dl className="mt-1.5 space-y-1.5">
            {rows.map((row) => (
              <Row key={row.key} label={row.label}>
                {row.value}
              </Row>
            ))}
          </dl>
          <p className="mt-3 text-2xs text-ink-muted">{t.warning}</p>
        </>
      ) : (
        // Not an error: a custom expression legitimately has no declared
        // conditions. It is stated plainly instead of leaving the reader to
        // assume the index applies anywhere.
        <Alert tone="warning" className="mt-4" title={t.noAssumptions}>
          {t.noAssumptionsHint}
        </Alert>
      )}

      {reference ? (
        <p className="mt-3 flex items-start gap-1.5 text-2xs text-ink-muted">
          <IconBook className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">{t.assumptionReferencia}:</span> {reference}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** The hypotheses an option carries, condensed enough to scan before choosing. */
function OptionSummary({ index }: { index: PerformanceIndex }) {
  const { rows } = readAssumptions(index.assumptions);
  if (rows.length === 0) {
    return <p className="mt-2 text-2xs text-ink-muted">{t.noAssumptions}</p>;
  }
  return (
    <dl className="mt-2 space-y-0.5">
      {rows.slice(0, 3).map((row) => (
        <div key={row.key} className="flex gap-1.5 text-2xs leading-snug">
          <dt className="shrink-0 text-ink-muted">{row.label}:</dt>
          <dd className="text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One selectable option.
 *
 * The hypotheses sit *outside* the `<label>` on purpose. A `<label>` only
 * accepts phrasing content, and the summary is a definition list — nesting it
 * would be invalid markup and would also drag four lines of prose into the
 * radio's accessible name. It is wired as the description instead, so a screen
 * reader announces the index and then why it applies.
 */
function OptionCard({
  name,
  value,
  checked,
  onChange,
  title,
  badge,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  const descriptionId = `${id}-desc`;

  return (
    <div
      onClick={() => onChange(value)}
      className={cn(
        "cursor-pointer rounded-card border p-3 transition",
        // The border carries the state, but never alone: the radio dot is
        // rendered, and the checked option is the one the browser announces.
        checked
          ? "border-brand bg-brand-50 shadow-card"
          : "border-edge bg-surface-raised hover:border-edge-strong",
      )}
    >
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={() => onChange(value)}
          aria-describedby={children ? descriptionId : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 border-edge-strong accent-brand"
        />
        <label htmlFor={id} className="flex-1 cursor-pointer text-sm font-medium text-ink">
          {title}
        </label>
        {badge}
      </div>
      {children ? (
        <div id={descriptionId} className="mt-1 pl-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Index chooser.
 *
 * A `<select>` cannot show why an index applies, so the hypotheses only ever
 * appeared after the choice — if at all. These cards put them where the
 * decision is made.
 */
export function IndexPicker({
  indices,
  value,
  onChange,
  hint,
  customSlot,
  className,
}: {
  indices: PerformanceIndex[];
  /** "none" | index slug | "custom". */
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  /** The expression editor, rendered under the grid when "custom" is chosen. */
  customSlot?: ReactNode;
  className?: string;
}) {
  const name = useId();
  const hintId = useId();

  return (
    <fieldset className={cn("min-w-0", className)} aria-describedby={hint ? hintId : undefined}>
      <legend className="text-sm font-semibold text-ink">{t.selectLabel}</legend>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <OptionCard
          name={name}
          value="none"
          checked={value === "none"}
          onChange={onChange}
          title={t.none}
        >
          <p className="text-2xs text-ink-muted">{t.noneHint}</p>
        </OptionCard>

        {indices.map((index) => (
          <OptionCard
            key={index.slug}
            name={name}
            value={index.slug}
            checked={value === index.slug}
            onChange={onChange}
            title={index.name}
            badge={
              <Badge tone={index.goal === "minimize" ? "info" : "brand"}>
                {goalLabel(index.goal)}
              </Badge>
            }
          >
            <Expression>{index.expression}</Expression>
            <OptionSummary index={index} />
          </OptionCard>
        ))}

        <OptionCard
          name={name}
          value="custom"
          checked={value === "custom"}
          onChange={onChange}
          title={t.custom}
        >
          <p className="text-2xs text-ink-muted">{t.customHint}</p>
        </OptionCard>
      </div>

      {value === "custom" && customSlot ? <div className="mt-3">{customSlot}</div> : null}
    </fieldset>
  );
}
