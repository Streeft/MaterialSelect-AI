"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, createProperty, deleteProperty, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import type { PropertyCategory, PropertyDefinition } from "@/lib/types";

const CATEGORIES: PropertyCategory[] = [
  "FISICA",
  "MECANICA",
  "TERMICA",
  "ELETRICA",
  "AMBIENTAL",
  "ECONOMICA",
];

export default function PropertiesAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });

  const [name, setName] = useState("");
  const [category, setCategory] = useState<PropertyCategory>("MECANICA");
  const [canonicalUnit, setCanonicalUnit] = useState("");
  const [physicalDimension, setPhysicalDimension] = useState("");
  const [acceptedUnits, setAcceptedUnits] = useState("");
  const [isInterval, setIsInterval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createProperty({
        name,
        category,
        canonical_unit: canonicalUnit,
        physical_dimension: physicalDimension,
        accepted_units: acceptedUnits
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean),
        is_interval: isInterval,
        better_direction: "NEUTRAL",
        allows_log_scale: true,
      }),
    onSuccess: () => {
      setName("");
      setCanonicalUnit("");
      setPhysicalDimension("");
      setAcceptedUnits("");
      setIsInterval(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteProperty(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const properties: PropertyDefinition[] = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">{ptBR.admin.propertiesTitle}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{ptBR.form.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{ptBR.admin.category}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PropertyCategory)}
            className="rounded border border-slate-300 px-2 py-1.5"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ptBR.categories[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{ptBR.admin.canonicalUnit}</span>
          <input
            value={canonicalUnit}
            onChange={(e) => setCanonicalUnit(e.target.value)}
            required
            placeholder="ex.: Pa"
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{ptBR.admin.physicalDimension}</span>
          <input
            value={physicalDimension}
            onChange={(e) => setPhysicalDimension(e.target.value)}
            placeholder="ex.: [mass] / [length] / [time] ** 2"
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{ptBR.admin.acceptedUnits}</span>
          <input
            value={acceptedUnits}
            onChange={(e) => setAcceptedUnits(e.target.value)}
            placeholder="Pa, MPa, GPa"
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isInterval}
            onChange={(e) => setIsInterval(e.target.checked)}
          />
          <span className="text-slate-600">{ptBR.admin.isInterval}</span>
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {ptBR.admin.newProperty}
          </button>
        </div>
      </form>

      {error && <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {isLoading && <p className="text-sm text-slate-500">{ptBR.catalog.loading}</p>}
      {isError && <p className="text-sm text-red-600">{ptBR.catalog.error}</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">{ptBR.form.name}</th>
                <th className="px-4 py-2">{ptBR.admin.category}</th>
                <th className="px-4 py-2">{ptBR.admin.canonicalUnit}</th>
                <th className="px-4 py-2">{ptBR.admin.valueCount}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {properties.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {p.name}
                    {p.symbol && <span className="ml-1 text-slate-400">({p.symbol})</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{ptBR.categories[p.category]}</td>
                  <td className="px-4 py-2 text-slate-500">{p.canonical_unit}</td>
                  <td className="px-4 py-2 text-slate-600">{p.value_count}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove.mutate(p.id)}
                      disabled={p.value_count > 0}
                      title={p.value_count > 0 ? ptBR.admin.inUse : ptBR.actions.delete}
                      className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      {ptBR.actions.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
