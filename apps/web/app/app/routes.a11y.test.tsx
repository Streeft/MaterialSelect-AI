import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { Landing } from "@/components/marketing/Landing";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
// The load-case picker is an `md-outlined-select`: the real combobox lives in
// its shadow root, where the plain `screen` above cannot reach.
import { screen as shadowScreen } from "shadow-dom-testing-library";
import type {
  AIStatus,
  ApplicationArchetype,
  BatteryChemistry,
  ChartData,
  Comparison,
  CostResult,
  EcoAuditResult,
  DashboardOverview,
  MaterialClass,
  MaterialClassDetail,
  MaterialDetail,
  MaterialListItem,
  LoadCase,
  PerformanceIndex,
  Process,
  ProcessClass,
  ProcessClassDetail,
  ProcessDetail,
  PropertyDefinition,
  PropertyDistribution,
  PropertyMap,
  SolveResult,
  SynthesisKindInfo,
  SynthesisPreview,
  TransportMode,
  StudySummary,
} from "@/lib/types";

/**
 * Accessibility over the screens, not only over the primitives.
 *
 * A button can pass every axe rule and still land on a page where the table has
 * no name, the filter has no label and the figure is a wall of `<path>`. These
 * mount each main route with the API stubbed, so the check runs in `npm run
 * test` — the same gate the CI already blocks on — instead of in an audit
 * nobody repeats.
 *
 * Automated rules catch roughly a third of real barriers. The keyboard walk and
 * the contrast measurements are a checklist in docs/11-usabilidade.md §6; this
 * file is what keeps a regression from reaching a pull request unnoticed.
 */

// Plotly never renders here — which is exactly the situation of a reader who
// cannot see it. Whatever the assertions find is what that reader gets.
vi.mock("react-plotly.js", () => ({ default: () => null }));

// Several routes read their initial state from the query string, and a screen
// that never got past its empty state is not the screen worth auditing.
const nav = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  // `id` for the material datasheet, `slug` for the browse routes (P1-4). Both
  // at once because each page reads only its own key, and a `slug` of undefined
  // leaves those queries disabled — the page would stay on its loading state and
  // the audit would time out on a screen that never rendered.
  useParams: () => ({ id: "1", slug: "fundicao" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

const classes: MaterialClass[] = [
  {
    id: 1,
    name: "Metais",
    slug: "metais",
    parent_id: null,
    description: null,
    material_count: 2,
  },
  {
    id: 2,
    name: "Cerâmicas",
    slug: "ceramicas",
    parent_id: null,
    description: null,
    material_count: 1,
  },
];

const materials: MaterialListItem[] = [
  {
    id: 1,
    name: "Aço 1020",
    class_name: "Metais",
    class_slug: "metais",
    subclass: "Aço-carbono",
    is_demo: true,
    is_own_record: false,
    keywords: ["estrutural"],
    quality: { medido: 4, importado: 0, estimado: 1, missing: 0 },
  },
  {
    id: 2,
    name: "Alumina",
    class_name: "Cerâmicas",
    class_slug: "ceramicas",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 0, importado: 2, estimado: 0, missing: 3 },
  },
];

function property(
  slug: string,
  name: string,
  overrides: Partial<PropertyDefinition> = {},
): PropertyDefinition {
  return {
    display_unit: null,
    id: slug === "densidade" ? 1 : 2,
    name,
    slug,
    symbol: slug === "densidade" ? "ρ" : "E",
    description: null,
    category: slug === "densidade" ? "FISICA" : "MECANICA",
    physical_dimension: "densidade",
    canonical_unit: "kg/m**3",
    accepted_units: ["kg/m**3", "g/cm**3"],
    is_interval: false,
    better_direction: "LOWER",
    allows_log_scale: true,
    value_count: 2,
    ...overrides,
  };
}

const properties: PropertyDefinition[] = [
  property("densidade", "Densidade"),
  property("modulo_young", "Módulo de Young", {
    canonical_unit: "Pa",
    accepted_units: ["Pa", "GPa"],
    better_direction: "HIGHER",
    physical_dimension: "pressao",
  }),
];

const indices: PerformanceIndex[] = [
  {
    id: 1,
    name: "Viga leve limitada por rigidez",
    slug: "viga-leve-rigidez",
    expression: "modulo_young ** 0.5 / densidade",
    goal: "maximize",
    description: null,
    assumptions: { funcao: "Viga em flexão" },
    dimension: "Pa**0.5 * m**3 / kg",
    is_demo: true,
  },
];

const propertyMap: PropertyMap = {
  scale: "log",
  x_axis: {
    is_index: false,
    property_slug: "densidade",
    property_name: "Densidade",
    expression: null,
    symbol: "ρ",
    unit: "kg/m**3",
    category: "FISICA",
    better_direction: "LOWER",
    allows_log_scale: true,
    min_value: 2500,
    max_value: 7850,
  },
  y_axis: {
    is_index: false,
    property_slug: "modulo_young",
    property_name: "Módulo de Young",
    expression: null,
    symbol: "E",
    unit: "Pa",
    category: "MECANICA",
    better_direction: "HIGHER",
    allows_log_scale: true,
    min_value: 2e11,
    max_value: 3.7e11,
  },
  points: [
    {
      material_id: 1,
      material_name: "Aço 1020",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: true,
      x: 7850,
      y: 2e11,
      x_min: null,
      x_max: null,
      y_min: 1.9e11,
      y_max: 2.1e11,
      x_uncertainty: 50,
      y_uncertainty: null,
      x_is_interval: false,
      y_is_interval: true,
      x_quality: "MEDIDO",
      y_quality: "IMPORTADO",
      index_value: 5.7,
      index_undefined_reason: null,
    },
    {
      material_id: 2,
      material_name: "Alumina",
      class_name: "Cerâmicas",
      class_slug: "ceramicas",
      is_demo: true,
      x: 3900,
      y: 3.7e11,
      x_min: null,
      x_max: null,
      y_min: null,
      y_max: null,
      x_uncertainty: null,
      y_uncertainty: null,
      x_is_interval: false,
      y_is_interval: false,
      x_quality: "ESTIMADO",
      y_quality: "MEDIDO",
      // No index for this one, and the backend says why — the table has to
      // repeat the reason rather than leave the cell blank.
      index_value: null,
      index_undefined_reason: "Sem valor de módulo de Young",
    },
  ],
  envelopes: [],
  envelopes_alt: [],
  excluded: [
    {
      material_id: 3,
      name: "Liga experimental",
      reason: "Sem valor em ambos os eixos",
    },
  ],
  index: null,
  considered_count: 3,
  plotted_count: 2,
  notes: [],
};

const comparison: Comparison = {
  normalization: "minmax",
  properties: [
    {
      property_slug: "densidade",
      property_name: "Densidade",
      symbol: "ρ",
      unit: "kg/m**3",
      category: "FISICA",
      better_direction: "LOWER",
      allows_log_scale: true,
      min_value: 3900,
      max_value: 7850,
      present_count: 1,
      missing_material_ids: [2],
    },
  ],
  materials: [
    {
      material_id: 1,
      name: "Aço 1020",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: true,
      complete: true,
      cells: [
        {
          display_unit: null,
          display_value: null,
          display_min: null,
          display_max: null,
          display_uncertainty: null,
          property_slug: "densidade",
          is_missing: false,
          value: 7850,
          normalized: 0,
          value_min: null,
          value_max: null,
          original_value: 7.85,
          original_unit: "g/cm**3",
          conversion_method: "pint",
          uncertainty: null,
          data_quality: "MEDIDO",
          source_label: "ASM",
          measurement_condition: null,
          difference_pct: null,
          difference_state: "sem_referencia",
        },
      ],
    },
    {
      material_id: 2,
      name: "Alumina",
      class_name: "Cerâmicas",
      class_slug: "ceramicas",
      is_demo: true,
      complete: false,
      // Nothing recorded, so the figure has no bar to draw. Both the table view
      // and the figure's data table have to say that in words.
      cells: [
        {
          display_unit: null,
          display_value: null,
          display_min: null,
          display_max: null,
          display_uncertainty: null,
          property_slug: "densidade",
          is_missing: true,
          value: null,
          normalized: null,
          value_min: null,
          value_max: null,
          original_value: null,
          original_unit: null,
          conversion_method: null,
          uncertainty: null,
          data_quality: null,
          source_label: null,
          measurement_condition: null,
          difference_pct: null,
          difference_state: "sem_referencia",
        },
      ],
    },
  ],
  notes: [],
};

const chart: ChartData = {
  x_property_slug: "densidade",
  x_property_name: "Densidade",
  x_unit: "kg/m**3",
  y_property_slug: "modulo_young",
  y_property_name: "Módulo de Young",
  y_unit: "Pa",
  points: [
    {
      material_id: 1,
      material_name: "Aço 1020",
      class_name: "Metais",
      x: 7850,
      y: 2e11,
    },
    {
      material_id: 2,
      material_name: "Alumina",
      class_name: "Cerâmicas",
      x: 3900,
      y: 3.7e11,
    },
  ],
  excluded_material_ids: [3],
};

const materialDetail: MaterialDetail = {
  id: 1,
  name: "Aço 1020",
  class_id: 1,
  class_name: "Metais",
  class_slug: "metais",
  subclass: "Aço-carbono",
  description: "Aço de baixo carbono.",
  is_demo: true,
  is_own_record: false,
  is_active: true,
  keywords: ["estrutural"],
  // P0-2: the sheet always carries the join, empty or not.
  processes: [],
  property_groups: [
    {
      category: "FISICA",
      properties: [
        {
          display_unit: null,
          display_value: null,
          display_min: null,
          display_max: null,
          display_typical: null,
          display_uncertainty: null,
          property_slug: "densidade",
          property_name: "Densidade",
          symbol: "ρ",
          category: "FISICA",
          is_missing: false,
          is_interval: false,
          value_scalar: 7.85,
          value_min: null,
          value_max: null,
          value_typical: null,
          original_unit: "g/cm**3",
          normalized_value: 7850,
          canonical_unit: "kg/m**3",
          conversion_method: "pint",
          uncertainty: null,
          measurement_condition: null,
          notes: null,
          data_quality: "MEDIDO",
          source_label: "ASM",
        },
        {
          display_unit: null,
          display_value: null,
          display_min: null,
          display_max: null,
          display_typical: null,
          display_uncertainty: null,
          property_slug: "modulo_young",
          property_name: "Módulo de Young",
          symbol: "E",
          category: "MECANICA",
          // Nothing recorded: the sheet must say so, and axe must still find a
          // named, reachable control behind it.
          is_missing: true,
          is_interval: false,
          value_scalar: null,
          value_min: null,
          value_max: null,
          value_typical: null,
          original_unit: null,
          normalized_value: null,
          canonical_unit: "Pa",
          conversion_method: null,
          uncertainty: null,
          measurement_condition: null,
          notes: null,
          data_quality: "ESTIMADO",
          source_label: null,
        },
      ],
    },
  ],
};

const studies: StudySummary[] = [
  {
    id: 7,
    name: "Painel de fuselagem",
    description: null,
    created_at: "2026-03-14T10:00:00Z",
    constraint_count: 3,
    universe: "material",
    criterion_count: 1,
    stage_count: 1,
  },
];

// The panel is the screen with the most numbers per square centimetre, so the
// fixture keeps every state its components have to render differently: a class
// with full coverage and one with a gap, a `filled_pct` of `null` (which is
// absence, never `0`), and a property whose distribution has boxes.
const overview: DashboardOverview = {
  materials: 3,
  demo_materials: 3,
  classes: 2,
  properties: 2,
  coverage: {
    filled: 4,
    declared_missing: 1,
    not_recorded: 1,
    slots: 6,
    filled_pct: 66.7,
  },
  by_quality: [
    { bucket: "MEDIDO", count: 2, share_pct: 33.3 },
    { bucket: "IMPORTADO", count: 2, share_pct: 33.3 },
    { bucket: "AUSENTE", count: 1, share_pct: 16.7 },
    { bucket: "NAO_REGISTRADO", count: 1, share_pct: 16.7 },
  ],
  by_class: [
    {
      slug: "metais",
      name: "Metais",
      materials: 2,
      coverage: {
        filled: 4,
        declared_missing: 0,
        not_recorded: 0,
        slots: 4,
        filled_pct: 100,
      },
    },
    {
      slug: "ceramicas",
      name: "Cerâmicas",
      materials: 1,
      coverage: {
        filled: 0,
        declared_missing: 1,
        not_recorded: 1,
        slots: 2,
        filled_pct: null,
      },
    },
  ],
  by_property: [
    {
      slug: "modulo_young",
      name: "Módulo de Young",
      category: "MECANICA",
      canonical_unit: "Pa",
      coverage: {
        filled: 3,
        declared_missing: 0,
        not_recorded: 0,
        slots: 3,
        filled_pct: 100,
      },
    },
    {
      slug: "densidade",
      name: "Densidade",
      category: "FISICA",
      canonical_unit: "kg/m**3",
      coverage: {
        filled: 1,
        declared_missing: 1,
        not_recorded: 1,
        slots: 3,
        filled_pct: 33.3,
      },
    },
  ],
  gaps: [
    {
      slug: "densidade",
      name: "Densidade",
      category: "FISICA",
      canonical_unit: "kg/m**3",
      coverage: {
        filled: 1,
        declared_missing: 1,
        not_recorded: 1,
        slots: 3,
        filled_pct: 33.3,
      },
    },
  ],
};

const distribution: PropertyDistribution = {
  display_unit: null,
  property_slug: "densidade",
  property_name: "Densidade",
  category: "FISICA",
  canonical_unit: "kg/m**3",
  allows_log_scale: true,
  boxes: [
    {
      class_slug: "metais",
      class_name: "Metais",
      count: 2,
      minimum: 2700,
      q1: 3500,
      median: 4900,
      q3: 6800,
      maximum: 7850,
    },
  ],
  // A class the panel must *name* as having no data, rather than draw as zero.
  classes_without_data: ["Cerâmicas"],
};

// `enabled: true` on purpose. The selection screen embeds the AI panel, and a
// disabled layer collapses it to a single heading — the audit would then pass
// over a card that is not the one shipped to a user with the layer on.
const aiStatus: AIStatus = {
  enabled: true,
  provider: "mock",
  simulated: true,
  disclaimer: "Sugestões simuladas, sem chamada a modelo externo.",
};

// `ApiError` comes from the real module: the pages narrow on it with
// `instanceof`, and a look-alike declared here would silently never match.
// P1-4: the browse screens. Populated rather than empty, because an empty page
// is an empty state and not the screen worth auditing — the violations live in
// the trail, the badges and the provenance triggers a real folder renders.
const processClasses: ProcessClass[] = [
  {
    id: 1,
    name: "Conformação",
    slug: "conformacao",
    parent_id: null,
    description: null,
    process_count: 0,
  },
  {
    id: 2,
    name: "Conformação em estado líquido",
    slug: "conformacao-liquido",
    parent_id: 1,
    description: null,
    process_count: 1,
  },
];

const processes: Process[] = [
  {
    id: 10,
    name: "Fundição",
    slug: "fundicao",
    class_id: 2,
    class_name: "Conformação em estado líquido",
    class_slug: "conformacao-liquido",
    description: "Verte metal líquido num molde.",
    is_demo: true,
    material_count: 2,
  },
];

const processDetail: ProcessDetail = {
  ...(processes[0] as Process),
  attributes: [
    {
      display_unit: null,
      display_value: null,
      display_min: null,
      display_max: null,
      display_typical: null,
      display_uncertainty: null,
      attribute_id: 1,
      attribute_name: "Faixa de massa",
      attribute_slug: "faixa-massa",
      kind: "ENVELOPE",
      value_scalar: null,
      value_min: 0.2,
      value_max: 400,
      value_typical: 200.1,
      labels: [],
      original_unit: "kg",
      normalized_value: 200.1,
      normalized_min: 0.2,
      normalized_max: 400,
      canonical_unit: "kg",
      conversion_method: "identity:kg",
      uncertainty: null,
      measurement_condition: null,
      notes: null,
      source_label: "Dados demonstrativos",
      data_quality: "ESTIMADO",
      is_missing: false,
    },
    {
      display_unit: null,
      display_value: null,
      display_min: null,
      display_max: null,
      display_typical: null,
      display_uncertainty: null,
      attribute_id: 2,
      attribute_name: "Lote econômico",
      attribute_slug: "lote-economico",
      kind: "ESCALAR",
      value_scalar: null,
      value_min: null,
      value_max: null,
      value_typical: null,
      labels: [],
      original_unit: null,
      normalized_value: null,
      normalized_min: null,
      normalized_max: null,
      canonical_unit: null,
      conversion_method: null,
      uncertainty: null,
      measurement_condition: null,
      notes: null,
      source_label: null,
      data_quality: "ESTIMADO",
      is_missing: true,
    },
  ],
};

const processFamily: ProcessClassDetail = {
  ...(processClasses[0] as ProcessClass),
  applications: "Produção em série da forma primária.",
  // Null on purpose: the written-absence path is the one worth auditing.
  characteristics: null,
  ancestors: [],
  children: [processClasses[1] as ProcessClass],
  descendant_process_count: 1,
  processes: [],
};

const materialFamily: MaterialClassDetail = {
  ...(classes[0] as MaterialClass),
  applications: "Estruturas e componentes de máquina.",
  characteristics: "Condutores, dúcteis, módulo alto.",
  ancestors: [],
  children: [],
  descendant_material_count: 2,
};

// P2: um caso de carga e uma resposta de dimensionamento. O caso traz a
// derivação inteira porque é ela que a tela abre num <details> — auditar a
// tela sem ela auditaria metade.
const loadCases: LoadCase[] = [
  {
    key: "viga-rigidez",
    label: "Viga em flexão, rigidez especificada",
    summary: "Viga que não pode fletir mais do que o projeto admite.",
    function_label: "Viga em flexão, rigidez especificada",
    constraint_label: "Rigidez à flexão S especificada",
    objective_label: "Minimizar massa",
    free_variable_label: "Área da seção A",
    fixed_labels: ["Comprimento L", "Rigidez S"],
    derivation: [
      "Objetivo: m = A · L · ρ.",
      "Restrição: S = C · E · I / L³.",
      "Isolando a variável livre: A = √(12 · S · L³ / (C · E)).",
      "Minimizar a massa é maximizar √E/ρ.",
    ],
    reference: "Ashby, Material Selection in Mechanical Design",
    index_slug: "viga-leve-rigidez",
    index_name: "Viga leve limitada por rigidez",
    index_expression: "sqrt(modulo_young) / densidade",
    index_goal: "maximize",
    cost_index_slug: "viga-leve-rigidez-custo",
    cost_index_name: "Viga barata limitada por rigidez",
    cost_index_expression: "sqrt(modulo_young) / (densidade * custo_massa)",
    cost_objective_label: "Minimizar custo de material",
    objective_unit: "kg",
    free_unit: "m**2",
    variables: [
      {
        key: "comprimento",
        label: "Comprimento",
        unit: "m",
        help_text: "Vão livre.",
      },
      {
        key: "rigidez",
        label: "Rigidez exigida",
        unit: "N/m",
        help_text: "Força por deslocamento.",
      },
      {
        key: "constante_apoio",
        label: "Constante de apoio e carregamento",
        unit: "dimensionless",
        help_text: "Constante C da flecha.",
      },
    ],
    supports: [
      {
        key: "biapoiada-central",
        label: "Biapoiada, carga no meio do vão",
        variable_key: "constante_apoio",
        value: 48,
        note: null,
      },
    ],
  },
];

// P3: o Synthesizer. A prévia traz uma propriedade **sem** lei de propósito —
// a ausência com motivo escrito é metade do que esta tela mostra, e auditar só
// os valores deixaria essa metade sem auditoria.
const synthesisKinds: SynthesisKindInfo[] = [
  {
    kind: "composito",
    label: "Compósito de dois constituintes",
    note: "O módulo sai como par de limites porque depende da direção.",
    rules: {
      densidade: {
        key: "volume-linear",
        label: "Regra das misturas por volume",
        formula: "x = f·xA + (1 − f)·xB",
        basis: "exato",
        basis_label: "Exata",
      },
    },
    without_rule: { limite_escoamento: "Controlada pela interface." },
  },
  {
    kind: "espuma",
    label: "Espuma de um sólido",
    note: "As escalas de Gibson–Ashby são empíricas.",
    rules: {},
    without_rule: {},
  },
  {
    kind: "painel",
    label: "Painel sanduíche",
    note: "Um painel não é uma mistura, é um arranjo.",
    rules: {},
    without_rule: {},
  },
];

const synthesisPreview: SynthesisPreview = {
  kind: "composito",
  kind_label: "Compósito de dois constituintes",
  kind_note: "O módulo sai como par de limites porque depende da direção.",
  parents: ["Aço 1020", "Alumínio 6061"],
  parameters: { fracao_volumetrica: 0.6 },
  values: [
    {
      slug: "densidade",
      name: "Densidade",
      canonical_unit: "kg/m**3",
      value: 1560,
      value_min: null,
      value_max: null,
      rule: {
        key: "volume-linear",
        label: "Regra das misturas por volume",
        formula: "x = f·xA + (1 − f)·xB",
        basis: "exato",
        basis_label: "Exata",
      },
      quality: "ESTIMADO",
    },
  ],
  skipped: [
    {
      slug: "limite_escoamento",
      name: "Limite de escoamento",
      reason: "Resistência de compósito é controlada pela interface.",
    },
  ],
};

// P3: o Eco Audit. Uma fase sem carbono e um pódio recusado entram de propósito
// — é o estado que a tela desenha com rótulo escrito, e auditar só o caminho
// feliz deixaria essa metade sem auditoria.
const transportModes: TransportMode[] = [
  {
    slug: "maritimo",
    name: "Marítimo (navio de carga)",
    description: null,
    energy_intensity: 0.16,
    carbon_intensity: 0.012,
    is_demo: true,
  },
];

const ecoResult: EcoAuditResult = {
  material_id: 1,
  material_name: "Aço 1020",
  process_id: 1,
  process_name: "Fundição em areia",
  transport_mode: transportModes[0]!,
  transport_distance_km: 1500,
  mass_in_part: 2,
  mass_bought: 2.5,
  scrap_fraction: 0.2,
  recycled_fraction: 0,
  use_model: "movel",
  end_of_life: "reciclagem",
  phases: [
    {
      phase: "material",
      label: "Material",
      energy: 525,
      carbon: 31.25,
      detail: "massa comprada × primária",
      energy_missing: [],
      carbon_missing: [],
      energy_reason: null,
      carbon_reason: null,
    },
    {
      phase: "manufatura",
      label: "Manufatura",
      energy: 27.5,
      carbon: null,
      detail: "massa comprada × energia do processo por kg",
      energy_missing: [],
      carbon_missing: ["co2-processo"],
      energy_reason: null,
      carbon_reason: "Dados ausentes: co2-processo",
    },
    {
      phase: "transporte",
      label: "Transporte",
      energy: 2.7,
      carbon: 0.204,
      detail: "massa da peça (t) × distância (km) × intensidade do modal",
      energy_missing: [],
      carbon_missing: [],
      energy_reason: null,
      carbon_reason: null,
    },
    {
      phase: "uso",
      label: "Uso",
      energy: 1000,
      carbon: 70,
      detail: "massa da peça × distância × intensidade de uso",
      energy_missing: [],
      carbon_missing: [],
      energy_reason: null,
      carbon_reason: null,
    },
    {
      phase: "fim-de-vida",
      label: "Fim de vida",
      energy: 48,
      carbon: 3.2,
      detail: "massa da peça × energia de reciclagem por kg",
      energy_missing: [],
      carbon_missing: [],
      energy_reason: null,
      carbon_reason: null,
    },
  ],
  total_energy: 1603.2,
  total_carbon: null,
  energy_dominance: { phase: "uso", label: "Uso", share: 0.62, refusal: null },
  carbon_dominance: {
    phase: null,
    label: null,
    share: null,
    refusal:
      "Sem fase dominante em carbono: Manufatura não pôde ser calculada.",
  },
  energy_unit: "MJ",
  carbon_unit: "kg de CO₂",
  carbon_unit_note: "O carbono sai em kg de CO₂ por declaração.",
  recycling_credit_note:
    "Este documento não abate crédito de reciclagem do total.",
};

const costResult: CostResult = {
  material_id: 1,
  material_name: "Aço 1020",
  part_mass: 2,
  batch_size: 1000,
  write_off_years: 5,
  load_factor: 0.5,
  material_cost_per_mass: 8,
  monetary_unit_note: "Os valores estão em unidade monetária não especificada.",
  costed: [
    {
      process_id: 1,
      process_slug: "fundicao-areia",
      process_name: "Fundição em areia",
      class_name: "Conformação",
      rank: 1,
      terms: {
        material: 20,
        tooling: 12,
        overhead: 7.08,
        capital: 0.95,
        total: 40.03,
        batch_sensitive: 12,
      },
    },
  ],
  uncosted: [
    {
      process_id: 2,
      process_slug: "retificacao",
      process_name: "Retificação",
      missing_slugs: ["custo-ferramental"],
      missing_labels: ["Custo de ferramental dedicado"],
      reason: "Sem dado econômico: Custo de ferramental dedicado",
    },
  ],
};

const solveResult: SolveResult = {
  case: loadCases[0]!,
  inputs: { comprimento: 0.8, rigidez: 200000, constante_apoio: 48 },
  objective: "massa",
  objective_label: "Minimizar massa",
  index_slug: "viga-leve-rigidez",
  index_name: "Viga leve limitada por rigidez",
  index_expression: "sqrt(modulo_young) / densidade",
  structural_factor: 1234.5,
  free_structural_factor: 12.3,
  objective_unit: "kg",
  free_unit: "m**2",
  objective_dimension: "[mass]",
  free_dimension: "[length] ** 2",
  objective_note: null,
  solved: [
    {
      record_id: 1,
      name: "Alumínio 6061",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: false,
      is_own_record: false,
      rank: 1,
      index_value: 3070,
      objective_value: 0.402,
      free_value: 0.00018,
    },
  ],
  excluded: [
    {
      record_id: 2,
      name: "Polímero sem módulo",
      missing_slugs: ["modulo_young"],
      missing_labels: ["Módulo de Young"],
      reason: "Dados ausentes: modulo_young",
    },
  ],
};

// P4: o catálogo de químicas é dado semeado com fonte, e a auditoria monta a
// tela com ele — o painel de proveniência é parte do que axe precisa ver.
const batteryChemistries: BatteryChemistry[] = [
  {
    slug: "lfp",
    name: "LFP (fosfato de ferro-lítio)",
    formula: "LiFePO4",
    nominal_voltage: 3.2,
    specific_energy: 160,
    energy_density: 350,
    specific_power: 1500,
    cycle_efficiency: 0.95,
    cycle_life: 3500,
    cell_cost_per_kwh: 75,
    thermal_safety: "ALTA",
    thermal_runaway_temp_c: 270,
    operating_temp_min_c: -20,
    operating_temp_max_c: 60,
    max_continuous_c_rate: 3,
    peak_c_rate: 5,
    description: "Estabilidade térmica alta.",
    advantages: ["Vida em ciclos longa"],
    limitations: ["Energia específica menor"],
    typical_applications: ["Armazenamento estacionário"],
    citation: "Linden's Handbook of Batteries (4ª ed.)",
    source: "Literatura de baterias (compilação)",
  },
];

const batteryArchetypes: ApplicationArchetype[] = [
  {
    slug: "ve-urbano",
    name: "Veículo elétrico urbano",
    description: "Automóvel de passeio para ciclo misto.",
    target_voltage: 400,
    target_energy_kwh: 50,
    target_power_kw: 120,
    target_dod: 0.85,
    recommended_chemistries: ["lfp"],
    default_cell_capacity_ah: 100,
  },
];

vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  // P1-4: a ficha traz a estrela e anota a visita, então toda tela de registro
  // passa por estas quatro. O espaço vazio é o estado honesto aqui — a
  // auditoria é sobre a ficha, não sobre os marcadores.
  getMyRecords: () =>
    Promise.resolve({ favorites: [], recents: [], own_records: [] }),
  addFavorite: () =>
    Promise.resolve({ favorites: [], recents: [], own_records: [] }),
  removeFavorite: () =>
    Promise.resolve({ favorites: [], recents: [], own_records: [] }),
  touchRecent: () => Promise.resolve(undefined),
  getBillingStatus: () =>
    Promise.resolve({
      active: true,
      status: "active",
      current_period_end: null,
      access_mode: "subscription",
      has_access: true,
      can_edit_catalog: true,
    }),
  listMaterials: () => Promise.resolve(materials),
  listClasses: () => Promise.resolve(classes),
  listProcesses: () => Promise.resolve(processes),
  listProcessClasses: () => Promise.resolve(processClasses),
  getProcess: () => Promise.resolve(processDetail),
  getProcessClass: () => Promise.resolve(processFamily),
  getClass: () => Promise.resolve(materialFamily),
  listProcessAttributes: () => Promise.resolve([]),
  listProperties: () => Promise.resolve(properties),
  listPerformanceIndices: () => Promise.resolve(indices),
  listLoadCases: () => Promise.resolve(loadCases),
  estimatePartCost: () => Promise.resolve(costResult),
  listTransportModes: () => Promise.resolve(transportModes),
  listSynthesisKinds: () => Promise.resolve(synthesisKinds),
  previewSynthesis: () => Promise.resolve(synthesisPreview),
  createSynthesis: () =>
    Promise.resolve({
      ...synthesisPreview,
      material_id: 9,
      material_name: "Compósito",
    }),
  runEcoAudit: () => Promise.resolve(ecoResult),
  listBatteryChemistries: () => Promise.resolve(batteryChemistries),
  listBatteryArchetypes: () => Promise.resolve(batteryArchetypes),
  designBatteryPack: () => Promise.resolve(null),
  compareBatteries: () => Promise.resolve(null),
  getBatteryChemistry: () => Promise.resolve(batteryChemistries[0]),
  solveBrief: () => Promise.resolve(solveResult),
  getPropertyMap: () => Promise.resolve(propertyMap),
  getComparison: () => Promise.resolve(comparison),
  getMaterial: () => Promise.resolve(materialDetail),
  getChart: () => Promise.resolve(chart),
  listStudies: () => Promise.resolve(studies),
  getDashboardOverview: () => Promise.resolve(overview),
  getDashboardDistribution: () => Promise.resolve(distribution),
  deactivateMaterial: () => Promise.resolve(),
  // Saved charts endpoints (B7)
  listSavedCharts: () => Promise.resolve([]),
  getSavedChart: () => Promise.resolve(null),
  createSavedChart: () => Promise.resolve(null),
  deleteSavedChart: () => Promise.resolve(),
  // The selection wizard and the import wizard start empty and only reach these
  // on a user action; they exist so the module's shape is complete.
  getStudy: () => Promise.resolve(null),
  createStudy: () => Promise.resolve(studies[0]),
  deleteStudy: () => Promise.resolve(),
  evaluateIndex: () => Promise.resolve(null),
  runSelection: () => Promise.resolve(null),
  runStudy: () => Promise.resolve(null),
  getAIStatus: () => Promise.resolve(aiStatus),
  interpretStatement: () => Promise.resolve(null),
  explainStudy: () => Promise.resolve(null),
  listImports: () => Promise.resolve([]),
  listImportTemplates: () => Promise.resolve([]),
  createImportTemplate: () => Promise.resolve(null),
  uploadImportFile: () => Promise.resolve(null),
  previewImportSheet: () => Promise.resolve(null),
  validateImport: () => Promise.resolve(null),
  commitImport: () => Promise.resolve(null),
  cancelImport: () => Promise.resolve(null),
  rollbackImport: () => Promise.resolve(null),
  catalogueExportUrl: (format: string) => `#${format}`,
  studyExportUrl: (id: number, format: string) => `#${id}-${format}`,
  studyLaudoUrl: (id: number) => `#${id}-laudo`,
  opensInBrowser: (format: string) => format === "html",
  // The write side of the catalogue. No audit below mounts a form that calls
  // any of it, and it is here anyway: a Vitest mock fails on *property access*,
  // not on call, so an export left out does not fail where it is used — it
  // throws mid-render of whatever component merely imported it.
  createMaterial: () => Promise.resolve(materialDetail),
  updateMaterial: () => Promise.resolve(materialDetail),
  replaceMaterialValues: () => Promise.resolve(materialDetail),
  createClass: () => Promise.resolve(classes[0]),
  updateClass: () => Promise.resolve(classes[0]),
  deleteClass: () => Promise.resolve(),
  createProperty: () => Promise.resolve(properties[0]),
  updateProperty: () => Promise.resolve(properties[0]),
  deleteProperty: () => Promise.resolve(),
}));

// Imported after the mocks so each page picks them up.
const { default: HomePage } = await import("./page");
const { default: CatalogPage } = await import("./catalogo/page");
const { default: MapsPage } = await import("./mapas/page");
const { default: ComparePage } = await import("./comparar/page");
const { default: MaterialPage } = await import("./materiais/[id]/page");
const { default: StylePage } = await import("./estilo/page");
const { default: DashboardPage } = await import("./painel/page");
const { default: SelectionPage } = await import("./selecao/page");
const { default: ImportPage } = await import("./importar/page");
const { default: ProcessesPage } = await import("./processos/page");
const { default: ProcessDetailPage } = await import("./processos/[slug]/page");
const { default: ProcessFamilyPage } =
  await import("./processos/familia/[slug]/page");
const { default: MaterialFamilyPage } = await import("./catalogo/[slug]/page");
const { default: MyRecordsPage } = await import("./meus-registros/page");
const { default: SolverPage } = await import("./dimensionar/page");
const { default: CostPage } = await import("./custo/page");
const { default: EcoPage } = await import("./eco/page");
const { default: SynthesisPage } = await import("./sintetizar/page");
const { default: BatteryPage } = await import("./baterias/page");

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(node: ReactNode, client: QueryClient) {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

/**
 * Mount a route, wait for the marker that proves it finished loading — an axe
 * run over a spinner proves nothing — and report every violation at once.
 *
 * The marker is a heading rather than free text: a figure's title also appears
 * in the `<caption>` of the data table it now carries, so plain text matches
 * twice on exactly the screens this file exists to check.
 */
async function auditRoute(node: ReactNode, settled: RegExp | string) {
  const client = makeClient();
  const { container } = render(wrap(node, client));
  await screen.findByRole("heading", { name: settled });
  // The marker proves the screen rendered; it does not prove every request
  // behind it has landed. The import wizard keeps three in flight whose data
  // only reaches the DOM in a later step, so they were still resolving when the
  // test ended — React said so, and axe had audited a screen mid-settle.
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await expectClean(container);
}

async function expectClean(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toHaveLength(0);
}

describe("acessibilidade das telas principais", () => {
  beforeEach(() => {
    nav.query = "";
  });

  it("início", async () => {
    await auditRoute(<HomePage />, ptBR.home.methodTitle);
  });

  it("catálogo", async () => {
    await auditRoute(<CatalogPage />, ptBR.catalog.title);
  });

  it("mapas", async () => {
    // The figure heading carries its kind before its axes (the D-80 eyebrow).
    await auditRoute(<MapsPage />, new RegExp(`^${ptBR.map.figure}\\b.*×`));
  });

  it("comparador, na tabela e numa figura", async () => {
    // With no materials chosen the page is an empty state, which is not the
    // screen worth auditing.
    nav.query = "materiais=1,2";
    const user = userEvent.setup();
    const client = makeClient();
    const { container } = render(wrap(<ComparePage />, client));

    // Settle the query before looking for anything, the way `auditRoute` does.
    // This block was the one route audit that raced a promise with a DOM find
    // instead: the row appears only once the comparison resolves, so under a
    // loaded runner the default find timeout could expire while the screen was
    // still on "Comparando…" — which is exactly how it failed in CI on a
    // backend-only commit. Waiting on the query is deterministic; waiting on
    // the DOM to catch up is a race that a faster machine merely hides.
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await screen.findByRole("rowheader", { name: /Aço 1020/ });
    await expectClean(container);

    // And again in a chart mode, where what a reader gets is the data table.
    await user.click(screen.getByRole("tab", { name: ptBR.compare.viewBars }));
    await screen.findByRole("heading", { name: ptBR.compare.figure });
    await expectClean(container);
  });

  it("ficha do material", async () => {
    await auditRoute(<MaterialPage />, ptBR.detail.position);
  });

  it("sistema de design", async () => {
    await auditRoute(<StylePage />, ptBR.styleGuide.title);
  });

  // The three screens below were outside this file until the sweep that added
  // them, which is precisely why they are here: the panel is the densest page
  // in the product, and the selection and import wizards are the two longest
  // keyboard paths a reader has to walk.
  it("painel", async () => {
    await auditRoute(<DashboardPage />, ptBR.dashboard.title);
  });

  it("seleção", async () => {
    await auditRoute(<SelectionPage />, ptBR.selection.title);
  });

  it("importação", async () => {
    await auditRoute(<ImportPage />, ptBR.importer.title);
  });

  // P1-4: the browse screens. The datasheet is where a provenance trigger sits
  // next to a written absence, and the family page is where the trail lives —
  // both are patterns the rest of the product reuses.
  it("processos", async () => {
    await auditRoute(<ProcessesPage />, ptBR.processes.title);
  });

  it("ficha do processo", async () => {
    // O marcador é o `h1` da página — o nome do processo —, não um parágrafo:
    // `auditRoute` espera um heading, e esperar por texto solto auditaria a
    // tela antes de ela ter terminado de chegar.
    await auditRoute(<ProcessDetailPage />, "Fundição");
  });

  it("família de processo", async () => {
    await auditRoute(<ProcessFamilyPage />, "Conformação");
  });

  it("família de material", async () => {
    await auditRoute(<MaterialFamilyPage />, "Metais");
  });

  // P1-4: o espaço do usuário. Auditado com as três listas **vazias**, que é o
  // caminho que a D-24 governa: ausência escrita, nunca painel em branco — e é
  // justamente o estado que um teste de conteúdo tenderia a pular.
  it("meus registros", async () => {
    await auditRoute(<MyRecordsPage />, ptBR.myRecords.title);
  });

  // P2: sem caso escolhido a tela é um <select> e nada mais — auditá-la ali
  // não tocaria no formulário de projeto, na derivação nem na tabela, que é
  // onde moram os rótulos. O caso não vem pré-escolhido de propósito (escolher
  // por alguém qual é o problema seria o oposto do que o Finder serve), então
  // o teste escolhe, como um leitor escolheria.
  it("dimensionar, com o caso escolhido e o formulário montado", async () => {
    const client = makeClient();
    const { container } = render(wrap(<SolverPage />, client));
    await screen.findByRole("heading", { name: ptBR.solver.title });
    await waitFor(() => expect(client.isFetching()).toBe(0));

    await userEvent.selectOptions(
      await shadowScreen.findByShadowRole("combobox", {
        name: ptBR.solver.caseLabel,
      }),
      "viga-rigidez",
    );
    await screen.findByRole("heading", { name: ptBR.solver.inputsStep });
    await expectClean(container);
  });

  // P3: o formulário já monta sem interação (o material vem do catálogo), e é
  // com ele na tela que a auditoria vale.
  it("custo da peça", async () => {
    await auditRoute(<CostPage />, ptBR.cost.briefStep);
  });

  // P3: mesma razão — o formulário monta sozinho, e a auditoria vale com ele na
  // tela. O resultado tem uma fase sem carbono, então o rótulo escrito que
  // substitui a célula vazia entra na varredura.
  it("auditoria ambiental", async () => {
    await auditRoute(<EcoPage />, ptBR.eco.briefStep);
  });

  // P3: a tela monta com o primeiro tipo escolhido e o aviso do princípio 1 na
  // frente; é com ela assim que a auditoria vale.
  it("sintetizar material", async () => {
    await auditRoute(<SynthesisPage />, ptBR.synthesis.kindStep);
  });

  // P4: a tela monta com os requisitos preenchidos e o arquétipo escolhido, e
  // é assim que vale auditar — os três fatores de empacotamento, o seletor de
  // química e a tabela comparativa só existem com o formulário montado.
  it("dimensionar bateria", async () => {
    await auditRoute(<BatteryPage />, ptBR.battery.title);
  });

  // Landing is the one route in this file that isn't under `/app`: no session,
  // no query client, no API stubbing, because the vitrine has none of that —
  // it's a plain server component (see its own top-of-file comment).
  it("vitrine pública (/)", async () => {
    const { container } = render(<Landing />);
    await screen.findByRole("heading", { level: 1 });
    await expectClean(container);
  });
});
