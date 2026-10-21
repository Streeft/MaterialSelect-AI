"use client";

import { useQuery } from "@tanstack/react-query";
import { getMaterialOrdinals } from "@/lib/api";
import type { DataQuality, MaterialOrdinalValue } from "@/lib/types";
import { fichaText } from "@/lib/i18n-ficha";
import { cn } from "@/lib/cn";
import {
  Badge,
  DataQualityBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  MissingValue,
} from "@/components/ui";

const t = fichaText.ordinals;

/**
 * The "Propriedades ordinais" section of the material sheet (D-126, ORD-a).
 *
 * An ordinal property is a closed scale of levels, worst first. This section
 * only **shows** what the backend sends — the scale as catalogued and the one
 * level the material holds, with source and quality — and invents nothing: the
 * scale is not turned into a number, a level is not guessed from a neighbour,
 * and the two kinds of "no level" are told apart in words (a source that said
 * so, and a property nobody filled in) because neither is the worst level.
 *
 * Four written states before any list: loading, failed, no ordinal property
 * defined at all, and then one block per property.
 */
export function MaterialOrdinals({ materialId }: { materialId: number }) {
  const query = useQuery({
    queryKey: ["material-ordinals", materialId],
    queryFn: () => getMaterialOrdinals(materialId),
    enabled: Number.isFinite(materialId),
  });

  if (query.isLoading) return <LoadingState label={t.loading} />;
  if (query.isError) return <ErrorState title={t.error} onRetry={() => void query.refetch()} />;
  const values = query.data?.values ?? [];
  if (values.length === 0) return <EmptyState title={t.none} description={t.noneHint} />;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {values.map((value) => (
        <OrdinalBlock key={value.slug} value={value} />
      ))}
    </div>
  );
}

function OrdinalBlock({ value }: { value: MaterialOrdinalValue }) {
  const hasLevel = value.status === "nivel" && value.level !== null;
  return (
    <div className="well flex min-w-0 flex-col gap-2" data-ordinal={value.slug} data-status={value.status}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body font-semibold text-ink">{value.name}</h3>
        {value.is_demo ? <Badge tone="neutral">{t.demo}</Badge> : null}
      </div>

      {hasLevel ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-support text-ink-subtle">{t.levelLabel}</span>
          <span className="text-body font-semibold text-ink">{value.level}</span>
          {value.data_quality ? (
            <DataQualityBadge state={value.data_quality as DataQuality} />
          ) : null}
        </div>
      ) : (
        // Written, never a dash or a blank (D-24): the backend's own sentence,
        // then what it does not mean.
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <MissingValue />
            <span className="text-body text-ink">{value.status_text}</span>
          </div>
          <p className="text-support text-ink-muted">
            {value.status === "ausente" ? t.absentHint : t.noDataHint}
          </p>
        </div>
      )}

      {value.scale.length > 0 ? (
        <ol
          aria-label={t.scaleLabel(value.name)}
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {value.scale.map((level) => {
            const held = hasLevel && level === value.level;
            return (
              <li
                key={level}
                aria-current={held ? "true" : undefined}
                data-held={held ? "" : undefined}
                // The held level is told apart by fill, weight and an outline
                // as well as by the sentence above — never by colour alone.
                className={cn(
                  "rounded-control border px-2 py-0.5 text-support",
                  held
                    ? "border-action bg-action font-semibold text-action-ink"
                    : "border-line bg-panel text-ink-muted",
                )}
              >
                {level}
                {held ? <span className="sr-only"> ({t.thisLevel})</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="flex flex-col gap-0.5 text-caption text-ink-muted">
        {value.source_label ? (
          <p>{t.source(value.source_label)}</p>
        ) : hasLevel ? (
          <p>{t.noSource}</p>
        ) : null}
        {value.measurement_condition ? <p>{t.condition(value.measurement_condition)}</p> : null}
        {value.notes ? <p>{t.note(value.notes)}</p> : null}
      </div>
    </div>
  );
}
