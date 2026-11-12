"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMaterial, listClasses, listProperties } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { MaterialForm } from "@/components/MaterialForm";
import {
  Alert,
  Breadcrumb,
  ButtonLink,
  ErrorState,
  LoadingState,
  PageDoc,
} from "@/components/ui";
import { IconPencil } from "@/components/ui/icons";

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
    <div className="flex flex-col gap-6">
      {/* D-214: editing is the sheet's own page, one step further — the
          trail leads back to it, and the head is the document's, so the form
          reads as the sheet open for writing, not as another screen. */}
      {material.data ? (
        <Breadcrumb
          items={[
            { label: ptBR.nav.catalog, href: "/app/catalogo" },
            { label: material.data.class_name, href: `/app/catalogo/${material.data.class_slug}` },
            { label: material.data.name, href: `/app/materiais/${id}` },
            { label: ptBR.form.editTitle },
          ]}
        />
      ) : (
        <ButtonLink href={`/app/materiais/${id}`} variant="link" size="sm" className="self-start">
          {ptBR.detail.back}
        </ButtonLink>
      )}
      <PageDoc
        icon={<IconPencil className="h-5 w-5" />}
        title={material.data?.name ?? ptBR.form.editTitle}
        properties={
          material.data ? (
            <p className="text-body text-ink-muted">{ptBR.form.editTitle}</p>
          ) : undefined
        }
      />

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
      {material.data?.is_official && (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="info">{ptBR.form.officialReadOnly}</Alert>
          <ButtonLink href={`/app/materiais/novo?copiar=${id}`}>{ptBR.form.makeOwnCopy}</ButtonLink>
        </div>
      )}
      {material.data && !material.data.is_official && classes.data && properties.data && (
        <MaterialForm classes={classes.data} properties={properties.data} initial={material.data} />
      )}
    </div>
  );
}
