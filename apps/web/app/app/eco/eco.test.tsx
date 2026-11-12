import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC roles live inside a
// shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { encodeUrlJson } from "@/lib/urlState";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { ecoPhaseI18n } from "@/lib/i18n-extras";
import type {
  EcoAuditRequest,
  EcoAuditResult,
  EcoComparisonRequest,
  EcoComparisonResult,
  EcoWaterfall,
  EndOfLifeRouteInfo,
  MaterialDetail,
  MaterialListItem,
  TransportMode,
} from "@/lib/types";

const t = ptBR.eco;

const runEcoAudit =
  vi.fn<(payload: EcoAuditRequest) => Promise<EcoAuditResult>>();
const compareEcoAudits =
  vi.fn<(payload: EcoComparisonRequest) => Promise<EcoComparisonResult>>();
const getDefaults = vi.fn(async () => (await import("@/lib/defaults.fixture")).defaultsFixture);
const downloadEcoAudit =
  vi.fn<
    (
      payload: EcoAuditRequest,
      format: string,
    ) => Promise<{ blob: Blob; filename: string }>
  >();

const materials: MaterialListItem[] = [
  {
    id: 7,
    name: "Liga Alumínio Demo A",
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 3, importado: 0, estimado: 1, missing: 0 },
    designations: [],
  },
];

const detail = {
  id: 7,
  name: "Liga Alumínio Demo A",
  processes: [
    {
      id: 1,
      slug: "fundicao-areia",
      name: "Fundição em areia",
      class_name: "Conformação",
    },
    {
      id: 2,
      slug: "forjamento",
      name: "Forjamento",
      class_name: "Conformação",
    },
  ],
} as unknown as MaterialDetail;

const modes: TransportMode[] = [
  {
    slug: "maritimo",
    name: "Marítimo (navio de carga)",
    description: null,
    energy_intensity: 0.16,
    carbon_intensity: 0.012,
    is_demo: true,
  },
  {
    slug: "aereo",
    name: "Aéreo (carga)",
    description: null,
    energy_intensity: 8.5,
    carbon_intensity: 0.62,
    is_demo: true,
  },
];

const routes: EndOfLifeRouteInfo[] = [
  {
    slug: "aterro",
    label: "Aterro",
    description: "A peça é enterrada.",
    energy_property: "energia_aterro",
    carbon_property: "co2_aterro",
    materials_with_factor: 0,
  },
  {
    slug: "reciclagem",
    label: "Reciclagem",
    description: "O material volta como matéria-prima equivalente.",
    energy_property: "energia_reciclagem",
    carbon_property: "co2_reciclagem",
    materials_with_factor: 1,
  },
  {
    slug: "reuso",
    label: "Reuso",
    description: "A peça é usada de novo como está.",
    energy_property: "energia_reuso",
    carbon_property: "co2_reuso",
    materials_with_factor: 0,
  },
];

const componentPhase = (phase: string, label: string, energy: number | null, reason: string | null = null) => ({
  phase,
  label,
  energy,
  carbon: energy === null ? null : energy / 10,
  detail: "",
  energy_missing: energy === null ? ["energia_reuso"] : [],
  carbon_missing: energy === null ? ["co2_reuso"] : [],
  energy_reason: reason,
  carbon_reason: reason,
});

const PHASES: [string, string][] = [
  ["material", "Material"],
  ["manufatura", "Manufatura"],
  ["transporte", "Transporte"],
  ["uso", "Uso"],
  ["fim-de-vida", "Fim de vida"],
];

/** The server's waterfall, written out by hand: `null` is an absent phase. */
function waterfall(
  quantity: "energy" | "carbon",
  unit: string,
  values: (number | null)[],
): EcoWaterfall {
  let running = 0;
  let complete = true;
  const steps = PHASES.map(([phase, label], index) => {
    const value = values[index] ?? null;
    if (value === null) {
      complete = false;
      return { phase, label, value, start: running, end: running, reason: "Dados ausentes: x" };
    }
    const start = running;
    running += value;
    return { phase, label, value, start, end: running, reason: null };
  });
  return {
    quantity,
    unit,
    steps,
    total: complete
      ? { phase: "total", label: "Total", value: running, start: 0, end: running, reason: null }
      : { phase: "total", label: "Total", value: null, start: null, end: null, reason: "Sem total" },
    domain: [0, Math.max(running, 1)],
  };
}

const result: EcoAuditResult = {
  components: [
    {
      name: "Liga Alumínio Demo A",
      material_id: 7,
      material_name: "Liga Alumínio Demo A",
      process_id: 1,
      process_name: "Fundição em areia",
      quantity: 1,
      unit_mass: 2,
      mass_in_part: 2,
      mass_bought: 2.5,
      scrap_fraction: 0.2,
      recycled_fraction: 0,
      end_of_life: "reciclagem",
      end_of_life_label: "Reciclagem",
      phases: [
        componentPhase("material", "Material", 525),
        componentPhase("manufatura", "Manufatura", 27.5),
        componentPhase("fim-de-vida", "Fim de vida", 48),
      ],
    },
  ],
  transport_legs: [
    {
      mode: modes[0]!,
      distance_km: 1500,
      energy: 2.7,
      carbon: 0.204,
      energy_missing: [],
      carbon_missing: [],
      energy_reason: null,
      carbon_reason: null,
    },
  ],
  material_id: 7,
  material_name: "Liga Alumínio Demo A",
  process_id: 1,
  process_name: "Fundição em areia",
  transport_mode: modes[0]!,
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
      detail: "massa comprada × [(1 − 0) × primária + 0 × reciclada]",
      energy_missing: [],
      carbon_missing: [],
      energy_reason: null,
      carbon_reason: null,
    },
    {
      phase: "manufatura",
      label: "Manufatura",
      energy: 27.5,
      carbon: 2.125,
      detail: "massa comprada × energia do processo por kg",
      energy_missing: [],
      carbon_missing: [],
      energy_reason: null,
      carbon_reason: null,
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
      detail: "massa da peça × distância percorrida × intensidade de uso",
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
  total_carbon: 106.779,
  energy_dominance: {
    phase: "uso",
    label: "Uso",
    share: 0.6237,
    refusal: null,
  },
  carbon_dominance: {
    phase: "uso",
    label: "Uso",
    share: 0.6555,
    refusal: null,
  },
  energy_waterfall: waterfall("energy", "MJ", [525, 27.5, 2.7, 1000, 48]),
  carbon_waterfall: waterfall("carbon", "kg de CO₂", [31.25, 2.125, 0.204, 70, 3.2]),
  energy_unit: "MJ",
  carbon_unit: "kg de CO₂",
  carbon_unit_note:
    "O carbono sai em kg de CO₂ por declaração: a pegada é adimensional no catálogo.",
  recycling_credit_note:
    "A reciclagem aparece duas vezes e nunca se cancela. Este documento não abate crédito de reciclagem do total.",
};

const nav = vi.hoisted(() => ({ noProcess: false }));

// The brief lives in the URL (D-216): a test opens the page at an address.
function setQuery(query: string) {
  window.history.replaceState(null, "", `/app/eco${query ? `?${query}` : ""}`);
}

// `PageHeader` reads the pathname for the route palette (D-49); without this it
// gets null and the header throws before anything renders.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/eco",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/lib/api", () => ({
  getDefaults: () => getDefaults(),
  compareEcoAudits: (payload: EcoComparisonRequest) => compareEcoAudits(payload),
  listMaterials: () => Promise.resolve(materials),
  getMaterial: () => Promise.resolve(nav.noProcess ? { ...detail, processes: [] } : detail),
  listTransportModes: () => Promise.resolve(modes),
  listEndOfLifeRoutes: () => Promise.resolve(routes),
  runEcoAudit: (payload: EcoAuditRequest) => runEcoAudit(payload),
  downloadEcoAudit: (payload: EcoAuditRequest, format: string) =>
    downloadEcoAudit(payload, format),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: EcoPage } = await import("./page");

async function open() {
  render(wrap(<EcoPage />));
  await screen.findByRole("heading", { name: t.productStep });
}

beforeEach(() => {
  nav.noProcess = false;
  setQuery("material=7&massa=2");
  getDefaults.mockClear();
  compareEcoAudits.mockReset();
  runEcoAudit.mockReset();
  runEcoAudit.mockResolvedValue(result);
  downloadEcoAudit.mockReset();
  downloadEcoAudit.mockResolvedValue({
    blob: new Blob(["x"]),
    filename: "auditoria-ambiental-do-produto.csv",
  });
});

describe("Auditoria ambiental", () => {
  it("não audita enquanto faltar a massa da peça", async () => {
    // A massa é o número que decide a resposta; inventá-la seria a ferramenta
    // escrevendo o briefing.
    setQuery("");
    await open();

    // D-86/D-219: no button to press; the result card says what is missing.
    expect(await screen.findByText(t.blocked.mass)).toBeInTheDocument();
    expect(screen.queryByShadowRole("button", { name: t.run })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(runEcoAudit).not.toHaveBeenCalled();
  });

  it("mostra as premissas do uso sempre abertas, com os padrões do servidor (D-216)", async () => {
    await open();

    // No disclosure: every premise is a field on screen, already filled.
    expect(await screen.findByShadowLabelText(new RegExp(`^${t.lifeLabel}`))).toHaveValue(10);
    expect(screen.getByShadowLabelText(new RegExp(`^${t.travelLabel}`))).toHaveValue(200000);
    expect(screen.getByShadowLabelText(t.intensityLabel)).toHaveValue(0.0025);
    expect(screen.getByShadowLabelText(t.carbonPerEnergyLabel)).toHaveValue(0.07);
    expect(screen.getByText("Premissas iniciais da auditoria.")).toBeInTheDocument();
  });

  it("usa os padrões que o servidor mandar, sem número copiado na tela", async () => {
    const { defaultsFixture } = await import("@/lib/defaults.fixture");
    getDefaults.mockResolvedValueOnce({
      ...defaultsFixture,
      eco: {
        ...defaultsFixture.eco,
        transport_distance_km: 321,
        mobile: { ...defaultsFixture.eco.mobile, distance_km: 123456 },
      },
    });
    const user = userEvent.setup();
    await open();

    expect(await screen.findByShadowLabelText(new RegExp(`^${t.travelLabel}`))).toHaveValue(123456);
    await waitFor(() => expect(runEcoAudit).toHaveBeenCalledTimes(1));
    expect(runEcoAudit.mock.calls[0]![0]).toMatchObject({
      transport_legs: [{ distance_km: 321 }],
      use: { distance_km: 123456 },
    });
    // At the server's value the premise leaves the address.
    expect(new URLSearchParams(window.location.search).has("percurso")).toBe(false);
  });

  it("restaura os padrões do servidor com um botão", async () => {
    setQuery("material=7&massa=2&vida=25&uso=estatico&potencia=90");
    const user = userEvent.setup();
    await open();

    expect(await screen.findByShadowLabelText(new RegExp(`^${t.lifeLabel}`))).toHaveValue(25);
    const restore = await screen.findByShadowRole("button", {
      name: ecoPhaseI18n.restoreDefaults,
    });
    expect(restore).toBeEnabled();
    await user.click(restore);

    await waitFor(() => expect(screen.getByShadowLabelText(new RegExp(`^${t.lifeLabel}`))).toHaveValue(10));
    const params = new URLSearchParams(window.location.search);
    for (const key of ["vida", "uso", "potencia"]) expect(params.has(key)).toBe(false);
    // The solver's seed is not a premise: it stays.
    expect(params.get("massa")).toBe("2");
  });

  it("aceita material e massa pela URL, que é como o dimensionamento liga aqui", async () => {
    const user = userEvent.setup();
    await open();

    await waitFor(() => expect(runEcoAudit).toHaveBeenCalledTimes(1));
    expect(runEcoAudit.mock.calls[0]![0]).toMatchObject({
      components: [{ material_id: 7, process_id: 1, unit_mass: 2, quantity: 1 }],
      transport_legs: [{ mode: "maritimo", distance_km: 1500 }],
    });
    // Never both shapes: a single-part field next to the list is refused.
    expect(runEcoAudit.mock.calls[0]![0]).not.toHaveProperty("material_id");
  });

  it("diz que não há processo, em vez de um seletor vazio", async () => {
    // D-24: um <select> vazio parecia controle que falhou ao carregar.
    nav.noProcess = true;
    await open();

    expect(await screen.findByText(t.noProcessShort)).toBeInTheDocument();
    expect(screen.getByText(t.blocked.process)).toBeInTheDocument();
    expect(runEcoAudit).not.toHaveBeenCalled();
  });

  it("só oferece processos que fazem este material", async () => {
    // O conjunto de candidatos é a junção do P0-2, não a tabela inteira. A
    // consulta conta em vez de exigir um nó só: o rótulo de uma opção do
    // `md-select` aparece no host e de novo dentro do shadow root.
    await open();

    await waitFor(() =>
      expect(
        screen.getAllByShadowText("Fundição em areia").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getAllByShadowText("Forjamento").length).toBeGreaterThan(0);
  });

  it("manda só os campos do modelo de uso escolhido", async () => {
    // O outro modelo é recusado pela API, nunca ignorado — e mandar os dois
    // calaria um número que o leitor digitou e a soma não conteria.
    const user = userEvent.setup();
    await open();

    await waitFor(() => expect(runEcoAudit).toHaveBeenCalledTimes(1));
    const sent = runEcoAudit.mock.calls[0]![0]!.use;
    expect(sent.model).toBe("movel");
    expect(sent.distance_km).toBeDefined();
    expect(sent.power_watts).toBeUndefined();
    expect(sent.duty_cycle).toBeUndefined();
  });

  it("troca os campos ao escolher o modelo estático", async () => {
    const user = userEvent.setup();
    await open();

    await userEvent.selectOptions(
      await screen.findByShadowRole("combobox", { name: t.useModelLabel }),
      "estatico",
    );

    expect(await screen.findByShadowLabelText(/Potência/)).toBeInTheDocument();

    // The brief was complete from the link, so the mobile model was asked about
    // first; the switch asks again, with the static fields only (D-219).
    await waitFor(() => expect(runEcoAudit.mock.calls.at(-1)![0]!.use.model).toBe("estatico"));
    const sent = runEcoAudit.mock.calls.at(-1)![0]!.use;
    expect(sent.model).toBe("estatico");
    expect(sent.power_watts).toBeDefined();
    expect(sent.distance_km).toBeUndefined();
  });

  it("mostra as cinco fases na ordem em que a peça as vive", async () => {
    const user = userEvent.setup();
    await open();

    // The result card is always on screen; the podium is what the run adds.
    await screen.findByText(t.dominanceTitle);
    // Scoped to the table, and read in order: "Material" is also the label of
    // the picker in step 1, so an unscoped query could pass on the wrong node —
    // and the order is itself the claim, since the phases are never sorted by
    // magnitude.
    // The result region's first table: the inputs are tables too now (D-219).
    const table = within(screen.getByRole("region", { name: ptBR.ui.resultPanel })).getAllByRole("table")[0]!;
    const firstCells = within(table)
      .getAllByRole("row")
      .map((row) => within(row).queryAllByRole("cell")[0]?.textContent)
      .filter(Boolean);
    expect(firstCells).toEqual([
      "Material",
      "Manufatura",
      "Transporte",
      "Uso",
      "Fim de vida",
      t.totalLabel,
    ]);
  });

  it("nomeia a fase dominante nas duas grandezas", async () => {
    // A resposta não é o total: é qual fase domina.
    const user = userEvent.setup();
    await open();

    await screen.findByText(t.dominanceTitle);
    expect(screen.getByText(t.dominanceEnergy)).toBeInTheDocument();
    expect(screen.getByText(t.dominanceCarbon)).toBeInTheDocument();
    // Duas vezes "Uso": um pódio para cada grandeza. A fração vem em pt-BR
    // (D-30), e o teste lê o texto renderizado em vez de adivinhar o
    // arredondamento.
    expect(screen.getAllByText(/Uso/).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(new RegExp(`% ${t.dominanceShare}`)).length,
    ).toBe(2);
  });

  it("escreve o motivo no lugar de uma célula vazia", async () => {
    // D-24: ausência é o quarto estado, com rótulo escrito — e cada grandeza
    // tem o seu, porque leem dados catalogados diferentes.
    const user = userEvent.setup();
    runEcoAudit.mockResolvedValue({
      ...result,
      phases: result.phases.map((phase) =>
        phase.phase === "transporte"
          ? {
              ...phase,
              carbon: null,
              carbon_missing: ["intensidade-carbono-do-modal"],
              carbon_reason: "Dados ausentes: intensidade-carbono-do-modal",
            }
          : phase,
      ),
      total_carbon: null,
      carbon_dominance: {
        phase: null,
        label: null,
        share: null,
        refusal:
          "Sem fase dominante em carbono: Transporte não pôde ser calculada.",
      },
    });
    await open();

    // The result card is always on screen; the podium is what the run adds.
    await screen.findByText(t.dominanceTitle);
    // O motivo aparece tanto na célula da tabela quanto na barra proporcional do PhaseBars
    expect(
      screen.getAllByText(/Dados ausentes: intensidade-carbono-do-modal/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Sem fase dominante em carbono/),
    ).toBeInTheDocument();
  });

  it("recusa somar quatro das cinco fases", async () => {
    const user = userEvent.setup();
    runEcoAudit.mockResolvedValue({
      ...result,
      total_energy: null,
      total_carbon: null,
    });
    await open();

    // The result card is always on screen; the podium is what the run adds.
    await screen.findByText(t.dominanceTitle);
    expect(
      screen.getAllByText(new RegExp("não é um total")).length,
    ).toBeGreaterThan(0);
  });

  it("mostra a massa comprada ao lado da massa da peça", async () => {
    // A diferença entre as duas é o refugo, e é por isso que a fase de material
    // é maior do que o leitor esperava.
    const user = userEvent.setup();
    await open();

    await screen.findByText(`${t.massBought}:`);
    expect(screen.getByText(/2,5 kg/)).toBeInTheDocument();
  });

  it("adiciona e remove componentes e trechos, e manda a lista inteira", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.addComponent }));
    // O segundo componente começa sem massa: a auditoria espera e diz por quê.
    expect(
      await screen.findByText(t.blocked.component(2, t.blocked.mass)),
    ).toBeInTheDocument();
    const first = t.componentLegend(1);
    const second = t.componentLegend(2);
    await user.type(
      await screen.findByShadowLabelText(new RegExp(`^${t.cellLabel(t.colUnitMass, second)}`)),
      "0.5",
    );
    const quantity = await screen.findByShadowLabelText(t.cellLabel(t.colQuantity, second));
    await user.clear(quantity);
    await user.type(quantity, "4");
    expect(screen.getByShadowLabelText(new RegExp(`^${t.cellLabel(t.colUnitMass, first)}`))).toHaveValue(2);

    await user.click(await screen.findByShadowRole("button", { name: t.addLeg }));

    await waitFor(() => {
      const sent = runEcoAudit.mock.calls.at(-1)![0]!;
      expect(sent.components).toHaveLength(2);
      expect(sent.transport_legs).toHaveLength(2);
    });
    const sent = runEcoAudit.mock.calls.at(-1)![0]!;
    expect(sent.components![1]).toMatchObject({ unit_mass: 0.5, quantity: 4 });
    expect(sent.transport_legs![1]).toMatchObject({ distance_km: 0 });

    // D-219: removed from the row's ⋯, as in any table edited in place.
    await user.click(screen.getByRole("button", { name: ptBR.ds.rowActions(second) }));
    await user.click(screen.getByRole("menuitem", { name: ptBR.ds.removeRow }));
    expect(screen.queryByShadowLabelText(t.cellLabel(t.colQuantity, second))).toBeNull();
  });

  it("marca a rota sem fator no catálogo em vez de escondê-la", async () => {
    await open();
    await waitFor(() =>
      expect(
        screen.getAllByShadowText(`Reuso — ${t.eolNoFactor}`).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getAllByShadowText("Reciclagem").length).toBeGreaterThan(0);
  });

  it("mostra o detalhe por componente com o motivo escrito da ausência", async () => {
    const user = userEvent.setup();
    const reason = "Dados ausentes: energia_reuso. A rota Reuso fica indisponível";
    runEcoAudit.mockResolvedValue({
      ...result,
      components: [
        ...result.components,
        {
          ...result.components[0]!,
          name: "Tampa",
          end_of_life: "reuso",
          end_of_life_label: "Reuso",
          phases: [
            componentPhase("material", "Material", 100),
            componentPhase("manufatura", "Manufatura", 10),
            componentPhase("fim-de-vida", "Fim de vida", null, reason),
          ],
        },
      ],
    });
    await open();

    const table = await screen.findByRole("table", { name: t.componentsTitle });
    expect(within(table).getByText("Tampa")).toBeInTheDocument();
    expect(within(table).getAllByText(reason).length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: t.legsTitle })).toBeInTheDocument();
  });

  it("leva o nome do material à ficha do registro, não a uma família", async () => {
    // /app/catalogo/[slug] é a família; um id ali cairia numa família inexistente.
    const user = userEvent.setup();
    await open();

    expect(
      await screen.findByRole("link", { name: "Liga Alumínio Demo A" }),
    ).toHaveAttribute("href", "/app/materiais/7");
  });

  it("diz em que unidade o carbono está e por quê", async () => {
    const user = userEvent.setup();
    await open();

    // The result card is always on screen; the podium is what the run adds.
    await screen.findByText(t.dominanceTitle);
    expect(screen.getByText(/adimensional no catálogo/)).toBeInTheDocument();
  });

  it("carrega a nota de que a reciclagem não é abatida do total", async () => {
    const user = userEvent.setup();
    await open();

    // The result card is always on screen; the podium is what the run adds.
    await screen.findByText(t.dominanceTitle);
    expect(
      screen.getByText(/não abate crédito de reciclagem/),
    ).toBeInTheDocument();
  });

  it("exporta o briefing que gerou o resultado, por um menu Exportar (D-91)", async () => {
    // jsdom has no object URLs; the real `save` needs them.
    const created = vi.fn(() => "blob:eco");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const user = userEvent.setup();
    await open();
    await screen.findByText(t.dominanceTitle);

    // Each waterfall has its own "Exportar" (the figure's, D-91); the audit's
    // file menu is the first in reading order.
    const trigger = screen.getAllByRole("button", { name: ptBR.exports.title })[0]!;
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await user.click(trigger);
    // Todos os formatos num menu só, nunca uma fileira de botões.
    for (const label of [
      ptBR.exports.csv,
      ptBR.exports.xlsx,
      ptBR.exports.docx,
      ptBR.exports.pptx,
      ptBR.exports.html,
    ]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(label) })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.xlsx) }));

    await waitFor(() => expect(downloadEcoAudit).toHaveBeenCalledTimes(1));
    expect(downloadEcoAudit.mock.calls[0]![1]).toBe("xlsx");
    // O mesmo briefing que o servidor auditou, não o que os campos dizem agora.
    expect(downloadEcoAudit.mock.calls[0]![0]).toEqual(runEcoAudit.mock.calls[0]![0]);
    await waitFor(() => expect(created).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("desenha a cascata por fase com os degraus do servidor, e a fase ausente como lacuna", async () => {
    // D-216: a fase sem dado não é um degrau de altura zero — é um marcador
    // tracejado com o motivo escrito, e o total é recusado.
    runEcoAudit.mockResolvedValue({
      ...result,
      carbon_waterfall: waterfall("carbon", "kg de CO₂", [31.25, null, 0.204, 70, 3.2]),
    });
    const user = userEvent.setup();
    await open();

    const energy = await screen.findByRole("figure", {
      name: ecoPhaseI18n.waterfall.figureLabel("energia"),
    });
    // Five phases and the total, each one a labelled mark.
    expect(within(energy).getAllByRole("img")).toHaveLength(6);
    expect(
      within(energy).getByRole("img", {
        name: ecoPhaseI18n.waterfall.stepAria("Material", "525 MJ", "525 MJ"),
      }),
    ).toBeInTheDocument();
    expect(within(energy).getByRole("img", { name: /^Total: 1\.603,2 MJ$/ })).toBeInTheDocument();

    const carbon = await screen.findByRole("figure", {
      name: ecoPhaseI18n.waterfall.figureLabel("carbono"),
    });
    expect(
      within(carbon).getByRole("img", {
        name: ecoPhaseI18n.waterfall.absentAria("Manufatura", "Dados ausentes: x"),
      }),
    ).toBeInTheDocument();
    expect(within(carbon).getByRole("img", { name: /^Total: sem dado\./ })).toBeInTheDocument();
  });

  it("guarda o produto na URL e o reabre igual", async () => {
    const user = userEvent.setup();
    const { unmount } = render(wrap(<EcoPage />));
    await screen.findByRole("heading", { name: t.productStep });

    await user.click(await screen.findByShadowRole("button", { name: t.addComponent }));
    await user.click(await screen.findByShadowRole("button", { name: t.addLeg }));
    // D-219: each cell names its column and its row.
    const second = await screen.findByShadowLabelText(
      new RegExp(`^${t.cellLabel(t.colUnitMass, t.componentLegend(2))}`),
    );
    await user.clear(second);
    await user.type(second, "0.5");

    const params = new URLSearchParams(window.location.search);
    expect(params.get("componentes")).not.toBeNull();
    expect(params.get("trechos")).not.toBeNull();
    unmount();

    // A fresh render of the same address: the two components and two legs are back.
    render(wrap(<EcoPage />));
    await screen.findByRole("heading", { name: t.productStep });
    expect(await screen.findAllByShadowLabelText(new RegExp(`^${t.colQuantity}`))).toHaveLength(2);
    expect(screen.getByShadowLabelText(t.cellLabel(t.colMode, t.legLegend(2)))).toBeInTheDocument();
    // The first line keeps the solver's seed; the second holds what was typed.
    expect(
      screen.getByShadowLabelText(new RegExp(`^${t.cellLabel(t.colUnitMass, t.componentLegend(1))}`)),
    ).toHaveValue(2);
    expect(
      screen.getByShadowLabelText(new RegExp(`^${t.cellLabel(t.colUnitMass, t.componentLegend(2))}`)),
    ).toHaveValue(0.5);
  });

  it("ignora na URL uma lista de componentes malformada, sem quebrar a tela", async () => {
    setQuery("componentes=isto-nao-e-json&modo=outro");
    await open();

    // Back to the defaults: one blank component, individual view.
    expect(await screen.findAllByShadowLabelText(new RegExp(`^${t.colQuantity}`))).toHaveLength(1);
    expect(screen.getByText(t.blocked.mass)).toBeInTheDocument();
  });
});

describe("Auditoria ambiental: cenários A e B (D-216)", () => {
  const scenario = (material: string, mass: string) => ({
    material,
    process: "",
    mass,
    recycled: "0",
    endOfLife: "reciclagem" as const,
  });
  const compared: EcoComparisonResult = {
    material_a: { ...result, material_name: "Liga Alumínio Demo A" },
    material_b: { ...result, material_name: "Aço Demo B", total_energy: 2000 },
    delta_energy: 396.8,
    delta_energy_percent: 24.75,
    delta_carbon: 10,
    delta_carbon_percent: 9.36,
    winner_energy: "material_a",
    winner_carbon: "material_a",
    // Deliberately NOT B − A of the two audits above: the table must print what
    // the server sent, never subtract on its own.
    phase_deltas: PHASES.map(([phase, label], index) => ({
      phase,
      label,
      delta_energy: index === 0 ? 4242 : null,
      delta_carbon: null,
    })),
  };

  beforeEach(() => {
    compareEcoAudits.mockResolvedValue(compared);
  });

  it("abre os dois cenários pela URL e compara com o que ela descreve", async () => {
    setQuery(
      `modo=compare&a=${encodeUrlJson(scenario("7", "3"))}&b=${encodeUrlJson(scenario("7", "4"))}&modal=aereo&distancia=900`,
    );
    const user = userEvent.setup();
    render(wrap(<EcoPage />));
    await screen.findByRole("heading", { name: t.materialA });
    expect(screen.getByRole("heading", { name: t.materialB })).toBeInTheDocument();

    // The same component twice: two scenarios, two mass fields.
    const masses = await screen.findAllByShadowLabelText(new RegExp(`^${t.massLabel}`));
    expect(masses).toHaveLength(2);
    expect(masses[0]).toHaveValue(3);
    expect(masses[1]).toHaveValue(4);
    await waitFor(() => expect(compareEcoAudits).toHaveBeenCalled());
    expect(compareEcoAudits.mock.calls[0]![0]).toMatchObject({
      material_a: { material_id: 7, process_id: 1, part_mass: 3 },
      material_b: { material_id: 7, process_id: 1, part_mass: 4 },
      transport_mode: "aereo",
      transport_distance_km: 900,
    });
    expect(runEcoAudit).not.toHaveBeenCalled();
  });

  it("escreve só o cenário editado na URL, sem tocar no outro", async () => {
    setQuery(`modo=compare&a=${encodeUrlJson(scenario("7", "3"))}`);
    const user = userEvent.setup();
    render(wrap(<EcoPage />));
    const masses = await screen.findAllByShadowLabelText(new RegExp(`^${t.massLabel}`));

    await user.clear(masses[1]!);
    await user.type(masses[1]!, "6");

    const params = new URLSearchParams(window.location.search);
    expect(params.get("modo")).toBe("compare");
    expect(JSON.parse(atob(params.get("b")!.replace(/-/g, "+").replace(/_/g, "/")))).toMatchObject({
      mass: "6",
    });
    expect(JSON.parse(atob(params.get("a")!.replace(/-/g, "+").replace(/_/g, "/")))).toMatchObject({
      mass: "3",
    });
  });

  it("imprime a diferença por fase que o servidor mandou, sem subtrair no navegador", async () => {
    setQuery(`modo=compare&a=${encodeUrlJson(scenario("7", "3"))}`);
    const user = userEvent.setup();
    render(wrap(<EcoPage />));

    await screen.findByText(t.winnerEnergy);
    const table = screen.getAllByRole("table")[0]!;
    // 4.242 is the server's delta; B − A of the two audits would be 0.
    expect(within(table).getByText(/\+4\.242 MJ/)).toBeInTheDocument();
    // A phase either side could not compute is a written absence, not a zero.
    expect(within(table).getAllByText(t.noDelta).length).toBeGreaterThan(0);
    // The winners and the premises that fed both scenarios are on screen.
    expect(screen.getByText(t.winnerEnergy)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: ecoPhaseI18n.premises.title })).toBeInTheDocument();
  });
});
