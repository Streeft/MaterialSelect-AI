"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  curveExportUrl,
  getMaterialCurve,
  listMaterialCurves,
} from "@/lib/api";
import type { Curve, CurveScale } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { CurveChart } from "@/components/charts/CurveChart";
import { MenuItem } from "@/components/ui/Menu";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectOption,
} from "@/components/ui";

const t = ptBR.curves;

/**
 * The reader's choice of curve, units and scale lives in the page URL (D-70),
 * like the reading units of the properties: a link is the whole question, and
 * whoever opens it draws the same figure.
 */
export const CURVE_PARAMS = {
  curve: "curva",
  x: "curva_x",
  y: "curva_y",
  parameter: "curva_param",
  scale: "curva_escala",
} as const;

/**
 * The "Curvas" section of the material sheet (D-106).
 *
 * Three written states before any figure: loading, failed, and — the one that
 * matters most — **no curve registered**, said in words with the count per
 * kind, never an empty plot or a flat line at zero (D-24). With curves, a
 * picker chooses one; the units and the scale are the figure's own controls,
 * and every choice is a new question to the backend, which converts and lays
 * out the points (ADR 0004).
 */
export function MaterialCurves({ materialId }: { materialId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const list = useQuery({
    queryKey: ["material-curves", materialId],
    queryFn: () => listMaterialCurves(materialId),
    enabled: Number.isFinite(materialId),
  });

  const requested = Number(search.get(CURVE_PARAMS.curve));
  const curves = list.data?.curves ?? [];
  const selected = curves.find((c) => c.id === requested) ?? curves[0];
  // A unit or scale in the URL belongs to the curve it was chosen for; a
  // different curve starts from its own conventions.
  const sameCurve = selected !== undefined && selected.id === requested;
  const reading = {
    x: sameCurve ? search.get(CURVE_PARAMS.x) ?? undefined : undefined,
    y: sameCurve ? search.get(CURVE_PARAMS.y) ?? undefined : undefined,
    parameter: sameCurve ? search.get(CURVE_PARAMS.parameter) ?? undefined : undefined,
    scale: sameCurve
      ? ((search.get(CURVE_PARAMS.scale) as CurveScale | null) ?? undefined)
      : undefined,
  };

  const curve = useQuery({
    queryKey: ["material-curve", materialId, selected?.id, reading.x, reading.y, reading.parameter, reading.scale],
    queryFn: () => getMaterialCurve(materialId, selected!.id, reading),
    enabled: selected !== undefined,
    // Changing a unit keeps the previous figure on screen instead of flashing
    // back to the loading state (the B8 lesson).
    placeholderData: (previous) => previous,
  });

  const update = useCallback(
    (changes: Partial<Record<keyof typeof CURVE_PARAMS, string | null>>) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(changes)) {
        const param = CURVE_PARAMS[key as keyof typeof CURVE_PARAMS];
        if (value) next.set(param, value);
        else next.delete(param);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  if (list.isLoading) return <LoadingState label={t.loading} />;
  if (list.isError) return <ErrorState title={t.error} onRetry={() => void list.refetch()} />;
  if (!list.data) return null;

  const counts = (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-caption text-ink-muted" aria-label={t.kindCounts}>
      {list.data.counts_by_kind.map((count) => (
        <li key={count.kind}>{t.kindCount(count.label, count.count)}</li>
      ))}
    </ul>
  );

  if (list.data.total === 0 || selected === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState title={t.none} description={t.noneHint} />
        {counts}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {curves.length > 1 ? (
        <Select
          label={t.picker}
          value={String(selected.id)}
          onChange={(event) =>
            update({ curve: event.target.value, x: null, y: null, parameter: null, scale: null })
          }
          className="max-w-xl"
        >
          {curves.map((c) => (
            <SelectOption key={c.id} value={String(c.id)}>
              {`${c.kind_label} — ${c.title}`}
            </SelectOption>
          ))}
        </Select>
      ) : null}
      {counts}
      {curve.isError ? (
        <ErrorState
          title={t.curveError}
          description={curve.error instanceof ApiError ? curve.error.message : undefined}
          onRetry={() =>
            // A stale link with a unit the axis refuses is fixed by dropping
            // the choice, not by asking again.
            curve.error instanceof ApiError && curve.error.status === 400
              ? update({ x: null, y: null, parameter: null, scale: null })
              : void curve.refetch()
          }
        />
      ) : curve.data ? (
        <CurveChart
          curve={curve.data}
          controls={<CurveControls curve={curve.data} onChange={(c) => update({ curve: String(curve.data.id), ...c })} />}
          exportItems={
            <>
              <MenuItem
                href={curveExportUrl(materialId, curve.data.id, "csv", reading)}
                download
                hint={t.exportCsvHint}
              >
                {t.exportCsv}
              </MenuItem>
              <MenuItem
                href={curveExportUrl(materialId, curve.data.id, "xlsx", reading)}
                download
                hint={t.exportXlsxHint}
              >
                {t.exportXlsx}
              </MenuItem>
            </>
          }
        />
      ) : (
        <LoadingState label={t.loading} />
      )}
    </div>
  );
}

/**
 * Units per axis and the scale. The options are the backend's own lists — the
 * axis's accepted units and the scales its quantities allow — so nothing
 * offered here can be refused there.
 */
function CurveControls({
  curve,
  onChange,
}: {
  curve: Curve;
  onChange: (changes: { x?: string; y?: string; parameter?: string; scale?: string }) => void;
}) {
  const axisLabel = (axis: Curve["x_axis"]) => axis.title ?? axis.quantity_label;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {curve.x_axis.accepted_units.length > 1 ? (
        <Select
          label={t.unitX(axisLabel(curve.x_axis))}
          value={curve.x_axis.unit}
          onChange={(event) => onChange({ x: event.target.value })}
        >
          {curve.x_axis.accepted_units.map((option) => (
            <SelectOption key={option.unit} value={option.unit}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      ) : null}
      {curve.y_axis.accepted_units.length > 1 ? (
        <Select
          label={t.unitY(axisLabel(curve.y_axis))}
          value={curve.y_axis.unit}
          onChange={(event) => onChange({ y: event.target.value })}
        >
          {curve.y_axis.accepted_units.map((option) => (
            <SelectOption key={option.unit} value={option.unit}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      ) : null}
      {curve.parameter && curve.parameter.accepted_units.length > 1 ? (
        <Select
          label={t.unitParameter(curve.parameter.quantity_label)}
          value={curve.parameter.unit}
          onChange={(event) => onChange({ parameter: event.target.value })}
        >
          {curve.parameter.accepted_units.map((option) => (
            <SelectOption key={option.unit} value={option.unit}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      ) : null}
      {curve.available_scales.length > 1 ? (
        <Select
          label={t.scale}
          value={curve.scale}
          onChange={(event) => onChange({ scale: event.target.value })}
        >
          {curve.available_scales.map((scale) => (
            <SelectOption key={scale} value={scale}>
              {t.scales[scale] ?? scale}
            </SelectOption>
          ))}
        </Select>
      ) : null}
    </div>
  );
}
