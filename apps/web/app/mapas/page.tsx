"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getPropertyMap,
  listClasses,
  listPerformanceIndices,
  listProperties,
} from "@/lib/api";
import type { ChartScale, Goal, IndexIn, PropertyMapRequest } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { AshbyMap } from "@/components/charts/AshbyMap";

const t = ptBR.map;

/** Comma-separated numeric ids from a query string, ignoring junk. */
function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function MapsPageContent() {
  const params = useSearchParams();

  const [x, setX] = useState(params.get("x") ?? "densidade");
  const [y, setY] = useState(params.get("y") ?? "modulo_young");
  const [scale, setScale] = useState<ChartScale>("log");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [showEnvelopes, setShowEnvelopes] = useState(true);
  const [showIntervals, setShowIntervals] = useState(true);
  const [showLabels, setShowLabels] = useState(false);

  const [indexMode, setIndexMode] = useState("none"); // "none" | slug | "custom"
  const [customExpression, setCustomExpression] = useState("");
  const [indexGoal, setIndexGoal] = useState<Goal>("maximize");
  const [levelMaterialId, setLevelMaterialId] = useState<number | null>(null);

  // Materials carried over from a selection run, so a study can be read on the map.
  const restrictedIds = useMemo(() => parseIds(params.get("materiais")), [params]);
  const highlightIds = useMemo(() => parseIds(params.get("destaque")), [params]);

  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const indices = useQuery({
    queryKey: ["performance-indices"],
    queryFn: listPerformanceIndices,
  });

  // Fall back to the first two properties if the seeded slugs are absent.
  useEffect(() => {
    const available = properties.data;
    if (!available || available.length < 2) return;
    const slugs = available.map((p) => p.slug);
    if (!slugs.includes(x)) setX(slugs[0] as string);
    if (!slugs.includes(y)) setY((slugs[1] ?? slugs[0]) as string);
  }, [properties.data, x, y]);

  const activeIndex = useMemo<IndexIn | null>(() => {
    if (indexMode === "none") return null;
    if (indexMode === "custom") {
      return customExpression.trim()
        ? { name: t.indexCustom, expression: customExpression.trim(), goal: indexGoal }
        : null;
    }
    const chosen = indices.data?.find((i) => i.slug === indexMode);
    return chosen
      ? { name: chosen.name, expression: chosen.expression, goal: chosen.goal }
      : null;
  }, [indexMode, customExpression, indexGoal, indices.data]);

  const request = useMemo<PropertyMapRequest>(
    () => ({
      x,
      y,
      scale,
      class_slugs: selectedClasses,
      material_ids: restrictedIds.length > 0 ? restrictedIds : null,
      include_envelopes: showEnvelopes,
      index: activeIndex,
      index_level_material_ids: levelMaterialId === null ? [] : [levelMaterialId],
    }),
    [x, y, scale, selectedClasses, restrictedIds, showEnvelopes, activeIndex, levelMaterialId],
  );

  const map = useQuery({
    queryKey: ["property-map", JSON.stringify(request)],
    queryFn: () => getPropertyMap(request),
    enabled: Boolean(x && y && x !== y),
  });

  const inputClass =
    "rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none";
  const overlay = map.data?.index ?? null;

  function toggleClass(slug: string) {
    setSelectedClasses((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {/* Axes and display options */}
      <section className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm text-slate-600">
          {t.axisX}
          <select className={`${inputClass} mt-1 block`} value={x} onChange={(e) => setX(e.target.value)}>
            {(properties.data ?? []).map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} [{prettyUnit(p.canonical_unit)}]
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-600">
          {t.axisY}
          <select className={`${inputClass} mt-1 block`} value={y} onChange={(e) => setY(e.target.value)}>
            {(properties.data ?? []).map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} [{prettyUnit(p.canonical_unit)}]
              </option>
            ))}
          </select>
        </label>

        <fieldset className="text-sm text-slate-600">
          <legend className="mb-1">{t.scale}</legend>
          <div className="inline-flex overflow-hidden rounded border border-slate-300">
            {(["linear", "log"] as ChartScale[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={scale === option}
                onClick={() => setScale(option)}
                className={
                  "px-3 py-1 text-xs " +
                  (scale === option ? "bg-brand-600 text-white" : "bg-white text-slate-600")
                }
              >
                {option === "linear" ? t.linear : t.log}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="text-sm text-slate-600">
          <legend className="mb-1">{t.options}</legend>
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showEnvelopes} onChange={(e) => setShowEnvelopes(e.target.checked)} />
              {t.envelopes}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showIntervals} onChange={(e) => setShowIntervals(e.target.checked)} />
              {t.intervals}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              {t.labels}
            </label>
          </div>
        </fieldset>
      </section>

      {/* Class filter */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">{t.classes}</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setSelectedClasses([])}
            className={
              "rounded-full px-3 py-1 " +
              (selectedClasses.length === 0
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            {t.allClasses}
          </button>
          {(classes.data ?? []).map((c) => (
            <button
              key={c.slug}
              type="button"
              aria-pressed={selectedClasses.includes(c.slug)}
              onClick={() => toggleClass(c.slug)}
              className={
                "rounded-full px-3 py-1 " +
                (selectedClasses.includes(c.slug)
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>

      {/* Index line */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">{t.indexTitle}</h2>
        <p className="mb-3 text-xs text-slate-500">{t.indexHint}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600">
            {t.indexTitle}
            <select
              className={`${inputClass} mt-1 block`}
              value={indexMode}
              onChange={(e) => setIndexMode(e.target.value)}
            >
              <option value="none">{t.indexNone}</option>
              {(indices.data ?? []).map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.name} — {i.expression}
                </option>
              ))}
              <option value="custom">{t.indexCustom}</option>
            </select>
          </label>

          {indexMode === "custom" && (
            <>
              <label className="text-sm text-slate-600">
                {t.expression}
                <input
                  className={`${inputClass} mt-1 block w-72`}
                  value={customExpression}
                  onChange={(e) => setCustomExpression(e.target.value)}
                  placeholder="modulo_young / densidade"
                />
              </label>
              <label className="text-sm text-slate-600">
                {t.goal}
                <select
                  className={`${inputClass} mt-1 block`}
                  value={indexGoal}
                  onChange={(e) => setIndexGoal(e.target.value as Goal)}
                >
                  <option value="maximize">{t.maximize}</option>
                  <option value="minimize">{t.minimize}</option>
                </select>
              </label>
            </>
          )}

          {activeIndex && (
            <label className="text-sm text-slate-600">
              {t.levelThrough}
              <select
                className={`${inputClass} mt-1 block`}
                value={levelMaterialId ?? ""}
                onChange={(e) =>
                  setLevelMaterialId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">{t.levelNone}</option>
                {(map.data?.points ?? [])
                  .filter((p) => p.index_value !== null)
                  .map((p) => (
                    <option key={p.material_id} value={p.material_id}>
                      {p.material_name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        {overlay && (
          <div className="mt-3 space-y-1 text-xs">
            {overlay.available ? (
              <p className="text-slate-600">
                {overlay.orientation === "vertical" ? (
                  <strong>{t.vertical}</strong>
                ) : (
                  <>
                    {t.slope}: <strong>{overlay.slope?.toFixed(3)}</strong>
                  </>
                )}
                {" · "}
                {t.dimension}: {prettyUnit(overlay.dimension)}
              </p>
            ) : (
              <p className="text-amber-700">
                <strong>{t.indexUnavailable}:</strong> {overlay.unavailable_reason}
              </p>
            )}
            {overlay.levels.map((level) => (
              <p key={`${level.value}-${level.material_id ?? "n"}`} className="text-slate-500">
                M = {formatNumber(level.value)}
                {level.material_name ? ` (${level.material_name})` : ""} —{" "}
                {t.superior(level.superior_material_ids.length)}
              </p>
            ))}
          </div>
        )}
      </section>

      {x === y && (
        <p role="alert" className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Escolha duas propriedades diferentes para os eixos.
        </p>
      )}
      {map.isLoading && <p className="py-8 text-center text-sm text-slate-500">{t.loading}</p>}
      {map.isError && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {map.error instanceof Error ? map.error.message : t.error}
        </p>
      )}

      {map.data && (
        <>
          <AshbyMap
            map={map.data}
            highlightIds={highlightIds}
            showEnvelopes={showEnvelopes}
            showIntervals={showIntervals}
            showLabels={showLabels}
          />

          {map.data.notes.length > 0 && (
            <ul className="space-y-1 rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-600">
              {map.data.notes.map((note, i) => (
                <li key={i}>• {note}</li>
              ))}
            </ul>
          )}

          {map.data.excluded.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-800">{t.excludedTitle}</h2>
              <p className="mb-2 text-xs text-amber-700">{t.excludedHint}</p>
              <ul className="space-y-1 text-sm text-amber-800">
                {map.data.excluded.map((e) => (
                  <li key={e.material_id}>
                    {e.name} — {e.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {map.data.points.length > 0 && (
            <Link
              href={`/comparar?materiais=${map.data.points.map((p) => p.material_id).join(",")}`}
              className="inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-slate-50"
            >
              {t.compareSelected} →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export default function MapsPage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">{t.loading}</p>}>
      <MapsPageContent />
    </Suspense>
  );
}
