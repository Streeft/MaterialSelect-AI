import type { PropertyGroup as PropertyGroupType, PropertyValueOut } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";

/** Render the value cell for a single property, honouring the missing-data rule. */
function ValueCell({ p }: { p: PropertyValueOut }) {
  // The non-negotiable rule: a missing value is shown as "ausente", never as 0.
  if (p.is_missing) {
    return (
      <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        {ptBR.detail.missing}
      </span>
    );
  }

  const unit = prettyUnit(p.original_unit);

  if (p.is_interval && p.value_min !== null && p.value_max !== null) {
    return (
      <span>
        <span className="font-medium">
          {formatNumber(p.value_min)} – {formatNumber(p.value_max)}
        </span>{" "}
        {unit}
        {p.value_typical !== null && (
          <span className="ml-1 text-xs text-slate-500">
            ({ptBR.detail.typical}: {formatNumber(p.value_typical)})
          </span>
        )}
      </span>
    );
  }

  if (p.value_scalar !== null) {
    return (
      <span>
        <span className="font-medium">{formatNumber(p.value_scalar)}</span> {unit}
        {p.uncertainty !== null && (
          <span className="ml-1 text-xs text-slate-500">
            ± {formatNumber(p.uncertainty)}
          </span>
        )}
      </span>
    );
  }

  // Not flagged missing but no numeric value present — still never invent a 0.
  return <span className="text-xs text-slate-400">{ptBR.detail.missing}</span>;
}

/** A category card listing its property values with units and provenance. */
export function PropertyGroupCard({ group }: { group: PropertyGroupType }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
        {ptBR.categories[group.category]}
      </h3>
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <tbody>
          {group.properties.map((p) => (
            <tr key={p.property_slug} className="align-top">
              <th
                scope="row"
                className="w-1/3 px-4 py-2 text-left font-normal text-slate-600"
              >
                {p.property_name}
                {p.symbol && <span className="ml-1 text-slate-400">({p.symbol})</span>}
              </th>
              <td className="px-4 py-2">
                <ValueCell p={p} />
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                  {!p.is_missing && p.normalized_value !== null && (
                    <span>
                      {ptBR.detail.normalized}: {formatNumber(p.normalized_value)}{" "}
                      {prettyUnit(p.canonical_unit)}
                    </span>
                  )}
                  <span>
                    {ptBR.detail.quality}: {ptBR.quality[p.data_quality]}
                  </span>
                  {p.source_label && (
                    <span>
                      {ptBR.detail.source}: {p.source_label}
                    </span>
                  )}
                  {p.measurement_condition && (
                    <span>
                      {ptBR.detail.condition}: {p.measurement_condition}
                    </span>
                  )}
                </div>
                {p.notes && <div className="mt-0.5 text-xs italic text-slate-400">{p.notes}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
