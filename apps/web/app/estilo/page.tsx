"use client";

import { useState } from "react";
import { ptBR } from "@/lib/i18n";
import { paletteSeats } from "@/lib/design/palette";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  ClassBadge,
  DataQualityBadge,
  DataQualityLegend,
  Dialog,
  Disclosure,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  MissingValue,
  NumberInput,
  ProvenancePopover,
  RadioGroup,
  RadioOption,
  Section,
  Select,
  Skeleton,
  Stepper,
  TBody,
  THead,
  Table,
  TableScroll,
  Tabs,
  Td,
  Textarea,
  Th,
  RowHeader,
  ThemeToggle,
  Tr,
  type Provenance,
} from "@/components/ui";
import { IconDownload, IconGrid, IconPlus, IconTable, IconTrash } from "@/components/ui/icons";

/**
 * Living documentation for the design system.
 *
 * Deliberately not linked from the main navigation: it is for whoever continues
 * this work, and for the monograph — the figures showing the interface language
 * are screenshots of this page, so they cannot go stale relative to the code.
 */

const SURFACES = [
  ["surface", "bg-surface"],
  ["surface-raised", "bg-surface-raised"],
  ["surface-sunken", "bg-surface-sunken"],
  ["edge", "bg-edge"],
  ["edge-strong", "bg-edge-strong"],
  ["ink", "bg-ink"],
  ["ink-muted", "bg-ink-muted"],
  ["ink-subtle", "bg-ink-subtle"],
] as const;

const BRAND = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const BRAND_CLASS: Record<(typeof BRAND)[number], string> = {
  50: "bg-brand-50",
  100: "bg-brand-100",
  200: "bg-brand-200",
  300: "bg-brand-300",
  400: "bg-brand-400",
  500: "bg-brand-500",
  600: "bg-brand-600",
  700: "bg-brand-700",
  800: "bg-brand-800",
  900: "bg-brand-900",
  950: "bg-brand-950",
};

const SEMANTIC = [
  ["success", "bg-success", "bg-success-soft text-success-fg"],
  ["warning", "bg-warning", "bg-warning-soft text-warning-fg"],
  ["danger", "bg-danger", "bg-danger-soft text-danger-fg"],
  ["info", "bg-info", "bg-info-soft text-info-fg"],
] as const;

const CLASS_NAMES = ["Metais", "Polímeros", "Cerâmicas", "Compósitos", "Elastômeros"];

const SAMPLE: Provenance = {
  quality: "IMPORTADO",
  isMissing: false,
  originalValue: 3.9,
  originalUnit: "g/cm**3",
  normalizedValue: 3900,
  canonicalUnit: "kg/m**3",
  conversionMethod: "pint:g/cm**3->kg/m**3",
  uncertainty: 0.05,
  valueMin: null,
  valueMax: null,
  valueTypical: null,
  measurementCondition: "23 °C",
  sourceLabel: "Ashby, Material Selection in Mechanical Design",
  notes: null,
};

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-8 w-8 shrink-0 rounded border border-edge ${className}`} />
      <code className="font-mono text-2xs text-ink-muted">{name}</code>
    </div>
  );
}

/** Marker shapes, drawn the way Plotly draws them, so the legend can be checked. */
function Marker({ symbol, color }: { symbol: string; color: string }) {
  const common = { fill: color, stroke: "rgb(0 0 0 / 0.25)", strokeWidth: 1 };
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
      {symbol === "circle" && <circle cx="10" cy="10" r="7" {...common} />}
      {symbol === "square" && <rect x="3" y="3" width="14" height="14" {...common} />}
      {symbol === "diamond" && <polygon points="10,2 18,10 10,18 2,10" {...common} />}
      {symbol === "triangle-up" && <polygon points="10,2 18,17 2,17" {...common} />}
      {symbol === "x" && (
        <path d="M4 4l12 12M16 4L4 16" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      )}
      {symbol === "star" && (
        <polygon points="10,1 12.4,7.2 19,7.6 13.9,11.8 15.6,18.2 10,14.6 4.4,18.2 6.1,11.8 1,7.6 7.6,7.2" {...common} />
      )}
      {symbol === "hexagon" && (
        <polygon points="10,2 17,6 17,14 10,18 3,14 3,6" {...common} />
      )}
    </svg>
  );
}

export default function StyleGuidePage() {
  const [tab, setTab] = useState("tabela");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"table" | "cards">("table");
  const [step, setStep] = useState("restricoes");
  const seats = paletteSeats();

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{ptBR.styleGuide.title}</h1>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">{ptBR.styleGuide.subtitle}</p>
        </div>
        <ThemeToggle />
      </header>

      <Section title={ptBR.styleGuide.surfaces} headingLevel={2}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACES.map(([name, cls]) => (
            <Swatch key={name} name={name} className={cls} />
          ))}
        </div>
      </Section>

      <Section
        title={ptBR.styleGuide.tokens}
        description="A rampa é invertida no tema escuro, não recolorida: `bg-brand-50 text-brand-700` continua significando “tom mais fraco, tinta segura” nos dois temas."
        headingLevel={2}
      >
        <div className="flex flex-wrap gap-2">
          {BRAND.map((shade) => (
            <div key={shade} className="flex flex-col items-center gap-1">
              <span
                className={`h-10 w-10 rounded border border-edge ${BRAND_CLASS[shade]}`}
              />
              <code className="font-mono text-2xs text-ink-subtle">{shade}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title={ptBR.styleGuide.semantics} headingLevel={2}>
        <div className="grid gap-3 sm:grid-cols-2">
          {SEMANTIC.map(([name, solid, soft]) => (
            <div key={name} className="flex items-center gap-3">
              <span className={`h-8 w-8 shrink-0 rounded ${solid}`} />
              <span className={`rounded-control px-2 py-1 text-xs ${soft}`}>
                {name} · texto sobre o fundo suave
              </span>
            </div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Alert tone="info" title="Informação">
            Um aviso permanente, não descartável.
          </Alert>
          <Alert tone="warning" title={ptBR.limitation.title}>
            {ptBR.limitation.full}
          </Alert>
        </div>
      </Section>

      <Section
        title={ptBR.styleGuide.qualityScale}
        description="Rótulo, glifo e cor — nessa ordem de confiabilidade. A cor é o primeiro canal que um leitor perde."
        headingLevel={2}
      >
        <div className="flex flex-wrap items-center gap-2">
          <DataQualityBadge state="MEDIDO" />
          <DataQualityBadge state="IMPORTADO" />
          <DataQualityBadge state="ESTIMADO" />
          <MissingValue />
        </div>
        <Card>
          <CardBody>
            <DataQualityLegend />
          </CardBody>
        </Card>
        <p className="text-sm text-ink-muted">
          Valor com proveniência:{" "}
          <ProvenancePopover provenance={SAMPLE}>
            <span className="tabular-nums font-medium">3,9 g/cm³</span>
          </ProvenancePopover>
        </p>
      </Section>

      <Section
        title={ptBR.styleGuide.classPalette}
        description={ptBR.styleGuide.classPaletteHint}
        headingLevel={2}
      >
        <div className="flex flex-wrap gap-4">
          {seats.map((seat, i) => (
            <div key={seat.color} className="flex flex-col items-center gap-1">
              <Marker symbol={seat.symbol} color={seat.color} />
              <ClassBadge name={CLASS_NAMES[i] ?? `Classe ${i + 1}`} color={seat.color} />
              <code className="font-mono text-2xs text-ink-subtle">{seat.color}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title={ptBR.styleGuide.typography} headingLevel={2}>
        <div className="space-y-1">
          <p className="text-2xl font-semibold text-ink">Seleção de materiais</p>
          <p className="text-lg font-semibold text-ink">Índice de desempenho e ranking</p>
          <p className="text-sm text-ink">Corpo de texto, tamanho padrão da interface.</p>
          <p className="text-sm text-ink-muted">Texto secundário.</p>
          <p className="text-2xs text-ink-subtle">Linha de proveniência e legendas.</p>
          <p className="font-mono text-sm text-ink">sqrt(modulo_young) / densidade</p>
          <p className="tabular-nums text-sm text-ink">
            1,0 · 10,5 · 100,25 · 1000,5 — alinham em coluna
          </p>
        </div>
      </Section>

      <Section title={ptBR.styleGuide.buttons} headingLevel={2}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Executar seleção</Button>
          <Button variant="secondary">Salvar estudo</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger" icon={<IconTrash />}>
            Excluir
          </Button>
          <Button variant="link">Ver no mapa</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={<IconPlus />}>
            Adicionar restrição
          </Button>
          <Button size="sm" variant="secondary" icon={<IconDownload />}>
            Exportar
          </Button>
          <Button variant="primary" loading>
            Executando
          </Button>
          <Button variant="primary" disabled>
            Indisponível
          </Button>
        </div>
        <ButtonGroup label="Visualização">
          <ButtonGroupItem selected={view === "table"} onClick={() => setView("table")}>
            <IconTable className="h-3.5 w-3.5" />
            Tabela
          </ButtonGroupItem>
          <ButtonGroupItem selected={view === "cards"} onClick={() => setView("cards")}>
            <IconGrid className="h-3.5 w-3.5" />
            Cartões
          </ButtonGroupItem>
        </ButtonGroup>
        <div className="flex flex-wrap gap-2">
          <Badge>neutro</Badge>
          <Badge tone="brand">marca</Badge>
          <Badge tone="success">válido</Badge>
          <Badge tone="warning">atenção</Badge>
          <Badge tone="danger">erro</Badge>
          <Badge tone="info">informação</Badge>
        </div>
      </Section>

      {/* The specimen strings below are written inline on purpose, and are the
          one place in the application where Portuguese sits outside lib/i18n.ts.
          They are not product copy: they are the content a primitive is shown
          holding, the way a type specimen needs words to be a specimen at all.
          Routing them through the dictionary would fill it with labels no user
          ever reads and would hide, from whoever reviews this page, that the
          screens themselves take every string from there. */}
      <Section title={ptBR.styleGuide.forms} headingLevel={2}>
        <Card>
          <CardHeader title="Novo critério" description="Todos os campos são rotulados" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do estudo" hint="Aparece na lista de estudos salvos" required>
              <Input placeholder="Viga leve para bicicleta" />
            </Field>
            <Field label="Peso" hint="Renormalizado para somar 1">
              <NumberInput defaultValue={0.5} />
            </Field>
            <Field label="Propriedade">
              <Select defaultValue="densidade">
                <option value="densidade">Densidade</option>
                <option value="modulo_young">Módulo de Young</option>
              </Select>
            </Field>
            <Field label="Valor" error="Informe um número." required>
              <Input defaultValue="abc" />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <Textarea placeholder="Contexto do estudo…" />
            </Field>
            <RadioGroup legend="Objetivo" className="sm:col-span-2">
              <RadioOption name="demo-goal" label="Maximizar" defaultChecked />
              <RadioOption name="demo-goal" label="Minimizar" />
            </RadioGroup>
            <Checkbox
              label="Incluir materiais demonstrativos"
              hint="Valores fictícios, marcados na interface"
              className="sm:col-span-2"
            />
          </CardBody>
          <CardFooter>
            <Button variant="ghost">Cancelar</Button>
            <Button variant="primary">Salvar</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Etapas e abas" headingLevel={2}>
        <Stepper
          label="Etapas do estudo"
          current={step}
          onSelect={setStep}
          steps={[
            { id: "funcao", label: "1. Função" },
            { id: "restricoes", label: "2. Restrições" },
            { id: "objetivo", label: "3. Objetivo" },
            {
              id: "resultados",
              label: "4. Resultados",
              blockedReason: "Execute a seleção para liberar.",
            },
          ]}
          statusOf={(s) => {
            if (s.id === step) return "current";
            if (s.id === "resultados") return "blocked";
            return s.id === "funcao" ? "done" : "upcoming";
          }}
        />
        <Tabs
          label="Visualização da comparação"
          value={tab}
          onChange={setTab}
          items={[
            { id: "tabela", label: "Tabela" },
            { id: "barras", label: "Barras" },
            { id: "radar", label: "Radar", meta: "3+" },
          ]}
          panelClassName="pt-3 text-sm text-ink-muted"
        >
          Conteúdo da aba <strong className="font-medium text-ink">{tab}</strong>. O painel é
          filho do próprio componente: assim o <code className="font-mono">aria-controls</code> da
          aba não tem como apontar para um elemento que não existe.
        </Tabs>
      </Section>

      <Section title={ptBR.styleGuide.tables} headingLevel={2}>
        <TableScroll label="Exemplo de ranking">
          <Table>
            <THead>
              <Tr>
                <Th>Material</Th>
                <Th>Classe</Th>
                <Th numeric>Densidade</Th>
                <Th numeric>Pontuação</Th>
                <Th>Qualidade</Th>
              </Tr>
            </THead>
            <TBody>
              <Tr>
                <RowHeader>Liga Alumínio Demo A</RowHeader>
                <Td>
                  <ClassBadge name="Metais" color={seats[0]?.color ?? "#0072B2"} />
                </Td>
                <Td numeric>2.700</Td>
                <Td numeric>0,84</Td>
                <Td>
                  <DataQualityBadge state="MEDIDO" />
                </Td>
              </Tr>
              <Tr>
                <RowHeader>Compósito Demo E</RowHeader>
                <Td>
                  <ClassBadge name="Compósitos" color={seats[3]?.color ?? "#CC79A7"} />
                </Td>
                <Td numeric>1.550</Td>
                <Td numeric>0,71</Td>
                <Td>
                  <DataQualityBadge state="ESTIMADO" />
                </Td>
              </Tr>
              <Tr>
                <RowHeader>Cerâmica Demo D</RowHeader>
                <Td>
                  <ClassBadge name="Cerâmicas" color={seats[2]?.color ?? "#009E73"} />
                </Td>
                <Td numeric>3.900</Td>
                <Td numeric>
                  <MissingValue />
                </Td>
                <Td>
                  <DataQualityBadge state="AUSENTE" />
                </Td>
              </Tr>
            </TBody>
          </Table>
        </TableScroll>
      </Section>

      <Section title={ptBR.styleGuide.feedback} headingLevel={2}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardBody>
              <LoadingState />
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardBody>
          </Card>
          <ErrorState description="O servidor não respondeu." onRetry={() => {}} />
          <EmptyState
            title="Nenhum candidato após as restrições."
            description="Afrouxe um limiar ou remova uma restrição para ver candidatos."
            action={<Button variant="secondary">Rever restrições</Button>}
          />
          <Card>
            <CardBody className="space-y-2">
              <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                Abrir diálogo
              </Button>
              <Disclosure summary="Materiais fora do mapa (3)">
                <p className="text-sm text-ink-muted">
                  Nenhum material é descartado em silêncio.
                </p>
              </Disclosure>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Excluir estudo salvo"
        description="Esta ação não pode ser desfeita."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          O foco entra no diálogo, não sai dele enquanto está aberto e volta ao botão que o abriu.
        </p>
      </Dialog>
    </div>
  );
}
