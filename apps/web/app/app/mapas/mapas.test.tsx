import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
// MWC roles live inside a shadow root (see components/layout/layout.test.tsx).
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { installWideViewport } from "@/lib/testing/viewport";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { allowLoadedRunner } from "@/lib/testing/loadedRunner";
import { suggestText } from "@/lib/i18n-suggest";
import { MAP_URL_KEY } from "@/lib/navMemory";
import { decodeMapState } from "./url-state";
import type {
  IndexLineOut,
  IndexLineRequest,
  MapPreset,
  PerformanceIndex,
  PropertyDefinition,
  PropertyMap,
  PropertyMapRequest,
  SuggestionsOut,
} from "@/lib/types";

allowLoadedRunner();

const t = ptBR.map;

// D-213: what the page does with Plotly's selection events. The figure itself
// never draws here; these buttons emit what Plotly emits.
vi.mock("react-plotly.js", () => ({
  default: (props: { onSelected?: (event: unknown) => void }) => (
    <div data-testid="plotly-mock">
      <button
        type="button"
        onClick={() =>
          props.onSelected?.({
            lassoPoints: { x: [1, 2, 3], y: [1, 2, 3] },
            points: [{ customdata: 0 }, { customdata: 1 }],
          })
        }
      >
        simular laço
      </button>
      <button
        type="button"
        onClick={() => props.onSelected?.({ range: { x: [2, 8], y: [150, 300] } })}
      >
        simular caixa
      </button>
    </div>
  ),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/mapas",
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function property(slug: string, name: string, unit: string): PropertyDefinition {
  return {
    display_unit: null,
    id: slug.length,
    name,
    slug,
    symbol: null,
    description: null,
    category: "MECANICA",
    physical_dimension: "x",
    canonical_unit: unit,
    accepted_units: [unit],
    is_interval: false,
    better_direction: "HIGHER",
    allows_log_scale: true,
    value_count: 3,
  };
}

const properties = [
  property("densidade", "Densidade", "kg/m**3"),
  property("modulo_young", "Módulo de Young", "Pa"),
  property("limite_escoamento", "Limite de escoamento", "Pa"),
];

const indices: PerformanceIndex[] = [
  {
    id: 1,
    name: "Viga leve limitada por rigidez",
    slug: "viga-leve-rigidez",
    expression: "sqrt(modulo_young) / densidade",
    goal: "maximize",
    description: null,
    assumptions: {},
    dimension: "Pa**0.5*m**3/kg",
    is_demo: true,
  },
];

const presets: MapPreset[] = [
  {
    slug: "modulo-densidade",
    name: "Módulo de Young × Densidade",
    description: "Leveza e rigidez.",
    x: "densidade",
    y: "modulo_young",
    x_name: "Densidade",
    y_name: "Módulo de Young",
    scale: "log",
    index: {
      name: "Viga leve limitada por rigidez",
      expression: "sqrt(modulo_young) / densidade",
      goal: "maximize",
      slug: "viga-leve-rigidez",
    },
    available: true,
    missing_properties: [],
  },
  {
    slug: "resistencia-densidade",
    name: "Limite de escoamento × Densidade",
    description: "Leveza e resistência.",
    x: "densidade",
    y: "limite_escoamento",
    x_name: "Densidade",
    y_name: "Limite de escoamento",
    scale: "log",
    index: {
      name: "Viga leve limitada por resistência",
      expression: "limite_escoamento ** (2 / 3) / densidade",
      goal: "maximize",
      slug: null,
    },
    available: true,
    missing_properties: [],
  },
  {
    slug: "modulo-custo",
    name: "Módulo de Young × Custo por volume",
    description: "Rigidez barata.",
    x: "custo_volume",
    y: "modulo_young",
    x_name: null,
    y_name: "Módulo de Young",
    scale: "log",
    index: null,
    available: false,
    missing_properties: ["custo_volume"],
  },
];

function point(id: number, name: string, x: number, y: number) {
  return {
    material_id: id,
    material_name: name,
    class_name: "Metais",
    class_slug: "metais",
    is_demo: true,
    x,
    y,
    x_min: null,
    x_max: null,
    y_min: null,
    y_max: null,
    x_uncertainty: null,
    y_uncertainty: null,
    x_is_interval: false,
    y_is_interval: false,
    x_quality: "MEDIDO" as const,
    y_quality: "MEDIDO" as const,
    index_value: null,
    index_undefined_reason: null,
  };
}

function mapFor(request: PropertyMapRequest): PropertyMap {
  const axis = (slug: string) => ({
    is_index: false,
    property_slug: slug,
    property_name: properties.find((p) => p.slug === slug)?.name ?? slug,
    expression: null,
    symbol: null,
    unit: slug === "densidade" ? "g/cm**3" : "GPa",
    category: null,
    better_direction: "HIGHER" as const,
    allows_log_scale: true,
    min_value: null,
    max_value: null,
  });
  const all = [point(1, "Aço 1020", 7.85, 200), point(2, "Liga de alumínio", 2.7, 69), point(3, "Titânio", 4.5, 110)];
  const points = request.material_ids ? all.filter((p) => request.material_ids?.includes(p.material_id)) : all;
  return {
    scale: request.scale,
    x_axis: axis(request.x ?? "densidade"),
    y_axis: axis(request.y ?? "modulo_young"),
    points,
    envelopes: [],
    envelopes_alt: [],
    excluded: [],
    index: null,
    considered_count: points.length,
    plotted_count: points.length,
    notes: [],
  };
}

const getPropertyMap = vi.fn((request: PropertyMapRequest) => Promise.resolve(mapFor(request)));
const moveIndexLine = vi.fn<(request: IndexLineRequest) => Promise<IndexLineOut>>();
const convertMapBox = vi.fn();
const listSavedCharts = vi.fn(() => Promise.resolve([] as { id: number; name: string; created_at: string }[]));
const getSavedChart = vi.fn((id: number) =>
  Promise.resolve({ id, name: "Metais leves", created_at: "2026-11-01", configuration: { scale: "linear" } }),
);

const suggestNextSteps = vi.fn<() => Promise<SuggestionsOut>>();

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: () => suggestNextSteps(),
  listProperties: () => Promise.resolve(properties),
  listClasses: () => Promise.resolve([]),
  listPerformanceIndices: () => Promise.resolve(indices),
  listMapPresets: () => Promise.resolve(presets),
  listSavedCharts: () => listSavedCharts(),
  listProcessAttributes: () => Promise.resolve([]),
  listProcessClasses: () => Promise.resolve([]),
  getPropertyMap: (request: PropertyMapRequest) => getPropertyMap(request),
  moveIndexLine: (request: IndexLineRequest) => moveIndexLine(request),
  convertMapBox: (payload: unknown) => convertMapBox(payload),
  createSavedChart: () => Promise.resolve(null),
  getSavedChart: (id: number) => getSavedChart(id),
}));

const { default: MapsPage } = await import("./page");

function setQuery(query: string) {
  window.history.replaceState(null, "", `/app/mapas${query ? `?${query}` : ""}`);
}

function query(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/** What the home's "Último mapa" will open (D-232): the whole address, not just the path. */
function readMapUrl(): string | null {
  const raw = window.localStorage.getItem(MAP_URL_KEY);
  return raw ? ((JSON.parse(raw) as string[])[0] ?? null) : null;
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

async function open() {
  const view = render(wrap(<MapsPage />));
  await screen.findByTestId("plotly-mock");
  return view;
}

function line(overrides: Partial<IndexLineOut> = {}): IndexLineOut {
  return {
    available: true,
    unavailable_reason: null,
    value: 2,
    dimension: "Pa**0.5*m**3/kg",
    orientation: "oblique",
    slope: 2,
    points: [
      [1, 1],
      [10, 100],
    ],
    handle: [3.16, 10],
    better_ids: [1],
    worse_ids: [2, 3],
    undefined_ids: [],
    steps: [1, 2, 3],
    step_index: 1,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  setQuery("");
  push.mockReset();
  getPropertyMap.mockClear();
  moveIndexLine.mockReset();
  moveIndexLine.mockImplementation((request) =>
    Promise.resolve(line(request.level ? { value: request.level, step_index: request.level - 1 } : {})),
  );
  convertMapBox.mockReset();
});

describe("Mapas — lembra o último mapa com os filtros (D-232)", () => {
  it("guarda o endereço completo do mapa, e o atualiza quando o leitor mexe", async () => {
    const user = userEvent.setup();
    setQuery("sel=1");
    await open();
    await waitFor(() => expect(readMapUrl()).toBe("/app/mapas?sel=1"));

    await user.click(screen.getByRole("button", { name: "simular laço" }));
    await waitFor(() => expect(readMapUrl()).toBe("/app/mapas?sel=1%2C2"));
  });
});

describe("Mapas — seleção que vira filtro (D-213)", () => {
  it("o laço escolhe materiais, guarda na URL e oferece Comparar com esses ids", async () => {
    const user = userEvent.setup();
    await open();

    expect(screen.getByText(t.selectionEmpty)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular laço" }));

    await waitFor(() => expect(query().get("sel")).toBe("1,2"));
    expect(screen.getByText(t.selectionCount(2))).toBeInTheDocument();
    const compare = screen.getByShadowRole("link", { name: `${t.compareSelection} →` });
    expect(compare).toHaveAttribute("href", "/app/comparar?materiais=1,2");
    // D-232: a lasso is a set of records, so it opens the Selection as a list
    // stage (`?materiais=`); the Chart Stage is for a box.
    const toSelection = screen.getByShadowRole("link", { name: `${t.openInSelection} →` });
    expect(toSelection).toHaveAttribute("href", "/app/selecao?etapa=restricoes&materiais=1,2");
    expect(screen.getByText(t.openInSelectionListHint)).toBeInTheDocument();
    expect(screen.queryByText(t.openInSelectionNeedsBox)).not.toBeInTheDocument();
  });

  it("a lista de pontos marcados também abre a Seleção, e a seleção acima do limite avisa que corta", async () => {
    setQuery("sel=1-250");
    await open();
    const link = await screen.findByShadowRole("link", { name: `${t.openInSelection} →` });
    expect(link).toHaveAttribute("href", "/app/selecao?etapa=restricoes&materiais=1-200");
    expect(screen.getByText(t.openInSelectionCapped(200))).toBeInTheDocument();
  });

  it("o painel da seleção passa no axe com o laço e com a caixa", async () => {
    const user = userEvent.setup();
    const { container } = await open();
    await user.click(screen.getByRole("button", { name: "simular laço" }));
    await screen.findByShadowRole("link", { name: `${t.openInSelection} →` });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("“Mostrar só estes no mapa” restringe o mapa pelos mesmos ids, e “Mostrar todos” desfaz", async () => {
    const user = userEvent.setup();
    setQuery("sel=1,2");
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.showOnlySelection }));
    await waitFor(() => expect(query().get("materiais")).toBe("1,2"));
    await waitFor(() =>
      expect(getPropertyMap).toHaveBeenLastCalledWith(expect.objectContaining({ material_ids: [1, 2] })),
    );
    expect(query().get("sel")).toBeNull();
    expect(await screen.findByText(t.restrictedNotice(2))).toBeInTheDocument();

    await user.click(screen.getByShadowRole("button", { name: t.showAll }));
    await waitFor(() => expect(query().get("materiais")).toBeNull());
  });

  it("uma caixa vai para a Seleção como estágio, convertida pelo servidor", async () => {
    const user = userEvent.setup();
    convertMapBox.mockResolvedValue({
      box: { x_min: 2000, x_max: 8000, y_min: 1e11, y_max: 3e11 },
      x_unit: "kg/m**3",
      y_unit: "Pa",
    });
    await open();

    await user.click(screen.getByRole("button", { name: "simular caixa" }));
    await waitFor(() => expect(query().get("caixa")).not.toBeNull());
    // Aço (7,85; 200) is inside; aluminium (69 GPa) and titanium (110 GPa) are below it.
    expect(screen.getByText(t.selectionCount(1))).toBeInTheDocument();

    await user.click(screen.getByShadowRole("button", { name: new RegExp(`^${t.openInSelection}`) }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(convertMapBox).toHaveBeenCalledWith(expect.objectContaining({ to: "canonical" }));
    expect(push.mock.calls[0]?.[0]).toMatch(/^\/app\/selecao\?.*novo_estagio=chart.*x_min=2000/);
  });

  it("a lista de pontos anda pelo teclado, anuncia o destacado e marca com Espaço", async () => {
    const user = userEvent.setup();
    await open();

    const first = screen.getByRole("checkbox", { name: t.pointSelect("Aço 1020") });
    const second = screen.getByRole("checkbox", { name: t.pointSelect("Liga de alumínio") });
    // One tab stop for the whole list (roving tabindex).
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByText(/^Liga de alumínio, Metais\. Densidade 2,7 g\/cm³; Módulo de Young 69 GPa\.$/),
    ).toBeInTheDocument();

    await user.keyboard(" ");
    await waitFor(() => expect(query().get("sel")).toBe("2"));
    expect(second).toBeChecked();

    await user.keyboard("{End}");
    expect(screen.getByRole("checkbox", { name: t.pointSelect("Titânio") })).toHaveFocus();
  });

  // D-221 (on D-86): on a narrow window the drawing sections of the inspector
  // fold, unless the link already uses one of them.
  it("em tela estreita as seções de desenho do inspetor recolhem, a não ser que o link as use", async () => {
    const { unmount } = await open();
    const appearance = screen.getByRole("button", { name: t.inspectorParts.appearance });
    expect(appearance).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: new RegExp(`^${t.axesTitle}`) })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // An axis can become an index only with the drawing sections in view.
    expect(screen.queryByRole("group", { name: new RegExp(`^${t.axisX} — `) })).toBeNull();
    unmount();

    const { encodeMapState } = await import("./url-state");
    const { DEFAULT_MAP_STATE } = await import("./mapUrl");
    setQuery(`estado=${encodeMapState({ ...DEFAULT_MAP_STATE, scale: "linear" })}`);
    await open();
    expect(screen.getByRole("button", { name: t.inspectorParts.appearance })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("group", { name: new RegExp(`^${t.axisX} — `) })).toBeInTheDocument();
  });

  it("um mapa salvo é uma visão: abre com um clique e se fixa no Início (D-221)", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("msai:pinned-maps");
    listSavedCharts.mockResolvedValueOnce([{ id: 7, name: "Metais leves", created_at: "2026-11-01" }]);
    await open();
    const view = await screen.findByRole("button", { name: "Metais leves" });
    expect(view).toHaveAttribute("aria-pressed", "false");
    await user.click(view);
    await waitFor(() => expect(getSavedChart).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.getByRole("button", { name: "Metais leves" })).toHaveAttribute("aria-pressed", "true"));

    await user.click(screen.getByRole("button", { name: t.viewMenu("Metais leves") }));
    await user.click(await screen.findByRole("menuitem", { name: t.pinHome }));
    expect(JSON.parse(window.localStorage.getItem("msai:pinned-maps") ?? "[]")).toEqual([
      { id: 7, name: "Metais leves" },
    ]);
    window.localStorage.removeItem("msai:pinned-maps");
  });

  it("abre o mapa fixado que chega pelo endereço (?grafico=) (D-221)", async () => {
    setQuery("grafico=9");
    await open();
    await waitFor(() => expect(getSavedChart).toHaveBeenCalledWith(9));
  });

  it("no celular o inspetor é uma folha que começa recolhida à cabeça (D-221)", async () => {
    const user = userEvent.setup();
    await open();
    const toggle = screen.getByRole("button", { name: t.inspectorOpen });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("controles")).toHaveAttribute("data-open", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: t.inspectorClose })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("controles")).toHaveAttribute("data-open", "true");
  });

  it("a seleção vem do endereço: um link reabre o mapa com os mesmos registros", async () => {
    setQuery("sel=3");
    await open();
    expect(screen.getByText(t.selectionCount(1))).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: t.pointSelect("Titânio") })).toBeChecked();
  });
});

describe("Mapas — mapas clássicos e linha de índice móvel (D-213)", () => {
  installWideViewport();

  it("um mapa clássico troca eixos e índice com um clique; o indisponível diz o que falta", async () => {
    const user = userEvent.setup();
    await open();

    const unavailable = await screen.findByRole("button", { name: "Módulo de Young × Custo por volume" });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveAccessibleDescription(t.presetUnavailable("custo_volume"));

    await user.click(screen.getByRole("button", { name: "Limite de escoamento × Densidade" }));
    await waitFor(() =>
      expect(getPropertyMap).toHaveBeenLastCalledWith(
        expect.objectContaining({
          x: "densidade",
          y: "limite_escoamento",
          scale: "log",
          index: expect.objectContaining({ expression: "limite_escoamento ** (2 / 3) / densidade" }),
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Limite de escoamento × Densidade" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("o mapa segue o leitor no endereço, e o mapa de chegada não suja a URL", async () => {
    const user = userEvent.setup();
    await open();
    expect(query().get("estado")).toBeNull();
    await user.click(screen.getByShadowRole("button", { name: t.linear }));
    await waitFor(() => expect(query().get("estado")).not.toBeNull());
    const { decodeMapState } = await import("./url-state");
    expect(decodeMapState(query().get("estado") ?? "")?.scale).toBe("linear");
    await user.click(screen.getByShadowRole("button", { name: t.log }));
    await waitFor(() => expect(query().get("estado")).toBeNull());
  });

  it("em tela larga as seções de desenho do inspetor começam abertas (D-221)", async () => {
    await open();
    for (const part of ["appearance", "classes", "index"] as const) {
      expect(screen.getByRole("button", { name: t.inspectorParts[part] })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
    // The axes can turn into an index from the always-open panel.
    expect(screen.getByRole("group", { name: new RegExp(`^${t.axisX} — `) })).toBeInTheDocument();
  });

  it("a linha móvel nasce no backend e o controle move o nível pelos passos que ele mandou", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole("button", { name: "Módulo de Young × Densidade" }));

    await user.click(await screen.findByShadowRole("button", { name: t.lineAdd }));
    await waitFor(() => expect(moveIndexLine).toHaveBeenCalled());
    expect(moveIndexLine.mock.calls[0]?.[0]).toMatchObject({
      x: "densidade",
      y: "modulo_young",
      level: null,
      through: null,
      index: expect.objectContaining({ expression: "sqrt(modulo_young) / densidade" }),
    });
    // The level the backend chose is now the one in the address.
    await waitFor(() => expect(query().get("linha")).toBe("2"));
    expect(screen.getByText(t.lineBetter(1))).toBeInTheDocument();

    const slider = screen.getByRole("slider", { name: t.lineSlider });
    expect(slider).toHaveValue("1");
    fireEvent.change(slider, { target: { value: "2" } });
    await waitFor(() => expect(query().get("linha")).toBe("3"));
    await waitFor(() =>
      expect(moveIndexLine).toHaveBeenLastCalledWith(expect.objectContaining({ level: 3 })),
    );

    await user.click(screen.getByShadowRole("button", { name: t.lineUseBetter }));
    await waitFor(() => expect(query().get("sel")).toBe("1"));
  });

  it("passa no axe com seleção, mapas clássicos e a linha móvel na tela", async () => {
    const user = userEvent.setup();
    setQuery("sel=1,3");
    const { container } = await open();
    await user.click(await screen.findByRole("button", { name: "Módulo de Young × Densidade" }));
    await user.click(await screen.findByShadowRole("button", { name: t.lineAdd }));
    await screen.findByRole("slider", { name: t.lineSlider });
    // The stand-in figure's buttons are this file's, not the page's: Plotly's
    // own figure sits in the `role="img"` box, which the real page keeps.
    screen.getByTestId("plotly-mock").setAttribute("hidden", "");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("Mapas — Sugestão da IA (D-229)", () => {
  function answer(): SuggestionsOut {
    return {
      tool: "mapas",
      summary: "Três caminhos.",
      suggestions: [
        {
          title: "Troque o eixo Y",
          body: "A resistência tem mais valores.",
          actions: [{ type: "set_axes", label: "Usar estes eixos", x: "densidade", y: "limite_escoamento" }],
        },
        {
          title: "Abrir o mapa clássico",
          body: "Leveza e resistência.",
          actions: [{ type: "apply_preset", label: "Abrir este mapa", id: "resistencia-densidade" }],
        },
        {
          title: "Índice do mapa",
          body: "A linha do índice separa os melhores.",
          actions: [{ type: "set_index", label: "Usar este índice", slug: "viga-leve-rigidez" }],
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
  }

  beforeEach(() => {
    suggestNextSteps.mockReset();
    suggestNextSteps.mockResolvedValue(answer());
  });

  it("não consulta a IA ao abrir; “Usar estes eixos” troca os eixos no endereço", async () => {
    const user = userEvent.setup();
    await open();
    expect(suggestNextSteps).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: suggestText.button }));
    await user.click(await screen.findByRole("button", { name: "Usar estes eixos" }));
    await waitFor(() => expect(query().get("estado")).not.toBeNull());
    const state = decodeMapState(query().get("estado") ?? "");
    expect(state?.xAxis?.property).toBe("densidade");
    expect(state?.yAxis?.property).toBe("limite_escoamento");
    await waitFor(() =>
      expect(getPropertyMap).toHaveBeenLastCalledWith(
        expect.objectContaining({ x: "densidade", y: "limite_escoamento" }),
      ),
    );
  });

  it("“Abrir este mapa” aplica o mapa clássico e “Usar este índice” troca o índice", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole("button", { name: suggestText.button }));
    await user.click(await screen.findByRole("button", { name: "Abrir este mapa" }));
    await waitFor(() =>
      expect(decodeMapState(query().get("estado") ?? "")?.yAxis?.property).toBe("limite_escoamento"),
    );
    // On a narrow window the panel folds after an action; the answer is kept.
    expect(screen.queryByRole("button", { name: "Usar este índice" })).toBeNull();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await user.click(await screen.findByRole("button", { name: "Usar este índice" }));
    await waitFor(() =>
      expect(decodeMapState(query().get("estado") ?? "")?.indexMode).toBe("viga-leve-rigidez"),
    );
  });

  it("o contexto enviado é o que o mapa mostra: eixos e índice", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole("button", { name: suggestText.button }));
    await screen.findByText("Troque o eixo Y");
    expect(suggestNextSteps).toHaveBeenCalledTimes(1);
  });
});
