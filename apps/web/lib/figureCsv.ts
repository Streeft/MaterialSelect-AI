/**
 * A figure's table as CSV (D-206).
 *
 * The file carries exactly the text of the table the reader sees (D-31), so the
 * figure, the table and the file cannot disagree — nothing is recomputed. The
 * separator is `;` and the file opens with a BOM, which is what a pt-BR
 * spreadsheet expects when numbers use a decimal comma. A cell the table shows
 * as a written absence stays that text: absence is never turned into 0.
 */
export function tableToCsv(table: HTMLTableElement): string {
  const rows = Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) => escapeCell((cell.textContent ?? "").replace(/\s+/g, " ").trim())),
  );
  return rows.map((cells) => cells.join(";")).join("\r\n");
}

function escapeCell(text: string): string {
  // Quote what would break a row, and neutralise a leading formula character.
  const guarded = /^[=+@]/.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Hand `csv` to the browser as `<fileName>.csv`. */
export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
