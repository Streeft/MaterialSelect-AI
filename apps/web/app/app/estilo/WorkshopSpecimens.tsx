"use client";

// Sample text in this file is specimen copy (see the note in `estilo/page.tsx`),
// not product copy, which is why it is written here and not in `lib/i18n.ts`.

import { useState } from "react";
import type { MaterialListItem } from "@/lib/types";
import { Drawer, Envelope } from "@/components/workshop/FileCabinet";
import { WORKSHOP_ICONS } from "@/components/layout/workshopIcons";
import { setAmbience, useAmbience, AMBIENCES } from "@/lib/ambience";
import { ButtonGroup, ButtonGroupItem, TBody, THead, Table, TableScroll, Td, Th, Tr } from "@/components/ui";

const OBJECTS: Record<string, string> = {
  "/app/selecao": "Seleção: bancada",
  "/app/mapas": "Mapas: prancheta",
  "/app/dimensionar": "Dimensionar: esquadro",
  "/app/custo": "Custo: calculadora",
  "/app/catalogo": "Catálogo: gaveta",
  "/app/processos": "Processos: caixa de ferramentas",
};

function specimen(id: number, name: string, subclass: string): MaterialListItem {
  return {
    id,
    name,
    class_name: "Espécime",
    class_slug: "especime",
    subclass,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 4, importado: 2, estimado: 1, missing: 3 },
    designations: [],
  };
}

const ENVELOPES = [specimen(1, "Material de exemplo A", "Subfamília um"), specimen(2, "Material de exemplo B", "Subfamília dois")];

/**
 * D-256: the pieces of the "Oficina" ambience. The switch here is the same one Aparência has, so
 * the surfaces can be seen in both ambiences without leaving the page; the drawer, the envelope
 * and the objects are drawn the same in either.
 */
export function WorkshopSpecimens() {
  const ambience = useAmbience();
  const [open, setOpen] = useState<string | null>("um");
  return (
    <div className="flex flex-col gap-6">
      <ButtonGroup label="Ambiente">
        {AMBIENCES.map((option) => (
          <ButtonGroupItem
            key={option}
            label={option === "oficina" ? "Oficina" : "Engenharia"}
            selected={ambience === option}
            onClick={() => setAmbience(option)}
          />
        ))}
      </ButtonGroup>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-page p-4 text-support text-ink-muted">
          Bancada: a página. Madeira no ambiente Oficina, com veio que só se afasta do texto.
        </div>
        <div className="rounded-card border border-line bg-panel p-4 text-support text-ink-muted">
          Papel: o painel. Sempre chapado, porque é onde se lê.
        </div>
        <div className="well text-support text-ink-muted">Poço: papel milimetrado no ambiente Oficina.</div>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-3">
        {Object.entries(WORKSHOP_ICONS).map(([href, Icon]) => (
          <li key={href} className="flex items-center gap-2 text-support text-ink">
            <Icon className="h-5 w-5" />
            {OBJECTS[href]}
          </li>
        ))}
      </ul>

      <div className="oficina-cabinet">
        <Drawer
          name="Família de exemplo"
          count="2 materiais"
          open={open === "um"}
          onToggle={() => setOpen(open === "um" ? null : "um")}
        >
          <ul aria-label="Materiais de exemplo" className="grid gap-3 sm:grid-cols-2">
            {ENVELOPES.map((material) => (
              <Envelope key={material.id} material={material} />
            ))}
          </ul>
        </Drawer>
        <Drawer
          name="Outra família"
          count="0 materiais"
          open={open === "dois"}
          onToggle={() => setOpen(open === "dois" ? null : "dois")}
        >
          <p className="text-support text-ink-muted">Gaveta vazia.</p>
        </Drawer>
      </div>

      <TableScroll label="Tabela de exemplo">
        <Table>
          <THead>
            <Tr>
              <Th>Registro</Th>
              <Th>Situação</Th>
            </Tr>
          </THead>
          <TBody>
            <Tr>
              <Td>Linha um</Td>
              <Td>No ambiente Oficina o cabeçalho perde a faixa e ganha uma régua.</Td>
            </Tr>
            <Tr>
              <Td>Linha dois</Td>
              <Td>As linhas e os valores são os mesmos.</Td>
            </Tr>
          </TBody>
        </Table>
      </TableScroll>
    </div>
  );
}
