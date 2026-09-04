import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { Landing } from "@/components/marketing/Landing";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type {
  AIStatus,
  ChartData,
  Comparison,
  DashboardOverview,
  MaterialClass,
  MaterialDetail,
  MaterialListItem,
  PerformanceIndex,
  PropertyDefinition,
  PropertyDistribution,
  PropertyMap,
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
  useParams: () => ({ id: "1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

const classes: MaterialClass[] = [
  { id: 1, name: "Metais", slug: "metais", parent_id: null, description: null, material_count: 2 },
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
  excluded: [{ material_id: 3, name: "Liga experimental", reason: "Sem valor em ambos os eixos" }],
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
    { material_id: 1, material_name: "Aço 1020", class_name: "Metais", x: 7850, y: 2e11 },
    { material_id: 2, material_name: "Alumina", class_name: "Cerâmicas", x: 3900, y: 3.7e11 },
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
  is_active: true,
  keywords: ["estrutural"],
  property_groups: [
    {
      category: "FISICA",
      properties: [
        {
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
    criterion_count: 1,
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
  coverage: { filled: 4, declared_missing: 1, not_recorded: 1, slots: 6, filled_pct: 66.7 },
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
      coverage: { filled: 4, declared_missing: 0, not_recorded: 0, slots: 4, filled_pct: 100 },
    },
    {
      slug: "ceramicas",
      name: "Cerâmicas",
      materials: 1,
      coverage: { filled: 0, declared_missing: 1, not_recorded: 1, slots: 2, filled_pct: null },
    },
  ],
  by_property: [
    {
      slug: "modulo_young",
      name: "Módulo de Young",
      category: "MECANICA",
      canonical_unit: "Pa",
      coverage: { filled: 3, declared_missing: 0, not_recorded: 0, slots: 3, filled_pct: 100 },
    },
    {
      slug: "densidade",
      name: "Densidade",
      category: "FISICA",
      canonical_unit: "kg/m**3",
      coverage: { filled: 1, declared_missing: 1, not_recorded: 1, slots: 3, filled_pct: 33.3 },
    },
  ],
  gaps: [
    {
      slug: "densidade",
      name: "Densidade",
      category: "FISICA",
      canonical_unit: "kg/m**3",
      coverage: { filled: 1, declared_missing: 1, not_recorded: 1, slots: 3, filled_pct: 33.3 },
    },
  ],
};

const distribution: PropertyDistribution = {
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
vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  listMaterials: () => Promise.resolve(materials),
  listClasses: () => Promise.resolve(classes),
  listProperties: () => Promise.resolve(properties),
  listPerformanceIndices: () => Promise.resolve(indices),
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
    await auditRoute(<MapsPage />, ptBR.map.figure);
  });

  it("comparador, na tabela e numa figura", async () => {
    // With no materials chosen the page is an empty state, which is not the
    // screen worth auditing.
    nav.query = "materiais=1,2";
    const user = userEvent.setup();
    const { container } = render(wrap(<ComparePage />, makeClient()));

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

  // Landing is the one route in this file that isn't under `/app`: no session,
  // no query client, no API stubbing, because the vitrine has none of that —
  // it's a plain server component (see its own top-of-file comment).
  it("vitrine pública (/)", async () => {
    const { container } = render(<Landing />);
    await screen.findByRole("heading", { level: 1 });
    await expectClean(container);
  });
});
