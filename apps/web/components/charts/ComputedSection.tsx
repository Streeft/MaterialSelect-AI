"use client";

import type { Comparison, CompareMaterial } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import {
  Table,
  TableCaption,
  TableScroll,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  RowHeader,
} from "@/components/ui";

const t = ptBR.compare.computed;

/**
 * The computed properties of the compared materials (D-128).
 *
 * Every number is evaluated by the backend with the selection's own evaluator,
 * in canonical units. A material missing any input shows the evaluator's
 * written reason, never a zero, a dash or an empty cell (D-24).
 */
export function ComputedTable({ comparison }: { comparison: Comparison }) {
  const columns = comparison.computed ?? [];
  if (columns.length === 0) return null;
  const materials: CompareMaterial[] = comparison.materials;
  return (
    <TableScroll label={t.tableRegion(materials.length, columns.length)}>
      <Table>
        <TableCaption>{t.title}</TableCaption>
        <THead>
          <Tr>
            <Th className="sticky left-0 z-20 bg-well">{t.columnMaterial}</Th>
            {columns.map((column) => (
              <Th key={column.expression}>
                {column.name}
                <span className="ml-1 font-normal normal-case text-ink-subtle">
                  [{prettyUnit(column.dimension)}]
                </span>
                <span className="block font-normal normal-case text-xs text-ink-subtle">
                  {column.expression} · {t.summary(column.defined_count, column.undefined_count)}
                </span>
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {materials.map((material) => (
            <Tr key={material.material_id}>
              <RowHeader className="sticky left-0 z-[1] bg-panel">
                {material.name}
                <span className="block text-xs font-normal text-ink-subtle">
                  {material.class_name}
                </span>
              </RowHeader>
              {columns.map((column) => {
                const item = column.values.find((v) => v.material_id === material.material_id);
                return (
                  <Td key={column.expression}>
                    {item && item.value !== null ? (
                      <span className="tabular-nums text-ink">{formatNumber(item.value)}</span>
                    ) : (
                      <span className="text-xs text-ink-subtle">
                        {t.undefinedLabel}
                        {item?.undefined_reason ? `: ${item.undefined_reason}` : ""}
                      </span>
                    )}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}
