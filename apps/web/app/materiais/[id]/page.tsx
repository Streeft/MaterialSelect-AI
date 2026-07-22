"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getChart, getMaterial } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { DemoDataBadge } from "@/components/DemoDataBadge";
import { PropertyGroupCard } from "@/components/PropertyGroup";
import { PropertyChart } from "@/components/PropertyChart";

export default function MaterialDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{material.data.name}</h1>
              {material.data.is_demo && <DemoDataBadge />}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {material.data.class_name}
              {material.data.subclass ? ` · ${material.data.subclass}` : ""}
            </p>
            {material.data.description && (
              <p className="mt-2 text-sm text-slate-600">{material.data.description}</p>
            )}
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
