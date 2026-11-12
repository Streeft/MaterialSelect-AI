"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { getProcess } from "@/lib/api";
import type { ProcessAttributeValue, ProcessDetail } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { AttributeValueText } from "@/components/process/AttributeValueText";
import {
  Button,
  Card,
  CardBody,
  ErrorState,
  MissingValue,
  RowHeader,
  Table,
  TableScroll,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  TableSkeleton,
} from "@/components/ui";

const t = ptBR.processes;

/**
 * The selected processes side by side (D-219): one column each, one row per
 * attribute that any of them has. A process without a value for a row gets the
 * written absence, never a blank or a 0. Every value is the datasheet's own
 * (`getProcess`), so it carries the unit the source gave.
 */
export function ProcessCompare({
  slugs,
  onRemove,
  onClear,
}: {
  slugs: readonly string[];
  onRemove: (slug: string) => void;
  onClear: () => void;
}) {
  const results = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: ["process", slug],
      queryFn: () => getProcess(slug),
    })),
  });
  const failed = results.some((r) => r.isError);
  const loading = results.some((r) => r.isLoading);
  const details = results.flatMap((r) => (r.data ? [r.data] : []));

  // Rows in the order the first process lists them, then the others' extras.
  const rows: { slug: string; name: string }[] = [];
  for (const detail of details) {
    for (const a of detail.attributes) {
      if (!rows.some((row) => row.slug === a.attribute_slug)) {
        rows.push({ slug: a.attribute_slug, name: a.attribute_name });
      }
    }
  }
  const valueOf = (
    detail: ProcessDetail,
    slug: string,
  ): ProcessAttributeValue | undefined =>
    detail.attributes.find((a) => a.attribute_slug === slug);

  return (
    <Card>
      <CardBody className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-heading text-ink">{t.compareTitle}</h2>
            <p className="text-body text-ink-muted">{t.compareHint}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClear}>
            {t.compareClear}
          </Button>
        </div>
        {slugs.length < 2 ? (
          <p className="text-body text-ink-muted">{t.comparePick}</p>
        ) : null}
        {failed ? (
          <ErrorState
            title={t.compareError}
            onRetry={() => results.forEach((r) => void r.refetch())}
          />
        ) : null}
        {loading ? <TableSkeleton label={t.loading} /> : null}
        {details.length > 0 && !loading ? (
          <TableScroll label={t.compareTitle}>
            <Table>
              <THead>
                <Tr>
                  <Th>{t.compareAttribute}</Th>
                  {details.map((detail) => (
                    <Th key={detail.slug} className="min-w-0 break-words">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/app/processos/${detail.slug}`}
                          className="text-brand-700"
                        >
                          {detail.name}
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t.compareRemove(detail.name)}
                          onClick={() => onRemove(detail.slug)}
                        >
                          ×
                        </Button>
                      </span>
                    </Th>
                  ))}
                </Tr>
              </THead>
              <TBody>
                <Tr>
                  <RowHeader>{t.columnClass}</RowHeader>
                  {details.map((detail) => (
                    <Td key={detail.slug}>{detail.class_name}</Td>
                  ))}
                </Tr>
                <Tr>
                  <RowHeader>{t.columnMaterials}</RowHeader>
                  {details.map((detail) => (
                    <Td key={detail.slug} className="tabular-nums">
                      {detail.material_count}
                    </Td>
                  ))}
                </Tr>
                {rows.map((row) => (
                  <Tr key={row.slug}>
                    <RowHeader>{row.name}</RowHeader>
                    {details.map((detail) => {
                      const value = valueOf(detail, row.slug);
                      return (
                        <Td key={detail.slug}>
                          {value && !value.is_missing ? (
                            <AttributeValueText value={value} />
                          ) : (
                            <MissingValue />
                          )}
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        ) : null}
      </CardBody>
    </Card>
  );
}
