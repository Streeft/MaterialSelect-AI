"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deactivateMaterial,
  getChart,
  getMaterial,
  listProperties,
} from "@/lib/api";
import {
  UNITS_PARAM,
  UnitPicker,
  parseUnitChoices,
} from "@/components/UnitPicker";
import type { MaterialDetail, PropertyGroup } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { FavoriteButton } from "@/components/my-records/FavoriteButton";
import { SimilarPanel } from "@/components/similar/SimilarPanel";
import { useRecordVisit } from "@/components/my-records/useRecordVisit";
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

  // A escolha de unidade de leitura vive na URL (D-70), então ela entra na
  // chave da consulta: trocar de unidade é uma pergunta diferente, e a resposta
  // vem do servidor — a conversão é cálculo e não apresentação (ADR 0004).
  const search = useSearchParams();
  const unitsParam = search.get(UNITS_PARAM);
  const unitChoices = parseUnitChoices(unitsParam);

  const material = useQuery({
    queryKey: ["material", id, unitsParam],
    queryFn: () => getMaterial(id, unitChoices),
    enabled: Number.isFinite(id),
    // Sem isto a ficha pisca de volta para o estado de carregamento a cada
    // troca de unidade — o mesmo defeito que o B8 corrigiu na escala do mapa.
    placeholderData: (previous) => previous,
  });

  useRecordVisit("material", Number.isFinite(id) ? id : undefined);

  // As unidades que cada grandeza admite. Vêm da definição e não da ficha: é a
  // mesma lista curada que o backend aceita, então nenhuma escolha oferecida
  // aqui pode ser recusada lá.
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });
  const acceptedBySlug = new Map(
    (properties.data ?? []).map((d) => [d.slug, d.accepted_units ?? []]),
  );

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
      router.push("/app/catalogo");
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
      <ButtonLink
        href="/app/catalogo"
        variant="link"
        size="sm"
        className="self-start"
      >
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
                  <h1 className="text-2xl font-semibold text-ink">
                    {data.name}
                  </h1>
                  {data.is_demo && (
                    <Badge tone="warning">{ptBR.demoBadge}</Badge>
                  )}
                  {/* P1-4: the sheet says whose record this is. Beside the demo
                      badge because they answer the same question — how far this
                      material's numbers may be trusted — and a reader who has
                      learnt to look here finds both. */}
                  {data.is_own_record && (
                    <Badge tone="info">{ptBR.myRecords.ownBadge}</Badge>
                  )}
                  {!data.is_active && <Badge>{t.inactive}</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ClassBadge
                    name={data.class_name}
                    color={classVisual(data.class_slug).color}
                  />
                  {data.subclass && (
                    <span className="text-sm text-ink-muted">
                      {data.subclass}
                    </span>
                  )}
                </div>
                {data.description && (
                  <p className="mt-2 max-w-prose text-sm text-ink-muted">
                    {data.description}
                  </p>
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
                <FavoriteButton universe="material" recordId={data.id} />
                <ButtonLink href={`/app/materiais/${id}/editar`} size="sm">
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
            <Section
              id="propriedades"
              title={t.properties}
              description={t.provenanceHint}
            >
              {data.property_groups.length === 0 ? (
                <EmptyState title={t.noProperties} />
              ) : (
                <>
                  <UnitChoices
                    groups={data.property_groups}
                    acceptedBySlug={acceptedBySlug}
                  />
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
              {/* P0-2: the datasheet half of the material↔process join. */}
              <Section
                id="processos"
                title={t.compatibleProcesses}
                description={t.compatibleProcessesHint}
              >
                {data.processes.length === 0 ? (
                  // Written out, never an empty card: no process linked is a
                  // state, and it is not the same as "cannot be manufactured".
                  <EmptyState title={t.noProcesses} />
                ) : (
                  <Card>
                    <CardBody className="flex flex-col gap-3">
                      {Object.entries(
                        data.processes.reduce<
                          Record<string, typeof data.processes>
                        >((byFamily, process) => {
                          const family = process.class_name;
                          byFamily[family] = [
                            ...(byFamily[family] ?? []),
                            process,
                          ];
                          return byFamily;
                        }, {}),
                      ).map(([family, list]) => (
                        <div key={family} className="flex flex-col gap-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                            {family}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {/* Links since P1-4: the join reads in both
                                directions now that a process has a datasheet,
                                and a badge that named a page the reader could
                                not reach was the half of P0-2 still missing. */}
                            {list.map((process) => (
                              <Link
                                key={process.slug}
                                href={`/app/processos/${process.slug}`}
                                className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              >
                                <Badge
                                  tone="brand"
                                  title={process.description ?? undefined}
                                >
                                  {process.name}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                )}
              </Section>

              {/* P2: "what resembles this" is a question about a record, so it
                  lives on the record's own page — the same reasoning that put
                  the compatible processes here rather than behind a second
                  screen. */}
              <SimilarPanel material={data} />

              {chart.data && (
                <PropertyChart data={chart.data} highlightMaterialId={id} />
              )}
              {chart.data && (
                <ButtonLink
                  href={`/app/mapas?x=densidade&y=modulo_young&destaque=${id}`}
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

/**
 * Em que unidade esta ficha está sendo lida (D-70).
 *
 * Um seletor por grandeza que tem alternativa, num lugar só: um `<select>` ao
 * lado de cada valor transformaria a coluna de números — que é o que a ficha
 * existe para mostrar — numa fileira de controles. As grandezas com uma unidade
 * só não aparecem, porque um seletor de uma opção afirma que existe escolha.
 *
 * A nota diz o que não mudou: a proveniência de cada número continua guardando
 * o que a fonte registrou e a unidade canônica. Sem ela, um leitor poderia
 * concluir que trocar a unidade reescreveu o dado.
 */
function UnitChoices({
  groups,
  acceptedBySlug,
}: {
  groups: MaterialDetail["property_groups"];
  acceptedBySlug: Map<string, string[]>;
}) {
  const choosable = (groups as PropertyGroup[])
    .flatMap((g) => g.properties)
    .filter((p) => (acceptedBySlug.get(p.property_slug) ?? []).length > 1);

  if (choosable.length === 0) return null;

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {choosable.map((p) => (
            <UnitPicker
              key={p.property_slug}
              property={p}
              acceptedUnits={acceptedBySlug.get(p.property_slug) ?? []}
            />
          ))}
        </div>
        <p className="text-xs text-ink-muted">{ptBR.units.readingNote}</p>
      </CardBody>
    </Card>
  );
}
