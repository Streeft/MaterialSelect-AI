"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getReleaseDiff,
  getReleaseDiffRecord,
  listCatalogReleases,
  releaseDiffExportUrl,
} from "@/lib/api";
import type {
  CatalogRelease,
  ReleaseDiff,
  ReleaseDiffItem,
  ReleaseRecordStatus,
  ReleaseUniverse,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import {
  comparablePartners,
  comparableReleases,
  defaultPair,
  recordName,
} from "@/lib/releaseDiff";
import { ReleaseRecordDetail } from "@/components/catalog/ReleaseRecordDetail";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  MenuButton,
  MenuItem,
  RowHeader,
  Section,
  Select,
  SelectOption,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
  type BadgeTone,
} from "@/components/ui";
import { IconDownload } from "@/components/ui/icons";

const t = ptBR.releases;

/** The page's whole state lives in the URL, so a link is the whole question. */
export const RELEASE_PARAMS = {
  base: "base",
  target: "alvo",
  status: "tipo",
  classSlug: "classe",
  universe: "universo",
  page: "pagina",
  table: "tabela",
  record: "registro",
} as const;

type ParamKey = keyof typeof RELEASE_PARAMS;

const PAGE_SIZE = 25;
const STATUSES: ReleaseRecordStatus[] = ["novo", "alterado", "desativado", "inalterado"];

const STATUS_TONE: Record<ReleaseRecordStatus, BadgeTone> = {
  novo: "success",
  alterado: "warning",
  desativado: "danger",
  inalterado: "neutral",
};

const UNIVERSES: ReleaseUniverse[] = ["material", "processo", "modal"];

function isUniverse(value: string | null): value is ReleaseUniverse {
  return UNIVERSES.includes(value as ReleaseUniverse);
}

function isStatus(value: string | null): value is ReleaseRecordStatus {
  return STATUSES.includes(value as ReleaseRecordStatus);
}

/** Read by shape, so a test mock of the API need not re-export `ApiError`. */
function httpStatus(error: unknown): number | undefined {
  return error instanceof Error ? (error as { status?: number }).status : undefined;
}

function errorDetail(error: unknown): string | undefined {
  const status = httpStatus(error);
  return status !== undefined && status >= 400 && status < 500 && error instanceof Error
    ? error.message
    : undefined;
}

/**
 * "Mudanças entre releases" (D-108, TM7).
 *
 * Choose two comparable releases, read the count per kind, narrow by kind and
 * class, open one record to see each field before → after. The backend derives
 * every row and converts every number (ADR 0004); this screen only chooses,
 * prints and writes absence out in words (D-24). Releases, filters, page and the
 * open record are all in the URL.
 */
export function ReleaseChanges() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const releases = useQuery({ queryKey: ["catalog-releases"], queryFn: listCatalogReleases });

  const update = useCallback(
    (changes: Partial<Record<ParamKey, string | null>>) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(changes)) {
        const param = RELEASE_PARAMS[key as ParamKey];
        if (value) next.set(param, value);
        else next.delete(param);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  if (releases.isLoading) return <LoadingState label={t.loading} />;
  if (releases.isError) {
    return <ErrorState title={t.error} onRetry={() => void releases.refetch()} />;
  }
  const all = releases.data ?? [];
  const bases = comparableReleases(all);
  if (bases.length === 0) {
    const undeclared = all.filter((r) => r.lineage === null).length;
    return (
      <EmptyState
        title={t.noPair}
        description={
          <>
            {t.noPairHint}
            {undeclared > 0 ? <> {t.noPairUndeclared(undeclared)}</> : null}
          </>
        }
        action={
          <Link href="/app/catalogo" className="text-sm font-medium text-accent underline">
            {t.backToCatalog}
          </Link>
        }
      />
    );
  }

  // The pair: the URL's, completed from the list when only one end is named.
  const fallback = defaultPair(all);
  const baseParam = search.get(RELEASE_PARAMS.base);
  const targetParam = search.get(RELEASE_PARAMS.target);
  const baseSlug = baseParam ?? (targetParam ? all.find((r) => r.slug === targetParam)?.previous_slug : null) ?? fallback?.base ?? "";
  const partners = comparablePartners(all, baseSlug);
  const targetSlug =
    targetParam ??
    all.find((r) => r.previous_slug === baseSlug && partners.some((p) => p.slug === r.slug))?.slug ??
    partners[0]?.slug ??
    fallback?.target ??
    "";

  return (
    <ReleaseComparison
      releases={all}
      bases={bases}
      partners={partners}
      baseSlug={baseSlug}
      targetSlug={targetSlug}
      search={search}
      update={update}
    />
  );
}

function ReleaseComparison({
  releases,
  bases,
  partners,
  baseSlug,
  targetSlug,
  search,
  update,
}: {
  releases: CatalogRelease[];
  bases: CatalogRelease[];
  partners: CatalogRelease[];
  baseSlug: string;
  targetSlug: string;
  search: URLSearchParams;
  update: (changes: Partial<Record<ParamKey, string | null>>) => void;
}) {
  const statusParam = search.get(RELEASE_PARAMS.status);
  const tipo = isStatus(statusParam) ? statusParam : undefined;
  const classe = search.get(RELEASE_PARAMS.classSlug) ?? undefined;
  const universeParam = search.get(RELEASE_PARAMS.universe);
  const universo = isUniverse(universeParam) ? universeParam : undefined;
  const pageNumber = Math.max(1, Number(search.get(RELEASE_PARAMS.page)) || 1);
  const openTable = search.get(RELEASE_PARAMS.table);
  const openRecord = search.get(RELEASE_PARAMS.record);

  const diff = useQuery({
    queryKey: ["catalog-release-diff", baseSlug, targetSlug, tipo, classe, universo, pageNumber],
    queryFn: () =>
      getReleaseDiff(baseSlug, targetSlug, {
        tipo,
        classe,
        universo,
        pagina: pageNumber,
        porPagina: PAGE_SIZE,
      }),
    enabled: baseSlug !== "" && targetSlug !== "",
    // A filter or a page keeps the previous list on screen while the next loads.
    placeholderData: (previous) => previous,
    retry: (count, error) => httpStatus(error) === undefined && count < 2,
  });

  const data = diff.data;
  const inList = data?.items.find(
    (i) => i.external_table === openTable && i.external_record_id === openRecord,
  );
  // A link to a record that is not on this page still opens: by identity, never name.
  const detailQuery = useQuery({
    queryKey: ["catalog-release-record", baseSlug, targetSlug, openTable, openRecord],
    queryFn: () => getReleaseDiffRecord(baseSlug, targetSlug, openTable ?? "", openRecord ?? ""),
    enabled: Boolean(openTable && openRecord && data && !inList),
    retry: false,
  });
  const detail: ReleaseDiffItem | undefined = inList ?? detailQuery.data;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  useEffect(() => {
    if (focusDetail.current && detail) {
      focusDetail.current = false;
      headingRef.current?.focus();
    }
  }, [detail]);

  const pair = (base: string, target: string) =>
    update({
      base,
      target,
      status: null,
      classSlug: null,
      page: null,
      table: null,
      record: null,
    });

  const baseRelease = releases.find((r) => r.slug === baseSlug);
  const targetRelease = releases.find((r) => r.slug === targetSlug);

  const rejected = diff.isError ? errorDetail(diff.error) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {data?.is_demo || (baseRelease?.is_demo && targetRelease?.is_demo) ? (
        <Alert tone="warning">{t.demoNotice}</Alert>
      ) : null}

      <Card>
        <CardHeader headingLevel={2} title={t.chooseTitle} description={t.direction} />
        <CardBody className="flex flex-col gap-4">
          <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Select
              label={t.base}
              value={baseSlug}
              onChange={(event) => {
                const base = event.target.value;
                const options = comparablePartners(releases, base);
                const keep = options.some((r) => r.slug === targetSlug);
                const next =
                  keep
                    ? targetSlug
                    : (options.find((r) => r.slug !== base && r.previous_slug === base)?.slug ??
                      options[0]?.slug ??
                      "");
                pair(base, next);
              }}
            >
              {bases.map((r) => (
                <SelectOption key={r.slug} value={r.slug}>
                  {t.releaseOption(r.release, r.name, r.is_demo)}
                </SelectOption>
              ))}
            </Select>
            <Select
              label={t.target}
              value={targetSlug}
              onChange={(event) => pair(baseSlug, event.target.value)}
            >
              {partners.map((r) => (
                <SelectOption key={r.slug} value={r.slug}>
                  {t.releaseOption(r.release, r.name, r.is_demo)}
                </SelectOption>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="sm"
              disabled={!baseSlug || !targetSlug}
              onClick={() => pair(targetSlug, baseSlug)}
            >
              {t.swap}
            </Button>
          </div>
          {baseRelease && targetRelease ? (
            <ReleaseMeta base={baseRelease} target={targetRelease} />
          ) : null}
        </CardBody>
      </Card>

      {diff.isLoading || (diff.isFetching && !data) ? (
        <LoadingState label={t.diffLoading} />
      ) : diff.isError && !data ? (
        <ErrorState
          title={t.diffError}
          description={rejected}
          onRetry={() =>
            rejected !== undefined
              ? update({ status: null, classSlug: null, page: null, table: null, record: null })
              : void diff.refetch()
          }
        />
      ) : data ? (
        <>
          <Summary data={data} />

          <Card>
            <CardHeader headingLevel={2} title={t.filtersTitle} />
            <CardBody className="grid items-end gap-3 md:grid-cols-[14rem_14rem_16rem_auto]">
              <Select
                label={t.filterStatus}
                value={tipo ?? ""}
                onChange={(event) =>
                  update({ status: event.target.value || null, page: null, table: null, record: null })
                }
              >
                <SelectOption value="">{t.allStatuses}</SelectOption>
                {data.counts.map((c) => (
                  <SelectOption key={c.status} value={c.status}>
                    {c.label}
                  </SelectOption>
                ))}
              </Select>
              <Select
                label={t.filterUniverse}
                value={universo ?? ""}
                onChange={(event) =>
                  update({
                    universe: event.target.value || null,
                    classSlug: null,
                    page: null,
                    table: null,
                    record: null,
                  })
                }
              >
                <SelectOption value="">{t.allUniverses}</SelectOption>
                {data.universes.map((u) => (
                  <SelectOption key={u.universe} value={u.universe}>
                    {t.universeOption(u.label, u.count)}
                  </SelectOption>
                ))}
              </Select>
              <Select
                label={t.filterClass}
                value={classe ?? ""}
                onChange={(event) =>
                  update({
                    classSlug: event.target.value || null,
                    page: null,
                    table: null,
                    record: null,
                  })
                }
              >
                <SelectOption value="">{t.allClasses}</SelectOption>
                {data.classes.map((c) => (
                  <SelectOption key={c.slug} value={c.slug}>
                    {t.classOption(c.name, c.count)}
                  </SelectOption>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                disabled={!tipo && !classe && !universo}
                onClick={() =>
                  update({
                    status: null,
                    classSlug: null,
                    universe: null,
                    page: null,
                    table: null,
                    record: null,
                  })
                }
              >
                {t.clearFilters}
              </Button>
            </CardBody>
          </Card>

          <Section
            id="registros"
            title={t.listTitle(data.filtered_total)}
            description={
              data.filtered_total === data.total ? undefined : t.listShowing(data.filtered_total, data.total)
            }
            actions={
              <MenuButton label={t.exportMenu} icon={<IconDownload className="h-4 w-4" />}>
                <MenuItem
                  href={releaseDiffExportUrl(baseSlug, targetSlug, "csv", { tipo, classe, universo })}
                  download
                  hint={t.exportCsvHint}
                >
                  {t.exportCsv}
                </MenuItem>
                <MenuItem
                  href={releaseDiffExportUrl(baseSlug, targetSlug, "xlsx", { tipo, classe, universo })}
                  download
                  hint={t.exportXlsxHint}
                >
                  {t.exportXlsx}
                </MenuItem>
              </MenuButton>
            }
          >
            {diff.isError ? (
              <ErrorState title={t.diffError} description={rejected} onRetry={() => void diff.refetch()} />
            ) : data.items.length === 0 ? (
              <EmptyState
                title={tipo || classe || universo ? t.emptyFiltered : t.empty}
                description={tipo || classe || universo ? t.emptyFilteredHint : t.emptyHint}
                action={
                  tipo || classe || universo ? (
                    <Button
                      size="sm"
                      onClick={() => update({ status: null, classSlug: null, page: null })}
                    >
                      {t.clearFilters}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <RecordList
                data={data}
                openTable={openTable}
                openRecord={openRecord}
                onOpen={(item) => {
                  const isOpen =
                    item.external_table === openTable && item.external_record_id === openRecord;
                  focusDetail.current = !isOpen;
                  update(
                    isOpen
                      ? { table: null, record: null }
                      : { table: item.external_table, record: item.external_record_id },
                  );
                }}
              />
            )}
            {data.page_count > 1 ? (
              <nav aria-label={t.pagination} className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={data.page <= 1}
                  onClick={() => update({ page: data.page - 1 > 1 ? String(data.page - 1) : null, table: null, record: null })}
                >
                  {t.previousPage}
                </Button>
                <span className="text-support text-ink-muted" aria-live="polite">
                  {t.pageOf(data.page, data.page_count)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={data.page >= data.page_count}
                  onClick={() => update({ page: String(data.page + 1), table: null, record: null })}
                >
                  {t.nextPage}
                </Button>
              </nav>
            ) : null}
            <p className="text-support text-ink-subtle">{t.exportScope}</p>
          </Section>

          {openTable && openRecord ? (
            <Section id="release-detail" title={t.detailTitle}>
              <div className="subsection" aria-labelledby="release-detail-title" role="region">
                {detail ? (
                  <ReleaseRecordDetail ref={headingRef} item={detail} />
                ) : detailQuery.isError ? (
                  httpStatus(detailQuery.error) === 404 ? (
                    <EmptyState title={t.detailNotFound} />
                  ) : (
                    <ErrorState
                      title={t.detailError}
                      description={errorDetail(detailQuery.error)}
                      onRetry={() => void detailQuery.refetch()}
                    />
                  )
                ) : (
                  <LoadingState label={t.detailLoading} />
                )}
                <div className="mt-3">
                  <Button size="sm" variant="ghost" onClick={() => update({ table: null, record: null })}>
                    {t.close}
                  </Button>
                </div>
              </div>
            </Section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Two releases side by side: what each is, so the pair is never a pair of slugs. */
function ReleaseMeta({ base, target }: { base: CatalogRelease; target: CatalogRelease }) {
  const rows: { label: string; of: (r: CatalogRelease) => string }[] = [
    { label: t.metaRelease, of: (r) => r.release ?? r.slug },
    { label: t.metaName, of: (r) => r.name },
    { label: t.metaLicense, of: (r) => r.license_label },
    { label: t.metaRecords, of: (r) => String(r.material_count) },
    {
      label: t.metaImported,
      of: (r) => (r.imported_at ? (formatDate(r.imported_at) ?? r.imported_at) : t.metaNotImported),
    },
    { label: t.metaActive, of: (r) => (r.is_active ? t.active : t.inactive) },
  ];
  return (
    <TableScroll label={t.metaCaption}>
      <Table>
        <TableCaption>{t.metaCaption}</TableCaption>
        <THead>
          <Tr>
            <Th>
              <span className="sr-only">{t.metaCaption}</span>
            </Th>
            <Th>{t.base}</Th>
            <Th>{t.target}</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <Tr key={row.label}>
              <RowHeader>{row.label}</RowHeader>
              <Td>{row.of(base)}</Td>
              <Td>{row.of(target)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

function Summary({ data }: { data: ReleaseDiff }) {
  return (
    <Section id="resumo" title={t.summaryTitle} description={t.summaryTotal(data.total)}>
      <ul
        aria-label={t.summaryAria}
        className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4"
      >
        {data.counts.map((c) => (
          <li key={c.status} className="well flex flex-col gap-1" data-status={c.status}>
            <Badge tone={STATUS_TONE[c.status]} className="self-start">
              {c.label}
            </Badge>
            <span className="text-2xl font-bold tabular-nums text-ink">{c.count}</span>
          </li>
        ))}
      </ul>
      <details className="text-support text-ink-muted">
        <summary className="cursor-pointer font-medium text-ink">{t.ruleTitle}</summary>
        <p className="mt-1 max-w-prose">{data.rule}</p>
      </details>
    </Section>
  );
}

function changesSummary(item: ReleaseDiffItem): string {
  if (item.status === "novo") return t.onlyInTarget;
  if (item.status === "desativado") return t.onlyInBase;
  if (item.change_count === 0) return t.noChanges;
  return t.changesCount(item.change_count);
}

function RecordList({
  data,
  openTable,
  openRecord,
  onOpen,
}: {
  data: ReleaseDiff;
  openTable: string | null;
  openRecord: string | null;
  onOpen: (item: ReleaseDiffItem) => void;
}) {
  return (
    <TableScroll label={t.listCaption}>
      <Table>
        <TableCaption>{t.listCaption}</TableCaption>
        <THead>
          <Tr>
            <Th>{t.columnStatus}</Th>
            <Th>{t.columnRecord}</Th>
            <Th>{t.columnClass}</Th>
            <Th>{t.columnChanges}</Th>
            <Th>{t.columnIdentity}</Th>
            <Th>
              <span className="sr-only">{t.columnAction}</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {data.items.map((item) => {
            const name = recordName(item);
            const isOpen =
              item.external_table === openTable && item.external_record_id === openRecord;
            const renamed =
              item.base && item.target && item.base.name !== item.target.name ? item.base.name : null;
            const side = item.target ?? item.base;
            return (
              <Tr
                key={`${item.external_table}:${item.external_record_id}`}
                data-status={item.status}
                aria-current={isOpen ? "true" : undefined}
              >
                <Td>
                  <Badge tone={STATUS_TONE[item.status]}>{item.status_label}</Badge>
                </Td>
                <RowHeader>
                  <span>{name}</span>
                  {renamed ? (
                    <span className="block text-caption font-normal text-ink-subtle">
                      {t.renamedFrom(renamed)}
                    </span>
                  ) : null}
                </RowHeader>
                <Td>
                  {side?.class_name}
                  {item.universe !== "material" ? (
                    <span className="block text-caption text-ink-subtle">{item.universe_label}</span>
                  ) : null}
                </Td>
                <Td>{changesSummary(item)}</Td>
                <Td>
                  <span className="font-mono text-caption text-ink-muted">
                    {item.external_table} · {item.external_record_id}
                  </span>
                </Td>
                <Td>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t.openAria(name)}
                    aria-expanded={isOpen}
                    aria-controls="release-detail"
                    onClick={() => onOpen(item)}
                  >
                    {isOpen ? t.selected : t.open}
                  </Button>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableScroll>
  );
}
