// Pure form logic for the material form: validation schema and the conversion
// between form fields (strings) and the API payload. Kept out of the component
// so it can be unit-tested in isolation.

import { z } from "zod";
import type {
  DataQuality,
  MaterialDetail,
  PropertyValueIn,
  ValueKind,
} from "./types";
import { ptBR } from "./i18n";

export const REQUIRED = ptBR.form.required;

export const valueSchema = z
  .object({
    property_slug: z.string().min(1, REQUIRED),
    kind: z.enum(["scalar", "interval", "missing"]),
    value: z.string(),
    value_min: z.string(),
    value_max: z.string(),
    value_typical: z.string(),
    unit: z.string(),
    uncertainty: z.string(),
    measurement_condition: z.string(),
    source_label: z.string(),
    notes: z.string(),
    data_quality: z.enum(["MEDIDO", "IMPORTADO", "ESTIMADO"]),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "scalar") {
      if (v.value.trim() === "")
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: REQUIRED });
      if (v.unit.trim() === "")
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: REQUIRED });
    } else if (v.kind === "interval") {
      if (v.value_min.trim() === "")
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value_min"], message: REQUIRED });
      if (v.value_max.trim() === "")
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value_max"], message: REQUIRED });
      if (v.unit.trim() === "")
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: REQUIRED });
    }
  });

export const formSchema = z.object({
  name: z.string().min(1, REQUIRED),
  class_id: z.string().min(1, REQUIRED),
  subclass: z.string(),
  description: z.string(),
  keywords: z.string(),
  values: z.array(valueSchema),
});

export type FormValues = z.infer<typeof formSchema>;
export type ValueRow = FormValues["values"][number];

/** Parse a possibly comma-decimal string into a number, or null if empty/invalid. */
export function toNum(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function emptyValueRow(): ValueRow {
  return {
    property_slug: "",
    kind: "scalar" as ValueKind,
    value: "",
    value_min: "",
    value_max: "",
    value_typical: "",
    unit: "",
    uncertainty: "",
    measurement_condition: "",
    source_label: "",
    notes: "",
    data_quality: "ESTIMADO" as DataQuality,
  };
}

export function toApiValues(values: ValueRow[]): PropertyValueIn[] {
  return values.map((v) => ({
    property_slug: v.property_slug,
    kind: v.kind,
    data_quality: v.data_quality,
    unit: v.kind === "missing" ? null : v.unit || null,
    value: v.kind === "scalar" ? toNum(v.value) : null,
    value_min: v.kind === "interval" ? toNum(v.value_min) : null,
    value_max: v.kind === "interval" ? toNum(v.value_max) : null,
    value_typical: v.kind === "interval" ? toNum(v.value_typical) : null,
    uncertainty: toNum(v.uncertainty),
    measurement_condition: v.measurement_condition || null,
    source_label: v.source_label || null,
    notes: v.notes || null,
  }));
}

export function initialValuesFromDetail(detail: MaterialDetail): ValueRow[] {
  const rows: ValueRow[] = [];
  for (const group of detail.property_groups) {
    for (const p of group.properties) {
      rows.push({
        property_slug: p.property_slug,
        kind: p.is_missing ? "missing" : p.is_interval ? "interval" : "scalar",
        value: p.value_scalar?.toString() ?? "",
        value_min: p.value_min?.toString() ?? "",
        value_max: p.value_max?.toString() ?? "",
        value_typical: p.value_typical?.toString() ?? "",
        unit: p.original_unit ?? "",
        uncertainty: p.uncertainty?.toString() ?? "",
        measurement_condition: p.measurement_condition ?? "",
        source_label: p.source_label ?? "",
        notes: p.notes ?? "",
        data_quality: p.data_quality,
      });
    }
  }
  return rows;
}
