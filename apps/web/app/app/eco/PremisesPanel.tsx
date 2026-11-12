"use client";

import type { DefaultsResult } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import { Button, NumberInput, Select, SelectOption } from "@/components/ui";
import type { UseModel } from "@/lib/types";
import { defaultPremises, type Premises } from "./ecoBrief";

const t = ptBR.eco;

/**
 * The use-phase premises, always on screen (D-216).
 *
 * They used to be folded into a disclosure with the numbers in its summary. A
 * premise decides the answer as much as the material does (a 200 000 km life or
 * a 10 000 km one is the difference between "use dominates" and "material
 * dominates"), so it is shown as a form beside the result and not behind a
 * click. The starting values are the server's (`GET /api/padroes`) and the
 * button puts them back.
 */
export function PremisesPanel({
  defaults,
  premises,
  onChange,
}: {
  defaults: DefaultsResult["eco"];
  premises: Premises;
  onChange: (patch: Partial<Premises>) => void;
}) {
  const initial = defaultPremises(defaults);
  const atDefaults = (Object.keys(initial) as (keyof Premises)[]).every(
    (key) => initial[key] === premises[key],
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-support text-ink-muted">{defaults.note}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t.useModelLabel}
          value={premises.useModel}
          onChange={(event) =>
            onChange({ useModel: (event.target as HTMLSelectElement).value as UseModel })
          }
        >
          <SelectOption value="estatico">{t.useStatic}</SelectOption>
          <SelectOption value="movel">{t.useMobile}</SelectOption>
        </Select>
        <NumberInput
          label={t.lifeLabel}
          unit={t.unitYears}
          value={premises.life}
          min={0}
          step="any"
          onChange={(event) => onChange({ life: event.target.value })}
        />
        {premises.useModel === "estatico" ? (
          <>
            <NumberInput
              label={t.powerLabel}
              unit={t.unitW}
              value={premises.power}
              min={0}
              step="any"
              onChange={(event) => onChange({ power: event.target.value })}
            />
            <NumberInput
              label={t.dutyLabel}
              hint={t.dutyHint}
              value={premises.duty}
              min={0}
              max={1}
              step="any"
              onChange={(event) => onChange({ duty: event.target.value })}
            />
          </>
        ) : (
          <>
            <NumberInput
              label={t.travelLabel}
              unit={t.unitKm}
              value={premises.travel}
              min={0}
              step="any"
              onChange={(event) => onChange({ travel: event.target.value })}
            />
            <NumberInput
              label={t.intensityLabel}
              value={premises.intensity}
              min={0}
              step="any"
              onChange={(event) => onChange({ intensity: event.target.value })}
            />
          </>
        )}
        <NumberInput
          label={t.carbonPerEnergyLabel}
          hint={t.carbonPerEnergyHint}
          value={premises.carbonPerEnergy}
          min={0}
          step="any"
          onChange={(event) => onChange({ carbonPerEnergy: event.target.value })}
        />
      </div>
      <div>
        <Button variant="ghost" size="sm" disabled={atDefaults} onClick={() => onChange(initial)}>
          {ecoPhaseI18n.restoreDefaults}
        </Button>
      </div>
    </div>
  );
}
