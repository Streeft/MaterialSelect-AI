"use client";

// Sample text in this file is specimen copy (see the note in `estilo/page.tsx`),
// not product copy, which is why it is written here and not in `lib/i18n.ts`.

import { useState } from "react";
import { MenuButton, MenuItem, Tabs } from "@/components/ui";

/** The 15 M3 roles, baseline beside emphasized (D-252b). */
const ROLES = [
  "display-small",
  "headline-medium",
  "title-large",
  "title-medium",
  "title-small",
  "body-large",
  "body-medium",
  "label-large",
  "label-medium",
] as const;

// Literal class names, so Tailwind finds every one of them in the source.
const BASELINE: Record<(typeof ROLES)[number], string> = {
  "display-small": "text-m3-display-small",
  "headline-medium": "text-m3-headline-medium",
  "title-large": "text-m3-title-large",
  "title-medium": "text-m3-title-medium",
  "title-small": "text-m3-title-small",
  "body-large": "text-m3-body-large",
  "body-medium": "text-m3-body-medium",
  "label-large": "text-m3-label-large",
  "label-medium": "text-m3-label-medium",
};
const EMPHASIZED: Record<(typeof ROLES)[number], string> = {
  "display-small": "text-m3-display-small-emphasized",
  "headline-medium": "text-m3-headline-medium-emphasized",
  "title-large": "text-m3-title-large-emphasized",
  "title-medium": "text-m3-title-medium-emphasized",
  "title-small": "text-m3-title-small-emphasized",
  "body-large": "text-m3-body-large-emphasized",
  "body-medium": "text-m3-body-medium-emphasized",
  "label-large": "text-m3-label-large-emphasized",
  "label-medium": "text-m3-label-medium-emphasized",
};

const ORDERS = ["Nome", "Classe", "Densidade"] as const;

/**
 * D-252b: what M3 Expressive added and the app now has — the emphasized type
 * styles (shown on the selected tab and group seat), the vertical menu with a
 * selected item, and the segmented list.
 */
export function M3ExpressiveSpecimens() {
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const [order, setOrder] = useState<(typeof ORDERS)[number]>("Nome");
  const [picked, setPicked] = useState("Aço 1020");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-body font-semibold text-ink">Tipografia: base e enfatizada</h3>
        <table className="w-full text-left">
          <caption className="sr-only">Cada papel do M3 na forma de base e na enfatizada</caption>
          <thead>
            <tr className="text-caption text-ink-muted">
              <th className="py-1 pr-4 font-medium">Papel</th>
              <th className="py-1 pr-4 font-medium">Base</th>
              <th className="py-1 font-medium">Enfatizada</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => (
              <tr key={role} className="border-t border-line">
                <td className="py-1.5 pr-4 font-mono text-caption text-ink-muted">{role}</td>
                <td className={`py-1.5 pr-4 text-ink ${BASELINE[role]}`}>Seleção de materiais</td>
                <td className={`py-1.5 text-ink ${EMPHASIZED[role]}`}>Seleção de materiais</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 max-w-prose text-support text-ink-muted">
          A enfatizada muda só o peso. Ela marca o que está escolhido: a aba ativa e o assento do
          grupo de botões abaixo, sem empurrar os vizinhos.
        </p>
        <div className="mt-3">
          <Tabs
            label="Exemplo de abas"
            value={tab}
            onChange={setTab}
            items={[
              { id: "a", label: "Resumo" },
              { id: "b", label: "Classificação" },
              { id: "c", label: "Eliminados" },
            ]}
          >
            <p className="text-support text-ink-muted">Painel da aba.</p>
          </Tabs>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-body font-semibold text-ink">Menu vertical com item escolhido</h3>
        <MenuButton label={`Ordenar: ${order}`}>
          {ORDERS.map((option) => (
            <MenuItem key={option} selected={option === order} onSelect={() => setOrder(option)}>
              {option}
            </MenuItem>
          ))}
        </MenuButton>
      </div>

      <div>
        <h3 className="mb-2 text-body font-semibold text-ink">Lista segmentada</h3>
        <ul className="m3-list-segmented max-w-md" aria-label="Exemplo de lista segmentada">
          {["Aço 1020", "Alumínio 6061", "PEEK", "Alumina"].map((name) => (
            <li key={name} aria-current={name === picked ? "true" : undefined}>
              <button
                type="button"
                className="m3-state w-full px-4 py-3 text-left text-body"
                onClick={() => setPicked(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
