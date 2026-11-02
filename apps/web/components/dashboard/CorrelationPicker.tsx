"use client";

import type { PropertyCoverage } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { Button, ToggleChip } from "@/components/ui";

/**
 * Which properties the correlation matrix reads (D-193). `null` is the
 * server's default (the 12 best-covered textbook properties of the level);
 * picking chips sends an explicit list. Closed by default: the matrix is
 * readable without touching it, and 48 chips are not the first thing to read.
 */
export function CorrelationPicker({
  properties,
  chosen,
  onChange,
}: {
  properties: PropertyCoverage[];
  chosen: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const selected = new Set(chosen ?? []);
  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(next.size === 0 ? null : properties.filter((p) => next.has(p.slug)).map((p) => p.slug));
  };

  return (
    <details className="well rounded-card p-4">
      <summary className="cursor-pointer text-support font-medium">{d.correlation.pick}</summary>
      <p className="mt-2 text-caption text-ink-muted">{d.correlation.pickHint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {properties.map((p) => (
          <ToggleChip key={p.slug} selected={selected.has(p.slug)} aria-pressed={selected.has(p.slug)} onClick={() => toggle(p.slug)}>
            {p.name}
          </ToggleChip>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => onChange(properties.map((p) => p.slug))}>
          {d.correlation.all}
        </Button>
        <Button variant="ghost" size="sm" disabled={chosen === null} onClick={() => onChange(null)}>
          {d.correlation.reset}
        </Button>
      </div>
    </details>
  );
}
