"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { useAnnounce } from "./Announcer";
import { Button } from "./Button";
import { MenuButton, MenuItem } from "./Menu";
import { useOptionalSnackbar } from "./Snackbar";
import { IconPlus } from "./icons";

const t = ptBR.ds;

export interface InlineColumn {
  id: string;
  /** The column's name; also written above each cell when the table stacks. */
  header: string;
  /** A quieter second line under the header: the unit, a range. */
  hint?: string;
  /** A number column: right-aligned, tabular. */
  numeric?: boolean;
  /** Minimum width of the column when the table is wide, e.g. "10rem". */
  minWidth?: string;
}

/**
 * D-219: a table you edit in place — Airtable's grid, in the app's table look.
 *
 * One row per item (a component of the product, a transport leg), the controls
 * in the cells, "+ Nova linha" under the last row, and a "⋯" per row with
 * Duplicar and Remover. Removing has "Desfazer" (D-130): the row leaves at
 * once and comes back if the reader asks, through the app's snackbar.
 *
 * The table owns no data and computes nothing: the caller keeps the rows, draws
 * each cell (`renderCell`, a control that names itself with `cellLabel`) and
 * decides what adding, duplicating and restoring mean. Below 640 px of its own
 * width (a container query, D-182) each row stacks into a block with the column
 * names written above the controls, so a phone never scrolls the page sideways.
 */
export function InlineTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  rowName,
  renderCell,
  onAdd,
  addLabel,
  onDuplicate,
  onRemove,
  onRestore,
  minRows = 1,
  stackBelow = "sm",
  className,
}: {
  /** The table's accessible name (its caption). */
  label: string;
  columns: readonly InlineColumn[];
  rows: readonly Row[];
  /** A positional list (one that lives in the URL) passes the index. */
  rowKey: (row: Row, index: number) => string | number;
  /** "Componente 2": names the row's menu and the removal notice. */
  rowName: (row: Row, index: number) => string;
  renderCell: (row: Row, column: InlineColumn, index: number) => ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  onDuplicate?: (row: Row, index: number) => void;
  onRemove?: (row: Row, index: number) => void;
  /** Puts a removed row back where it was ("Desfazer"). */
  onRestore?: (row: Row, index: number) => void;
  /** Rows that cannot be removed below this count (a product has one component). */
  minRows?: number;
  /** Stack the rows below 640 px ("sm") or, for a wide table, below 900 px ("md") of its own width. */
  stackBelow?: "sm" | "md";
  className?: string;
}) {
  const snackbar = useOptionalSnackbar();
  const announce = useAnnounce();
  const canRemove = Boolean(onRemove) && rows.length > minRows;
  const hasMenu = Boolean(onDuplicate) || Boolean(onRemove);

  function remove(row: Row, index: number) {
    if (!onRemove) return;
    const name = rowName(row, index);
    onRemove(row, index);
    if (snackbar && onRestore) {
      snackbar.notify({
        message: t.rowRemoved(name),
        action: { label: t.undo, onAction: () => onRestore(row, index) },
      });
    } else {
      announce(t.rowRemoved(name));
    }
  }

  return (
    <div className={cn("ds-inline-table", className)} data-stack={stackBelow}>
      <table className="ds-inline-grid">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                className={cn(column.numeric && "ds-inline-numeric")}
              >
                <span className="block text-caption font-semibold text-ink-muted">{column.header}</span>
                {column.hint ? (
                  <span className="block text-caption font-normal text-ink-subtle">{column.hint}</span>
                ) : null}
              </th>
            ))}
            {hasMenu ? (
              <th scope="col" className="ds-inline-actions">
                <span className="sr-only">{t.moreActions}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const name = rowName(row, index);
            return (
              <tr key={rowKey(row, index)}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    data-label={column.header}
                    className={cn(column.numeric && "ds-inline-numeric")}
                  >
                    {renderCell(row, column, index)}
                  </td>
                ))}
                {hasMenu ? (
                  <td className="ds-inline-actions">
                    <span className="ds-inline-row-name" aria-hidden>
                      {name}
                    </span>
                    <MenuButton label={t.rowActions(name)} iconOnly icon={<span aria-hidden>⋯</span>}>
                      {onDuplicate ? (
                        <MenuItem onSelect={() => onDuplicate(row, index)}>{t.duplicateRow}</MenuItem>
                      ) : null}
                      {onRemove ? (
                        <MenuItem disabled={!canRemove} onSelect={() => remove(row, index)}>
                          {t.removeRow}
                        </MenuItem>
                      ) : null}
                    </MenuButton>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {onAdd ? (
        <div className="ds-inline-add">
          <Button size="sm" variant="ghost" icon={<IconPlus className="h-4 w-4" aria-hidden />} onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
