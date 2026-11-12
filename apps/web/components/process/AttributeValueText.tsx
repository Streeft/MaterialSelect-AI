"use client";

import type { ProcessAttributeValue } from "@/lib/types";
import { formatNumber, valueUnit } from "@/lib/format";
import { Badge, MissingValue } from "@/components/ui";

/** One process attribute as text: an envelope as a range, a scalar as a number, a label set as badges. */
export function AttributeValueText({
  value,
}: {
  value: ProcessAttributeValue;
}) {
  // D-205: `valueUnit`, as the material sheet does since D-184. A cost is a
  // dimensionless quantity here (D-65: money is in no unit system), and the
  // dash `prettyUnit` writes for it read as "missing" ("50.000 —").
  const unit = valueUnit(value.original_unit);

  if (value.kind === "DISCRETO") {
    if (value.labels.length === 0) return <MissingValue />;
    return (
      <span className="flex flex-wrap gap-1">
        {value.labels.map((label) => (
          <Badge key={label} tone="neutral">
            {label}
          </Badge>
        ))}
      </span>
    );
  }

  if (value.value_min !== null && value.value_max !== null) {
    return (
      <span>
        <span className="font-medium tabular-nums">
          {formatNumber(value.value_min)} – {formatNumber(value.value_max)}
        </span>{" "}
        {unit}
      </span>
    );
  }

  if (value.value_scalar !== null) {
    return (
      <span>
        <span className="font-medium tabular-nums">
          {formatNumber(value.value_scalar)}
        </span>{" "}
        {unit}
      </span>
    );
  }

  // Carrying no value without being flagged missing is still absence, and
  // absence has exactly one rendering in this system.
  return <MissingValue />;
}
