"use client";

// Specimen text below is Portuguese on purpose: it is sample content for the
// style guide, the same deliberate exception the root CLAUDE.md grants
// `estilo/page.tsx` (M3Foundations sits beside it on the same terms).

import { useState } from "react";
import {
  Badge,
  Block,
  Button,
  DataQualityBadge,
  EmptyState,
  FilterBar,
  MenuItem,
  PageDoc,
  PropertyList,
  Section,
  SidePeek,
  Workbench,
  Input,
  useReorder,
  type FilterField,
} from "@/components/ui";
import { IconBook } from "@/components/ui/icons";

/**
 * D-206: the F1 pieces, live. The monograph's figures are captures of this
 * route, so each piece shows here in its real component, never a picture.
 */
export function F1Specimens() {
  return (
    <>
      <BlockSpecimen />
      <FilterSpecimen />
      <DocSpecimen />
      <EmptySpecimen />
      <PeekSpecimen />
      <WorkbenchSpecimen />
    </>
  );
}

function BlockSpecimen() {
  const [items, setItems] = useState(["Mapa de propriedades", "Tabela de resultados", "Notas do estudo"]);
  const [hidden, setHidden] = useState<string[]>([]);
  const { handleProps, itemProps } = useReorder({ items, onReorder: setItems, nameOf: (item) => item });
  return (
    <Section
      title="Blocos móveis"
      description="Alça ⋮⋮ no hover (sempre visível no toque), arrastar ou Alt + ↑/↓, ocultar sem apagar."
      headingLevel={2}
    >
      <div className="max-w-xl">
        {items.map((item, index) => (
          <Block
            key={item}
            name={item}
            handle={handleProps(index)}
            item={itemProps(index)}
            hidden={hidden.includes(item)}
            onToggleHidden={() =>
              setHidden((h) => (h.includes(item) ? h.filter((x) => x !== item) : [...h, item]))
            }
          >
            <span className="text-body text-ink">{item}</span>
          </Block>
        ))}
      </div>
    </Section>
  );
}

function FilterSpecimen() {
  const [values, setValues] = useState<Record<string, string | null>>({
    classe: "metais",
    qualidade: null,
    fonte: null,
  });
  const fields: FilterField[] = [
    {
      id: "classe",
      label: "Classe",
      pinned: true,
      value: values.classe ?? null,
      options: [
        { value: "metais", label: "Metais" },
        { value: "polimeros", label: "Polímeros" },
        { value: "ceramicas", label: "Cerâmicas" },
      ],
    },
    {
      id: "qualidade",
      label: "Qualidade",
      pinned: true,
      value: values.qualidade ?? null,
      options: [
        { value: "verificado", label: "Verificado" },
        { value: "estimado", label: "Estimado" },
      ],
    },
    {
      id: "fonte",
      label: "Fonte",
      value: values.fonte ?? null,
      options: [{ value: "demo", label: "Demonstração" }],
    },
  ];
  return (
    <Section
      title="Barra de filtros"
      description="Chips “Campo: valor ▾”, “+ Filtro” e Limpar. No celular, cada painel abre como folha inferior."
      headingLevel={2}
    >
      <FilterBar
        fields={fields}
        onChange={(id, value) => setValues((v) => ({ ...v, [id]: value }))}
        onClear={() => setValues({ classe: null, qualidade: null, fonte: null })}
      />
    </Section>
  );
}

function DocSpecimen() {
  const [title, setTitle] = useState("Aço AISI 1020 (exemplo)");
  return (
    <Section
      title="Página-documento e lista de propriedades"
      description="Ícone, título editável no lugar, propriedades alinhadas e as ações num ⋯."
      headingLevel={2}
    >
      <div className="msds-card p-5">
        <PageDoc
          icon={<IconBook className="h-5 w-5" />}
          title={title}
          onTitleChange={setTitle}
          primaryAction={
            <Button variant="tonal" size="sm">
              Comparar
            </Button>
          }
          menu={
            <>
              <MenuItem onSelect={() => {}}>Ver no mapa</MenuItem>
              <MenuItem onSelect={() => {}}>Exportar cartão CAE</MenuItem>
            </>
          }
          properties={
            <PropertyList
              items={[
                { label: "Classe", value: <Badge tone="neutral">Metais</Badge> },
                {
                  label: "Densidade",
                  value: "7,87 g/cm³",
                  aside: <DataQualityBadge state="MEDIDO" />,
                },
                {
                  label: "Módulo de Young",
                  value: "200 GPa",
                  hint: "a 20 °C",
                  aside: <DataQualityBadge state="ESTIMADO" />,
                },
              ]}
            />
          }
        />
      </div>
    </Section>
  );
}

function EmptySpecimen() {
  return (
    <Section
      title="Estado vazio com modelos"
      description="A tela vazia oferece pontos de partida; um modelo abre a tela já preparada, nunca um valor."
      headingLevel={2}
    >
      <div className="msds-card">
        <EmptyState
          layout="page"
          title="Nenhum estudo ainda"
          description="Um estudo guarda a função da peça, as restrições e o objetivo."
          action={<Button size="sm">Novo estudo</Button>}
          templates={[
            { label: "Viga leve e rígida", description: "Rigidez à flexão por massa", href: "/app/selecao?funcao=viga" },
            { label: "Painel barato", description: "Rigidez por custo", href: "/app/selecao?funcao=painel" },
          ]}
        />
      </div>
    </Section>
  );
}

function PeekSpecimen() {
  const [open, setOpen] = useState(false);
  return (
    <Section
      title="Abrir ao lado"
      description="Folha lateral modal: o registro ao lado da lista, com o caminho para a página inteira."
      headingLevel={2}
    >
      <div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Abrir “Moldagem por injeção” ao lado
        </Button>
      </div>
      <SidePeek
        open={open}
        title="Moldagem por injeção"
        onClose={() => setOpen(false)}
        openHref="/app/processos"
      >
        <PropertyList
          dense
          items={[
            { label: "Família", value: "Moldagem" },
            { label: "Espessura mínima", value: "0,4 mm" },
            { label: "Lote econômico", value: "10 000 peças" },
          ]}
        />
      </SidePeek>
    </Section>
  );
}

function WorkbenchSpecimen() {
  return (
    <Section
      title="Bancada de cálculo"
      description="Entradas de um lado, resultado do outro e “Como se calcula” recolhido. O número vem do servidor."
      headingLevel={2}
    >
      <Workbench
        inputs={
          <>
            <Input label="Comprimento (m)" defaultValue="1,2" />
            <Input label="Carga (N)" defaultValue="500" />
          </>
        }
        result={
          <div className="well flex flex-col gap-1 p-4">
            <span className="text-caption text-ink-muted">Massa mínima (exemplo)</span>
            <span className="text-title text-ink">1,84 kg</span>
          </div>
        }
        method={<p className="text-body text-ink-muted">m = (12 F L² / C δ)^½ · L · ρ / E^½</p>}
      />
    </Section>
  );
}
