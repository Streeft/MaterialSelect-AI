"use client";

import Link from "next/link";
import { Suspense, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  catalogueExportUrl,
  listClasses,
  listProperties,
  searchMaterials,
  type CatalogQuery,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { roots } from "@/lib/taxonomy";
import { ExportButtons } from "@/components/ExportButtons";
import { MaterialList } from "@/components/catalog/MaterialList";
import { MaterialCards, MaterialLines } from "@/components/catalog/MaterialCards";
import { MaterialPreview } from "@/components/catalog/MaterialPreview";
import {
  CATALOG_COLUMNS,
  type CatalogColumn,
  type ServerSort,
} from "@/components/catalog/MaterialRows";
import { PaneScaffold } from "@/components/layout/PaneScaffold";
import { useAnnounce } from "@/components/ui/Announcer";
import { BREAKPOINT_MIN } from "@/lib/design/breakpoints";
import { CompositionReport } from "@/components/catalog/CompositionReport";
import { SearchHelp } from "@/components/catalog/SearchHelp";
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DensityToggle,
  CardBody,
  DataQualityLegend,
  EmptyState,
  ErrorState,
  FilterBar,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Popover,
  SavedViewsBar,
  Section,
  Select,
  SelectOption,
  VIEW_KIND_LABEL,
  type FilterField,
} from "@/components/ui";
import { useDatabaseView } from "@/lib/savedViews";
import { enumCodec, textCodec, useUrlState, type UrlCodec, type UrlSpec } from "@/lib/urlState";
import { useDebounced } from "@/lib/useDebounced";

const t = ptBR.catalog;

/** D-215: one page of the catalogue; the phone used to get all ~680 cards at once. */
const CATALOG_PAGE_SIZE = 50;

type QualityFilter = "" | "complete" | "gaps" | "measured" | "referenced";
type DemoFilter = "" | "sim" | "nao";
type ViewKind = "table" | "gallery" | "list";

/** A 1-based page number; anything else in the URL is page 1. */
const pageCodec: UrlCodec<number> = {
  parse: (raw) => (/^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : undefined),
  serialize: (value) => String(value),
};

/** The optional table columns, comma-separated; an unknown name is dropped. */
const columnsCodec: UrlCodec<string> = {
  parse: (raw) =>
    raw
      .split(",")
      .filter((c): c is CatalogColumn => (CATALOG_COLUMNS as readonly string[]).includes(c))
      .join(","),
  serialize: (value) => value,
};

interface CatalogUrl {
  busca: string;
  classe: string;
  subclasse: string;
  qualidade: QualityFilter;
  demo: DemoFilter;
  pagina: number;
  visao: ViewKind;
  ordenar: string;
  direcao: "asc" | "desc";
  colunas: string;
}

/**
 * D-215: the whole question in the address — text, chips, page, view, order
 * and columns — so a link reopens the same page and Back/Reload keep it. The
 * names of `busca`, `classe` and `subclasse` are the ones the panel already
 * links with (D-193).
 */
const CATALOG_URL: UrlSpec<CatalogUrl> = {
  busca: { param: "busca", codec: textCodec, defaultValue: "" },
  classe: { param: "classe", codec: textCodec, defaultValue: "" },
  subclasse: { param: "subclasse", codec: textCodec, defaultValue: "" },
  qualidade: {
    param: "qualidade",
    codec: enumCodec<QualityFilter>(["", "complete", "gaps", "measured", "referenced"]),
    defaultValue: "",
  },
  demo: { param: "demo", codec: enumCodec<DemoFilter>(["", "sim", "nao"]), defaultValue: "" },
  pagina: { param: "pagina", codec: pageCodec, defaultValue: 1 },
  visao: { param: "visao", codec: enumCodec<ViewKind>(["table", "gallery", "list"]), defaultValue: "table" },
  ordenar: { param: "ordenar", codec: textCodec, defaultValue: "relevancia" },
  direcao: { param: "direcao", codec: enumCodec(["asc", "desc"] as const), defaultValue: "asc" },
  colunas: { param: "colunas", codec: columnsCodec, defaultValue: CATALOG_COLUMNS.join(",") },
};

type FilterKey = "classe" | "subclasse" | "qualidade" | "demo";

/**
 * A 400 from the search is the reader's query, refused with the reason in
 * Portuguese (D-55, D-105) — shown as such and never retried. Read by shape
 * rather than by `instanceof ApiError`, which every test mock of the API would
 * otherwise have to re-export.
 */
function isQueryRejection(error: unknown): error is Error & { status: 400 } {
  return error instanceof Error && (error as { status?: unknown }).status === 400;
}

export default function CatalogPage() {
  // `useSearchParams` (inside `useUrlState`) needs a boundary, or `next build` refuses the page.
  return (
    <Suspense fallback={<LoadingState />}>
      <CatalogPageContent />
    </Suspense>
  );
}

function CatalogPageContent() {
  const [url, setUrl] = useUrlState(CATALOG_URL);
  // D-209: the filters still belong to the saved views (tabs in the reader's
  // account); D-215 only moves where they are kept, into the URL. Any change
  // of chip or of text goes back to page 1.
  const view = useDatabaseView<FilterKey>({
    scope: "catalogo",
    initialFilters: { classe: null, subclasse: null, qualidade: null, demo: null },
    defaultKind: "table",
    store: {
      filters: {
        classe: url.classe || null,
        subclasse: url.subclasse || null,
        qualidade: url.qualidade || null,
        demo: url.demo || null,
      },
      updateFilters: (update) =>
        setUrl((current) => {
          const next = update({
            classe: current.classe || null,
            subclasse: current.subclasse || null,
            qualidade: current.qualidade || null,
            demo: current.demo || null,
          });
          return {
            classe: next.classe ?? "",
            subclasse: next.subclasse ?? "",
            qualidade: (next.qualidade ?? "") as QualityFilter,
            demo: (next.demo ?? "") as DemoFilter,
            pagina: 1,
          };
        }),
      kind: url.visao,
      setKind: (kind) => setUrl({ visao: kind }),
    },
  });

  const debouncedSearch = useDebounced(url.busca, 300);
  const columns = useMemo(
    () => new Set(url.colunas.split(",").filter(Boolean) as CatalogColumn[]),
    [url.colunas],
  );

  const question: CatalogQuery = {
    q: debouncedSearch,
    classe: url.classe || null,
    subclasse: url.subclasse || null,
    qualidade: url.qualidade || null,
    demo: url.demo === "sim" ? true : url.demo === "nao" ? false : null,
    ordenar: url.ordenar,
    direcao: url.direcao,
    limit: CATALOG_PAGE_SIZE,
    offset: (url.pagina - 1) * CATALOG_PAGE_SIZE,
    facetas: true,
  };
  // D-105/D-215: one endpoint answers the rows, the total, the chip counts and
  // the composition report. The key keeps the "materials" prefix every
  // invalidation already targets.
  const materials = useQuery({
    queryKey: ["materials", "busca", question],
    queryFn: () => searchMaterials(question),
    // Keep the last good page on screen while the next one loads.
    placeholderData: (previous) => previous,
    retry: (count, error) => !isQueryRejection(error) && count < 2,
  });
  const items = materials.data?.items;
  const total = materials.data?.total ?? 0;
  const facets = materials.data?.facets ?? null;
  const queryError = isQueryRejection(materials.error) ? materials.error.message : null;
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });

  const sortProperty =
    ["relevancia", "nome", "classe"].includes(url.ordenar)
      ? null
      : (properties.data ?? []).find((p) => p.slug === url.ordenar) ?? null;
  const filtered = Boolean(url.classe || url.subclasse || url.qualidade || url.demo);

  // D-184: list-detail. A plain click on a name shows the material beside the
  // list when the list's own block is wide enough for two panes (the same 840 px
  // the scaffold's container query uses); otherwise the link navigates as before.
  // A preview whose material leaves the page simply closes.
  const listRef = useRef<HTMLDivElement>(null);
  const announce = useAnnounce();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const shown = items ?? [];
  const previewItem = shown.find((m) => m.id === previewId) ?? null;
  const requestPreview = (id: number) => {
    const width = listRef.current?.getBoundingClientRect().width ?? 0;
    if (width < BREAKPOINT_MIN.expanded) return false;
    setPreviewId(id);
    const name = shown.find((m) => m.id === id)?.name;
    if (name) announce(t.preview.opened(name));
    return true;
  };

  // The table's headers order the whole catalogue, not the page on screen.
  const headerSort: ServerSort = {
    state:
      url.ordenar === "nome"
        ? { key: "name", dir: url.direcao }
        : url.ordenar === "classe"
          ? { key: "class", dir: url.direcao }
          : null,
    onChange: (next) =>
      setUrl({
        ordenar: next ? (next.key === "name" ? "nome" : "classe") : "relevancia",
        direcao: next?.dir ?? "asc",
        pagina: 1,
      }),
  };

  // Chip options carry the server's counts (the other chips applied). A
  // subclass is offered only where the result has it, so a chip never offers
  // a value that empties the screen.
  const count = (bucket: Record<string, number> | undefined, key: string) =>
    facets ? (bucket?.[key] ?? 0) : undefined;
  const subclasses = Object.keys(facets?.subclasse ?? {}).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const filterFields: FilterField[] = [
    {
      id: "classe",
      label: t.filterClass,
      pinned: true,
      value: view.filters.classe,
      options: (classes.data ?? []).map((c) => ({
        value: c.slug,
        label: c.name,
        count: count(facets?.classe, c.slug),
      })),
    },
    {
      id: "qualidade",
      label: t.filterQuality,
      pinned: true,
      value: view.filters.qualidade,
      options: (
        [
          ["complete", t.qualityComplete],
          ["gaps", t.qualityWithGaps],
          ["measured", t.qualityMeasured],
          ["referenced", t.qualityReferenced],
        ] as const
      ).map(([value, label]) => ({ value, label, count: count(facets?.qualidade, value) })),
    },
    {
      id: "subclasse",
      label: t.subclassLabel,
      value: view.filters.subclasse,
      options: subclasses.map((name) => ({
        value: name,
        label: name,
        count: count(facets?.subclasse, name),
      })),
    },
    {
      id: "demo",
      label: t.filterDemo,
      value: view.filters.demo,
      options: [
        { value: "sim", label: t.demoOnly, count: count(facets?.demo, "true") },
        { value: "nao", label: t.demoNone, count: count(facets?.demo, "false") },
      ],
    },
  ];

  const pagination = (
    <Pagination
      page={url.pagina}
      pageSize={CATALOG_PAGE_SIZE}
      total={total}
      onPage={(pagina) => {
        setPreviewId(null);
        setUrl({ pagina });
      }}
      rangeLabel={t.pageRange}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        secondaryActions={
          // D-108: a quiet door to a maintenance reading, not a second action.
          <ButtonLink href="/app/catalogo/releases" variant="ghost" size="sm">
            {t.releasesLink}
          </ButtonLink>
        }
        primaryAction={
          <ButtonLink href="/app/materiais/novo" variant="primary" size="sm">
            + {ptBR.actions.new}
          </ButtonLink>
        }
      />

      <div className="flex min-w-0 flex-col gap-3">
        <SavedViewsBar
          views={view.saved.views}
          activeId={view.activeId}
          onSelect={view.select}
          onCreate={(kind) =>
            view.create(kind, `${VIEW_KIND_LABEL[kind]} ${view.saved.views.length + 1}`)
          }
          onRename={view.rename}
          onDelete={view.remove}
          dirty={view.dirty}
          onSaveChanges={view.saveChanges}
        />
        <Input
          label={t.searchLabel}
          type="search"
          value={url.busca}
          onChange={(e) => setUrl({ busca: e.target.value, pagina: 1 })}
          placeholder={t.searchPlaceholder}
          hint={t.searchHint}
        />
        <FilterBar
          fields={filterFields}
          onChange={(id, value) => view.setFilter(id as FilterKey, value)}
          onClear={view.clearFilters}
        />
        <SearchHelp onUse={(query) => setUrl({ busca: query, pagina: 1 })} />
      </div>

      {/* P1-4: the way *into* the taxonomy, next to (not instead of) the filter
          above. The two answer different questions — the chip narrows the list
          on this screen, a family card leaves for that family's own page. The
          count is the server's (D-215): the family and everything under it,
          for the current text and the other chips. */}
      <Section id="familias" title={ptBR.family.families} description={t.browseHint}>
        <div className="flex flex-wrap gap-2">
          {roots(classes.data ?? []).map((family) => (
            <Link
              key={family.slug}
              href={`/app/catalogo/${family.slug}`}
              className="min-w-0 rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Card className="pressable">
                <CardBody className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="break-words font-medium text-ink">{family.name}</span>
                  {facets ? (
                    <span className="text-caption text-ink-muted">
                      {ptBR.family.countMaterials(facets.classe[family.slug] ?? 0)}
                    </span>
                  ) : null}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        id="materiais"
        title={t.count(total)}
        actions={
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <Select
              label={t.orderLabel}
              value={url.ordenar}
              onChange={(e) => setUrl({ ordenar: e.target.value, pagina: 1 })}
              className="min-w-0 max-w-[16rem]"
            >
              <SelectOption value="relevancia">{t.orderRelevance}</SelectOption>
              <SelectOption value="nome">{t.orderName}</SelectOption>
              <SelectOption value="classe">{t.orderClass}</SelectOption>
              <optgroup label={t.orderPropertiesGroup}>
                {(properties.data ?? [])
                  .filter((p) => p.value_count > 0)
                  .map((p) => (
                    <SelectOption key={p.slug} value={p.slug}>
                      {p.name}
                    </SelectOption>
                  ))}
              </optgroup>
            </Select>
            {url.ordenar !== "relevancia" ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`${t.directionLabel}: ${url.direcao === "asc" ? t.directionAsc : t.directionDesc}`}
                onClick={() =>
                  setUrl({ direcao: url.direcao === "asc" ? "desc" : "asc", pagina: 1 })
                }
              >
                {url.direcao === "asc" ? t.directionAsc : t.directionDesc}
              </Button>
            ) : null}
            {view.kind === "table" ? (
              <Popover
                label={t.columnsMenu}
                title={t.columnsMenu}
                align="end"
                triggerClassName="msds-chip msds-ripple-host hidden sm:inline-flex"
                trigger={<span>{t.columnsLabel}</span>}
              >
                <fieldset className="flex flex-col gap-1 p-1">
                  <legend className="sr-only">{t.columnsMenu}</legend>
                  {CATALOG_COLUMNS.map((column) => (
                    <Checkbox
                      key={column}
                      label={columnLabel(column)}
                      checked={columns.has(column)}
                      onChange={(e) => {
                        const next = new Set(columns);
                        if (e.target.checked) next.add(column);
                        else next.delete(column);
                        setUrl({
                          colunas: CATALOG_COLUMNS.filter((c) => next.has(c)).join(","),
                        });
                      }}
                    />
                  ))}
                </fieldset>
              </Popover>
            ) : null}
            {/* The table exists from `sm` up; the cards below it have no rows to densify. */}
            {view.kind === "table" ? <DensityToggle className="hidden sm:inline-flex" /> : null}
            <ExportButtons urlFor={catalogueExportUrl} label={ptBR.exports.catalogue} />
          </div>
        }
      >
        {materials.isLoading && <LoadingState label={t.loading} />}
        {materials.isError &&
          (queryError ? (
            <ErrorState title={t.searchError} description={queryError} />
          ) : (
            <ErrorState
              title={t.error}
              error={materials.error}
              onRetry={() => void materials.refetch()}
            />
          ))}
        {!materials.isError && materials.data?.composition && (
          <CompositionReport report={materials.data.composition} />
        )}

        {items &&
          !materials.isError &&
          (shown.length === 0 ? (
            <EmptyState
              title={filtered ? t.emptyFiltered : t.empty}
              description={filtered ? undefined : t.emptyHint}
              action={
                filtered ? (
                  <Button size="sm" onClick={view.clearFilters}>
                    {t.clearFilters}
                  </Button>
                ) : (
                  <ButtonLink href="/app/materiais/novo" size="sm" variant="primary">
                    + {ptBR.actions.new}
                  </ButtonLink>
                )
              }
            />
          ) : (
            <div ref={listRef} className="flex min-w-0 flex-col gap-3">
              {previewItem ? (
                <PaneScaffold
                  layout="list-detail"
                  focus="secondary"
                  primaryLabel={t.preview.list}
                  secondaryLabel={t.preview.region}
                  primary={
                    <MaterialList
                      materials={shown}
                      searchQuery={debouncedSearch}
                      onPreview={requestPreview}
                      previewId={previewItem.id}
                      serverSort={headerSort}
                      valueColumn={sortProperty?.name}
                      compact
                    />
                  }
                  secondary={
                    <MaterialPreview
                      key={previewItem.id}
                      item={previewItem}
                      onClose={() => setPreviewId(null)}
                    />
                  }
                />
              ) : view.kind === "gallery" ? (
                <MaterialCards
                  materials={shown}
                  searchQuery={debouncedSearch}
                  layout="gallery"
                  valueLabel={sortProperty?.name}
                />
              ) : view.kind === "list" ? (
                <MaterialLines materials={shown} searchQuery={debouncedSearch} />
              ) : (
                <MaterialList
                  materials={shown}
                  searchQuery={debouncedSearch}
                  onPreview={requestPreview}
                  serverSort={headerSort}
                  columns={columns}
                  valueColumn={sortProperty?.name}
                />
              )}
              {pagination}
            </div>
          ))}

        {/* The legend belongs on the screen that shows many values at once —
            the badges above are only readable if the vocabulary is at hand. */}
        <Card>
          <CardBody>
            <DataQualityLegend />
          </CardBody>
        </Card>
      </Section>
    </div>
  );
}

function columnLabel(column: CatalogColumn): string {
  switch (column) {
    case "class":
      return t.columnClass;
    case "quality":
      return t.columnQuality;
    case "keywords":
      return t.columnKeywords;
    case "designations":
      return t.columnDesignations;
  }
}
