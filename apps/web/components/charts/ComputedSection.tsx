"use client";

import type { Comparison, CompareMaterial, ComputedColumn } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import {
  Badge,
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
import { IconCalculated } from "@/components/ui/icons";

const t = ptBR.compare.computed;
const tt = ptBR.compare.threshold;

/** The column's spread as a sentence: a number with its verdict, or why none (D-24, D-128). */
function SpreadLine({
  column,
  thresholdSet,
}: {
  column: ComputedColumn;
  thresholdSet: boolean;
}) {
  const state = column.spread_state ?? "valores_insuficientes";
  if (state !== "calculada" || column.spread_pct == null) {
    return (
      <span className="block text-xs font-normal normal-case text-ink-subtle">
        {tt.unavailable}: {tt.spread[state as keyof typeof tt.spread]}
      </span>
    );
  }
  const spread = tt.headerSpread(formatNumber(column.spread_pct));
  if (!thresholdSet) {
    return <span className="block text-xs font-normal normal-case text-ink-subtle">{spread}</span>;
  }
  return column.exceeds_threshold === true ? (
    <Badge tone="warning" className="mt-1">
      {tt.above} · {spread}
    </Badge>
  ) : (
    <span className="block text-xs font-normal normal-case text-ink-subtle">
      {tt.below} · {spread}
    </span>
  );
}

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
  const thresholdSet = comparison.threshold_pct != null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-support text-ink-subtle">{t.note}</p>
      <TableScroll label={t.tableRegion(materials.length, columns.length)}>
      <Table>
        <TableCaption>{t.title}</TableCaption>
        <THead>
          <Tr>
            <Th className="sticky left-0 z-20 bg-well">{t.columnMaterial}</Th>
            {columns.map((column) => (
              <Th
                key={column.expression}
                className={
                  column.exceeds_threshold === true
                    ? "border-l-2 border-brand bg-warning-soft text-warning-fg"
                    : "border-l-2 border-brand"
                }
              >
                {/* Calculated, in words and with a glyph: a value the server
                    derived must never pass for a measured one, and colour alone
                    would not say so (D-153, D-24). */}
                <Badge tone="brand" icon={<IconCalculated />} title={t.badgeTitle}>
                  {t.badge}
                </Badge>
                <span className="mt-1 block">
                  {/* A typed index has no name but its expression: said once. */}
                  {column.name !== column.expression ? column.name : null}
                  <span className="ml-1 font-normal normal-case text-ink-subtle">
                    [{prettyUnit(column.dimension)}]
                  </span>
                </span>
                <span className="block font-mono text-xs font-normal normal-case text-ink-subtle">
                  {column.expression}
                </span>
                <span className="block text-xs font-normal normal-case text-ink-subtle">
                  {t.inputs(column.variables.join(", "))} ·{" "}
                  {t.summary(column.defined_count, column.undefined_count)}
                </span>
                <SpreadLine column={column} thresholdSet={thresholdSet} />
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
                  <Td key={column.expression} className="border-l-2 border-brand">
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
      <p className="text-support text-ink-subtle">{t.spreadNote}</p>
    </div>
  );
}
