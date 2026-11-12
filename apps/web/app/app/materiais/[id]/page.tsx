"use client";

import { describeApiError, isNotFound } from "@/lib/errors";
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
  updateMaterial,
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
  Breadcrumb,
  Button,
  ButtonLink,
  Card,
  CardBody,
  ClassBadge,
  ConfirmDialog,
  DataQualityLegend,
  DocSection,
  EmptyState,
  ErrorState,
  LoadingState,
  MenuItem,
  Outline,
  PageDoc,
  PropertyList,
  type OutlineItem,
} from "@/components/ui";
import { useAnnounce } from "@/components/ui/Announcer";
import { usePageTitle } from "@/lib/pageTitle";

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

  const unitOptions: UnitOptions = new Map(
    (properties.data ?? []).map((d) => [
      d.slug,
      { accepted: d.accepted_units ?? [], convention: d.display_unit },
    ]),
  );

  // D-214: the title is edited in place where the server would accept it.
  const announce = useAnnounce();
  const [renameError, setRenameError] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (name: string) => updateMaterial(id, { name }),
    onSuccess: (saved) => {
      setRenameError(null);
      qc.invalidateQueries({ queryKey: ["material", id] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      announce(fichaText.doc.renamed(saved.name));
    },
    onError: (err) => setRenameError(describeApiError(err, fichaText.doc.renameError)),
  });

  const canEdit = data !== undefined && !data.is_official && (data.is_own_record || canEditCatalog);

  const outline: OutlineItem[] = data
    ? [
        { id: "propriedades", label: t.properties },
        { id: "processos", label: t.compatibleProcesses },
        { id: "semelhantes", label: ptBR.similar.title },
        ...(chart.data ? [{ id: "mapa", label: fichaText.doc.mapTitle }] : []),
        { id: "composicao", label: t.composition },
        { id: "designacoes", label: t.designations },
        { id: "equivalencias", label: ptBR.equivalences.title },
        { id: "ordinais", label: fichaText.ordinals.title },
        { id: "curvas", label: ptBR.curves.title },
      ]
    : [];

  return (
    <div className="m3-sheet-actions-room flex flex-col gap-6">
      {/* D-207: where the material sits — catalogue, its family, itself. Until
          it loads there is no family to name, so the way back is the plain link. */}
      {data ? (
        <Breadcrumb
          items={[
            { label: ptBR.nav.catalog, href: "/app/catalogo" },
            { label: data.class_name, href: `/app/catalogo/${data.class_slug}` },
            { label: data.name },
          ]}
        />
      ) : (
        <ButtonLink
          href="/app/catalogo"
          variant="link"
          size="sm"
          className="self-start"
        >
          {t.back}
        </ButtonLink>
      )}

      {material.isLoading && <LoadingState label={t.loading} />}
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
        // D-214: the sheet is a document page — the name, its properties in
        // one aligned list, one visible action and the rest in "⋯"; below, the
        // sections fold and a side index follows the reading.
        <PageDoc
          icon={
            <span
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: classVisual(data.class_slug).color }}
            />
          }
          title={data.name}
          onTitleChange={canEdit ? (name) => rename.mutate(name) : undefined}
          primaryAction={
            <>
              {/* D-197: on a phone these two live in the floating toolbar below. */}
              <span className="m3-hide-compact inline-flex items-center gap-2">
                <FavoriteButton universe="material" recordId={data.id} />
                {/* D-104 e D-124: menu "Exportar ▾" com ficha técnica em PDF/HTML e CAE card. */}
                <MaterialExportMenu materialId={data.id} unitChoices={unitChoices} />
              </span>
              {/* D-116: an official record is read-only; the way forward is an
                  own copy (D-62), which is not official. D-83: a shared
                  material a student cannot write offers no Edit at all. */}
              {data.is_official ? (
                <ButtonLink
                  href={`/app/materiais/novo?copiar=${data.id}`}
                  size="sm"
                  aria-describedby="material-official-reason"
                >
                  {ptBR.form.makeOwnCopy}
                </ButtonLink>
              ) : canEdit ? (
                <ButtonLink href={`/app/materiais/${id}/editar`} size="sm">
                  {ptBR.actions.edit}
                </ButtonLink>
              ) : null}
            </>
          }
          menu={
            <>
              <MenuItem href={`/app/comparar?materiais=${data.id}`}>{t.compareThis}</MenuItem>
              {chart.data ? (
                <MenuItem href={`/app/mapas?x=densidade&y=modulo_young&destaque=${id}`}>
                  {t.seeOnMap}
                </MenuItem>
              ) : null}
              {data.is_active && data.is_own_record && !data.is_official ? (
                <MenuItem
                  title={flowText.duplicate.hint}
                  disabled={duplicate.isPending}
                  onSelect={() => duplicate.mutate()}
                >
                  {duplicate.isPending ? flowText.duplicate.busy : flowText.duplicate.button}
                </MenuItem>
              ) : null}
              {data.is_active && canEdit ? (
                <MenuItem disabled={deactivate.isPending} onSelect={handleDeactivate}>
                  {ptBR.actions.deactivate}
                </MenuItem>
              ) : null}
            </>
          }
          properties={
            <PropertyList
              items={[
                {
                  id: "classe",
                  label: fichaText.doc.classLabel,
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <ClassBadge
                        name={data.class_name}
                        color={classVisual(data.class_slug).color}
                      />
                      {data.subclass && (
                        <span className="text-body text-ink-muted">{data.subclass}</span>
                      )}
                    </span>
                  ),
                },
                {
                  id: "registro",
                  label: fichaText.doc.recordLabel,
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {/* P1-4: the sheet says whose record this is. */}
                      {data.is_own_record && <Badge tone="info">{ptBR.myRecords.ownBadge}</Badge>}
                      <Badge>{data.is_active ? fichaText.doc.active : t.inactive}</Badge>
                      {/* D-122: a copy says where it came from. */}
                      {data.copied_from && (
                        <Badge tone="neutral">
                          {flowText.duplicate.copiedFrom}{" "}
                          <Link href={`/app/materiais/${data.copied_from.id}`} className="underline">
                            {data.copied_from.name}
                          </Link>
                        </Badge>
                      )}
                    </span>
                  ),
                },
                {
                  id: "referencias",
                  label: fichaText.doc.referencesLabel,
                  value:
                    referencedCount > 0
                      ? ptBR.catalog.referenceCount(referencedCount)
                      : ptBR.catalog.noReferences,
                },
                ...(data.keywords.length > 0
                  ? [
                      {
                        id: "palavras",
                        label: fichaText.doc.keywordsLabel,
                        value: (
                          <span className="flex flex-wrap gap-1">
                            {data.keywords.map((kw) => (
                              <Badge key={kw}>{kw}</Badge>
                            ))}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          }
        >
          <div className="flex flex-col gap-2">
            {data.description && (
              <p className="max-w-prose text-body text-ink">{data.description}</p>
            )}
            {/* D-151: the family's note, folded, right under the class it explains. */}
            <FamilyNote slug={data.class_slug} name={data.class_name} className="max-w-prose" />
            {data.is_official && (
              <p id="material-official-reason" className="text-support text-ink-muted">
                {ptBR.form.officialReadOnly}
              </p>
            )}
            {(duplicateError || renameError) && (
              <p role="alert" className="text-support text-danger-fg">
                {duplicateError ?? renameError}
              </p>
            )}
          </div>
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

          <div className="ds-doc-grid">
            <Outline items={outline} />
            <div className="ds-doc-main">
              <DocSection
                id="propriedades"
                title={t.properties}
                description={t.provenanceHint}
                actions={
                  atLevel.groups.length > 0 ? (
                    <CopyTableButton
                      ariaLabel={copyTablesText.sheet.aria}
                      getText={() => sheetTsv(atLevel.groups)}
                    />
                  ) : undefined
                }
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
              </DocSection>

              {/* P0-2: the datasheet half of the material↔process join. */}
              <DocSection
                id="processos"
                title={t.compatibleProcesses}
                description={t.compatibleProcessesHint}
              >
                {data.processes.length === 0 ? (
                  // Written out, never an empty card: no process linked is a
                  // state, and it is not the same as "cannot be manufactured".
                  <EmptyState title={t.noProcesses} />
                ) : (
                  <PropertyList
                    items={Object.entries(
                      data.processes.reduce<Record<string, typeof data.processes>>(
                        (byFamily, process) => {
                          const family = process.class_name;
                          byFamily[family] = [...(byFamily[family] ?? []), process];
                          return byFamily;
                        },
                        {},
                      ),
                    ).map(([family, list]) => ({
                      id: family,
                      label: family,
                      value: (
                        <span className="flex flex-wrap gap-2">
                          {/* Links since P1-4: the join reads in both directions. */}
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
                        </span>
                      ),
                    }))}
                  />
                )}
              </DocSection>

              {/* P2: "what resembles this" is a question about a record, so it
                  lives on the record's own page. */}
              <SimilarPanel material={data} unitChoices={unitChoices} />

              {chart.data && (
                // `min-w-0` inside: the figure's data table is wider than a
                // phone and scrolls in its own box, never the page.
                <DocSection id="mapa" title={fichaText.doc.mapTitle}>
                  <PropertyChart data={chart.data} highlightMaterialId={id} />
                  <ButtonLink
                    href={`/app/mapas?x=densidade&y=modulo_young&destaque=${id}`}
                    size="sm"
                    variant="tonal"
                    className="self-start"
                  >
                    {t.openInMaps} →
                  </ButtonLink>
                </DocSection>
              )}

              {/* D-105 (TM2): composition and designations, each a table — the
                  text is the record here, and absence is written, never blank. */}
              <DocSection id="composicao" title={t.composition} description={t.compositionHint}>
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
                        variant="tonal"
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
              </DocSection>
              <DocSection id="designacoes" title={t.designations} description={t.designationsHint}>
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
                        variant="tonal"
                        className="self-start"
                        onClick={() => setEditing("designations")}
                      >
                        {t.edit.editDesignations}
                      </Button>
                    )}
                  </>
                )}
              </DocSection>

              {/* D-115 (TM1): what a source declares equivalent — never inferred. */}
              <DocSection
                id="equivalencias"
                title={ptBR.equivalences.title}
                description={ptBR.equivalences.hint}
              >
                <EquivalenceSection materialId={data.id} />
              </DocSection>

              {/* D-126 (ORD-a): the level on each ordinal scale; never estimated. */}
              <DocSection
                id="ordinais"
                title={fichaText.ordinals.title}
                description={fichaText.ordinals.hint}
              >
                <MaterialOrdinals materialId={data.id} />
              </DocSection>

              {/* D-106 (TM4): the curves, each a figure with its table (D-31). */}
              <DocSection id="curvas" title={ptBR.curves.title} description={ptBR.curves.hint}>
                <MaterialCurves materialId={data.id} canEdit={canEditIdentity} />
              </DocSection>
            </div>
          </div>

          <SheetActions materialId={data.id} unitChoices={unitChoices} showMap={Boolean(chart.data)} />
        </PageDoc>
      )}
    </div>
  );
}
