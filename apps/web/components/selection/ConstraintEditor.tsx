"use client";

import type { ConstraintOperator, MaterialClass, PropertyDefinition } from "@/lib/types";
import { ptBR } from "@/lib/i18n";

const t = ptBR.selection;

/** Local editable shape for one constraint (values kept as strings for inputs). */
export interface ConstraintRow {
  id: string;
  operator: ConstraintOperator;
  property_slug: string;
  value: string;
  value_min: string;
  value_max: string;
  unit: string;
  class_slugs: string[];
  text: string;
}

export function emptyConstraint(id: string): ConstraintRow {
  return {
    id,
    operator: "lte",
    property_slug: "",
    value: "",
    value_min: "",
    value_max: "",
    unit: "",
    class_slugs: [],
    text: "",
  };
}

const OPERATORS: { value: ConstraintOperator; label: string }[] = [
  { value: "gte", label: "≥" },
  { value: "gt", label: ">" },
  { value: "lte", label: "≤" },
  { value: "lt", label: "<" },
  { value: "between", label: "∈ faixa" },
  { value: "outside", label: "∉ faixa" },
  { value: "exists", label: "existe" },
  { value: "not_exists", label: "não existe" },
  { value: "in_class", label: "∈ classe" },
  { value: "not_in_class", label: "∉ classe" },
  { value: "text_contains", label: "texto contém" },
];

const NUMERIC = new Set<ConstraintOperator>(["gt", "gte", "lt", "lte", "between", "outside"]);
const NEEDS_PROPERTY = new Set<ConstraintOperator>([
  "gt", "gte", "lt", "lte", "between", "outside", "exists", "not_exists",
]);
const CLASS_OPS = new Set<ConstraintOperator>(["in_class", "not_in_class"]);

interface Props {
  rows: ConstraintRow[];
  properties: PropertyDefinition[];
  classes: MaterialClass[];
  onChange: (rows: ConstraintRow[]) => void;
}

export function ConstraintEditor({ rows, properties, classes, onChange }: Props) {
  const input =
    "rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none";

  function update(id: string, patch: Partial<ConstraintRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-slate-500">{t.noConstraints}</p>}
      {rows.map((row) => {
        const isNumeric = NUMERIC.has(row.operator);
        const isRange = row.operator === "between" || row.operator === "outside";
        const prop = properties.find((p) => p.slug === row.property_slug);
        return (
          <div key={row.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <label className="text-xs text-slate-500">
              {t.operator}
              <select
                className={`${input} mt-0.5 block`}
                value={row.operator}
                onChange={(e) => update(row.id, { operator: e.target.value as ConstraintOperator })}
                aria-label={t.operator}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            {NEEDS_PROPERTY.has(row.operator) && (
              <label className="text-xs text-slate-500">
                {t.property}
                <select
                  className={`${input} mt-0.5 block`}
                  value={row.property_slug}
                  onChange={(e) => update(row.id, { property_slug: e.target.value })}
                  aria-label={t.property}
                >
                  <option value="">—</option>
                  {properties.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}

            {isNumeric && !isRange && (
              <label className="text-xs text-slate-500">
                {t.value}
                <input
                  className={`${input} mt-0.5 block w-24`}
                  value={row.value}
                  onChange={(e) => update(row.id, { value: e.target.value })}
                  inputMode="decimal"
                  aria-label={t.value}
                />
              </label>
            )}
            {isRange && (
              <>
                <label className="text-xs text-slate-500">
                  {t.valueMin}
                  <input className={`${input} mt-0.5 block w-20`} value={row.value_min}
                    onChange={(e) => update(row.id, { value_min: e.target.value })} inputMode="decimal" aria-label={t.valueMin} />
                </label>
                <label className="text-xs text-slate-500">
                  {t.valueMax}
                  <input className={`${input} mt-0.5 block w-20`} value={row.value_max}
                    onChange={(e) => update(row.id, { value_max: e.target.value })} inputMode="decimal" aria-label={t.valueMax} />
                </label>
              </>
            )}
            {isNumeric && (
              <label className="text-xs text-slate-500">
                {t.unit}
                <input
                  className={`${input} mt-0.5 block w-24`}
                  value={row.unit}
                  onChange={(e) => update(row.id, { unit: e.target.value })}
                  placeholder={prop?.canonical_unit ?? ""}
                  aria-label={t.unit}
                />
              </label>
            )}

            {CLASS_OPS.has(row.operator) && (
              <label className="text-xs text-slate-500">
                {t.classes}
                <select
                  multiple
                  className={`${input} mt-0.5 block h-20 w-40`}
                  value={row.class_slugs}
                  onChange={(e) =>
                    update(row.id, {
                      class_slugs: Array.from(e.target.selectedOptions, (o) => o.value),
                    })
                  }
                  aria-label={t.classes}
                >
                  {classes.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}

            {row.operator === "text_contains" && (
              <label className="text-xs text-slate-500">
                {t.text}
                <input className={`${input} mt-0.5 block w-40`} value={row.text}
                  onChange={(e) => update(row.id, { text: e.target.value })} aria-label={t.text} />
              </label>
            )}

            <button
              type="button"
              onClick={() => remove(row.id)}
              className="ml-auto rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
            >
              {ptBR.actions.remove}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Convert editable rows into API ConstraintIn payloads, skipping incomplete ones. */
export function toConstraintPayload(rows: ConstraintRow[]) {
  const num = (s: string): number | null => {
    const v = Number(s.replace(",", "."));
    return s.trim() !== "" && Number.isFinite(v) ? v : null;
  };
  return rows
    .map((r) => {
      if (NUMERIC.has(r.operator)) {
        if (!r.property_slug) return null;
        if (r.operator === "between" || r.operator === "outside") {
          const mn = num(r.value_min);
          const mx = num(r.value_max);
          if (mn === null || mx === null) return null;
          return {
            operator: r.operator,
            property_slug: r.property_slug,
            value_min: mn,
            value_max: mx,
            unit: r.unit.trim() || null,
          };
        }
        const v = num(r.value);
        if (v === null) return null;
        return {
          operator: r.operator,
          property_slug: r.property_slug,
          value: v,
          unit: r.unit.trim() || null,
        };
      }
      if (r.operator === "exists" || r.operator === "not_exists") {
        return r.property_slug ? { operator: r.operator, property_slug: r.property_slug } : null;
      }
      if (r.operator === "in_class" || r.operator === "not_in_class") {
        return r.class_slugs.length ? { operator: r.operator, class_slugs: r.class_slugs } : null;
      }
      return r.text.trim() ? { operator: r.operator, text: r.text.trim() } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}
