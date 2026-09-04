"use client";

import { useQuery } from "@tanstack/react-query";
import { listClasses, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { MaterialForm } from "@/components/MaterialForm";
import { ButtonLink, ErrorState, LoadingState, PageHeader } from "@/components/ui";

export default function NewMaterialPage() {
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });

  const loading = classes.isLoading || properties.isLoading;
  const error = classes.isError || properties.isError;

  return (
    <div className="flex flex-col gap-4">
      <ButtonLink href="/app/catalogo" variant="link" size="sm" className="self-start">
        {ptBR.detail.back}
      </ButtonLink>
      <PageHeader title={ptBR.form.createTitle} />

      {loading && <LoadingState label={ptBR.catalog.loading} />}
      {error && (
        <ErrorState
          title={ptBR.catalog.error}
          onRetry={() => {
            void classes.refetch();
            void properties.refetch();
          }}
        />
      )}
      {classes.data && properties.data && (
        <MaterialForm classes={classes.data} properties={properties.data} />
      )}
    </div>
  );
}
