import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC roles live inside a
// shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type {
  EcoAuditRequest,
  EcoAuditResult,
  EndOfLifeRouteInfo,
  MaterialDetail,
  MaterialListItem,
  TransportMode,
} from "@/lib/types";

const t = ptBR.eco;

const runEcoAudit =
  vi.fn<(payload: EcoAuditRequest) => Promise<EcoAuditResult>>();
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
  energy_unit: "MJ",
  carbon_unit: "kg de CO₂",
  carbon_unit_note:
    "O carbono sai em kg de CO₂ por declaração: a pegada é adimensional no catálogo.",
  recycling_credit_note:
    "A reciclagem aparece duas vezes e nunca se cancela. Este documento não abate crédito de reciclagem do total.",
};

const nav = vi.hoisted(() => ({ query: "", noProcess: false }));

// `PageHeader` reads the pathname for the route palette (D-49); without this it
// gets null and the header throws before anything renders.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/eco",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));

vi.mock("@/lib/api", () => ({
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
  nav.query = "material=7&massa=2";
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
    nav.query = "";
    await open();

    expect(
      await screen.findByShadowRole("button", { name: t.run }),
    ).toBeDisabled();
    // D-86: the disabled button says why.
    expect(await screen.findByText(t.blocked.mass)).toBeInTheDocument();
  });

  it("recolhe as premissas do uso, com cada valor no resumo", async () => {
    await open();

    const summary = await screen.findByText(t.useSummaryMobile("10", "200.000", "0,0025", "0,07"));
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);
  });

  it("aceita material e massa pela URL, que é como o dimensionamento liga aqui", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

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

    expect(await screen.findByText(t.noProcess)).toBeInTheDocument();
    expect(await screen.findByShadowRole("button", { name: t.run })).toBeDisabled();
    expect(screen.getByText(t.blocked.process)).toBeInTheDocument();
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

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

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
    await user.click(await screen.findByShadowRole("button", { name: t.run }));

    await waitFor(() => expect(runEcoAudit).toHaveBeenCalledTimes(1));
    const sent = runEcoAudit.mock.calls[0]![0]!.use;
    expect(sent.model).toBe("estatico");
    expect(sent.power_watts).toBeDefined();
    expect(sent.distance_km).toBeUndefined();
  });

  it("mostra as cinco fases na ordem em que a peça as vive", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

    // The result card is always on screen; the podium is what the run adds.
    await screen.findByText(t.dominanceTitle);
    // Scoped to the table, and read in order: "Material" is also the label of
    // the picker in step 1, so an unscoped query could pass on the wrong node —
    // and the order is itself the claim, since the phases are never sorted by
    // magnitude.
    const table = screen.getAllByRole("table")[0]!;
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

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

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

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

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

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

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

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

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
    const masses = await screen.findAllByShadowLabelText(t.unitMassLabel);
    await user.type(masses[0]!, "0,5".replace(",", "."));
    const quantities = await screen.findAllByShadowLabelText(t.quantityLabel);
    await user.clear(quantities[1]!);
    await user.type(quantities[1]!, "4");

    await user.click(await screen.findByShadowRole("button", { name: t.addLeg }));
    await user.click(await screen.findByShadowRole("button", { name: t.run }));

    await waitFor(() => expect(runEcoAudit).toHaveBeenCalledTimes(1));
    const sent = runEcoAudit.mock.calls[0]![0]!;
    expect(sent.components).toHaveLength(2);
    expect(sent.components![1]).toMatchObject({ unit_mass: 0.5, quantity: 4 });
    expect(sent.transport_legs).toHaveLength(2);
    expect(sent.transport_legs![1]).toMatchObject({ distance_km: 0 });

    await user.click(
      await screen.findByShadowRole("button", { name: t.removeComponent(2) }),
    );
    expect(screen.queryByText(t.componentLegend(2))).not.toBeInTheDocument();
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
    await user.click(await screen.findByShadowRole("button", { name: t.run }));

    const table = await screen.findByRole("table", { name: t.componentsTitle });
    expect(within(table).getByText("Tampa")).toBeInTheDocument();
    expect(within(table).getAllByText(reason).length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: t.legsTitle })).toBeInTheDocument();
  });

  it("leva o nome do material à ficha do registro, não a uma família", async () => {
    // /app/catalogo/[slug] é a família; um id ali cairia numa família inexistente.
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

    expect(
      await screen.findByRole("link", { name: "Liga Alumínio Demo A" }),
    ).toHaveAttribute("href", "/app/materiais/7");
  });

  it("diz em que unidade o carbono está e por quê", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

    // The result card is always on screen; the podium is what the run adds.
    await screen.findByText(t.dominanceTitle);
    expect(screen.getByText(/adimensional no catálogo/)).toBeInTheDocument();
  });

  it("carrega a nota de que a reciclagem não é abatida do total", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.run }));

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

    await user.click(await screen.findByShadowRole("button", { name: t.run }));
    await screen.findByText(t.dominanceTitle);

    const trigger = screen.getByRole("button", { name: ptBR.exports.title });
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
});
