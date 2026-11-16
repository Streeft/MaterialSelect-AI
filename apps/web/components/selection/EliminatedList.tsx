"use client";

import Link from "next/link";
import type { EliminatedRecord, SelectionUniverse } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { materialHref } from "@/lib/ai/plan";
import { Badge, EmptyState, Section } from "@/components/ui";

const t = ptBR.selection;

interface Group {
  reason: string;
  records: EliminatedRecord[];
}

/**
 * Group the server's list by the funnel line that removed each record, in the
 * order the server sent it (pipeline order). Grouping is presentation: every
 * reason and every flag comes from the run, nothing is re-evaluated here.
 */
export function groupByReason(records: EliminatedRecord[]): Group[] {
  const groups = new Map<string, EliminatedRecord[]>();
  for (const record of records) {
    const list = groups.get(record.reason);
    if (list) list.push(record);
    else groups.set(record.reason, [record]);
  }
  return [...groups].map(([reason, list]) => ({ reason, records: list }));
}

/**
 * Which material fell, and at which step (D-240). One `<details>` per funnel
 * line, closed by default: a catalogue of hundreds would otherwise bury the
 * rest of the tab. A material that held no datum for the step says so in
 * words — absence is never shown as a value.
 */
export function EliminatedList({
  records,
  universe,
}: {
  records: EliminatedRecord[];
  universe: SelectionUniverse;
}) {
  const groups = groupByReason(records);
  return (
    <Section id="reprovados" title={t.whyOutTitle} description={t.whyOutHint}>
      {groups.length === 0 ? (
        <EmptyState title={t.whyOutNone} />
      ) : (
        <ul className="divide-y divide-edge rounded-card border border-edge">
          {groups.map((group) => {
            const missing = group.records.filter((r) => r.missing_data).length;
            return (
              <li key={group.reason}>
                <details className="group">
                  <summary className="m3-state flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                    <span className="font-medium text-ink">{group.reason}</span>
                    <span className="text-caption tabular-nums text-ink-muted">
                      {t.whyOutCount(group.records.length)}
                    </span>
                    {missing > 0 && (
                      <Badge tone="neutral">{t.whyOutMissingCount(missing)}</Badge>
                    )}
                  </summary>
                  <ul className="space-y-1 px-4 pb-3">
                    {group.records.map((r) => (
                      <li key={r.record_id} className="flex flex-wrap items-baseline gap-x-2">
                        {universe === "material" ? (
                          <Link href={materialHref(r.record_id)} className="font-medium text-brand hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span>{r.name}</span>
                        )}
                        <span className="text-caption text-ink-muted">{r.class_name}</span>
                        {r.missing_data && (
                          <span className="text-caption italic text-ink-muted">
                            {t.whyOutMissing}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
