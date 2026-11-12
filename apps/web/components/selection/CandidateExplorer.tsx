"use client";

import { useState } from "react";
import type { RunResult } from "@/lib/types";
import { Alert, Badge, Button, ButtonLink, Checkbox, Section } from "@/components/ui";
import { encodeIdList } from "@/lib/idList";
import { explainCandidate } from "@/lib/selection/explain";
import { ptBR } from "@/lib/i18n";
import { wizardText } from "@/lib/i18n-selection-wizard";

const t = ptBR.selection;
const w = wizardText.explain;

/** Rows shown before "Mostrar todos": a catalogue can leave hundreds standing. */
const FIRST_ROWS = 30;

/**
 * Results, material by material (D-210): why each one is still standing, and
 * the two places a shortlist goes next — the map and the comparator — for the
 * ones the reader ticks. The sentences come from `explainCandidate`, which
 * only reads the run's answer.
 */
export function CandidateExplorer({ result }: { result: RunResult }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { candidates } = result;
  const isMaterialStudy = result.universe === "material";

  if (candidates.length === 0) {
    return <Alert tone="warning">{w.empty}</Alert>;
  }

  const shown = showAll ? candidates : candidates.slice(0, FIRST_ROWS);
  const toggle = (id: number, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, id] : current.filter((x) => x !== id),
    );
  // Ids in the backend's order, so the link carries the ranking, not the clicks.
  const orderedSelection = candidates.map((c) => c.record_id).filter((id) => selected.includes(id));
  const topSelected = candidates.find((c) => selected.includes(c.record_id) && c.rank === 1)?.record_id;

  return (
    <Section title={w.title} description={w.hint}>
      <div className="space-y-4">
        {isMaterialStudy ? (
          <div
            role="group"
            aria-label={w.selected(selected.length)}
            className="flex flex-wrap items-center gap-3 rounded-card border border-edge bg-surface-raised px-4 py-3"
          >
            <span className="text-support text-ink-muted" aria-live="polite">
              {w.selected(selected.length)}
            </span>
            {orderedSelection.length >= 1 ? (
              <ButtonLink
                variant="secondary"
                href={`/app/mapas?materiais=${orderedSelection.join(",")}${
                  topSelected ? `&destaque=${topSelected}` : ""
                }`}
              >
                {w.openMap}
              </ButtonLink>
            ) : (
              <Button variant="secondary" disabled title={w.mapNeedsOne}>
                {w.openMap}
              </Button>
            )}
            {orderedSelection.length >= 2 ? (
              <ButtonLink variant="secondary" href={`/app/comparar?materiais=${encodeIdList(orderedSelection)}`}>
                {w.compareSelected}
              </ButtonLink>
            ) : (
              <Button variant="secondary" disabled title={w.compareNeedsTwo}>
                {w.compareSelected}
              </Button>
            )}
            {orderedSelection.length < 2 && (
              <span className="basis-full text-caption text-ink-muted">
                {orderedSelection.length === 0 ? w.mapNeedsOne : w.compareNeedsTwo}
              </span>
            )}
          </div>
        ) : (
          <p className="text-caption text-ink-muted">{w.processNoMap}</p>
        )}

        <ul className="divide-y divide-edge-subtle rounded-card border border-edge">
          {shown.map((c) => {
            const expanded = open === c.record_id;
            const panelId = `explicacao-${c.record_id}`;
            return (
              <li key={c.record_id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  {isMaterialStudy ? (
                    <Checkbox
                      label={<span className="sr-only">{w.selectAria(c.name)}</span>}
                      checked={selected.includes(c.record_id)}
                      onChange={(e) => toggle(c.record_id, e.target.checked)}
                    />
                  ) : null}
                  {c.rank !== null && (
                    <Badge tone={c.rank === 1 ? "success" : "neutral"}>
                      {t.rank} {c.rank}
                    </Badge>
                  )}
                  <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                    {c.name}
                    <span className="ml-2 text-caption font-normal text-ink-muted">{c.class_name}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={expanded}
                    aria-controls={expanded ? panelId : undefined}
                    onClick={() => setOpen(expanded ? null : c.record_id)}
                  >
                    {w.toggle(c.name)}
                  </Button>
                </div>
                {expanded && (
                  <ul id={panelId} className="mt-2 list-disc space-y-1 pl-6 text-support text-ink-muted">
                    {explainCandidate(result, c.record_id).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {!showAll && candidates.length > FIRST_ROWS && (
          <Button variant="ghost" onClick={() => setShowAll(true)}>
            {w.showAll(candidates.length)}
          </Button>
        )}
        <p className="text-caption text-ink-muted">{w.eliminatedNote}</p>
      </div>
    </Section>
  );
}
