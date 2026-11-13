import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSyncExternalStore, type ReactNode } from "react";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { suggestText } from "@/lib/i18n-suggest";
import type {
  SuggestionsOut,
  DashboardActivity,
  DashboardComposition,
  DashboardCorrelation,
  DashboardOverview,
  DashboardProcesses,
  DashboardPropertyStats,
  DashboardSources,
  DashboardTop,
  PropertyDistribution,
} from "@/lib/types";

const t = ptBR.dashboard;

// Plotly pulls WebGL and canvas into a runtime jsdom has neither of, and
// nothing it draws is under test here — the numbers behind it are, via the
// data table every figure carries (D-31).
vi.mock("react-plotly.js", () => ({ default: () => null }));

// PageHeader reads its section from the current route (Task 1) — the mock
// needs a real pathname so `sectionForPath` doesn't crash on `null`. The
// panel keeps its tab and filters in the URL (D-193), so the mock is a tiny
// store: `router.replace` changes the search and re-renders its readers.
const nav = vi.hoisted(() => ({
  search: new URLSearchParams(),
  listeners: new Set<() => void>(),
  push: (() => undefined) as (url: string) => void,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/painel",
  useSearchParams: () =>
    useSyncExternalStore(
      (listener: () => void) => {
        nav.listeners.add(listener);
        return () => nav.listeners.delete(listener);
      },
      () => nav.search,
    ),
  useRouter: () => ({
    replace: (url: string) => {
      nav.search = new URLSearchParams(url.split("?")[1] ?? "");
      nav.listeners.forEach((listener) => listener());
    },
    push: (url: string) => nav.push(url),
  }),
}));

function at(search: string) {
  nav.search = new URLSearchParams(search);
}

const overview: DashboardOverview = {
  materials: 5,
  demo_materials: 5,
  classes: 2,
  properties: 2,
  coverage: { filled: 6, declared_missing: 1, not_recorded: 3, slots: 10, filled_pct: 60 },
  by_quality: [
    { bucket: "MEDIDO", count: 4, share_pct: 40 },
    { bucket: "IMPORTADO", count: 1, share_pct: 10 },
    { bucket: "ESTIMADO", count: 1, share_pct: 10 },
    { bucket: "AUSENTE", count: 1, share_pct: 10 },
    { bucket: "NAO_REGISTRADO", count: 3, share_pct: 30 },
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
      coverage: { filled: 2, declared_missing: 1, not_recorded: 3, slots: 6, filled_pct: 33.3 },
    },
  ],
  by_property: [
    {
      slug: "densidade",
      name: "Densidade",
      category: "FISICA",
      canonical_unit: "kg/m**3",
      coverage: { filled: 4, declared_missing: 1, not_recorded: 0, slots: 5, filled_pct: 80 },
    },
    {
      slug: "modulo_young",
      name: "Módulo de Young",
      category: "MECANICA",
      canonical_unit: "Pa",
      coverage: { filled: 1, declared_missing: 0, not_recorded: 4, slots: 5, filled_pct: 20 },
    },
  ],
  gaps: [
    {
      slug: "modulo_young",
      name: "Módulo de Young",
      category: "MECANICA",
      canonical_unit: "Pa",
      coverage: { filled: 1, declared_missing: 0, not_recorded: 4, slots: 5, filled_pct: 20 },
    },
  ],
};

const distributions: Record<string, PropertyDistribution> = {
  modulo_young: {
    display_unit: null,
    property_slug: "modulo_young",
    property_name: "Módulo de Young",
    category: "MECANICA",
    canonical_unit: "Pa",
    allows_log_scale: true,
    boxes: [
      {
        class_slug: "metais",
        class_name: "Metais",
        count: 2,
        minimum: 190e9,
        q1: 195e9,
        median: 200e9,
        q3: 205e9,
        maximum: 210e9,
      },
    ],
    classes_without_data: ["Cerâmicas"],
  },
  densidade: {
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
        minimum: 7800,
        q1: 7820,
        median: 7850,
        q3: 7880,
        maximum: 7900,
      },
      {
        class_slug: "ceramicas",
        class_name: "Cerâmicas",
        count: 1,
        minimum: 3900,
        q1: 3900,
        median: 3900,
        q3: 3900,
        maximum: 3900,
      },
    ],
    classes_without_data: [],
  },
};

const filtersOut = { class_slug: null, subclass: null, level: 3, demo: "todos" as const, materials: 5 };

const composition: DashboardComposition = {
  filters: filtersOut,
  width: 160,
  height: 90,
  cells: [
    { key: "c:metais", depth: 0, class_slug: "metais", class_name: "Metais", subclass: null, count: 2, share_pct: 66.7, x0: 0, y0: 0, x1: 106.7, y1: 90 },
    { key: "s:metais:Aços", depth: 1, class_slug: "metais", class_name: "Metais", subclass: "Aços", count: 2, share_pct: 66.7, x0: 0, y0: 0, x1: 106.7, y1: 90 },
    { key: "c:ceramicas", depth: 0, class_slug: "ceramicas", class_name: "Cerâmicas", subclass: null, count: 1, share_pct: 33.3, x0: 106.7, y0: 0, x1: 160, y1: 90 },
    { key: "s:ceramicas:", depth: 1, class_slug: "ceramicas", class_name: "Cerâmicas", subclass: null, count: 1, share_pct: 33.3, x0: 106.7, y0: 0, x1: 160, y1: 90 },
  ],
};

const processes: DashboardProcesses = {
  filters: filtersOut,
  processes: 2,
  families: [
    { slug: "uniao", name: "União", root_slug: "uniao", root_name: "União", processes: 2, materials: 3 },
  ],
  by_process: [
    { slug: "solda-mig", name: "Solda MIG", family_slug: "uniao", family_name: "União", materials: 2, share_pct: 40 },
    { slug: "adesivagem", name: "Adesivagem", family_slug: "uniao", family_name: "União", materials: 0, share_pct: 0 },
  ],
  by_material_class: [{ class_slug: "metais", class_name: "Metais", materials: 2, processes: 2 }],
  materials_with_process: 3,
  materials_without_process: 2,
};

const sources: DashboardSources = {
  filters: filtersOut,
  values: 6,
  sources: [
    {
      key: "1",
      label: "Fonte Demo",
      is_demo: true,
      license_label: null,
      materials: 5,
      values: 6,
      medido: 4,
      importado: 1,
      estimado: 1,
      declared_missing: 1,
      share_pct: 100,
    },
  ],
};

const stats: DashboardPropertyStats = {
  filters: filtersOut,
  property_slug: "modulo_young",
  property_name: "Módulo de Young",
  symbol_latex: null,
  category: "MECANICA",
  display_unit: "GPa",
  better_direction: "HIGHER",
  allows_log_scale: true,
  log_bins: false,
  count: 1,
  declared_missing: 0,
  not_recorded: 4,
  coverage_pct: 20,
  minimum: 200,
  q1: 200,
  median: 200,
  q3: 200,
  maximum: 200,
  mean: 200,
  bins: [{ lower: 200, upper: 200, count: 1 }],
};

const emptyStats: DashboardPropertyStats = {
  ...stats,
  property_slug: "densidade",
  property_name: "Densidade",
  count: 0,
  minimum: null,
  q1: null,
  median: null,
  q3: null,
  maximum: null,
  mean: null,
  coverage_pct: null,
  bins: [],
};

const top: DashboardTop = {
  filters: filtersOut,
  kind: "property",
  slug: "modulo_young",
  label: "Módulo de Young",
  expression: null,
  unit: "GPa",
  order: "melhor",
  direction: "maior",
  ranked: 2,
  without_value: 3,
  items: [
    { rank: 1, material_id: 11, name: "Aço A", class_slug: "metais", class_name: "Metais", subclass: "Aços", is_demo: true, value: 210 },
    { rank: 2, material_id: 12, name: "Aço B", class_slug: "metais", class_name: "Metais", subclass: null, is_demo: true, value: 190 },
  ],
};

const correlation: DashboardCorrelation = {
  filters: filtersOut,
  method: "spearman",
  min_pairs: 5,
  properties: [
    { slug: "densidade", name: "Densidade", symbol_latex: null, count: 5 },
    { slug: "modulo_young", name: "Módulo de Young", symbol_latex: null, count: 2 },
  ],
  cells: [
    { x: "densidade", y: "densidade", rho: 1, pairs: 5 },
    { x: "densidade", y: "modulo_young", rho: null, pairs: 2 },
    { x: "modulo_young", y: "densidade", rho: null, pairs: 2 },
    { x: "modulo_young", y: "modulo_young", rho: null, pairs: 2 },
  ],
};

const activity: DashboardActivity = {
  studies: 3,
  charts: 1,
  notebooks: 0,
  own_materials: 2,
  months: [
    { month: "2026-10", studies: 1, charts: 0, notebooks: 0 },
    { month: "2026-11", studies: 2, charts: 1, notebooks: 0 },
  ],
  actions: { CRIADO: 2 },
  recent: [
    { entity_type: "material", entity_id: 1, entity_label: "Meu aço", action: "CRIADO", created_at: "2026-11-01T10:00:00+00:00" },
  ],
  ai: {
    today: { day: "2026-11-02", requests: 7, artifacts: 1, fetches: 2 },
    ai_daily_limit: 100,
    notebook_daily_limit: 60,
    fetch_daily_limit: 30,
    days: [{ day: "2026-11-02", requests: 7, artifacts: 1, fetches: 2 }],
  },
};

const getDashboardOverview = vi.fn((_filters?: unknown) => Promise.resolve(overview));
// D-209: the overview's block layout, kept in the account.
const createSavedView = vi.fn((payload: Record<string, unknown>) =>
  Promise.resolve({ id: 1, position: 0, created_at: "", updated_at: "", ...payload }),
);
const getDashboardDistribution = vi.fn((slug: string, _filters?: unknown) =>
  Promise.resolve(distributions[slug]),
);
const getDashboardPropertyStats = vi.fn((slug: string) =>
  Promise.resolve(slug === "densidade" ? emptyStats : stats),
);
const getDashboardActivity = vi.fn(() => Promise.resolve(activity));

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  listSavedViews: () => Promise.resolve([]),
  createSavedView: (payload: Record<string, unknown>) => createSavedView(payload),
  updateSavedView: () => Promise.resolve({}),
  deleteSavedView: () => Promise.resolve(),
  getDashboardOverview: (filters: unknown) => getDashboardOverview(filters),
  getDashboardDistribution: (slug: string, filters: unknown) => getDashboardDistribution(slug, filters),
  getDashboardComposition: () => Promise.resolve(composition),
  getDashboardProcesses: () => Promise.resolve(processes),
  getDashboardSources: () => Promise.resolve(sources),
  getDashboardPropertyStats: (slug: string) => getDashboardPropertyStats(slug),
  getDashboardTop: () => Promise.resolve(top),
  getDashboardCorrelation: () => Promise.resolve(correlation),
  getDashboardActivity: () => getDashboardActivity(),
  listClasses: () =>
    Promise.resolve([
      { id: 1, slug: "metais", name: "Metais", parent_id: null, description: null },
      { id: 2, slug: "ceramicas", name: "Cerâmicas", parent_id: null, description: null },
    ]),
  listPerformanceIndices: () => Promise.resolve([]),
  dashboardExportUrl: (section: string) => `http://api/api/dashboard/export.csv?secao=${section}`,
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

// Imported after the mock so the page picks it up.
const { default: DashboardPage } = await import("./page");

async function renderDashboard(search = "") {
  at(search);
  const view = render(wrap(<DashboardPage />));
  expect(await screen.findByText(t.title)).toBeInTheDocument();
  // The overview tab is ready once its first tile is (the overview resolved).
  if (search === "") expect(await screen.findByText(t.materials)).toBeInTheDocument();
  return view;
}

async function renderProperties() {
  await renderDashboard("aba=propriedades");
  // The tab defaults to the worst-covered property, so its distribution has
  // loaded by the time a test can act.
  await waitFor(() =>
    expect(getDashboardDistribution).toHaveBeenCalledWith("modulo_young", expect.anything()),
  );
}

describe("painel", () => {
  it("shows the catalogue's own numbers, not a placeholder", async () => {
    await renderDashboard();

    // The MSDS stat tile counts up (D-80); a screen reader gets the final value
    // at once, in its own node, instead of the animation read aloud.
    const tileOf = (label: string) => screen.getByText(label).closest(".msds-stat") as HTMLElement;
    expect(within(tileOf(t.materials)).getByText("5", { selector: ".sr-only" })).toBeInTheDocument();
    expect(
      within(tileOf(t.overallCoverage)).getByText("60,0%", { selector: ".sr-only" }),
    ).toBeInTheDocument();
  });

  it("names all five states of the quality mix, including the one that is not a quality", async () => {
    await renderDashboard();

    for (const label of [
      ptBR.quality.MEDIDO,
      ptBR.quality.IMPORTADO,
      ptBR.quality.ESTIMADO,
      ptBR.quality.AUSENTE,
      ptBR.quality.NAO_REGISTRADO,
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("lists coverage per class in a table a screen reader can follow", async () => {
    await renderDashboard();

    // The MSDS chart card swaps the figure for its table (D-80).
    const card = screen
      .getByShadowRole("heading", { name: t.classCoverageTitle })
      .closest(".msds-chart-card") as HTMLElement;
    await userEvent.click(within(card).getByShadowRole("button", { name: ptBR.chart.showTable }));

    const table = screen.getByShadowRole("table", { name: t.classCoverageFigure });
    expect(within(table).getByShadowRole("rowheader", { name: "Metais" })).toBeInTheDocument();
    expect(within(table).getByShadowRole("rowheader", { name: "Cerâmicas" })).toBeInTheDocument();
  });

  it("never prints a percentage for a class with no slots (D-24)", async () => {
    getDashboardOverview.mockResolvedValueOnce({
      ...overview,
      by_class: [
        ...overview.by_class,
        {
          slug: "vidros",
          name: "Vidros",
          materials: 0,
          coverage: { filled: 0, declared_missing: 0, not_recorded: 0, slots: 0, filled_pct: null },
        },
      ],
    });
    at("");
    render(wrap(<DashboardPage />));

    expect(await screen.findByText(t.noSlots)).toBeInTheDocument();
  });

  it("ranks the least-filled property first among the gaps", async () => {
    await renderDashboard();

    const table = screen.getByShadowRole("table", { name: t.gapsTitle });
    expect(within(table).getByShadowRole("rowheader", { name: "Módulo de Young" })).toBeInTheDocument();
  });

  it("defaults the distribution panel to the worst-covered property", async () => {
    await renderProperties();

    expect(await screen.findByText(t.distributionFigure("Módulo de Young"))).toBeInTheDocument();
    expect(screen.getByText(t.classesWithoutData)).toBeInTheDocument();
  });

  it("fetches a new distribution when the reader picks a different property", async () => {
    await renderProperties();

    await userEvent.selectOptions(
      screen.getByShadowRole("combobox", { name: d.property.pickerLabel }),
      "densidade",
    );

    await waitFor(() =>
      expect(getDashboardDistribution).toHaveBeenCalledWith("densidade", expect.anything()),
    );
    // The choice is in the URL, so the view can be linked (D-193).
    expect(nav.search.get("prop")).toBe("densidade");
    expect(await screen.findByText(t.distributionFigure("Densidade"))).toBeInTheDocument();
  });

  it("keeps the distribution's scale in the URL, both ways (D-212)", async () => {
    at("aba=propriedades&escala=log");
    render(wrap(<DashboardPage />));
    const log = await screen.findByShadowRole("button", { name: t.log });
    expect(log).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByShadowRole("button", { name: t.linear }));
    // Linear is the default, so it leaves the URL rather than being spelled out.
    expect(nav.search.get("escala")).toBeNull();
    await userEvent.click(screen.getByShadowRole("button", { name: t.log }));
    expect(nav.search.get("escala")).toBe("log");
  });

  it("draws a property that refuses log linearly without rewriting the URL during render", async () => {
    getDashboardDistribution.mockImplementation((slug: string) =>
      Promise.resolve({ ...distributions[slug]!, allows_log_scale: false }),
    );
    at("aba=propriedades&escala=log");
    render(wrap(<DashboardPage />));
    await waitFor(() =>
      expect(screen.getByShadowRole("button", { name: t.linear })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByShadowRole("button", { name: t.log })).toBeDisabled();
    // The reader's choice stays where it was: it applies again to a property that allows it.
    expect(nav.search.get("escala")).toBe("log");
    getDashboardDistribution.mockImplementation((slug: string) => Promise.resolve(distributions[slug]));
  });

  it("shows an empty state instead of zeroed cards when the catalogue has nothing", async () => {
    getDashboardOverview.mockResolvedValueOnce({
      ...overview,
      materials: 0,
      by_property: [],
      by_class: [],
      by_quality: [],
      gaps: [],
      coverage: { filled: 0, declared_missing: 0, not_recorded: 0, slots: 0, filled_pct: null },
    });

    at("");
    render(wrap(<DashboardPage />));

    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("reports the failure and offers a retry instead of hanging silently", async () => {
    getDashboardOverview.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();

    at("");
    render(wrap(<DashboardPage />));

    expect(await screen.findByShadowRole("alert")).toHaveTextContent(t.error);
    getDashboardOverview.mockResolvedValueOnce(overview);
    await user.click(screen.getByShadowRole("button", { name: ptBR.ui.retry }));

    expect(await screen.findByText(t.materials)).toBeInTheDocument();
    expect(screen.queryByShadowRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the tab in the URL and switches content with it", async () => {
    await renderDashboard();
    await userEvent.click(screen.getByShadowRole("tab", { name: d.tabs.processos }));
    expect(nav.search.get("aba")).toBe("processos");
    expect(
      await screen.findByShadowRole("heading", { name: d.processes.familiesTitle }),
    ).toBeInTheDocument();
  });

  it("sends the global filters to the API and lists subclasses of the catalogue", async () => {
    await renderDashboard();
    await screen.findByText(d.composition.title);
    // D-209: the filters are chips; each opens its options.
    await userEvent.click(screen.getByShadowRole("button", { name: new RegExp(`^${d.filters.classe}: `) }));
    await userEvent.click(await screen.findByShadowRole("button", { name: "Metais" }));
    await waitFor(() =>
      expect(getDashboardOverview).toHaveBeenCalledWith(expect.objectContaining({ classe: "metais" })),
    );
    expect(nav.search.get("classe")).toBe("metais");
    await userEvent.click(
      screen.getByShadowRole("button", { name: new RegExp(`^${d.filters.subclasse}: `) }),
    );
    expect(await screen.findByShadowRole("button", { name: "Aços" })).toBeInTheDocument();
  });

  it("lets the reader hide an overview block and keeps the layout in the account (D-209)", async () => {
    await renderDashboard();
    await screen.findByText(d.composition.title);
    await userEvent.click(
      screen.getByShadowRole("button", { name: ptBR.ds.hideBlock(d.blocks.lacunas) }),
    );
    expect(
      screen.getByShadowRole("button", { name: ptBR.ds.showBlock(d.blocks.lacunas) }),
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(createSavedView).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "painel",
          kind: "layout",
          config: expect.objectContaining({ hidden: ["lacunas"] }),
        }),
      ),
    );
  });

  it("links a subclass of the treemap to the filtered catalogue", async () => {
    const push = vi.fn();
    nav.push = push;
    await renderDashboard();
    const cell = await screen.findByShadowRole("link", { name: /Metais, Aços: abrir no catálogo/ });
    await userEvent.click(cell);
    expect(push).toHaveBeenCalledWith("/app/catalogo?classe=metais&subclasse=A%C3%A7os");
  });

  it("writes a statistic of nothing in words, never 0 (D-24)", async () => {
    await renderProperties();
    await userEvent.selectOptions(
      screen.getByShadowRole("combobox", { name: d.property.pickerLabel }),
      "densidade",
    );
    expect(await screen.findAllByText(d.property.noValues)).not.toHaveLength(0);
    expect(await screen.findByText(d.property.histogramEmpty)).toBeInTheDocument();
  });

  it("ranks with the backend's order and offers the comparator on the listed materials", async () => {
    await renderProperties();
    expect(await screen.findByShadowRole("link", { name: "Aço A" })).toHaveAttribute("href", "/app/materiais/11");
    expect(screen.getByShadowRole("link", { name: d.actions.compareTop(2) })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=11,12",
    );
    expect(screen.getByText(new RegExp(d.top.without(3).slice(0, 20)))).toBeInTheDocument();
  });

  it("names a correlation without enough pairs instead of printing 0", async () => {
    await renderProperties();
    const cell = await screen.findByShadowRole("link", {
      name: d.correlation.cellAria("Módulo de Young", "Densidade", d.correlation.noRho, d.correlation.pairs(2)),
    });
    expect(cell).toBeInTheDocument();
  });

  it("shows only the reader's own activity and AI use", async () => {
    await renderDashboard("aba=atividade");
    expect(await screen.findByText(d.activity.intro)).toBeInTheDocument();
    expect(screen.getByText(d.activity.aiTodayNote(7, 100), { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Meu aço")).toBeInTheDocument();
  });

  it("names every figure on every tab and never sets state while rendering (D-219)", async () => {
    // React reports "Cannot update a component while rendering a different one"
    // through console.error; a spy turns that into a failure.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let figures = 0;
      for (const tab of ["", "aba=propriedades", "aba=processos", "aba=qualidade", "aba=atividade"]) {
        const view = await renderDashboard(tab);
        await waitFor(() => expect(screen.queryAllByText(d.loading)).toHaveLength(0));
        for (const figure of view.container.querySelectorAll("svg[data-chart-figure]")) {
          figures += 1;
          expect(figure.getAttribute("role"), tab || "visao").toBe("figure");
          expect(figure.getAttribute("aria-label")?.trim(), tab || "visao").toBeTruthy();
        }
        view.unmount();
      }
      expect(figures).toBeGreaterThan(0);
      const rendering = errors.mock.calls.filter((call) =>
        String(call[0]).includes("while rendering a different component"),
      );
      expect(rendering).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("has no detectable accessibility violations on any tab", async () => {
    for (const tab of ["", "aba=propriedades", "aba=processos", "aba=qualidade", "aba=atividade"]) {
      const view = await renderDashboard(tab);
      await waitFor(() => expect(screen.queryAllByText(d.loading)).toHaveLength(0));
      const violations = await findA11yViolations(view.container);
      expect(describeViolations(violations), tab || "visao").toBe("");
      view.unmount();
    }
  });
});

describe("painel — Sugestão da IA (D-230)", () => {
  const answer: SuggestionsOut = {
    tool: "painel",
    summary: "Onde o catálogo tem lacunas.",
    suggestions: [
      {
        title: "Revise a classe Cerâmicas",
        body: "É a classe menos preenchida.",
        actions: [
          { type: "open_route", label: "Abrir o catálogo de Cerâmicas", path: "/app/catalogo?classe=ceramicas" },
          // An action of a type this screen does not apply is not shown.
          { type: "set_param", label: "sem efeito aqui", name: "x", value: 1 },
          // Never a way out of the app.
          { type: "open_route", label: "Outro site", path: "//example.com/x" },
        ],
      },
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "",
  };

  it("só consulta ao clicar; cada rota é um link para dentro do app", async () => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
    const user = userEvent.setup();
    await renderDashboard();
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    const link = await screen.findByRole("link", { name: "Abrir o catálogo de Cerâmicas" });
    expect(link).toHaveAttribute("href", "/app/catalogo?classe=ceramicas");
    expect(suggest.fn).toHaveBeenCalledTimes(1);
    expect(suggest.fn).toHaveBeenCalledWith("painel", {});
    expect(screen.queryByRole("button", { name: "sem efeito aqui" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Outro site" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Outro site" })).toBeNull();
  });

  it("um erro da IA fica no painel e a tela segue inteira", async () => {
    suggest.fn.mockReset();
    suggest.fn.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderDashboard();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    expect(await screen.findByText(suggestText.errorTitle)).toBeInTheDocument();
    expect(screen.getByText(t.materials)).toBeInTheDocument();
  });

  it("não tem violação de acessibilidade com o painel aberto", async () => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
    const user = userEvent.setup();
    const view = await renderDashboard();
    await waitFor(() => expect(screen.queryAllByText(d.loading)).toHaveLength(0));
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByRole("link", { name: "Abrir o catálogo de Cerâmicas" });
    const violations = await findA11yViolations(view.container);
    expect(describeViolations(violations)).toBe("");
  }, 30_000);
});
