"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMaterial, listClasses, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { MaterialForm } from "@/components/MaterialForm";
import { ButtonLink, ErrorState, LoadingState, PageHeader } from "@/components/ui";

export default function NewMaterialPage() {
  // `useSearchParams` opts the subtree out of prerendering unless it sits
  // under a Suspense boundary.
  return (
    <Suspense fallback={<LoadingState label={ptBR.catalog.loading} />}>
      <NewMaterialContent />
    </Suspense>
  );
}

function NewMaterialContent() {
  const copyParam = Number(useSearchParams().get("copiar"));
  const copyId = Number.isInteger(copyParam) && copyParam > 0 ? copyParam : null;
  const source = useQuery({
    queryKey: ["material", copyId],
    queryFn: () => getMaterial(copyId as number),
    enabled: copyId !== null,
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });

  const loading = classes.isLoading || properties.isLoading || source.isLoading;
  const error = classes.isError || properties.isError || source.isError;

  return (
    <div className="flex flex-col gap-4">
      <ButtonLink href="/app/catalogo" variant="link" size="sm" className="self-start">
        {ptBR.detail.back}
      </ButtonLink>
      <PageHeader title={copyId !== null ? ptBR.form.copyTitle : ptBR.form.createTitle} />

      {loading && <LoadingState label={ptBR.catalog.loading} />}
      {error && (
        <ErrorState
          title={ptBR.catalog.error}
          onRetry={() => {
            void classes.refetch();
            void properties.refetch();
            if (copyId !== null) void source.refetch();
          }}
        />
      )}
      {classes.data && properties.data && (copyId === null || source.data) && (
        <MaterialForm
          classes={classes.data}
          properties={properties.data}
          copyFrom={copyId !== null ? source.data : undefined}
        />
      )}
    </div>
  );
}
