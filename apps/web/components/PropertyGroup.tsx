import type {
  PropertyGroup as PropertyGroupType,
  PropertyValueOut,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import {
  Card,
  CardHeader,
  DataQualityBadge,
  MissingValue,
  ProvenancePopover,
  provenanceOfProperty,
  qualityState,
} from "@/components/ui";

/** The number itself. Everything around it — where it came from, what it was
 * converted from, who recorded it — is in the popover. */
function ValueText({ p }: { p: PropertyValueOut }) {
  // A **leitura** (D-70), e não o registro: o backend já converteu a medida para
  // a unidade em que a grandeza se lê — ninguém lê módulo de Young em pascal, e
  // esta ficha mostrava 210000000000. O que a fonte disse continua inteiro em
  // `value_scalar` + `original_unit`, e é o que o popover de proveniência
  // mostra logo ao lado: a tela ficou legível sem deixar de ser auditável.
  //
  // A queda para o registro cobre o caso de um payload antigo em cache, e não
  // um estado normal: o backend sempre manda os dois conjuntos.
  const unit = prettyUnit(p.display_unit ?? p.original_unit);
  const min = p.display_min ?? p.value_min;
  const max = p.display_max ?? p.value_max;
  const typical = p.display_typical ?? p.value_typical;
  const scalar = p.display_value ?? p.value_scalar;
  const uncertainty = p.display_uncertainty ?? p.uncertainty;

  if (p.is_interval && min !== null && max !== null) {
    return (
      <span>
        <span className="font-medium tabular-nums">
          {formatNumber(min)} – {formatNumber(max)}
        </span>{" "}
        {unit}
        {typical !== null && (
          <span className="ml-1 text-xs text-ink-subtle">
            ({ptBR.detail.typical}: {formatNumber(typical)})
          </span>
        )}
      </span>
    );
  }

  if (scalar !== null) {
    return (
      <span>
        <span className="font-medium tabular-nums">{formatNumber(scalar)}</span>{" "}
        {unit}
        {uncertainty !== null && (
          <span className="ml-1 text-xs text-ink-subtle">
            ± {formatNumber(uncertainty)}
          </span>
        )}
      </span>
    );
  }

  // Not flagged missing but carrying no numeric value. It is still absence, and
  // absence has one rendering in this system — never a dash, never a 0.
  return <MissingValue />;
}

/**
 * Render the value cell for a single property.
 *
 * The provenance used to sit under every value as a row of undifferentiated
 * grey micro-text, which is where a reader's eye goes to not read something.
 * §3.2 of the proposal wants the reference reachable *in the interface*: the
 * value is now the trigger, the quality is a badge next to it, and absence gets
 * the same treatment as a value — a stated state, not a blank.
 */
function ValueCell({ p }: { p: PropertyValueOut }) {
  const provenance = provenanceOfProperty(p);
  const state = qualityState(provenance);

  if (p.is_missing) {
    return (
      <ProvenancePopover provenance={provenance}>
        <MissingValue />
      </ProvenancePopover>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <ProvenancePopover provenance={provenance}>
        <ValueText p={p} />
      </ProvenancePopover>
      <DataQualityBadge state={state} />
    </span>
  );
}

/** A category card listing its property values with units and provenance. */
export function PropertyGroupCard({ group }: { group: PropertyGroupType }) {
  return (
    <Card>
      <CardHeader title={ptBR.categories[group.category]} />
      <table className="min-w-full divide-y divide-edge-subtle text-sm">
        <tbody>
          {group.properties.map((p) => (
            <tr key={p.property_slug} className="align-top">
              <th
                scope="row"
                className="w-1/3 px-4 py-2 text-left font-normal text-ink-muted"
              >
                {p.property_name}
                {p.symbol && (
                  <span className="ml-1 text-ink-subtle">({p.symbol})</span>
                )}
              </th>
              <td className="px-4 py-2 text-ink">
                <ValueCell p={p} />
                {p.notes && (
                  <div className="mt-1 text-xs italic text-ink-subtle">
                    {p.notes}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
