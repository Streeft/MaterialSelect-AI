"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { PropertyValueOut } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import { Popover } from "@/components/ui";
import { IconChevronDown } from "@/components/ui/icons";

const t = ptBR.units;

/** O parâmetro em que a escolha vive, igual no cliente e no servidor. */
export const UNITS_PARAM = "unidades";

/** Lê `modulo_young:GPa,densidade:kg/m**3` da URL. */
export function parseUnitChoices(raw: string | null): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const piece of raw.split(",")) {
    const [slug, unit] = piece.split(":");
    if (slug?.trim() && unit?.trim()) out[slug.trim()] = unit.trim();
  }
  return out;
}

/**
 * A escolha de unidade de leitura, que **vive na URL** (D-70).
 *
 * Nunca numa linha de usuário no servidor, pela razão que o D-63 já fixou para
 * o registro de referência: uma preferência guardada faria a mesma URL desenhar
 * duas tabelas diferentes para duas pessoas, e um documento exportado a partir
 * dela deixaria de ser reproduzível pelo próprio link. Aqui o link *é* a
 * pergunta inteira, e quem o receber lê os mesmos números.
 *
 * As opções saem de `accepted_units` da propriedade, que já é a lista curada de
 * unidades válidas para aquela grandeza — o mesmo conjunto que o backend
 * aceita, então não há escolha na tela que o servidor vá recusar.
 *
 * Este gancho lê e grava a escolha de uma grandeza; o servidor converte, e a
 * escolha muda a pergunta, nunca o número no cliente (ADR 0004).
 */
export function useUnitChoice(
  property: Pick<PropertyValueOut, "property_slug" | "display_unit">,
  /** The quantity's own reading unit (its definition's `display_unit`). */
  conventionUnit?: string | null,
) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const choices = parseUnitChoices(search.get(UNITS_PARAM));
  const current = choices[property.property_slug] ?? property.display_unit ?? "";

  const choose = useCallback(
    (unit: string) => {
      const next = { ...choices };
      // Voltar à convenção da grandeza é **retirar** a escolha, não gravar a
      // unidade convencional: assim a URL só carrega o que o leitor mudou, e
      // uma mudança de convenção no catálogo alcança links antigos.
      const convention = conventionUnit ?? property.display_unit ?? "";
      if (unit === convention) delete next[property.property_slug];
      else next[property.property_slug] = unit;

      const params = new URLSearchParams(search.toString());
      const serialized = Object.entries(next)
        .map(([slug, value]) => `${slug}:${value}`)
        .join(",");
      if (serialized) params.set(UNITS_PARAM, serialized);
      else params.delete(UNITS_PARAM);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [choices, conventionUnit, pathname, property.display_unit, property.property_slug, router, search],
  );

  return { current, choose };
}

/**
 * D-214: a unidade **no valor**. O "210 GPa" da ficha é o próprio controle:
 * a unidade é um chip que abre as unidades aceitas daquela grandeza, e
 * escolher uma relê só aquela propriedade (D-70, na URL; o servidor converte).
 *
 * Substitui a fileira de seletores "Ler em:" que vinha antes de qualquer valor
 * — o leitor tinha de passar por controles antes de chegar aos números. Uma
 * grandeza com uma unidade só não ganha chip: a unidade fica escrita, sem
 * prometer escolha.
 */
export function UnitChip({
  property,
  acceptedUnits,
  conventionUnit,
}: {
  property: PropertyValueOut;
  acceptedUnits: readonly string[];
  conventionUnit?: string | null;
}) {
  const { choose } = useUnitChoice(property, conventionUnit);
  const shown = property.display_unit ?? property.original_unit ?? "";
  const pretty = prettyUnit(shown);

  return (
    <Popover
      label={t.chipLabel(property.property_name, pretty)}
      title={t.chipTitle(property.property_name)}
      triggerClassName="ds-unit-chip m3-state touch-target"
      trigger={
        <>
          <span>{pretty}</span>
          <IconChevronDown aria-hidden className="h-3.5 w-3.5" />
        </>
      }
    >
      {(close) => (
        <div role="group" aria-label={t.chipTitle(property.property_name)} className="flex flex-col gap-1">
          {acceptedUnits.map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={unit === shown}
              className="ds-unit-option m3-state"
              onClick={() => {
                choose(unit);
                close();
              }}
            >
              {prettyUnit(unit)}
            </button>
          ))}
          <p className="mt-1 text-caption text-ink-muted">{t.readingNote}</p>
        </div>
      )}
    </Popover>
  );
}
