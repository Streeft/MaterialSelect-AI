"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMaterial, listClasses, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { MaterialForm } from "@/components/MaterialForm";

export default function EditMaterialPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const material = useQuery({
    queryKey: ["material", id],
    queryFn: () => getMaterial(id),
    enabled: Number.isFinite(id),
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });

  const loading = material.isLoading || classes.isLoading || properties.isLoading;
  const error = material.isError || classes.isError || properties.isError;

  return (
    <div className="space-y-4">
      <Link href={`/materiais/${id}`} className="text-sm text-brand-600 hover:underline">
        {ptBR.detail.back}
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">{ptBR.form.editTitle}</h1>

      {loading && <p className="text-sm text-slate-500">{ptBR.detail.loading}</p>}
      {error && <p className="text-sm text-red-600">{ptBR.detail.error}</p>}
      {material.data && classes.data && properties.data && (
        <MaterialForm
          classes={classes.data}
          properties={properties.data}
          initial={material.data}
        />
      )}
    </div>
  );
}
