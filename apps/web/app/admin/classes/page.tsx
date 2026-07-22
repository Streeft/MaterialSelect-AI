"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClass, deleteClass, listClasses } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import type { MaterialClass } from "@/lib/types";

export default function ClassesAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["classes"],
    queryFn: listClasses,
  });

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createClass({
        name,
        parent_id: parentId ? Number(parentId) : null,
        description: description || null,
      }),
    onSuccess: () => {
      setName("");
      setParentId("");
      setDescription("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteClass(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : ptBR.form.genericError),
  });

  const classes: MaterialClass[] = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">{ptBR.admin.classesTitle}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
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
          <span className="text-slate-600">{ptBR.admin.parent}</span>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="">{ptBR.admin.noParent}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600">{ptBR.form.description}</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <div className="sm:col-span-4">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {ptBR.admin.newClass}
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
                <th className="px-4 py-2">{ptBR.admin.slug}</th>
                <th className="px-4 py-2">{ptBR.admin.materialCount}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classes.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-2 text-slate-500">{c.slug}</td>
                  <td className="px-4 py-2 text-slate-600">{c.material_count}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove.mutate(c.id)}
                      disabled={c.material_count > 0}
                      title={c.material_count > 0 ? ptBR.admin.inUse : ptBR.actions.delete}
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
