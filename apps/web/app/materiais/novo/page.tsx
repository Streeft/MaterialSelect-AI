"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listClasses, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { MaterialForm } from "@/components/MaterialForm";

export default function NewMaterialPage() {
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });

  const loading = classes.isLoading || properties.isLoading;
  const error = classes.isError || properties.isError;

  return (
    <div className="space-y-4">
      <Link href="/catalogo" className="text-sm text-brand-600 hover:underline">
        {ptBR.detail.back}
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">{ptBR.form.createTitle}</h1>

      {loading && <p className="text-sm text-slate-500">{ptBR.catalog.loading}</p>}
      {error && <p className="text-sm text-red-600">{ptBR.catalog.error}</p>}
      {classes.data && properties.data && (
        <MaterialForm classes={classes.data} properties={properties.data} />
      )}
    </div>
  );
}
