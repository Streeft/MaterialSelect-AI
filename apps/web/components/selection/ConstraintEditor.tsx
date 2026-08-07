"use client";

import type { ConstraintOperator, MaterialClass, PropertyDefinition } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import { Card, CardBody, Field, IconButton, Input, Select } from "@/components/ui";
import { IconTrash } from "@/components/ui/icons";

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

const OPERATORS: ConstraintOperator[] = [
  "gte",
  "gt",
  "lte",
  "lt",
  "between",
  "outside",
  "exists",
  "not_exists",
  "in_class",
  "not_in_class",
  "text_contains",
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
  function update(id: string, patch: Partial<ConstraintRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{t.noConstraints}</p>;
  }

  return (
    <ol className="space-y-3">
      {rows.map((row, position) => {
        const isNumeric = NUMERIC.has(row.operator);
        const isRange = row.operator === "between" || row.operator === "outside";
        const prop = properties.find((p) => p.slug === row.property_slug);
        const rowLabel = t.constraintNumber(position + 1);
        return (
          <li key={row.id}>
            <Card as="fieldset">
              {/* The number is the row's name for a reader who cannot see that
                  these controls are grouped in a box. A legend has to be the
                  fieldset's first child to be read as its caption. */}
              <legend className="sr-only">{rowLabel}</legend>
              <CardBody className="flex flex-wrap items-end gap-3">
                <Field label={t.operator} className="w-48">
                  <Select
                    value={row.operator}
                    onChange={(e) =>
                      update(row.id, { operator: e.target.value as ConstraintOperator })
                    }
                  >
                    {OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {t.operators[op]}
                      </option>
                    ))}
                  </Select>
                </Field>

                {NEEDS_PROPERTY.has(row.operator) && (
                  <Field label={t.property} className="w-56">
                    <Select
                      value={row.property_slug}
                      onChange={(e) => update(row.id, { property_slug: e.target.value })}
                    >
                      <option value="">{t.selectProperty}</option>
                      {properties.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                {/* Text input with a decimal keypad, not `type="number"`: a
                    pt-BR reader types "2,7", and a number input silently
                    discards the value it cannot parse. The payload builder
                    accepts both separators. */}
                {isNumeric && !isRange && (
                  <Field label={t.value} className="w-28">
                    <Input
                      inputMode="decimal"
                      className="tabular-nums"
                      value={row.value}
                      onChange={(e) => update(row.id, { value: e.target.value })}
                    />
                  </Field>
                )}
                {isRange && (
                  <>
                    <Field label={t.valueMin} className="w-28">
                      <Input
                        inputMode="decimal"
                        className="tabular-nums"
                        value={row.value_min}
                        onChange={(e) => update(row.id, { value_min: e.target.value })}
                      />
                    </Field>
                    <Field label={t.valueMax} className="w-28">
                      <Input
                        inputMode="decimal"
                        className="tabular-nums"
                        value={row.value_max}
                        onChange={(e) => update(row.id, { value_max: e.target.value })}
                      />
                    </Field>
                  </>
                )}
                {isNumeric && (
                  // The unit is not decoration: an empty box means "canonical",
                  // and the placeholder is the only place that says which one.
                  <Field
                    label={t.unit}
                    hint={prop ? prettyUnit(prop.canonical_unit) : undefined}
                    className="w-28"
                  >
                    <Input
                      value={row.unit}
                      onChange={(e) => update(row.id, { unit: e.target.value })}
                      placeholder={prop?.canonical_unit ?? ""}
                    />
                  </Field>
                )}

                {CLASS_OPS.has(row.operator) && (
                  <Field label={t.classes} className="w-56">
                    <Select
                      multiple
                      className="h-24"
                      value={row.class_slugs}
                      onChange={(e) =>
                        update(row.id, {
                          class_slugs: Array.from(e.target.selectedOptions, (o) => o.value),
                        })
                      }
                    >
                      {classes.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                {row.operator === "text_contains" && (
                  <Field label={t.text} className="w-56">
                    <Input
                      value={row.text}
                      onChange={(e) => update(row.id, { text: e.target.value })}
                    />
                  </Field>
                )}

                <IconButton
                  className="ml-auto"
                  size="sm"
                  variant="ghost"
                  label={`${ptBR.actions.remove}: ${rowLabel}`}
                  icon={<IconTrash />}
                  onClick={() => remove(row.id)}
                />
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ol>
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
