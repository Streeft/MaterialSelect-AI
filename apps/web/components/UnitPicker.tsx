"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { PropertyValueOut } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import { Select, SelectOption } from "@/components/ui";

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
 */
export function UnitPicker({
  property,
  acceptedUnits,
}: {
  property: PropertyValueOut;
  acceptedUnits: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const choices = parseUnitChoices(search.get(UNITS_PARAM));
  const current =
    choices[property.property_slug] ?? property.display_unit ?? "";

  const choose = useCallback(
    (unit: string) => {
      const next = { ...choices };
      // Voltar à convenção da grandeza é **retirar** a escolha, não gravar a
      // unidade convencional: assim a URL só carrega o que o leitor mudou, e
      // uma mudança de convenção no catálogo alcança links antigos.
      if (unit === (property.display_unit ?? ""))
        delete next[property.property_slug];
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
    [
      choices,
      pathname,
      property.display_unit,
      property.property_slug,
      router,
      search,
    ],
  );

  // Uma grandeza com uma unidade só não tem escolha a oferecer, e um seletor de
  // uma opção é ruído que sugere que existe alternativa.
  if (acceptedUnits.length < 2) return null;

  return (
    <Select
      label={`${t.readIn} ${property.property_name}`}
      value={current}
      onChange={(e) => choose((e.target as HTMLSelectElement).value)}
    >
      {acceptedUnits.map((unit) => (
        <SelectOption key={unit} value={unit}>
          {prettyUnit(unit)}
        </SelectOption>
      ))}
    </Select>
  );
}
