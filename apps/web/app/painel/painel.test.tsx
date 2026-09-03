import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { DashboardOverview, PropertyDistribution } from "@/lib/types";
import { selectMwcOption } from "@/lib/testing/mwc";

const t = ptBR.dashboard;

// Plotly pulls WebGL and canvas into a runtime jsdom has neither of, and
// nothing it draws is under test here — the numbers behind it are, via the
// data table every figure carries (D-31).
vi.mock("react-plotly.js", () => ({ default: () => null }));

// PageHeader reads its section from the current route (Task 1) — the mock
// needs a real pathname so `sectionForPath` doesn't crash on `null`.
vi.mock("next/navigation", () => ({
  usePathname: () => "/painel",
}));

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

const getDashboardOverview = vi.fn(() => Promise.resolve(overview));
const getDashboardDistribution = vi.fn((slug: string) => Promise.resolve(distributions[slug]));

vi.mock("@/lib/api", () => ({
  getDashboardOverview: () => getDashboardOverview(),
  getDashboardDistribution: (slug: string) => getDashboardDistribution(slug),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

// Imported after the mock so the page picks it up.
const { default: DashboardPage } = await import("./page");

async function renderDashboard() {
  render(wrap(<DashboardPage />));
  expect(await screen.findByText(t.title)).toBeInTheDocument();
  // The panel defaults to the worst-covered property, so its distribution has
  // loaded by the time a test can act.
  await waitFor(() => expect(getDashboardDistribution).toHaveBeenCalledWith("modulo_young"));
}

describe("painel", () => {
  it("shows the catalogue's own numbers, not a placeholder", async () => {
    await renderDashboard();

    expect(screen.getByText("5")).toBeInTheDocument(); // materiais ativos
    expect(screen.getByText(t.demoNote(5))).toBeInTheDocument();
    expect(screen.getByText("60,0%")).toBeInTheDocument(); // cobertura geral
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

    const table = screen.getByShadowRole("table", { name: t.classCoverageFigure });
    expect(within(table).getByShadowRole("rowheader", { name: "Metais" })).toBeInTheDocument();
    expect(within(table).getByShadowRole("rowheader", { name: "Cerâmicas" })).toBeInTheDocument();
  });

  it("ranks the least-filled property first among the gaps", async () => {
    await renderDashboard();

    const table = screen.getByShadowRole("table", { name: t.gapsTitle });
    expect(within(table).getByShadowRole("rowheader", { name: "Módulo de Young" })).toBeInTheDocument();
  });

  it("defaults the distribution panel to the worst-covered property", async () => {
    await renderDashboard();

    expect(await screen.findByText(t.distributionFigure("Módulo de Young"))).toBeInTheDocument();
    expect(screen.getByText(t.classesWithoutData)).toBeInTheDocument();
  });

  it("fetches a new distribution when the reader picks a different property", async () => {
    await renderDashboard();

    selectMwcOption(screen.getByShadowRole("combobox", { name: t.property }), "densidade");

    await waitFor(() => expect(getDashboardDistribution).toHaveBeenCalledWith("densidade"));
    expect(await screen.findByText(t.distributionFigure("Densidade"))).toBeInTheDocument();
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

    render(wrap(<DashboardPage />));

    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("reports the failure and offers a retry instead of hanging silently", async () => {
    getDashboardOverview.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();

    render(wrap(<DashboardPage />));

    expect(await screen.findByShadowRole("alert")).toHaveTextContent(t.error);
    getDashboardOverview.mockResolvedValueOnce(overview);
    await user.click(screen.getByShadowRole("button", { name: ptBR.ui.retry }));

    expect(await screen.findByText(t.demoNote(5))).toBeInTheDocument();
    expect(screen.queryByShadowRole("alert")).not.toBeInTheDocument();
  });
});
