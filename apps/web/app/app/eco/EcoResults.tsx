"use client";

import Link from "next/link";
import type {
  EcoAuditResult,
  EcoComparisonResult,
  EcoDominance,
  EcoPhase,
  EcoUseIn,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import {
  EmptyState,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = ptBR.eco;

export function PhaseTable({ result }: { result: EcoAuditResult }) {
  if (result.phases.length === 0) {
    return <EmptyState title={t.resultStep} />;
  }
  return (
    <TableScroll label={t.resultStep}>
      <Table>
        <TableCaption>{result.carbon_unit_note}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnPhase}</Th>
            <Th scope="col">{`${t.columnEnergy} (${result.energy_unit})`}</Th>
            <Th scope="col">{`${t.columnCarbon} (${result.carbon_unit})`}</Th>
            <Th scope="col">{t.columnDetail}</Th>
          </Tr>
        </THead>
        <TBody>
          {result.phases.map((phase: EcoPhase) => (
            <Tr key={phase.phase}>
              <Td className="font-medium">{phase.label}</Td>
              <Td>
                <Quantity value={phase.energy} reason={phase.energy_reason} />
              </Td>
              <Td>
                <Quantity value={phase.carbon} reason={phase.carbon_reason} />
              </Td>
              <Td className="text-caption text-ink-muted">{phase.detail}</Td>
            </Tr>
          ))}
          <Tr>
            <Td className="font-medium">{t.totalLabel}</Td>
            <Td>
              <Quantity value={result.total_energy} reason={t.noTotal} />
            </Td>
            <Td>
              <Quantity value={result.total_carbon} reason={t.noTotal} />
            </Td>
            <Td />
          </Tr>
        </TBody>
      </Table>
    </TableScroll>
  );
}

export function Quantity({
  value,
  reason,
}: {
  value: number | null;
  reason: string | null;
}) {
  if (value !== null) {
    return <span className="tabular-nums">{formatNumber(value)}</span>;
  }
  return (
    <span className="text-caption text-ink-muted">{reason ?? "Não calculada"}</span>
  );
}

export function Podium({
  label,
  dominance,
}: {
  label: string;
  dominance: EcoDominance;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-muted">
        {label}
      </span>
      {dominance.phase ? (
        <span className="text-body text-ink">
          <strong>{dominance.label}</strong>
          {dominance.share !== null ? (
            <>
              {" "}
              — {formatNumber(dominance.share * 100)}% {t.dominanceShare}
            </>
          ) : null}
        </span>
      ) : (
        <span className="text-body text-ink-muted">{dominance.refusal}</span>
      )}
    </div>
  );
}

export function ComponentTable({ result }: { result: EcoAuditResult }) {
  const phaseLabels = result.components[0]?.phases.map((phase) => phase.label) ?? [];
  return (
    <TableScroll label={t.componentsTitle}>
      <Table>
        <TableCaption>{t.componentsTitle}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnComponent}</Th>
            <Th scope="col">{t.columnMassBought}</Th>
            {phaseLabels.map((label) => (
              <Th key={label} scope="col">{`${label} (${result.energy_unit} · ${result.carbon_unit})`}</Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {result.components.map((component, index) => (
            <Tr key={`${component.name}-${index}`}>
              <Td>
                <div className="font-medium">{component.name}</div>
                <div className="text-caption text-ink-muted">
                  <Link
                    className="text-accent underline underline-offset-2"
                    href={`/app/materiais/${component.material_id}`}
                  >
                    {component.material_name}
                  </Link>{" "}
                  · {component.process_name} · {component.quantity} ×{" "}
                  {formatNumber(component.unit_mass)} kg · {component.end_of_life_label}
                </div>
              </Td>
              <Td className="tabular-nums">{formatNumber(component.mass_bought)}</Td>
              {component.phases.map((phase) => (
                <Td key={phase.phase} className="text-caption">
                  <div>
                    <Quantity value={phase.energy} reason={phase.energy_reason} />
                  </div>
                  <div className="text-ink-muted">
                    <Quantity value={phase.carbon} reason={phase.carbon_reason} />
                  </div>
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

export function LegTable({ result }: { result: EcoAuditResult }) {
  return (
    <TableScroll label={t.legsTitle}>
      <Table>
        <TableCaption>{t.legsTitle}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnLeg}</Th>
            <Th scope="col">{t.transportDistanceLabel}</Th>
            <Th scope="col">{`${t.columnEnergy} (${result.energy_unit})`}</Th>
            <Th scope="col">{`${t.columnCarbon} (${result.carbon_unit})`}</Th>
          </Tr>
        </THead>
        <TBody>
          {result.transport_legs.map((leg, index) => (
            <Tr key={`${leg.mode.slug}-${index}`}>
              <Td className="font-medium">{`${t.legLegend(index + 1)} · ${leg.mode.name}`}</Td>
              <Td className="tabular-nums">{formatNumber(leg.distance_km)}</Td>
              <Td>
                <Quantity value={leg.energy} reason={leg.energy_reason} />
              </Td>
              <Td>
                <Quantity value={leg.carbon} reason={leg.carbon_reason} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

/** The sign decides the colour of a difference, never the number itself. */
function deltaTone(value: number | null): string {
  if (value === null || value === 0) return "text-ink-muted";
  return value < 0 ? "text-success-fg font-medium" : "text-danger-fg";
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function Cell({
  value,
  unit,
  reason,
}: {
  value: number | null;
  unit: string;
  reason: string | null | undefined;
}) {
  return value !== null ? (
    <>{`${formatNumber(value)} ${unit}`}</>
  ) : (
    <span className="text-ink-muted">{reason ?? t.noTotal}</span>
  );
}

function TotalDelta({
  delta,
  percent,
  unit,
}: {
  delta: number | null;
  percent: number | null;
  unit: string;
}) {
  return (
    <div className={deltaTone(delta)}>
      {delta !== null
        ? `${signed(delta)} ${unit}${percent !== null ? ` (${signed(percent)}%)` : ""}`
        : t.noDelta}
    </div>
  );
}

/**
 * Side-by-side phases of two scenarios. The difference of each phase is the
 * server's (`phase_deltas`, ADR 0004): this table prints B − A, it does not
 * subtract.
 */
export function ComparisonTable({ result }: { result: EcoComparisonResult }) {
  const resA = result.material_a;
  const resB = result.material_b;
  const energyUnit = resA.energy_unit;
  const carbonUnit = resA.carbon_unit;
  const deltas = new Map(result.phase_deltas.map((delta) => [delta.phase, delta]));

  return (
    <TableScroll label={t.compareResultStep}>
      <Table>
        <TableCaption>{resA.carbon_unit_note}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnPhase}</Th>
            <Th scope="col">{`${t.columnMaterialA} (${resA.material_name})`}</Th>
            <Th scope="col">{`${t.columnMaterialB} (${resB.material_name})`}</Th>
            <Th scope="col">{t.columnVariation}</Th>
          </Tr>
        </THead>
        <TBody>
          {resA.phases.map((pA) => {
            const pB = resB.phases.find((p) => p.phase === pA.phase);
            const delta = deltas.get(pA.phase);
            const deltaE = delta?.delta_energy ?? null;
            const deltaC = delta?.delta_carbon ?? null;
            return (
              <Tr key={pA.phase}>
                <Td className="font-medium">{pA.label}</Td>
                <Td className="tabular-nums text-caption">
                  <div>
                    <Cell value={pA.energy} unit={energyUnit} reason={pA.energy_reason} />
                  </div>
                  <div className="text-ink-muted">
                    <Cell value={pA.carbon} unit={carbonUnit} reason={pA.carbon_reason} />
                  </div>
                </Td>
                <Td className="tabular-nums text-caption">
                  <div>
                    <Cell value={pB?.energy ?? null} unit={energyUnit} reason={pB?.energy_reason} />
                  </div>
                  <div className="text-ink-muted">
                    <Cell value={pB?.carbon ?? null} unit={carbonUnit} reason={pB?.carbon_reason} />
                  </div>
                </Td>
                <Td className="tabular-nums text-caption">
                  <div className={deltaTone(deltaE)}>
                    {deltaE !== null ? `${signed(deltaE)} ${energyUnit}` : t.noDelta}
                  </div>
                  <div className={deltaTone(deltaC)}>
                    {deltaC !== null ? `${signed(deltaC)} ${carbonUnit}` : t.noDelta}
                  </div>
                </Td>
              </Tr>
            );
          })}
          <Tr>
            <Td className="font-medium">{t.totalLabel}</Td>
            <Td className="tabular-nums font-semibold text-caption">
              <div>
                <Cell value={resA.total_energy} unit={energyUnit} reason={t.noTotal} />
              </div>
              <div className="text-ink-muted">
                <Cell value={resA.total_carbon} unit={carbonUnit} reason={t.noTotal} />
              </div>
            </Td>
            <Td className="tabular-nums font-semibold text-caption">
              <div>
                <Cell value={resB.total_energy} unit={energyUnit} reason={t.noTotal} />
              </div>
              <div className="text-ink-muted">
                <Cell value={resB.total_carbon} unit={carbonUnit} reason={t.noTotal} />
              </div>
            </Td>
            <Td className="tabular-nums font-semibold text-caption">
              <TotalDelta
                delta={result.delta_energy}
                percent={result.delta_energy_percent}
                unit={energyUnit}
              />
              <TotalDelta
                delta={result.delta_carbon}
                percent={result.delta_carbon_percent}
                unit={carbonUnit}
              />
            </Td>
          </Tr>
        </TBody>
      </Table>
    </TableScroll>
  );
}

/**
 * The premises the answer on screen was computed from (D-216): read from the
 * brief that produced it, so the list cannot disagree with the numbers beside
 * it even if the inputs have been edited since.
 */
export function PremisesSummary({
  use,
  transportKm,
}: {
  use: EcoUseIn;
  transportKm: number | null;
}) {
  const p = ecoPhaseI18n.premises;
  const rows: [string, string][] = [
    [p.useModel, use.model === "estatico" ? t.useStatic : t.useMobile],
  ];
  const number = (value: number | null | undefined, unit: string): string =>
    value === null || value === undefined ? ptBR.quality.AUSENTE : `${formatNumber(value)} ${unit}`;
  rows.push([p.life, number(use.life_years, p.yearsUnit)]);
  if (use.model === "estatico") {
    rows.push([p.power, number(use.power_watts, "W")]);
    rows.push([p.duty, number(use.duty_cycle, "")]);
  } else {
    rows.push([p.travel, number(use.distance_km, "km")]);
    rows.push([p.intensity, number(use.mobile_intensity, "MJ/(kg·km)")]);
  }
  rows.push([p.carbonPerEnergy, number(use.carbon_per_energy, "kg CO₂/MJ")]);
  if (transportKm !== null) rows.push([p.transport, number(transportKm, "km")]);
  return (
    <section aria-label={p.title} className="well flex flex-col gap-2">
      <h4 className="text-body font-medium text-ink">{p.title}</h4>
      <p className="text-caption text-ink-muted">{p.hint}</p>
      <dl className="grid gap-x-6 gap-y-1 text-caption sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-wrap gap-x-2">
            <dt className="text-ink-muted">{label}:</dt>
            <dd className="min-w-0 break-words font-medium tabular-nums text-ink">{value.trim()}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
