"use client";

import { describeApiError, isNotFound } from "@/lib/errors";
import { useEffect, useState } from "react";
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
import { UNITS_PARAM, parseUnitChoices } from "@/components/UnitPicker";
import { errorsText } from "@/lib/i18n-errors";
import { ptBR } from "@/lib/i18n";
import { flowText } from "@/lib/i18n-flow";
import { fichaText } from "@/lib/i18n-ficha";
import { FavoriteButton } from "@/components/my-records/FavoriteButton";
import { useCanEditCatalog } from "@/lib/billing";
import { SimilarPanel } from "@/components/similar/SimilarPanel";
import { useRecordVisit } from "@/components/my-records/useRecordVisit";
import { useKeepOfflineSheet } from "@/components/material/useKeepOfflineSheet";
import { classVisual } from "@/lib/design/palette";
import { PropertyGroupCard, type UnitOptions } from "@/components/PropertyGroup";
import { FamilyNote } from "@/components/glossary/FamilyNote";
import { PropertyChart } from "@/components/PropertyChart";
import { DepthLevelPicker, useDepthLevel } from "@/components/DepthLevelPicker";
import { groupsAtLevel } from "@/lib/depth";
import { MaterialExportMenu } from "@/components/CaeExportDialog";
import { CollapsibleSection } from "@/components/material/CollapsibleSection";
import { SheetOutline } from "@/components/material/SheetOutline";
import { SheetQuickLinks } from "@/components/material/SheetQuickLinks";
import { SheetActions } from "@/components/material/SheetActions";
import { CompositionByCondition } from "@/components/material/CompositionByCondition";
import { DesignationTable } from "@/components/material/DesignationTable";
import { CopyTableButton } from "@/components/selection/CopyTableButton";
import { sheetTsv } from "@/lib/copyTables";
import { copyTablesText } from "@/lib/i18n-copy-tables";
import { EquivalenceSection } from "@/components/material/EquivalenceSection";
import { MaterialCurves } from "@/components/material/MaterialCurves";
import { MaterialOrdinals } from "@/components/material/MaterialOrdinals";
import { CompositionEditor, DesignationEditor } from "@/components/material/IdentityEditors";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  ChartSkeleton,
  ClassBadge,
  ConfirmDialog,
  DataQualityLegend,
  Disclosure,
  EmptyState,
  ErrorState,
  MenuItem,
  PageHeader,
  SheetSkeleton,
} from "@/components/ui";
import { usePageTitle } from "@/lib/pageTitle";

const t = ptBR.detail;

/** The sheet's sections, in reading order; each is an anchor (D-214). */
const SECTION_IDS = [
  "propriedades",
  "processos",
  "semelhantes",
  "mapa",
  "composicao",
  "designacoes",
  "equivalencias",
  "ordinais",
  "curvas",
];
/** What a sheet is read for opens at once; the long, rarely needed blocks start folded. */
const DEFAULT_OPEN: Record<string, boolean> = {
  propriedades: true,
  processos: true,
  composicao: true,
  designacoes: true,
};

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
  // D-207: the tab and the menu's "Recentes" carry the material's name — not
  // the previous one's, kept on screen while another unit choice loads.
  usePageTitle(material.isPlaceholderData ? null : material.data?.name);
  // D-152: a sheet the server answered is kept for reading without a connection.
  useKeepOfflineSheet(material.data, material.isPlaceholderData);

  // As unidades que cada grandeza admite. Vêm da definição e não da ficha: é a
  // mesma lista curada que o backend aceita, então nenhuma escolha oferecida
  // aqui pode ser recusada lá.
  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: listProperties,
  });
  // D-215: what each quantity can be read in, for the unit chip on its value.
  const unitOptions: UnitOptions = new Map(
    (properties.data ?? []).map((d) => [
      d.slug,
      { accepted: d.accepted_units ?? [], convention: d.display_unit },
    ]),
  );

  // Density × Young's modulus is the demonstrative Ashby-style map for the MVP.
  // D-214: which sections are open. The four the sheet is read for start open;
  // the long ones (similar, the map, equivalences, ordinals, curves) start
  // folded and are only mounted — so only requested — once opened. An address
  // that names one (`#curvas`) opens it.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const open: Record<string, boolean> = { ...DEFAULT_OPEN };
    const hash = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
    if (SECTION_IDS.includes(hash)) open[hash] = true;
    return open;
  });
  // D-214: asked for only when the reader opens the "Onde este material fica"
  // section, not on every visit to a sheet.
  const chart = useQuery({
    queryKey: ["chart", "densidade", "modulo_young"],
    queryFn: () => getChart("densidade", "modulo_young"),
    enabled: openSections.mapa === true,
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
      setDuplicateError(describeApiError(err, ptBR.detail.error)),
  });

  // D-201: confirmation on the MSDS dialog, not window.confirm.
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  function handleDeactivate() {
    setConfirmingDeactivate(true);
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

  const sectionProps = (id: string) => ({
    id,
    open: openSections[id] === true,
    onOpenChange: (next: boolean) => setOpenSections((current) => ({ ...current, [id]: next })),
  });
  const openSection = (id: string) => setOpenSections((current) => ({ ...current, [id]: true }));
  // The page was opened on `#curvas`: the browser's own jump ran before the
  // section existed, so once the sheet is here, go there.
  const loadedId = data?.id;
  useEffect(() => {
    if (loadedId === undefined) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (SECTION_IDS.includes(hash)) document.getElementById(hash)?.scrollIntoView?.();
  }, [loadedId]);

  const outline = data
    ? [
        { id: "propriedades", label: t.properties },
        { id: "processos", label: t.compatibleProcesses },
        { id: "semelhantes", label: ptBR.similar.title },
        { id: "mapa", label: t.position },
        { id: "composicao", label: t.composition },
        { id: "designacoes", label: t.designations },
        { id: "equivalencias", label: ptBR.equivalences.title },
        { id: "ordinais", label: fichaText.ordinals.title },
        { id: "curvas", label: ptBR.curves.title },
      ]
    : [];

  const canWrite = data !== undefined && !data.is_official && (data.is_own_record || canEditCatalog);
  const canDuplicate = data !== undefined && data.is_active && data.is_own_record && !data.is_official;
  const canDeactivate = data !== undefined && data.is_active && canWrite;

  // D-214: one primary and a "⋯" for the rest (Stripe/Vercel order, D-212).
  // The primary is the verb the reader most likely came to do: edit what they
  // may edit, make their own copy of what is official, otherwise compare.
  const primary = !data ? null : data.is_official ? (
    <ButtonLink href={`/app/materiais/novo?copiar=${data.id}`} size="sm" variant="primary">
      {ptBR.form.makeOwnCopy}
    </ButtonLink>
  ) : canWrite ? (
    <ButtonLink href={`/app/materiais/${id}/editar`} size="sm" variant="primary">
      {ptBR.actions.edit}
    </ButtonLink>
  ) : (
    <ButtonLink
      href={`/app/comparar?materiais=${data.id}`}
      size="sm"
      variant="primary"
      className="m3-hide-compact"
    >
      {t.compareThis}
    </ButtonLink>
  );
  const overflowItems = !data
    ? []
    : [
        ...(canWrite || data.is_official
          ? [
              <MenuItem key="compare" onSelect={() => router.push(`/app/comparar?materiais=${data.id}`)}>
                {t.compareThis}
              </MenuItem>,
            ]
          : []),
        <MenuItem
          key="map"
          onSelect={() => router.push(`/app/mapas?x=densidade&y=modulo_young&destaque=${data.id}`)}
        >
          {t.seeOnMap}
        </MenuItem>,
        ...(canDuplicate
          ? [
              <MenuItem
                key="duplicate"
                hint={flowText.duplicate.hint}
                disabled={duplicate.isPending}
                onSelect={() => duplicate.mutate()}
              >
                {duplicate.isPending ? flowText.duplicate.busy : flowText.duplicate.button}
              </MenuItem>,
            ]
          : []),
        ...(canDeactivate
          ? [
              <MenuItem key="deactivate" onSelect={handleDeactivate}>
                {ptBR.actions.deactivate}
              </MenuItem>,
            ]
          : []),
      ];

  return (
    <div className="m3-sheet-actions-room flex flex-col gap-6">
      {/* D-207: where the material sits — catalogue, its family, itself. Until
          it loads there is no family to name, so the way back is the plain link. */}
      {data ? (
        <PageHeader
          breadcrumb={[
            { label: ptBR.nav.catalog, href: "/app/catalogo" },
            { label: data.class_name, href: `/app/catalogo/${data.class_slug}` },
            { label: data.name },
          ]}
          eyebrow={false}
          title={data.name}
          secondaryActions={
            // D-197: on a phone these two live in the floating toolbar below.
            <span className="m3-hide-compact inline-flex items-center gap-2">
              <FavoriteButton universe="material" recordId={data.id} />
              {/* D-104 e D-124: menu "Exportar ▾" com ficha técnica em PDF/HTML e CAE card. */}
              <MaterialExportMenu materialId={data.id} unitChoices={unitChoices} />
            </span>
          }
          overflow={overflowItems}
          primaryAction={primary}
        />
      ) : (
        <ButtonLink href="/app/catalogo" variant="link" size="sm" className="self-start">
          {t.back}
        </ButtonLink>
      )}

      {data && (
        <ConfirmDialog
          open={confirmingDeactivate}
          title={ptBR.actions.deactivate}
          message={ptBR.actions.confirmDeactivate}
          confirmLabel={ptBR.actions.deactivate}
          onCancel={() => setConfirmingDeactivate(false)}
          onConfirm={() => {
            setConfirmingDeactivate(false);
            deactivate.mutate();
          }}
        />
      )}

      {material.isLoading && <SheetSkeleton label={t.loading} tiles={3} />}
      {material.isError &&
        (isNotFound(material.error) ? (
          // D-200: a record that does not exist is not a failed request; there
          // is nothing to retry, only the way back.
          <ErrorState
            title={errorsText.materialNotFound.title}
            description={errorsText.materialNotFound.description}
          />
        ) : (
          <ErrorState title={t.error} error={material.error} onRetry={() => void material.refetch()} />
        ))}

      {data && (
        <>
          <Card>
            <CardBody className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* P1-4: the sheet says whose record this is. */}
                {data.is_own_record && <Badge tone="info">{ptBR.myRecords.ownBadge}</Badge>}
                {!data.is_active && <Badge>{t.inactive}</Badge>}
                {/* D-122: a copy says where it came from. */}
                {data.copied_from && (
                  <Badge tone="neutral">
                    {flowText.duplicate.copiedFrom}{" "}
                    <Link href={`/app/materiais/${data.copied_from.id}`} className="underline">
                      {data.copied_from.name}
                    </Link>
                  </Badge>
                )}
                {referencedCount > 0 ? (
                  <Badge tone="neutral">{ptBR.catalog.referenceCount(referencedCount)}</Badge>
                ) : (
                  <Badge tone="neutral">{ptBR.catalog.noReferences}</Badge>
                )}
                <ClassBadge name={data.class_name} color={classVisual(data.class_slug).color} />
                {data.subclass && <span className="text-body text-ink-muted">{data.subclass}</span>}
              </div>
              {/* D-151: the family's note, folded, right under the class it explains. */}
              <FamilyNote slug={data.class_slug} name={data.class_name} className="max-w-prose" />
              {data.description && (
                <p className="max-w-prose break-words text-body text-ink-muted">{data.description}</p>
              )}
              {data.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {data.keywords.map((kw) => (
                    <Badge key={kw}>{kw}</Badge>
                  ))}
                </div>
              )}
              {duplicateError && (
                <p role="alert" className="text-support text-danger-fg">
                  {duplicateError}
                </p>
              )}
              {/* D-116: an official record is read-only; the way forward is an
                  own copy (D-62), the header's primary action. */}
              {data.is_official && (
                <p id="material-official-reason" className="text-support text-ink-muted">
                  {ptBR.form.officialReadOnly}
                </p>
              )}
            </CardBody>
          </Card>

          <SheetQuickLinks processCount={data.processes.length} onNavigate={openSection} />

          <div className="sheet-layout">
            <div className="sheet-grid">
              <SheetOutline items={outline} onNavigate={openSection} />

              <div className="flex min-w-0 flex-col gap-6">
                <CollapsibleSection
                  {...sectionProps("propriedades")}
                  title={t.properties}
                  description={t.provenanceHint}
                >
                  {data.property_groups.length === 0 ? (
                    <EmptyState title={t.noProperties} />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <DepthLevelPicker
                          summary={ptBR.depth.sheetCount(depthLevel, atLevel.shown, atLevel.total)}
                        />
                        {atLevel.groups.length > 0 ? (
                          <CopyTableButton
                            ariaLabel={copyTablesText.sheet.aria}
                            getText={() => sheetTsv(atLevel.groups)}
                          />
                        ) : null}
                      </div>
                      {atLevel.groups.length === 0 && (
                        <EmptyState title={ptBR.depth.noneAtLevel(depthLevel)} />
                      )}
                      {/* D-215: the unit is chosen on the value itself (UnitChip),
                          not in a block of selectors before the numbers. */}
                      {atLevel.groups.map((g) => (
                        <PropertyGroupCard key={g.category} group={g} units={unitOptions} />
                      ))}
                      {/* The legend, once per sheet: the badges next to each value
                          are only readable if the vocabulary is within reach. */}
                      <Card>
                        <CardBody className="flex flex-col gap-2">
                          <DataQualityLegend />
                          <p className="text-caption text-ink-muted">{ptBR.units.readingNote}</p>
                        </CardBody>
                      </Card>
                    </>
                  )}
                </CollapsibleSection>

                {/* P0-2: the datasheet half of the material↔process join. */}
                <CollapsibleSection
                  {...sectionProps("processos")}
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
                          data.processes.reduce<Record<string, typeof data.processes>>(
                            (byFamily, process) => {
                              const family = process.class_name;
                              byFamily[family] = [...(byFamily[family] ?? []), process];
                              return byFamily;
                            },
                            {},
                          ),
                        ).map(([family, list]) => (
                          <div key={family} className="flex flex-col gap-1">
                            <span className="text-caption font-semibold text-ink-muted">{family}</span>
                            <div className="flex flex-wrap gap-2">
                              {/* Links since P1-4: the join reads in both
                                  directions now that a process has a datasheet. */}
                              {list.map((process) => (
                                <Link
                                  key={process.slug}
                                  href={`/app/processos/${process.slug}`}
                                  className="rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                  <Badge tone="brand" title={process.description ?? undefined}>
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
                </CollapsibleSection>

                {/* P2: "what resembles this" is a question about a record, so it
                    lives on the record's own page. D-214: folded, with the way in
                    in the summary strip at the top. */}
                <CollapsibleSection
                  {...sectionProps("semelhantes")}
                  title={ptBR.similar.title}
                  description={ptBR.similar.hint}
                >
                  <SimilarPanel material={data} unitChoices={unitChoices} embedded />
                </CollapsibleSection>

                {/* D-214: on demand — the figure (and the request behind it) only
                    exists once the reader opens the section. */}
                <CollapsibleSection
                  {...sectionProps("mapa")}
                  title={t.position}
                  description={fichaText.layout.mapHint}
                >
                  {chart.isLoading && <ChartSkeleton />}
                  {chart.isError && (
                    <ErrorState
                      title={t.error}
                      error={chart.error}
                      onRetry={() => void chart.refetch()}
                    />
                  )}
                  {chart.data && <PropertyChart data={chart.data} highlightMaterialId={id} />}
                  <ButtonLink
                    href={`/app/mapas?x=densidade&y=modulo_young&destaque=${id}`}
                    size="sm"
                    className="self-start"
                  >
                    {t.openInMaps} →
                  </ButtonLink>
                </CollapsibleSection>

                {/* D-105 (TM2): composition and designations, each a table — the
                    text is the record here, and absence is written, never blank. */}
                <div className="sheet-pair">
                  <div className="sheet-pair-grid">
                    <CollapsibleSection
                      {...sectionProps("composicao")}
                      title={t.composition}
                      description={t.compositionHint}
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
                              className="self-start"
                              onClick={() => setEditing("composition")}
                            >
                              {t.edit.editComposition}
                            </Button>
                          )}
                        </>
                      )}
                      {data.is_official && (
                        <p className="text-caption text-ink-muted">{t.edit.officialReadOnly}</p>
                      )}
                    </CollapsibleSection>
                    <CollapsibleSection
                      {...sectionProps("designacoes")}
                      title={t.designations}
                      description={t.designationsHint}
                    >
                      {editing === "designations" ? (
                        <DesignationEditor
                          materialId={data.id}
                          designations={data.designations}
                          onDone={() => setEditing(null)}
                        />
                      ) : (
                        <>
                          <DesignationTable designations={data.designations} />
                          {canEditIdentity && (
                            <Button
                              size="sm"
                              className="self-start"
                              onClick={() => setEditing("designations")}
                            >
                              {t.edit.editDesignations}
                            </Button>
                          )}
                        </>
                      )}
                    </CollapsibleSection>
                  </div>
                </div>

                {/* D-115 (TM1): what a source declares equivalent to this material's
                    designations — kind and source written, and "nothing declared"
                    said in words. Never inferred from a name or a shared code. */}
                <CollapsibleSection
                  {...sectionProps("equivalencias")}
                  title={ptBR.equivalences.title}
                  description={ptBR.equivalences.hint}
                >
                  <EquivalenceSection materialId={data.id} />
                </CollapsibleSection>

                {/* D-126 (ORD-a): the level this material holds on each ordinal scale.
                    The scale is shown as catalogued and the absence is written; no
                    level is ever estimated here. */}
                <CollapsibleSection
                  {...sectionProps("ordinais")}
                  title={fichaText.ordinals.title}
                  description={fichaText.ordinals.hint}
                >
                  <MaterialOrdinals materialId={data.id} />
                </CollapsibleSection>

                {/* D-106 (TM4): the material's curves, each a figure with its table of
                    points (D-31). */}
                <CollapsibleSection
                  {...sectionProps("curvas")}
                  title={ptBR.curves.title}
                  description={ptBR.curves.hint}
                >
                  <MaterialCurves materialId={data.id} canEdit={canEditIdentity} />
                </CollapsibleSection>
              </div>
            </div>
          </div>

          <SheetActions materialId={data.id} unitChoices={unitChoices} showMap />
        </>
      )}
    </div>
  );
}
