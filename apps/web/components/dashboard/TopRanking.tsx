"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardTop, listPerformanceIndices } from "@/lib/api";
import type { DashboardFilters, PropertyCoverage } from "@/lib/types";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { formatNumber, prettyUnit } from "@/lib/format";
import { compareHref } from "@/lib/dashboardState";
import { ExpressionLabel } from "@/components/expression/ExpressionLabel";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  RowHeader,
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
} from "@/components/ui";

const SIZES = [5, 10, 20, 50] as const;

/**
 * Top N materials by a property or a performance index (D-193).
 *
 * The order, the direction ("melhor" follows the property's
 * `better_direction`, or the index's goal) and the values all come from
 * `GET /api/dashboard/top`. A material without the value is counted under the
 * table and never ranked as zero (D-24). "Comparar top N" opens the comparator
 * with exactly the listed materials.
 */
export function TopRanking({
  properties,
  property,
  filters,
}: {
  properties: PropertyCoverage[];
  property: string;
  filters: DashboardFilters;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [order, setOrder] = useState<"melhor" | "pior">("melhor");
  const [size, setSize] = useState<number>(10);
  const indices = useQuery({ queryKey: ["performance-indices"], queryFn: listPerformanceIndices });

  // Follows the panel's property until the reader picks something else here.
  const chosen = target ?? `p:${property}`;
  const isIndex = chosen.startsWith("i:");
  const slug = chosen.slice(2);
  const top = useQuery({
    queryKey: ["dashboard-top", chosen, order, size, filters],
    queryFn: () =>
      getDashboardTop(isIndex ? { indice: slug } : { propriedade: slug }, { n: size, ordem: order }, filters),
    enabled: slug.length > 0,
    placeholderData: (previous) => previous,
  });
  const data = top.data;
  const unit = data?.unit ? prettyUnit(data.unit) : "";
  const ids = data?.items.map((i) => i.material_id) ?? [];

  return (
    <Card>
      <CardHeader
        headingLevel={2}
        title={d.top.title}
        description={d.top.hint}
        actions={
          ids.length > 1 ? (
            <ButtonLink href={compareHref(ids)} variant="tonal" size="sm">
              {d.actions.compareTop(ids.length)}
            </ButtonLink>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,7rem)]">
          <Select label={d.top.target} value={chosen} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label={d.top.groupProperties}>
              {properties.map((p) => (
                <SelectOption key={p.slug} value={`p:${p.slug}`}>
                  {p.name}
                </SelectOption>
              ))}
            </optgroup>
            {indices.data && indices.data.length > 0 ? (
              <optgroup label={d.top.groupIndices}>
                {indices.data.map((i) => (
                  <SelectOption key={i.slug} value={`i:${i.slug}`}>
                    {i.name}
                  </SelectOption>
                ))}
              </optgroup>
            ) : null}
          </Select>
          <Select label={d.top.order} value={order} onChange={(e) => setOrder(e.target.value as "melhor" | "pior")}>
            <SelectOption value="melhor">{d.top.best}</SelectOption>
            <SelectOption value="pior">{d.top.worst}</SelectOption>
          </Select>
          <Select label={d.top.size} value={String(size)} onChange={(e) => setSize(Number(e.target.value))}>
            {SIZES.map((n) => (
              <SelectOption key={n} value={String(n)}>
                {n}
              </SelectOption>
            ))}
          </Select>
        </div>

        {data?.kind === "index" && data.expression ? (
          <p className="text-support text-ink-muted">
            <ExpressionLabel expression={data.expression} />
          </p>
        ) : null}

        {top.isLoading ? <LoadingState label={d.loading} /> : null}
        {top.isError ? (
          <ErrorState
            title={d.error}
            description={top.error instanceof Error ? top.error.message : undefined}
            onRetry={() => void top.refetch()}
          />
        ) : null}
        {data && data.items.length === 0 ? <EmptyState title={d.top.empty} /> : null}
        {data && data.items.length > 0 ? (
          <>
            <TableScroll label={`${d.top.title}: ${data.label}`}>
              <Table>
                <TableCaption>{`${d.top.title}: ${data.label}`}</TableCaption>
                <THead>
                  <Tr>
                    <Th numeric>{d.top.columnRank}</Th>
                    <Th>{d.top.columnMaterial}</Th>
                    <Th>{d.top.columnClass}</Th>
                    <Th numeric>
                      {d.top.columnValue}
                      {unit && unit !== "—" ? ` (${unit})` : ""}
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.items.map((item) => (
                    <Tr key={item.material_id}>
                      <Td numeric className="tabular-nums">
                        {item.rank.toLocaleString("pt-BR")}
                      </Td>
                      <RowHeader>
                        <Link
                          href={`/app/materiais/${item.material_id}`}
                          className="text-action underline-offset-2 hover:underline"
                        >
                          {item.name}
                        </Link>
                        {item.is_demo ? (
                          <Badge tone="neutral" className="ml-2">
                            {d.top.demo}
                          </Badge>
                        ) : null}
                      </RowHeader>
                      <Td>
                        {item.class_name}
                        {item.subclass ? <span className="text-ink-muted"> · {item.subclass}</span> : null}
                      </Td>
                      <Td numeric className="tabular-nums">
                        {formatNumber(item.value)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
            <p className="text-caption text-ink-muted">
              {d.top.direction(data.direction)} {d.top.without(data.without_value)}
            </p>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
