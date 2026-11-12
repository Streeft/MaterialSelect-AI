"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProcessMatrix, listProcessClasses, listProcesses } from "@/lib/api";
import { ProcessCompare } from "@/components/process/ProcessCompare";
import { ProcessMatrix } from "@/components/process/ProcessMatrix";
import {
  MASS_UNITS,
  MAX_COMPARE_PROCESSES,
  PROCESSES_URL,
  THICKNESS_UNITS,
  type ProcessMode,
} from "@/lib/processesUrl";
import { useDebounced } from "@/lib/useDebounced";
import { matchesQuery } from "@/lib/search";
import { useUrlState } from "@/lib/urlState";
import type { Process, ProcessClass } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { descendantSlugs, roots } from "@/lib/taxonomy";
import { useDatabaseView } from "@/lib/savedViews";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  FilterBar,
  Input,
  ListSkeleton,
  Select,
  SelectOption,
  PageHeader,
  RowHeader,
  SavedViewsBar,
  Section,
  Table,
  TableScroll,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  VIEW_KIND_LABEL,
  type FilterField,
} from "@/components/ui";

const t = ptBR.processes;

/**
 * The process universe's front door (P1-4).
 *
 * It had none: the second universe was reachable only from inside a selection
 * stage and from a material's datasheet, which made it something you *use* and
 * never something you *browse* — the gap the method's browse step is about.
 *
 * Grouped by root family rather than listed flat, because the family is the
 * first question the method asks about a process ("conforma, une ou trata?"),
 * and because a flat list of thirteen is already a list nobody reads.
 */
export default function ProcessesPage() {
  // `useSearchParams` (inside `useUrlState`) needs a boundary, or `next build` refuses the page.
  return (
    <Suspense fallback={<ListSkeleton variant="rows" count={4} />}>
      <ProcessesPageContent />
    </Suspense>
  );
}

type FilterKey = "familia" | "subfamilia" | "uso";

function ProcessesPageContent() {
  const [url, setUrl] = useUrlState(PROCESSES_URL);
  const classes = useQuery({
    queryKey: ["process-classes"],
    queryFn: listProcessClasses,
  });
  const processes = useQuery({
    queryKey: ["processes"],
    queryFn: listProcesses,
  });

  // D-209: a database of processes. The family cards are the "Galeria", the
  // default; "Tabela" and "Lista" read the same rows flat. Filters narrow the
  // list the server sent (family, sub-family, whether any material uses it)
  // and live in the reader's saved views.
  // D-219: the filters, the kind and the search now live in the address.
  const view = useDatabaseView<FilterKey>({
    scope: "processos",
    initialFilters: { familia: null, subfamilia: null, uso: null },
    defaultKind: "gallery",
    store: {
      filters: {
        familia: url.familia || null,
        subfamilia: url.subfamilia || null,
        uso: url.uso || null,
      },
      updateFilters: (update) =>
        setUrl((current) => {
          const next = update({
            familia: current.familia || null,
            subfamilia: current.subfamilia || null,
            uso: current.uso || null,
          });
          return {
            familia: next.familia ?? "",
            subfamilia: next.subfamilia ?? "",
            uso: (next.uso ?? "") as "" | "com" | "sem",
          };
        }),
      kind: url.visao,
      setKind: (kind) => setUrl({ visao: kind }),
    },
  });

  // D-219: capability filters are answered by the backend (it converts the unit
  // and compares the envelope); the lists below keep what it kept.
  const capQuery = {
    massa: url.massa,
    massaUnidade: url.massaUn,
    espessura: url.espessura,
    espessuraUnidade: url.espessuraUn,
    lote: url.lote,
  };
  const debouncedCap = useDebounced(JSON.stringify(capQuery), 400);
  const capActive = [url.massa, url.espessura, url.lote].some((v) =>
    /^\d+([.,]\d+)?$/.test(v.trim()),
  );
  const matrixOn = url.modo === "matriz" || capActive;
  const matrix = useQuery({
    queryKey: ["process-matrix", debouncedCap],
    queryFn: () => getProcessMatrix(JSON.parse(debouncedCap)),
    enabled: matrixOn,
    placeholderData: (previous) => previous,
  });
  const keptSlugs = useMemo(
    () =>
      capActive && matrix.data
        ? new Set(matrix.data.rows.map((r) => r.process.slug))
        : null,
    [capActive, matrix.data],
  );
  const toggleCompare = (slug: string) =>
    setUrl((current) => ({
      comparar: current.comparar.includes(slug)
        ? current.comparar.filter((s) => s !== slug)
        : current.comparar.length < MAX_COMPARE_PROCESSES
          ? [...current.comparar, slug]
          : current.comparar,
    }));

  const loading = classes.isLoading || processes.isLoading;
  const failed = classes.isError || processes.isError;
  const allClasses = useMemo(() => classes.data ?? [], [classes.data]);
  const rootOf = useMemo(() => {
    const map = new Map<string, ProcessClass>();
    for (const root of roots(allClasses)) {
      for (const slug of descendantSlugs(root.slug, allClasses))
        map.set(slug, root);
    }
    return map;
  }, [allClasses]);

  const needle = url.busca.trim();
  const shown = (processes.data ?? []).filter((p) => {
    if (
      view.filters.familia &&
      rootOf.get(p.class_slug)?.slug !== view.filters.familia
    )
      return false;
    if (view.filters.subfamilia && p.class_slug !== view.filters.subfamilia)
      return false;
    if (view.filters.uso === "com" && p.material_count === 0) return false;
    if (view.filters.uso === "sem" && p.material_count > 0) return false;
    // While the backend has not answered yet, keep the list rather than flash it empty.
    if (keptSlugs && !keptSlugs.has(p.slug)) return false;
    return matchesQuery(needle, p.name);
  });
  const filtered =
    Boolean(needle) ||
    capActive ||
    Object.values(view.filters).some((value) => value !== null);
  const clearAll = () => {
    view.clearFilters();
    setUrl({ busca: "", massa: "", espessura: "", lote: "" });
  };

  const familyClasses = view.filters.familia
    ? allClasses.filter(
        (c) =>
          c.slug !== view.filters.familia &&
          rootOf.get(c.slug)?.slug === view.filters.familia,
      )
    : allClasses.filter((c) => c.parent_id !== null);
  const fields: FilterField[] = [
    {
      id: "familia",
      label: t.filterFamily,
      pinned: true,
      value: view.filters.familia,
      options: roots(allClasses).map((c) => ({ value: c.slug, label: c.name })),
    },
    {
      id: "subfamilia",
      label: t.filterClass,
      value: view.filters.subfamilia,
      options: familyClasses.map((c) => ({ value: c.slug, label: c.name })),
    },
    {
      id: "uso",
      label: t.filterUse,
      value: view.filters.uso,
      options: [
        { value: "com", label: t.useWith },
        { value: "sem", label: t.useWithout },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <div className="flex flex-col gap-3">
        <SavedViewsBar
          views={view.saved.views}
          activeId={view.activeId}
          onSelect={view.select}
          onCreate={(kind) =>
            view.create(
              kind,
              `${VIEW_KIND_LABEL[kind]} ${view.saved.views.length + 1}`,
            )
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
          placeholder={t.searchPlaceholder}
          onChange={(event) => setUrl({ busca: event.target.value })}
        />
        <ButtonGroup label={t.modeLabel}>
          {(["lista", "matriz"] as ProcessMode[]).map((mode) => (
            <ButtonGroupItem
              key={mode}
              selected={url.modo === mode}
              label={mode === "lista" ? t.modeList : t.modeMatrix}
              onClick={() => setUrl({ modo: mode })}
            />
          ))}
        </ButtonGroup>
        <FilterBar
          fields={fields}
          onChange={(id, value) => {
            view.setFilter(id as "familia" | "subfamilia" | "uso", value);
            // A sub-family belongs to one family: changing the family drops it.
            if (id === "familia") view.setFilter("subfamilia", null);
          }}
          onClear={clearAll}
        />
        <fieldset className="flex min-w-0 flex-col gap-2 rounded-card border border-line p-3">
          <legend className="px-1 text-body font-medium text-ink">
            {t.capabilityTitle}
          </legend>
          <p className="text-support text-ink-muted">{t.capabilityHint}</p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex min-w-0 items-end gap-2">
              <Input
                label={t.capMass}
                inputMode="decimal"
                className="min-w-0 flex-1"
                value={url.massa}
                onChange={(e) => setUrl({ massa: e.target.value })}
              />
              <Select
                label={t.capUnit}
                value={url.massaUn}
                onChange={(e) =>
                  setUrl({
                    massaUn: e.target.value as (typeof MASS_UNITS)[number],
                  })
                }
              >
                {MASS_UNITS.map((u) => (
                  <SelectOption key={u} value={u}>
                    {u}
                  </SelectOption>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 items-end gap-2">
              <Input
                label={t.capThickness}
                inputMode="decimal"
                className="min-w-0 flex-1"
                value={url.espessura}
                onChange={(e) => setUrl({ espessura: e.target.value })}
              />
              <Select
                label={t.capUnit}
                value={url.espessuraUn}
                onChange={(e) =>
                  setUrl({
                    espessuraUn: e.target
                      .value as (typeof THICKNESS_UNITS)[number],
                  })
                }
              >
                {THICKNESS_UNITS.map((u) => (
                  <SelectOption key={u} value={u}>
                    {u}
                  </SelectOption>
                ))}
              </Select>
            </div>
            <Input
              label={t.capBatch}
              hint={t.capBatchHint}
              inputMode="numeric"
              value={url.lote}
              onChange={(e) => setUrl({ lote: e.target.value })}
            />
          </div>
          <p className="text-support text-ink-subtle">{t.capNoTolerance}</p>
          {capActive && matrix.data
            ? (
                [
                  ["massa", t.capMass],
                  ["espessura", t.capThickness],
                  ["lote", t.capBatch],
                ] as const
              ).map(([key, name]) => {
                const n = matrix.data.without_data[key] ?? 0;
                return n > 0 ? (
                  <Alert key={key} tone="info">
                    {t.withoutData(name.toLocaleLowerCase("pt-BR"), n)}
                  </Alert>
                ) : null;
              })
            : null}
        </fieldset>
      </div>

      {loading && <ListSkeleton variant="rows" count={4} label={t.loading} />}
      {failed && (
        <ErrorState
          title={t.error}
          onRetry={() => {
            void classes.refetch();
            void processes.refetch();
          }}
        />
      )}

      {classes.data && processes.data && (
        <Section
          id="processos"
          title={
            view.kind === "gallery" && !filtered
              ? t.familiesTitle
              : t.shownCount(shown.length)
          }
        >
          {classes.data.length === 0 ? (
            <EmptyState title={t.empty} />
          ) : shown.length === 0 ? (
            <EmptyState
              title={t.emptyFiltered}
              action={
                <Button size="sm" onClick={clearAll}>
                  {t.clearFilters}
                </Button>
              }
            />
          ) : url.modo === "matriz" ? (
            matrix.isError ? (
              <ErrorState
                title={t.matrixError}
                error={matrix.error}
                onRetry={() => void matrix.refetch()}
              />
            ) : !matrix.data ? (
              <ListSkeleton variant="rows" count={4} label={t.loading} />
            ) : (
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-support text-ink-muted">{t.matrixHint}</p>
                <ProcessMatrix
                  matrix={{
                    ...matrix.data,
                    rows: matrix.data.rows.filter((r) =>
                      shown.some((p) => p.slug === r.process.slug),
                    ),
                  }}
                  selected={url.comparar}
                  onToggle={toggleCompare}
                />
              </div>
            )
          ) : view.kind === "table" ? (
            <ProcessTable processes={shown} rootOf={rootOf} />
          ) : view.kind === "list" ? (
            <ProcessLines processes={shown} rootOf={rootOf} />
          ) : (
            // A grid, not a stack: three families at full width were three
            // thin strips of tiny badges with the right half of each empty.
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {roots(classes.data)
                // Filtered, a family with nothing left stays off the grid
                // instead of showing an empty card that reads as "no data".
                .filter(
                  (root) =>
                    !filtered ||
                    shown.some(
                      (p) => rootOf.get(p.class_slug)?.slug === root.slug,
                    ),
                )
                .map((root) => (
                  <FamilyCard
                    key={root.slug}
                    family={root}
                    classes={classes.data}
                    processes={shown}
                  />
                ))}
            </div>
          )}
        </Section>
      )}

      {url.comparar.length > 0 ? (
        <ProcessCompare
          slugs={url.comparar}
          onRemove={toggleCompare}
          onClear={() => setUrl({ comparar: [] })}
        />
      ) : null}
    </div>
  );
}

function ProcessTable({
  processes,
  rootOf,
}: {
  processes: Process[];
  rootOf: Map<string, ProcessClass>;
}) {
  return (
    <TableScroll label={t.title}>
      <Table>
        <THead>
          <Tr>
            <Th>{t.columnProcess}</Th>
            <Th>{t.columnFamily}</Th>
            <Th>{t.columnClass}</Th>
            <Th numeric>{t.columnMaterials}</Th>
          </Tr>
        </THead>
        <TBody>
          {processes.map((process) => (
            <Tr key={process.slug}>
              <RowHeader>
                <Link
                  href={`/app/processos/${process.slug}`}
                  className="font-medium text-brand-700"
                >
                  {process.name}
                </Link>
              </RowHeader>
              <Td className="text-ink-muted">
                {rootOf.get(process.class_slug)?.name ?? process.class_name}
              </Td>
              <Td className="text-ink-muted">{process.class_name}</Td>
              <Td numeric className="text-ink-muted">
                {process.material_count}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

function ProcessLines({
  processes,
  rootOf,
}: {
  processes: Process[];
  rootOf: Map<string, ProcessClass>;
}) {
  return (
    <ul className="divide-y divide-line-divider rounded-card border border-line bg-panel">
      {processes.map((process) => (
        <li key={process.slug}>
          <Link
            href={`/app/processos/${process.slug}`}
            className="m3-state flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
              {process.name}
            </span>
            <span className="text-caption text-ink-muted">
              {rootOf.get(process.class_slug)?.name ?? process.class_name}
            </span>
            <span className="text-caption text-ink-muted">
              {t.materialsServed(process.material_count)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FamilyCard({
  family,
  classes,
  processes,
}: {
  family: ProcessClass;
  classes: ProcessClass[];
  processes: Process[];
}) {
  // Everything under this root, the root included — the reader wants the
  // family's processes, not only the ones that happen to be filed at its top.
  const subtree = descendantSlugs(family.slug, classes);
  const inFamily = processes.filter((p) => subtree.has(p.class_slug));

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link
            href={`/app/processos/familia/${family.slug}`}
            className="rounded-control text-base font-semibold text-ink underline-offset-2 hover:text-brand-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {family.name}
          </Link>
          <span className="text-body text-ink-muted">
            {t.countProcesses(inFamily.length)}
          </span>
        </div>

        {inFamily.length === 0 ? (
          // Written out, never a blank card: an empty family is a state.
          <p className="text-body text-ink-muted">{t.emptyFolder}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {inFamily.map((process) => (
              <li key={process.slug}>
                <Link
                  href={`/app/processos/${process.slug}`}
                  className="flex items-center justify-between gap-2 rounded-control px-2 py-1.5 text-body text-ink transition hover:bg-brand-50 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span>{process.name}</span>
                  <span aria-hidden className="text-ink-subtle">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
