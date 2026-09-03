"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMaterial, listClasses, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { MaterialForm } from "@/components/MaterialForm";
import { ButtonLink, ErrorState, LoadingState, PageHeader } from "@/components/ui";

export default function EditMaterialPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const material = useQuery({
    queryKey: ["material", id],
    queryFn: () => getMaterial(id),
    enabled: Number.isFinite(id),
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });

  const loading = material.isLoading || classes.isLoading || properties.isLoading;
  const error = material.isError || classes.isError || properties.isError;

  return (
    <div className="flex flex-col gap-4">
      <ButtonLink href={`/materiais/${id}`} variant="link" size="sm" className="self-start">
        {ptBR.detail.back}
      </ButtonLink>
      <PageHeader title={ptBR.form.editTitle} />

      {loading && <LoadingState label={ptBR.detail.loading} />}
      {error && (
        <ErrorState
          title={ptBR.detail.error}
          onRetry={() => {
            void material.refetch();
            void classes.refetch();
            void properties.refetch();
          }}
        />
      )}
      {material.data && classes.data && properties.data && (
        <MaterialForm classes={classes.data} properties={properties.data} initial={material.data} />
      )}
    </div>
  );
}
