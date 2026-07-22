"use client";

import type { ColumnRole, PropertyDefinition } from "@/lib/types";
import { ptBR } from "@/lib/i18n";

export type ColumnTarget =
  | "ignore"
  | "name"
  | "class"
  | "subclass"
  | "description"
  | "keywords"
  | "property";

/** Client-side state for one spreadsheet column being mapped. */
export interface ColumnState {
  column: string;
  target: ColumnTarget;
  propertySlug: string;
  role: ColumnRole;
  unit: string;
}

const TARGET_OPTIONS: { value: ColumnTarget; label: string }[] = [
  { value: "ignore", label: ptBR.importer.ignore },
  { value: "name", label: ptBR.importer.targetName },
  { value: "class", label: ptBR.importer.targetClass },
  { value: "subclass", label: ptBR.importer.targetSubclass },
  { value: "description", label: ptBR.importer.targetDescription },
  { value: "keywords", label: ptBR.importer.targetKeywords },
  { value: "property", label: ptBR.importer.targetProperty },
];

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: "value", label: ptBR.importer.roleValue },
  { value: "min", label: ptBR.importer.roleMin },
  { value: "max", label: ptBR.importer.roleMax },
  { value: "typical", label: ptBR.importer.roleTypical },
];

interface MappingEditorProps {
  columns: ColumnState[];
  properties: PropertyDefinition[];
  onChange: (next: ColumnState[]) => void;
}

/** Table where the user assigns a target (and property/role/unit) per column. */
export function MappingEditor({ columns, properties, onChange }: MappingEditorProps) {
  function update(index: number, patch: Partial<ColumnState>) {
    onChange(columns.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  const selectClass =
    "rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-2">Coluna</th>
            <th scope="col" className="px-3 py-2">Destino</th>
            <th scope="col" className="px-3 py-2">{ptBR.importer.property}</th>
            <th scope="col" className="px-3 py-2">{ptBR.importer.columnRole}</th>
            <th scope="col" className="px-3 py-2">{ptBR.importer.unit}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {columns.map((col, i) => (
            <tr key={col.column}>
              <td className="px-3 py-2 font-medium text-slate-700">{col.column}</td>
              <td className="px-3 py-2">
                <select
                  aria-label={`Destino da coluna ${col.column}`}
                  className={selectClass}
                  value={col.target}
                  onChange={(e) => update(i, { target: e.target.value as ColumnTarget })}
                >
                  {TARGET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                {col.target === "property" && (
                  <select
                    aria-label={`Propriedade da coluna ${col.column}`}
                    className={selectClass}
                    value={col.propertySlug}
                    onChange={(e) => update(i, { propertySlug: e.target.value })}
                  >
                    <option value="">—</option>
                    {properties.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="px-3 py-2">
                {col.target === "property" && (
                  <select
                    aria-label={`Papel da coluna ${col.column}`}
                    className={selectClass}
                    value={col.role}
                    onChange={(e) => update(i, { role: e.target.value as ColumnRole })}
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
              </td>
              <td className="px-3 py-2">
                {col.target === "property" && (
                  <input
                    aria-label={`Unidade da coluna ${col.column}`}
                    className={selectClass + " w-28"}
                    value={col.unit}
                    onChange={(e) => update(i, { unit: e.target.value })}
                    placeholder="ex.: GPa"
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
