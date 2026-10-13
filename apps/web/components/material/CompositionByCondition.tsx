"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AtomicComposition, CompositionEntry } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { compositionConditions, conditionOf } from "@/lib/composition";
import { ButtonGroup, ButtonGroupItem } from "@/components/ui";
import { CompositionTable } from "@/components/material/CompositionTable";

const t = ptBR.detail;

/** The URL parameter that keeps the chosen condition, so a link reopens it. */
export const CONDITION_PARAM = "condicao";

/**
 * The composition on the sheet, one condition at a time (TM2-c, D-117).
 *
 * A material may state its composition for several conditions ("fundido",
 * "laminado"); each is a composition of its own, with its own derived atomic
 * percent. The picker appears only when there is more than one, and the choice
 * lives in the URL. "No condition stated" is the absence of the parameter; a
 * stale or unknown value falls back to the first condition rather than to an
 * empty table that would read as "no composition".
 */
export function CompositionByCondition({
  entries,
  atomic,
  materialIsDemo,
}: {
  entries: CompositionEntry[];
  atomic: AtomicComposition[] | undefined;
  materialIsDemo: boolean;
}) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const conditions = compositionConditions(entries);
  const asked = search.get(CONDITION_PARAM);
  const selected: string | null =
    asked !== null && conditions.includes(asked) ? asked : (conditions[0] ?? null);

  const choose = (label: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (label === null) next.delete(CONDITION_PARAM);
    else next.set(CONDITION_PARAM, label);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const rows = entries.filter((entry) => conditionOf(entry) === selected);
  const block = atomic?.find((a) => (a.condition_label ?? null) === selected);

  return (
    <div className="flex flex-col gap-3">
      {conditions.length > 1 && (
        <ButtonGroup label={t.conditionPicker} className="self-start">
          {conditions.map((label) => (
            <ButtonGroupItem
              key={label ?? ""}
              selected={label === selected}
              label={label ?? t.conditionNone}
              onClick={() => choose(label)}
            />
          ))}
        </ButtonGroup>
      )}
      <CompositionTable
        entries={rows}
        materialIsDemo={materialIsDemo}
        conditionLabel={selected}
        atomic={block}
      />
    </div>
  );
}
