"use client";

import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import type { CompareCell, DataQuality, PropertyValueOut } from "@/lib/types";
import { DataQualityBadge, type QualityState } from "./DataQualityBadge";
import { Popover } from "./Popover";
import { IconInfo } from "./icons";

/**
 * The full trail behind one number, one gesture away.
 *
 * §3.2 da proposta commits the tool to showing the bibliographic reference for
 * every value used, *in the interface* and not only in the exported report.
 * The backend already returns the whole chain — original value and unit, the
 * canonical value, the Pint conversion that produced it, uncertainty, the
 * measurement condition and the source. Before this component it was rendered
 * as a row of undifferentiated grey micro-text, which is where a reader's eye
 * goes to not read something.
 */

/** Format-agnostic view of a value's provenance, so every surface can feed it. */
export interface Provenance {
  quality: DataQuality | null;
  isMissing: boolean;
  originalValue: number | null;
  originalUnit: string | null;
  normalizedValue: number | null;
  canonicalUnit: string | null;
  conversionMethod: string | null;
  uncertainty: number | null;
  valueMin: number | null;
  valueMax: number | null;
  valueTypical: number | null;
  measurementCondition: string | null;
  sourceLabel: string | null;
  notes: string | null;
}

export function provenanceOfProperty(p: PropertyValueOut): Provenance {
  return {
    quality: p.data_quality,
    isMissing: p.is_missing,
    originalValue: p.value_scalar,
    originalUnit: p.original_unit,
    normalizedValue: p.normalized_value,
    canonicalUnit: p.canonical_unit,
    conversionMethod: p.conversion_method,
    uncertainty: p.uncertainty,
    valueMin: p.value_min,
    valueMax: p.value_max,
    valueTypical: p.value_typical,
    measurementCondition: p.measurement_condition,
    sourceLabel: p.source_label,
    notes: p.notes,
  };
}

export function provenanceOfCell(c: CompareCell, canonicalUnit: string | null): Provenance {
  return {
    quality: c.data_quality,
    isMissing: c.is_missing,
    originalValue: c.original_value,
    originalUnit: c.original_unit,
    normalizedValue: c.value,
    canonicalUnit,
    conversionMethod: c.conversion_method,
    uncertainty: c.uncertainty,
    valueMin: c.value_min,
    valueMax: c.value_max,
    valueTypical: null,
    measurementCondition: c.measurement_condition,
    sourceLabel: c.source_label,
    notes: null,
  };
}

/** Absence is a state of the datum, so it decides the badge too. */
export function qualityState(p: Pick<Provenance, "isMissing" | "quality">): QualityState {
  return p.isMissing || p.quality === null ? "AUSENTE" : p.quality;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-edge-subtle py-1 first:border-t-0">
      <dt className="w-28 shrink-0 text-2xs uppercase tracking-wide text-ink-subtle">{term}</dt>
      <dd className="min-w-0 flex-1 text-xs text-ink">{children}</dd>
    </div>
  );
}

/** The panel body. Split out so the material sheet can render it expanded. */
export function ProvenanceDetails({ p, className }: { p: Provenance; className?: string }) {
  const state = qualityState(p);

  if (p.isMissing) {
    return (
      <div className={cn("space-y-2", className)}>
        <DataQualityBadge state="AUSENTE" />
        <p className="text-xs font-medium text-ink">{ptBR.provenance.missingTitle}</p>
        <p className="text-xs text-ink-muted">{ptBR.provenance.missingBody}</p>
        {p.sourceLabel ? (
          <dl>
            <Row term={ptBR.provenance.source}>{p.sourceLabel}</Row>
          </dl>
        ) : null}
      </div>
    );
  }

  const hasRange = p.valueMin !== null && p.valueMax !== null;

  return (
    <div className={cn("space-y-2", className)}>
      <DataQualityBadge state={state} />
      <dl>
        {hasRange ? (
          <Row term={ptBR.provenance.range}>
            <span className="tabular-nums">
              {formatNumber(p.valueMin as number)} – {formatNumber(p.valueMax as number)}
            </span>{" "}
            {prettyUnit(p.originalUnit)}
          </Row>
        ) : null}
        {p.originalValue !== null ? (
          <Row term={ptBR.provenance.original}>
            <span className="tabular-nums">{formatNumber(p.originalValue)}</span>{" "}
            {prettyUnit(p.originalUnit)}
          </Row>
        ) : null}
        {p.valueTypical !== null ? (
          <Row term={ptBR.provenance.typical}>
            <span className="tabular-nums">{formatNumber(p.valueTypical)}</span>{" "}
            {prettyUnit(p.originalUnit)}
          </Row>
        ) : null}
        {p.normalizedValue !== null ? (
          <Row term={ptBR.provenance.normalized}>
            <span className="tabular-nums">{formatNumber(p.normalizedValue)}</span>{" "}
            {prettyUnit(p.canonicalUnit)}
          </Row>
        ) : null}
        {p.conversionMethod ? (
          <Row term={ptBR.provenance.conversion}>
            <code className="font-mono text-2xs">{p.conversionMethod}</code>
          </Row>
        ) : null}
        {p.uncertainty !== null ? (
          <Row term={ptBR.provenance.uncertainty}>
            <span className="tabular-nums">± {formatNumber(p.uncertainty)}</span>{" "}
            {prettyUnit(p.originalUnit)}
          </Row>
        ) : null}
        {p.measurementCondition ? (
          <Row term={ptBR.provenance.condition}>{p.measurementCondition}</Row>
        ) : null}
        {/* The reference. Shown even when absent, and named as absent: a blank
            line here reads as "no source needed", which is the opposite. */}
        <Row term={ptBR.provenance.source}>
          {p.sourceLabel ?? <span className="text-ink-subtle">{ptBR.provenance.unknown}</span>}
        </Row>
        {p.notes ? <Row term={ptBR.provenance.notes}>{p.notes}</Row> : null}
      </dl>
    </div>
  );
}

/**
 * Trigger + panel. `children` is the visible value; the badge and the affordance
 * are added around it, so a table cell stays a table cell.
 */
export function ProvenancePopover({
  provenance,
  children,
  align = "start",
  className,
}: {
  provenance: Provenance;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <Popover
      label={ptBR.provenance.trigger}
      align={align}
      className={className}
      trigger={
        <span className="inline-flex items-baseline gap-1 border-b border-dashed border-edge-strong">
          {children}
          <IconInfo className="h-3 w-3 shrink-0 translate-y-0.5 text-ink-subtle" />
        </span>
      }
    >
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
        {ptBR.provenance.title}
      </p>
      <ProvenanceDetails p={provenance} />
    </Popover>
  );
}
