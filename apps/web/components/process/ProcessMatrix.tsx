"use client";

import Link from "next/link";
import type { ProcessCapability, ProcessMatrix as Matrix } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { MAX_COMPARE_PROCESSES } from "@/lib/processesUrl";
import {
  Checkbox,
  MissingValue,
  RowHeader,
  Table,
  TableScroll,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";

const t = ptBR.processes;

/** A capability envelope as "min – max unit"; absence is written, never 0. */
function Capability({ value }: { value: ProcessCapability }) {
  if (value.minimum === null || value.maximum === null) return <MissingValue />;
  const unit = value.unit === "dimensionless" ? "" : (value.unit ?? "");
  return (
    <span className="tabular-nums">
      {formatNumber(value.minimum)} – {formatNumber(value.maximum)} {unit}
    </span>
  );
}

/**
 * Material family × process, in the Granta mould (D-219): rows are processes,
 * columns are the root families of the materials, a cell counts the family's
 * materials the process serves. The counts and the filters come from the
 * backend; nothing here counts or compares.
 */
export function ProcessMatrix({
  matrix,
  selected,
  onToggle,
}: {
  matrix: Matrix;
  selected: readonly string[];
  onToggle: (slug: string) => void;
}) {
  const full = selected.length >= MAX_COMPARE_PROCESSES;
  return (
    <TableScroll label={t.matrixTitle}>
      <Table>
        <THead>
          <Tr>
            <Th>
              <span className="sr-only">{t.columnCompare}</span>
            </Th>
            <Th>{t.columnProcess}</Th>
            {matrix.columns.map((column) => (
              <Th key={column.slug} numeric className="min-w-0 break-words">
                {column.name}
              </Th>
            ))}
            <Th numeric>{t.columnMass}</Th>
            <Th numeric>{t.columnThickness}</Th>
            <Th numeric>{t.columnBatch}</Th>
          </Tr>
        </THead>
        <TBody>
          {matrix.rows.map(({ process, counts, mass, thickness, batch }) => {
            const checked = selected.includes(process.slug);
            return (
              <Tr key={process.slug}>
                <Td>
                  <Checkbox
                    label={
                      <span className="sr-only">
                        {t.compareRow(process.name)}
                      </span>
                    }
                    checked={checked}
                    disabled={!checked && full}
                    onChange={() => onToggle(process.slug)}
                  />
                </Td>
                <RowHeader>
                  <Link
                    href={`/app/processos/${process.slug}`}
                    className="min-w-0 break-words font-medium text-brand-700"
                  >
                    {process.name}
                  </Link>
                </RowHeader>
                {matrix.columns.map((column) => {
                  const n = counts[column.slug] ?? 0;
                  return (
                    <Td
                      key={column.slug}
                      numeric
                      className={
                        n > 0
                          ? "bg-brand-50 font-medium text-ink"
                          : "text-ink-subtle"
                      }
                    >
                      {n > 0 ? (
                        <span aria-label={t.matrixCell(n, column.name)}>
                          {n}
                        </span>
                      ) : (
                        <span>{t.matrixNone}</span>
                      )}
                    </Td>
                  );
                })}
                <Td numeric>
                  <Capability value={mass} />
                </Td>
                <Td numeric>
                  <Capability value={thickness} />
                </Td>
                <Td numeric>
                  {batch === null ? (
                    <MissingValue />
                  ) : (
                    <span className="tabular-nums">{formatNumber(batch)}</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableScroll>
  );
}
