import type { MaterialDetail, PropertyValueOut } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";

/**
 * Material sheets kept for reading without a connection (D-152).
 *
 * D-142 left the app with a bare "Sem conexão" page, because showing material
 * data from a cache without its source and date would break principle 1. This
 * is the narrow exception the author chose: a sheet the reader has already
 * opened is kept **as it was shown**, and `public/offline.html` prints it under
 * a fixed notice with the day it was read beside every value.
 *
 * What is kept is text, not numbers: the value is written here, once, by the
 * same `formatNumber`/`prettyUnit` the sheet uses, so the offline page does no
 * arithmetic and no unit conversion (principle 2) and cannot drift from the
 * sheet. Absence stays a stated state, never a dash or a 0 (principle 3).
 *
 * Not kept: an own record (`is_own_record`), because it is private to the account
 * and a classroom machine is shared; the catalogue is the same for every reader.
 * Everything touching storage is in try/catch: private windows, blocked site data
 * and a full quota all throw, and the sheet page must work without it.
 */

export const OFFLINE_SHEETS_KEY = "msai.offline.sheets";
export const OFFLINE_SHEETS_VERSION = 1;
/** The most recent sheets kept; the oldest read goes first. */
export const OFFLINE_SHEETS_MAX = 20;

export interface OfflineRow {
  group: string;
  name: string;
  symbol: string | null;
  /** The value as the sheet wrote it, unit included. `null` is absence. */
  value: string | null;
  /** "Medido", "Importado", "Estimado" or "Ausente". */
  quality: string;
  source: string | null;
  condition: string | null;
  notes: string | null;
}

export interface OfflineSheet {
  id: number;
  name: string;
  className: string;
  subclass: string | null;
  /** When this device read the sheet from the server (ISO 8601). */
  readAt: string;
  rows: OfflineRow[];
}

interface Stored {
  v: number;
  sheets: OfflineSheet[];
}

/** The value text of a row, or `null` for absence. Mirrors `ValueText` in `PropertyGroup.tsx`. */
export function describeValue(p: PropertyValueOut): string | null {
  if (p.is_missing) return null;
  const unit = prettyUnit(p.display_unit ?? p.original_unit);
  const min = p.display_min ?? p.value_min;
  const max = p.display_max ?? p.value_max;
  const typical = p.display_typical ?? p.value_typical;
  const scalar = p.display_value ?? p.value_scalar;
  const uncertainty = p.display_uncertainty ?? p.uncertainty;
  const withUnit = (text: string) => (unit ? `${text} ${unit}` : text);

  if (p.is_interval && min !== null && max !== null) {
    const base = withUnit(`${formatNumber(min)} – ${formatNumber(max)}`);
    return typical !== null ? `${base} (${ptBR.detail.typical}: ${formatNumber(typical)})` : base;
  }
  if (scalar !== null) {
    const base = withUnit(formatNumber(scalar));
    return uncertainty !== null ? `${base} ± ${formatNumber(uncertainty)}` : base;
  }
  // Not flagged missing but carrying no number: still absence.
  return null;
}

function qualityLabel(p: PropertyValueOut, value: string | null): string {
  if (value === null || !p.data_quality) return ptBR.quality.AUSENTE;
  return ptBR.quality[p.data_quality];
}

/** Whether a sheet may be kept at all. */
export function isKeepable(material: MaterialDetail): boolean {
  return !material.is_own_record;
}

export function buildOfflineSheet(material: MaterialDetail, readAt: Date): OfflineSheet {
  const rows: OfflineRow[] = [];
  for (const group of material.property_groups) {
    for (const p of group.properties) {
      const value = describeValue(p);
      rows.push({
        group: ptBR.categories[group.category],
        name: p.property_name,
        symbol: p.symbol,
        value,
        quality: qualityLabel(p, value),
        source: value === null ? null : p.source_label,
        condition: p.measurement_condition,
        notes: p.notes,
      });
    }
  }
  return {
    id: material.id,
    name: material.name,
    className: material.class_name,
    subclass: material.subclass,
    readAt: readAt.toISOString(),
    rows,
  };
}

export function readOfflineSheets(): OfflineSheet[] {
  try {
    const raw = window.localStorage.getItem(OFFLINE_SHEETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed.v !== OFFLINE_SHEETS_VERSION || !Array.isArray(parsed.sheets)) return [];
    return parsed.sheets;
  } catch {
    return [];
  }
}

/** Keeps `sheet`, newest first, replacing an earlier read of the same material. */
export function saveOfflineSheet(sheet: OfflineSheet): void {
  try {
    const others = readOfflineSheets().filter((s) => s.id !== sheet.id);
    const sheets = [sheet, ...others].slice(0, OFFLINE_SHEETS_MAX);
    window.localStorage.setItem(OFFLINE_SHEETS_KEY, JSON.stringify({ v: OFFLINE_SHEETS_VERSION, sheets }));
  } catch {
    // Storage unavailable or full: the sheet works the same without an offline copy.
  }
}

export function clearOfflineSheets(): void {
  try {
    window.localStorage.removeItem(OFFLINE_SHEETS_KEY);
  } catch {
    // Nothing to clear.
  }
}
