"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getComparison, listMaterials, listProperties } from "@/lib/api";
import type { ComparisonRequest, NormalizationMethod } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import {
  COMPARISON_MODES,
  ComparisonView,
  type ComparisonMode,
} from "@/components/charts/ComparisonView";

const t = ptBR.compare;

// Mirrors MAX_COMPARE_* in apps/api/app/schemas/charts.py; the server rejects
// anything larger, and the UI should not let the user get that far.
const MAX_MATERIALS = 12;
const MAX_PROPERTIES = 12;

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function ComparePageContent() {
  const params = useSearchParams();

  const [selectedMaterials, setSelectedMaterials] = useState<number[]>(() =>
    parseIds(params.get("materiais")).slice(0, MAX_MATERIALS),
  );
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [normalization, setNormalization] = useState<NormalizationMethod>("minmax");
  const [mode, setMode] = useState<ComparisonMode>("table");
  const [search, setSearch] = useState("");

  const materials = useQuery({ queryKey: ["materials", ""], queryFn: () => listMaterials() });
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });

  // Sensible first view: the properties most materials actually have.
  useEffect(() => {
    if (selectedProperties.length > 0 || !properties.data) return;
    const ranked = [...properties.data]
      .filter((p) => p.value_count > 0)
      .sort((a, b) => b.value_count - a.value_count)
      .slice(0, 4)
      .map((p) => p.slug);
    if (ranked.length > 0) setSelectedProperties(ranked);
  }, [properties.data, selectedProperties.length]);

  const visibleMaterials = useMemo(() => {
    const all = materials.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (m) =>
        m.name.toLowerCase().includes(term) || m.class_name.toLowerCase().includes(term),
    );
  }, [materials.data, search]);

  const request = useMemo<ComparisonRequest>(
    () => ({
      material_ids: selectedMaterials,
      property_slugs: selectedProperties,
      normalization,
    }),
    [selectedMaterials, selectedProperties, normalization],
  );

  const ready = selectedMaterials.length > 0 && selectedProperties.length > 0;
  const comparison = useQuery({
    queryKey: ["comparison", JSON.stringify(request)],
    queryFn: () => getComparison(request),
    enabled: ready,
  });

  function toggleMaterial(id: number) {
    setSelectedMaterials((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= MAX_MATERIALS
          ? current
          : [...current, id],
    );
  }

  function toggleProperty(slug: string) {
    setSelectedProperties((current) =>
      current.includes(slug)
        ? current.filter((x) => x !== slug)
        : current.length >= MAX_PROPERTIES
          ? current
          : [...current, slug],
    );
  }

  const chipClass = (active: boolean) =>
    "rounded-full px-3 py-1 text-xs " +
    (active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {/* Material picker */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            {t.materials}{" "}
            <span className="font-normal text-slate-400">
              ({selectedMaterials.length}/{MAX_MATERIALS})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              aria-label={t.search}
              className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setSelectedMaterials([])}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {t.clear}
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-slate-500">{t.pickMaterials}</p>
        {materials.isLoading && <p className="text-sm text-slate-500">{ptBR.catalog.loading}</p>}
        <div className="flex flex-wrap gap-2">
          {visibleMaterials.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={selectedMaterials.includes(m.id)}
              onClick={() => toggleMaterial(m.id)}
              className={chipClass(selectedMaterials.includes(m.id))}
            >
              {m.name}
            </button>
          ))}
        </div>
      </section>

      {/* Property picker */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          {t.properties}{" "}
          <span className="font-normal text-slate-400">
            ({selectedProperties.length}/{MAX_PROPERTIES})
          </span>
        </h2>
        <p className="mb-2 text-xs text-slate-500">{t.pickProperties}</p>
        <div className="flex flex-wrap gap-2">
          {(properties.data ?? []).map((p) => (
            <button
              key={p.slug}
              type="button"
              aria-pressed={selectedProperties.includes(p.slug)}
              onClick={() => toggleProperty(p.slug)}
              className={chipClass(selectedProperties.includes(p.slug))}
              title={`${ptBR.direction[p.better_direction]} · ${prettyUnit(p.canonical_unit)}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      {/* View switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={ptBR.ui.views} className="flex flex-wrap gap-2">
          {COMPARISON_MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={mode === option.key}
              onClick={() => setMode(option.key)}
              className={chipClass(mode === option.key)}
            >
              {option.label}
            </button>
          ))}
        </nav>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          {t.normalization}
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            value={normalization}
            onChange={(e) => setNormalization(e.target.value as NormalizationMethod)}
          >
            <option value="minmax">{t.normMinmax}</option>
            <option value="vector">{t.normVector}</option>
          </select>
        </label>
      </div>

      {!ready && <p className="py-8 text-center text-sm text-slate-500">{t.empty}</p>}
      {comparison.isLoading && ready && (
        <p className="py-8 text-center text-sm text-slate-500">{t.loading}</p>
      )}
      {comparison.isError && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {comparison.error instanceof Error ? comparison.error.message : t.error}
        </p>
      )}

      {comparison.data && (
        <>
          <ComparisonView comparison={comparison.data} mode={mode} />

          {comparison.data.notes.length > 0 && (
            <section className="rounded-md bg-slate-50 px-4 py-3">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.notesTitle}
              </h2>
              <ul className="space-y-1 text-xs text-slate-600">
                {Array.from(new Set(comparison.data.notes)).map((note, i) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">{t.loading}</p>}>
      <ComparePageContent />
    </Suspense>
  );
}
