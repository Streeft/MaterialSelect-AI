import { Bar } from "@/components/ui";
import { ptBR } from "@/lib/i18n";

const t = ptBR.selection;

/**
 * Bar widths on this screen are proportions of numbers the backend already
 * computed — how many survived out of how many started, how much of a score
 * came from one criterion. Nothing here derives a new quantity; the ratio only
 * decides how wide an element is (ADR 0004).
 */
export function percent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

/** One stage of the elimination: a bar, what it kept, and what it dropped. */
export function FunnelRow({
  label,
  remaining,
  initial,
  eliminated,
  tone = "brand",
  undetermined = null,
  withoutLevel = null,
}: {
  undetermined?: number | null;
  /** D-126: candidates with no level recorded, written so "no level" never reads as "too poor". */
  withoutLevel?: number | null;
  label: string;
  remaining: number;
  initial: number;
  eliminated: number | null;
  tone?: "brand" | "neutral";
}) {
  return (
    <li className="grid grid-cols-[minmax(5rem,9rem)_minmax(0,1fr)_auto] items-center gap-3">
      <span className="truncate text-xs text-ink-muted" title={label}>
        {label}
      </span>
      <Bar
        value={percent(remaining, initial) / 100}
        color={tone === "brand" ? "bg-brand" : "bg-ink-subtle"}
        className="h-2.5"
      />
      <span className="text-xs tabular-nums text-ink">
        <strong>{remaining}</strong>
        {eliminated !== null && eliminated > 0 ? (
          <span className="ml-1.5 text-2xs font-normal text-ink-subtle">
            −{eliminated} {t.eliminated}
          </span>
        ) : null}
        {undetermined ? (
          <span className="ml-1.5 text-2xs font-normal text-ink-subtle">
            ({t.undeterminedNote(undetermined)})
          </span>
        ) : null}
        {withoutLevel ? (
          <span className="ml-1.5 text-2xs font-normal text-ink-subtle">
            ({t.withoutLevelNote(withoutLevel)})
          </span>
        ) : null}
      </span>
    </li>
  );
}
