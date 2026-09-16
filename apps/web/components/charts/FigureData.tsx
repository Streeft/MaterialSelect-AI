import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import {
  Disclosure,
  MissingValue,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = ptBR.chart;

/**
 * One column of a figure's data table.
 *
 * `cell` returns `null` — not a dash, not an empty string — when the figure had
 * nothing to draw for that row. Rendering absence is this component's job, not
 * the call site's: the moment each screen decides for itself, one of them writes
 * `—` and the third principle of the project is broken in the one table whose
 * whole purpose is to be read literally.
 */
export interface FigureColumn<Row> {
  key: string;
  header: ReactNode;
  /** Right-aligns and switches on tabular figures. */
  numeric?: boolean;
  cell: (row: Row) => ReactNode | null;
}

/**
 * The data behind a figure, as a table, reachable from the figure itself.
 *
 * A Plotly chart is a canvas of `<path>` elements: to a screen reader it is
 * either silence or an unreadable stream of tick labels. The alternative that
 * actually works is not a longer `alt` text — it is the numbers, and they are
 * already on the client, so nothing here is recomputed or summarised. Wrapped in
 * a disclosure because a sighted reader who has the figure does not need the
 * table open, and a keyboard reader needs it one Enter away.
 */
export function FigureData<Row>({
  caption,
  rows,
  rowKey,
  rowHeader,
  columns,
}: {
  /** Names the table: which figure these numbers drew. */
  caption: string;
  rows: Row[];
  rowKey: (row: Row) => string | number;
  /** The `<th scope="row">` — usually the material, so every cell is nameable. */
  rowHeader: { header: ReactNode; cell: (row: Row) => ReactNode };
  columns: FigureColumn<Row>[];
}) {
  // No figure, no alternative to it. The empty state already says why.
  if (rows.length === 0) return null;

  return (
    <Disclosure summary={t.dataTable} className="bg-surface">
      <p className="mb-2 text-xs text-ink-muted">{t.dataTableHint}</p>
      <TableScroll label={caption}>
        <Table>
          <TableCaption>{caption}</TableCaption>
          <THead>
            <Tr>
              <Th>{rowHeader.header}</Th>
              {columns.map((column) => (
                <Th key={column.key} numeric={column.numeric}>
                  {column.header}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={rowKey(row)}>
                <RowHeader>{rowHeader.cell(row)}</RowHeader>
                {columns.map((column) => {
                  const content = column.cell(row);
                  return (
                    <Td key={column.key} numeric={column.numeric}>
                      {content ?? <MissingValue />}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>
    </Disclosure>
  );
}
