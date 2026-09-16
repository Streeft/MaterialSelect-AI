import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import type { DataQuality } from "@/lib/types";
import {
  IconQualityEstimated,
  IconQualityImported,
  IconQualityMeasured,
  IconQualityMissing,
} from "./icons";

/**
 * The distinction the proposal promises (§3.3): imported, estimated and absent
 * data are told apart *in the interface*, not only in the export.
 *
 * Three cues, always together and in this order of reliability:
 *   1. the written label — survives colour blindness, greyscale and low vision;
 *   2. the glyph — distinguishable at 12 px and in monochrome;
 *   3. the colour — fastest to scan, and the first thing a reader loses.
 *
 * A badge that showed only a coloured dot would put the whole distinction in
 * the channel that fails first. That is why `showLabel={false}` still emits the
 * label to assistive technology.
 */

/** The backend's three qualities plus absence, which is not one of them. */
export type QualityState = DataQuality | "AUSENTE";

const STYLES: Record<QualityState, { box: string; icon: ReactNode }> = {
  MEDIDO: {
    box: "border-quality-medido/35 bg-quality-medido-soft text-quality-medido",
    icon: <IconQualityMeasured className="h-3.5 w-3.5" />,
  },
  IMPORTADO: {
    box: "border-quality-importado/35 bg-quality-importado-soft text-quality-importado",
    icon: <IconQualityImported className="h-3.5 w-3.5" />,
  },
  ESTIMADO: {
    box: "border-quality-estimado/35 bg-quality-estimado-soft text-quality-estimado",
    icon: <IconQualityEstimated className="h-3.5 w-3.5" />,
  },
  AUSENTE: {
    // Dashed, so absence reads as a hole even with no colour at all.
    box: "border-dashed border-quality-ausente/50 bg-quality-ausente-soft text-quality-ausente",
    icon: <IconQualityMissing className="h-3.5 w-3.5" />,
  },
};

export function DataQualityBadge({
  state,
  showLabel = true,
  className,
}: {
  state: QualityState;
  /** Hides the label visually. It stays available to assistive technology. */
  showLabel?: boolean;
  className?: string;
}) {
  const s = STYLES[state];
  const label = ptBR.quality[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-2xs font-medium leading-4",
        s.box,
        className,
      )}
    >
      {s.icon}
      <span className={showLabel ? undefined : "sr-only"}>{label}</span>
    </span>
  );
}

/**
 * The value cell for a property that has no value.
 *
 * Exists so that no screen has to decide for itself how to render absence — the
 * moment that decision is local, one table renders a dash, another an empty
 * cell, and the third principle of the project is quietly broken.
 */
export function MissingValue({ className }: { className?: string }) {
  return <DataQualityBadge state="AUSENTE" className={className} />;
}

/** Legend for a screen that shows many values at once. */
export function DataQualityLegend({ className }: { className?: string }) {
  const states: QualityState[] = ["MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE"];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
        {ptBR.provenance.legendTitle}
      </p>
      <dl className="flex flex-col gap-1">
        {states.map((state) => (
          <div key={state} className="flex flex-wrap items-baseline gap-x-2">
            <dt>
              <DataQualityBadge state={state} />
            </dt>
            <dd className="text-2xs text-ink-subtle">{ptBR.qualityHint[state]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
