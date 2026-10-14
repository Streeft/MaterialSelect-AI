/**
 * Copy a result table to the clipboard as TSV (D-120).
 *
 * The text is what is already on the screen — formatted by the same functions,
 * with absence written out — so there is no second computation of any number:
 * this module only lays cells out and hands the text to the browser.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
// A plain number, pt-BR or en-US: a leading minus on one of these is a
// negative number, not a formula, and must stay one.
const PLAIN_NUMBER = /^[-+]?\d+([.,]\d+)?$/;

/**
 * One cell as safe pasted text: no tab or line break (they would shift the
 * columns), and a leading apostrophe on anything a spreadsheet would read as a
 * formula (`=`, `+`, `-`, `@`) — visible and never destructive, the same rule
 * the exported spreadsheets follow (`cells.py`). Numbers are left alone.
 */
export function tsvCell(value: string): string {
  const flat = value.replace(/[\t\r\n]+/g, " ").trim();
  if (FORMULA_START.test(flat) && !PLAIN_NUMBER.test(flat)) return `'${flat}`;
  return flat;
}

/** Header row plus data rows as tab-separated text, lines joined by `\n`. */
export function toTsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(tsvCell).join("\t")).join("\n");
}

/**
 * Put text on the clipboard. Resolves `true` when it worked and `false` when
 * the browser refused (permissions, insecure context) — the caller says so, in
 * words, instead of pretending it copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
