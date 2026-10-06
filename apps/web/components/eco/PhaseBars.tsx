"use client";

import { useMemo } from "react";
import { formatNumber } from "@/lib/format";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import { cn } from "@/lib/cn";

export interface PhaseBarItem {
  seriesName: string;
  value: number | null;
  reason?: string | null;
  tone?: "primary" | "secondary";
}

export interface PhaseBarRow {
  phase: string;
  label: string;
  items: PhaseBarItem[];
}

export interface PhaseBarsProps {
  title: string;
  unit: string;
  rows: PhaseBarRow[];
  caption?: string;
  className?: string;
}

/**
 * Calculates percentage width (0 to 100) for a given value relative to the maximum
 * positive magnitude observed in the dataset.
 */
export function calculateBarWidth(value: number | null, maxMagnitude: number): number {
  if (value === null || !Number.isFinite(value) || maxMagnitude <= 0) {
    return 0;
  }
  const fraction = Math.abs(value) / maxMagnitude;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(clamped * 1000) / 10;
}

/**
 * Accessible horizontal bar chart showing Eco Audit impact per life-cycle phase.
 * Supports both single-material audits and side-by-side material comparisons.
 */
export function PhaseBars({
  title,
  unit,
  rows,
  caption,
  className,
}: PhaseBarsProps) {
  const maxMagnitude = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      for (const item of row.items) {
        if (item.value !== null && Number.isFinite(item.value)) {
          max = Math.max(max, Math.abs(item.value));
        }
      }
    }
    return max > 0 ? max : 1;
  }, [rows]);

  const seriesNames = useMemo(() => {
    const seen = new Set<string>();
    const list: { name: string; tone: "primary" | "secondary" }[] = [];
    for (const row of rows) {
      for (const item of row.items) {
        if (!seen.has(item.seriesName)) {
          seen.add(item.seriesName);
          list.push({
            name: item.seriesName,
            tone: item.tone ?? (list.length === 0 ? "primary" : "secondary"),
          });
        }
      }
    }
    return list;
  }, [rows]);

  const hasMultipleSeries = seriesNames.length > 1;

  return (
    <figure
      className={cn("well flex flex-col gap-3 p-4", className)}
      role="figure"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          {caption && <p className="text-xs text-ink-muted">{caption}</p>}
        </div>
        {hasMultipleSeries && (
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            {seriesNames.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-3 w-3 rounded-xs",
                    s.tone === "secondary"
                      ? "bg-amber-600 dark:bg-amber-500"
                      : "bg-brand-600 dark:bg-brand-500",
                  )}
                  aria-hidden
                />
                <span className="font-medium text-ink">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.phase}
            className="flex flex-col gap-1.5 border-b border-edge-subtle py-2 last:border-b-0"
          >
            <div className="flex items-center justify-between text-xs font-medium text-ink sm:text-sm">
              <span>{row.label}</span>
            </div>
            <div className="flex flex-col gap-1">
              {row.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  {hasMultipleSeries && (
                    <span
                      className="w-24 shrink-0 truncate font-medium text-ink-muted sm:w-32"
                      title={item.seriesName}
                    >
                      {item.seriesName}
                    </span>
                  )}
                  {item.value === null ? (
                    <div className="flex flex-1 items-center">
                      <span className="text-xs italic text-ink-muted">
                        {item.reason ?? ecoPhaseI18n.notCalculated}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center gap-2">
                      <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-sunken">
                        <div
                          className={cn(
                            "h-full rounded transition-all duration-300",
                            item.value < 0
                              ? "bg-success"
                              : item.tone === "secondary"
                                ? "bg-amber-600 dark:bg-amber-500"
                                : "bg-brand-600 dark:bg-brand-500",
                          )}
                          style={{
                            width: `${calculateBarWidth(item.value, maxMagnitude)}%`,
                          }}
                          role="meter"
                          aria-valuenow={item.value}
                          aria-label={`${row.label} - ${item.seriesName}: ${formatNumber(item.value)} ${unit}`}
                        />
                      </div>
                      <span className="min-w-[4.5rem] shrink-0 text-right font-medium tabular-nums text-ink">
                        {formatNumber(item.value)} {unit}
                        {item.value < 0 && (
                          <span className="ml-1 text-[10px] font-semibold text-success-fg">
                            ({ecoPhaseI18n.creditBadge})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
