"use client";

import type { ColumnRole, PropertyDefinition } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Input,
  RowHeader,
  Select,
  SelectOption,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

export type ColumnTarget =
  "ignore" | "name" | "class" | "subclass" | "description" | "keywords" | "property";

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

  return (
    <TableScroll label={ptBR.importer.mappingTitle}>
      <Table>
        <TableCaption>{ptBR.importer.mappingTitle}</TableCaption>
        <THead>
          <Tr>
            <Th>{ptBR.importer.columnSource}</Th>
            <Th>{ptBR.importer.columnTarget}</Th>
            <Th>{ptBR.importer.property}</Th>
            <Th>{ptBR.importer.columnRole}</Th>
            <Th>{ptBR.importer.unit}</Th>
          </Tr>
        </THead>
        <TBody>
          {columns.map((col, i) => {
            // The last three controls only exist for a column mapped to a
            // property. The cells are empty because there is nothing to set —
            // not because a value is missing.
            const isProperty = col.target === "property";
            return (
              <Tr key={col.column}>
                <RowHeader>{col.column}</RowHeader>
                <Td>
                  <Select
                    aria-label={ptBR.importer.ariaTarget(col.column)}
                    value={col.target}
                    onChange={(e) => update(i, { target: e.target.value as ColumnTarget })}
                  >
                    {TARGET_OPTIONS.map((o) => (
                      <SelectOption key={o.value} value={o.value}>
                        {o.label}
                      </SelectOption>
                    ))}
                  </Select>
                </Td>
                <Td>
                  {isProperty && (
                    <Select
                      aria-label={ptBR.importer.ariaProperty(col.column)}
                      value={col.propertySlug}
                      onChange={(e) => update(i, { propertySlug: e.target.value })}
                    >
                      <SelectOption value="">{ptBR.importer.selectProperty}</SelectOption>
                      {properties.map((p) => (
                        <SelectOption key={p.slug} value={p.slug}>
                          {p.name}
                        </SelectOption>
                      ))}
                    </Select>
                  )}
                </Td>
                <Td>
                  {isProperty && (
                    <Select
                      aria-label={ptBR.importer.ariaRole(col.column)}
                      value={col.role}
                      onChange={(e) => update(i, { role: e.target.value as ColumnRole })}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <SelectOption key={o.value} value={o.value}>
                          {o.label}
                        </SelectOption>
                      ))}
                    </Select>
                  )}
                </Td>
                <Td>
                  {isProperty && (
                    <Input
                      aria-label={ptBR.importer.ariaUnit(col.column)}
                      className="w-28"
                      value={col.unit}
                      onChange={(e) => update(i, { unit: e.target.value })}
                      placeholder="ex.: GPa"
                    />
                  )}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableScroll>
  );
}
