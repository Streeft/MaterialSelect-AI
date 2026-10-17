"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deactivateMaterial,
  duplicateMaterial,
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
import { flowText } from "@/lib/i18n-flow";
import { FavoriteButton } from "@/components/my-records/FavoriteButton";
import { useCanEditCatalog } from "@/lib/billing";
import { SimilarPanel } from "@/components/similar/SimilarPanel";
import { useRecordVisit } from "@/components/my-records/useRecordVisit";
import { classVisual } from "@/lib/design/palette";
import { PropertyGroupCard } from "@/components/PropertyGroup";
import { PropertyChart } from "@/components/PropertyChart";
import { DepthLevelPicker, useDepthLevel } from "@/components/DepthLevelPicker";
import { groupsAtLevel } from "@/lib/depth";
import { MaterialExportMenu } from "@/components/CaeExportDialog";
import { CompositionByCondition } from "@/components/material/CompositionByCondition";
import { DesignationTable } from "@/components/material/DesignationTable";
import { EquivalenceSection } from "@/components/material/EquivalenceSection";
import { MaterialCurves } from "@/components/material/MaterialCurves";
import { CompositionEditor, DesignationEditor } from "@/components/material/IdentityEditors";
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
  // D-127: the depth level is a view. The sheet arrives whole from the server
  // and is only cut here, with the count written next to the picker.
  const depthLevel = useDepthLevel();

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

  const canEditCatalog = useCanEditCatalog();

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

  // D-122: an own record can be duplicated as an editable copy of its own.
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const duplicate = useMutation({
    mutationFn: () => duplicateMaterial(id),
    onSuccess: (copy) => {
      setDuplicateError(null);
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["my-records"] });
      router.push(`/app/materiais/${copy.id}`);
    },
    onError: (err) =>
      setDuplicateError(err instanceof Error ? err.message : ptBR.detail.error),
  });

  function handleDeactivate() {
    if (window.confirm(ptBR.actions.confirmDeactivate)) {
      deactivate.mutate();
    }
  }

  const data = material.data;
  const atLevel = data
    ? groupsAtLevel(data.property_groups, depthLevel)
    : { groups: [], shown: 0, total: 0 };
  const referencedCount =
    data?.property_groups.reduce(
      (acc, g) =>
        acc +
        g.properties.filter((p) => Boolean(p.source_label) && !p.is_missing).length,
      0,
    ) ?? 0;

  // TM2-a: which block of the sheet is being edited, if any. Offered only where
  // the server would accept the write (own record, or a curator on the shared
  // catalogue) and never on a record of the official catalogue (D-102).
  const [editing, setEditing] = useState<"composition" | "designations" | null>(null);
  const canEditIdentity =
    data !== undefined && !data.is_official && (data.is_own_record || canEditCatalog);

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
                  {/* P1-4: the sheet says whose record this is. */}
                  {data.is_own_record && (
                    <Badge tone="info">{ptBR.myRecords.ownBadge}</Badge>
                  )}
                  {!data.is_active && <Badge>{t.inactive}</Badge>}
                  {/* D-122: a copy says where it came from. */}
                  {data.copied_from && (
                    <Badge tone="neutral">
                      {flowText.duplicate.copiedFrom}{" "}
                      <Link
                        href={`/app/materiais/${data.copied_from.id}`}
                        className="underline"
                      >
                        {data.copied_from.name}
                      </Link>
                    </Badge>
                  )}
                  {referencedCount > 0 ? (
                    <Badge tone="neutral">
                      {ptBR.catalog.referenceCount(referencedCount)}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{ptBR.catalog.noReferences}</Badge>
                  )}
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
                {/* D-104 e D-124: menu "Exportar ▾" com ficha técnica em PDF/HTML e CAE card. */}
                <MaterialExportMenu materialId={data.id} unitChoices={unitChoices} />
                {/* D-83: in open access mode a shared material is read-only for
                    a student; the server refuses the write, this only avoids
                    offering a button that cannot work. */}
                {/* D-116: an official record is read-only. The button stays,
                    disabled, with the reason written; the way forward is an
                    own copy (D-62), which is not official. */}
                {data.is_official && (
                  <>
                    <Button
                      size="sm"
                      disabled
                      aria-describedby="material-official-reason"
                    >
                      {ptBR.actions.edit}
                    </Button>
                    <ButtonLink href={`/app/materiais/novo?copiar=${data.id}`} size="sm">
                      {ptBR.form.makeOwnCopy}
                    </ButtonLink>
                  </>
                )}
                {!data.is_official && (data.is_own_record || canEditCatalog) && (
                  <ButtonLink href={`/app/materiais/${id}/editar`} size="sm">
                    {ptBR.actions.edit}
                  </ButtonLink>
                )}
                {data.is_active && data.is_own_record && !data.is_official && (
                  <Button
                    size="sm"
                    variant="secondary"
                    title={flowText.duplicate.hint}
                    loading={duplicate.isPending}
                    onClick={() => duplicate.mutate()}
                  >
                    {duplicate.isPending ? flowText.duplicate.busy : flowText.duplicate.button}
                  </Button>
                )}
                {data.is_active &&
                  !data.is_official &&
                  (data.is_own_record || canEditCatalog) && (
                  <Button
                    size="sm"
                    variant="danger-quiet"
                    onClick={handleDeactivate}
                    loading={deactivate.isPending}
                  >
                    {ptBR.actions.deactivate}
                  </Button>
                )}
              </div>
              {duplicateError && (
                <p role="alert" className="w-full text-support text-danger-fg">
                  {duplicateError}
                </p>
              )}
              {data.is_official && (
                <p id="material-official-reason" className="w-full text-support text-ink-muted">
                  {ptBR.form.officialReadOnly}
                </p>
              )}
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
                  <DepthLevelPicker
                    summary={ptBR.depth.sheetCount(depthLevel, atLevel.shown, atLevel.total)}
                  />
                  {atLevel.groups.length === 0 && (
                    <EmptyState title={ptBR.depth.noneAtLevel(depthLevel)} />
                  )}
                  <UnitChoices
                    groups={atLevel.groups}
                    acceptedBySlug={acceptedBySlug}
                  />
                  {atLevel.groups.map((g) => (
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
                          <span className="text-caption font-semibold text-ink-muted">
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

          {/* D-105 (TM2): composition and designations, each a table — the
              text is the record here, and absence is written, never blank. */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              id="composicao"
              title={t.composition}
              description={t.compositionHint}
              className="min-w-0"
            >
              {editing === "composition" ? (
                <CompositionEditor
                  materialId={data.id}
                  entries={data.composition}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <>
                  <CompositionByCondition
                    entries={data.composition}
                    atomic={data.atomic_composition}
                  />
                  {canEditIdentity && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => setEditing("composition")}
                    >
                      {t.edit.editComposition}
                    </Button>
                  )}
                </>
              )}
              {data.is_official && (
                <p className="mt-3 text-xs text-ink-muted">{t.edit.officialReadOnly}</p>
              )}
            </Section>
            <Section
              id="designacoes"
              title={t.designations}
              description={t.designationsHint}
              className="min-w-0"
            >
              {editing === "designations" ? (
                <DesignationEditor
                  materialId={data.id}
                  designations={data.designations}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <>
                  <DesignationTable
                    designations={data.designations}
                  />
                  {canEditIdentity && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => setEditing("designations")}
                    >
                      {t.edit.editDesignations}
                    </Button>
                  )}
                </>
              )}
            </Section>
          </div>

          {/* D-115 (TM1): what a source declares equivalent to this material's
              designations — kind and source written, and "nothing declared"
              said in words. Never inferred from a name or a shared code. */}
          <Section
            id="equivalencias"
            title={ptBR.equivalences.title}
            description={ptBR.equivalences.hint}
            className="min-w-0"
          >
            <EquivalenceSection materialId={data.id} />
          </Section>

          {/* D-106 (TM4): the material's curves, each a figure with its table of
              points (D-31). Full width: a family of curves needs the room, and a
              curve is read across, not beside another section. */}
          <Section
            id="curvas"
            title={ptBR.curves.title}
            description={ptBR.curves.hint}
            className="min-w-0"
          >
            <MaterialCurves materialId={data.id} canEdit={canEditIdentity} />
          </Section>
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
