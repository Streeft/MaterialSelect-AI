"use client";

import type { Goal, PerformanceIndex } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { PropertyHint } from "@/components/glossary/PropertyHint";
import { ButtonGroup, ButtonGroupItem, Select, SelectOption } from "@/components/ui";
import { ExpressionBuilder } from "@/components/expression/ExpressionBuilder";
import { IndexCard } from "@/components/selection/IndexCard";
import { describeAxisIndex } from "./axisIndex";
import type { AxisState } from "./url-state";

const t = ptBR.map;

/** One axis's controls: property picker, or index picker (predefined/custom). */
export function AxisControl({
  label,
  axis,
  onChange,
  properties,
  indices,
  dimension,
  allowIndex = true,
}: {
  label: string;
  axis: AxisState;
  onChange: (next: AxisState) => void;
  properties: { slug: string; name: string; canonical_unit?: string | null }[];
  indices: PerformanceIndex[];
  /** Dimension of the resolved index, once the map has computed it (ADR 0004). */
  dimension?: string | null;
  allowIndex?: boolean;
}) {
  const descriptor = describeAxisIndex(axis, indices);
  const selectedProperty = properties.find((p) => p.slug === axis.property);

  return (
    <div className="flex min-w-[min(16rem,100%)] flex-1 flex-col gap-2">
      {allowIndex && (
        <ButtonGroup label={`${label} — ${t.axisTypeProperty.toLowerCase()}/${t.axisTypeIndex.toLowerCase()}`}>
          <ButtonGroupItem
            selected={axis.mode === "property"}
            label={t.axisTypeProperty}
            onClick={() => onChange({ ...axis, mode: "property" })}
          />
          <ButtonGroupItem
            selected={axis.mode === "index"}
            label={t.axisTypeIndex}
            onClick={() => onChange({ ...axis, mode: "index" })}
          />
        </ButtonGroup>
      )}

      {axis.mode === "property" || !allowIndex ? (
        <div className="flex items-end gap-2">
        <Select
          label={label}
          className="min-w-0 flex-1"
          value={axis.property}
          onChange={(e) => onChange({ ...axis, property: e.target.value })}
        >
          {/* D-91: no unit in the option. The map reads in D-70 units
              (g/cm³, GPa) and an offset unit stays canonical, so the stored
              unit here ("[kg/m³]") contradicted the axis beside it. The
              axis title, drawn from the map itself, is the one place the
              unit is stated. */}
          {properties.map((p) => (
            <SelectOption key={p.slug} value={p.slug}>
              {p.name}
            </SelectOption>
          ))}
        </Select>
        {/* GL-b: an <option> cannot hold a button, so the hint sits beside the
            picker and follows the chosen property. Silent without an entry. */}
        {selectedProperty && (
          <PropertyHint
            slug={selectedProperty.slug}
            name={selectedProperty.name}
            className="mb-2.5"
          />
        )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-support text-ink-muted">{t.axisIndexHint}</p>
          <Select
            label={label}
            className="min-w-0"
            value={axis.indexSlug}
            onChange={(e) => onChange({ ...axis, indexSlug: e.target.value })}
          >
            <SelectOption value="">{t.axisIndexChoose}</SelectOption>
            {indices.map((i) => (
              <SelectOption key={i.slug} value={i.slug}>
                {i.name}
              </SelectOption>
            ))}
            <SelectOption value="custom">{t.indexCustom}</SelectOption>
          </Select>

          {axis.indexSlug === "custom" && (
            <div className="flex flex-col gap-2">
              <ExpressionBuilder
                label={t.expression}
                value={axis.customExpression}
                onChange={(next) => onChange({ ...axis, customExpression: next })}
              />
              <Select
                label={t.goal}
                value={axis.goal}
                onChange={(e) => onChange({ ...axis, goal: e.target.value as Goal })}
              >
                <SelectOption value="maximize">{t.maximize}</SelectOption>
                <SelectOption value="minimize">{t.minimize}</SelectOption>
              </Select>
            </div>
          )}

          {descriptor && <IndexCard index={descriptor} dimension={dimension} className="mt-1" />}
        </div>
      )}
    </div>
  );
}

