"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deactivateMaterial, getChart, getMaterial } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { DemoDataBadge } from "@/components/DemoDataBadge";
import { PropertyGroupCard } from "@/components/PropertyGroup";
import { PropertyChart } from "@/components/PropertyChart";

export default function MaterialDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();

  const material = useQuery({
    queryKey: ["material", id],
    queryFn: () => getMaterial(id),
    enabled: Number.isFinite(id),
  });

  // Density × Young's modulus is the demonstrative Ashby-style map for the MVP.
  const chart = useQuery({
    queryKey: ["chart", "densidade", "modulo_young"],
    queryFn: () => getChart("densidade", "modulo_young"),
  });

  const deactivate = useMutation({
    mutationFn: () => deactivateMaterial(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      // Also drop this material's cached detail (else Back within staleTime
      // shows it as still active) and the chart it no longer belongs to.
      qc.invalidateQueries({ queryKey: ["material", id] });
      qc.invalidateQueries({ queryKey: ["chart"] });
      router.push("/catalogo");
    },
  });

  function handleDeactivate() {
    if (window.confirm(ptBR.actions.confirmDeactivate)) {
      deactivate.mutate();
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/catalogo" className="text-sm text-brand-600 hover:underline">
        {ptBR.detail.back}
      </Link>

      {material.isLoading && (
        <p className="py-8 text-center text-sm text-slate-500">{ptBR.detail.loading}</p>
      )}
      {material.isError && (
        <p className="py-8 text-center text-sm text-red-600">{ptBR.detail.error}</p>
      )}

      {material.data && (
        <>
          <header className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">{material.data.name}</h1>
                  {material.data.is_demo && <DemoDataBadge />}
                  {!material.data.is_active && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      inativo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {material.data.class_name}
                  {material.data.subclass ? ` · ${material.data.subclass}` : ""}
                </p>
                {material.data.description && (
                  <p className="mt-2 text-sm text-slate-600">{material.data.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/materiais/${id}/editar`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {ptBR.actions.edit}
                </Link>
                {material.data.is_active && (
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={deactivate.isPending}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {ptBR.actions.deactivate}
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">{ptBR.detail.properties}</h2>
              {material.data.property_groups.length === 0 ? (
                <p className="text-sm text-slate-500">{ptBR.detail.noProperties}</p>
              ) : (
                material.data.property_groups.map((g) => (
                  <PropertyGroupCard key={g.category} group={g} />
                ))
              )}
            </div>

            <div>
              {chart.data && <PropertyChart data={chart.data} highlightMaterialId={id} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
