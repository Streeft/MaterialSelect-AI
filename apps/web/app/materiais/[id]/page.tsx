"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deactivateMaterial, getChart, getMaterial } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import { PropertyGroupCard } from "@/components/PropertyGroup";
import { PropertyChart } from "@/components/PropertyChart";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  ClassBadge,
  DataQualityLegend,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
} from "@/components/ui";

const t = ptBR.detail;

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

  const data = material.data;

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink href="/catalogo" variant="link" size="sm" className="self-start">
        {t.back}
      </ButtonLink>

      {material.isLoading && <LoadingState label={t.loading} />}
      {material.isError && (
        <ErrorState title={t.error} onRetry={() => void material.refetch()} />
      )}

      {data && (
        <>
          <Card>
            {/* Wraps at 375 px: unwrapped, the action pair pushed the page 33 px
                past the viewport and the whole document scrolled sideways. */}
            <CardBody className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-ink">{data.name}</h1>
                  {data.is_demo && <Badge tone="warning">{ptBR.demoBadge}</Badge>}
                  {!data.is_active && <Badge>{t.inactive}</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ClassBadge
                    name={data.class_name}
                    color={classVisual(data.class_slug).color}
                  />
                  {data.subclass && (
                    <span className="text-sm text-ink-muted">{data.subclass}</span>
                  )}
                </div>
                {data.description && (
                  <p className="mt-2 max-w-prose text-sm text-ink-muted">{data.description}</p>
                )}
                {data.keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {data.keywords.map((kw) => (
                      <Badge key={kw}>{kw}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <ButtonLink href={`/materiais/${id}/editar`} size="sm">
                  {ptBR.actions.edit}
                </ButtonLink>
                {data.is_active && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={handleDeactivate}
                    loading={deactivate.isPending}
                  >
                    {ptBR.actions.deactivate}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section id="propriedades" title={t.properties} description={t.provenanceHint}>
              {data.property_groups.length === 0 ? (
                <EmptyState title={t.noProperties} />
              ) : (
                <>
                  {data.property_groups.map((g) => (
                    <PropertyGroupCard key={g.category} group={g} />
                  ))}
                  {/* The legend, once per sheet: the badges next to each value
                      are only readable if the vocabulary is within reach. */}
                  <Card>
                    <CardBody>
                      <DataQualityLegend />
                    </CardBody>
                  </Card>
                </>
              )}
            </Section>

            {/* `min-w-0`: the figure's data table is wider than a phone, and a
                grid item defaults to `min-width: auto`. Without this the table
                widened the column, the column widened the page, and the whole
                sheet scrolled sideways at 375 px instead of the table scrolling
                inside its own box. */}
            <div className="flex min-w-0 flex-col gap-3">
              {chart.data && <PropertyChart data={chart.data} highlightMaterialId={id} />}
              {chart.data && (
                <ButtonLink
                  href={`/mapas?x=densidade&y=modulo_young&destaque=${id}`}
                  size="sm"
                  className="self-start"
                >
                  {t.openInMaps} →
                </ButtonLink>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
