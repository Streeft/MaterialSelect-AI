import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
// Ver a nota em components/layout/layout.test.tsx: papéis do MWC (as abas, o
// select) vivem dentro de um shadow root, invisíveis para as consultas normais.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { suggestText } from "@/lib/i18n-suggest";
import { installWideViewport } from "@/lib/testing/viewport";
import type {
  SuggestionsOut,
  ApplicationArchetype,
  BatteryChemistry,
  BatteryComparisonResult,
  PackDesignResult,
  RagoneResult,
} from "@/lib/types";

const t = ptBR.battery;

/**
 * As fixturas são **o contrato do backend**, campo por campo.
 *
 * A primeira versão desta tela foi escrita contra um contrato imaginado — nomes
 * como `cell_nominal_voltage_v` e rótulos térmicos em inglês —, e os testes
 * passavam porque afirmavam o mesmo engano que o código. Daí a regra aqui: toda
 * fixtura é tipada pelo tipo compartilhado, nunca por um objeto solto, e é o
 * compilador que impede a tela e a API de divergirem de novo.
 */
const lfp: BatteryChemistry = {
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
  description: "Estabilidade térmica alta e vida em ciclos longa.",
  advantages: ["Vida em ciclos longa"],
  limitations: ["Energia específica menor"],
  typical_applications: ["Armazenamento estacionário"],
  citation: "Linden's Handbook of Batteries (4ª ed.)",
  source: "Literatura de baterias (compilação)",
};

const nmc: BatteryChemistry = {
  ...lfp,
  slug: "nmc-811",
  name: "NMC-811 (alto níquel)",
  formula: "LiNi0.8Mn0.1Co0.1O2",
  nominal_voltage: 3.7,
  specific_energy: 280,
  energy_density: 700,
  cycle_life: 1500,
  cell_cost_per_kwh: 105,
  thermal_safety: "MODERADA",
  thermal_runaway_temp_c: 190,
  citation: "Doeff et al. (Chem. Rev. 2020)",
};

const mockChemistries: BatteryChemistry[] = [lfp, nmc];

const mockArchetypes: ApplicationArchetype[] = [
  {
    slug: "ve_urbano",
    name: "Veículo elétrico urbano",
    description: "Automóvel de passeio para ciclo misto.",
    target_voltage: 400,
    target_energy_kwh: 50,
    target_power_kw: 120,
    target_dod: 0.85,
    recommended_chemistries: ["lfp", "nmc-811"],
    default_cell_capacity_ah: 100,
  },
];

const mockDesignResult: PackDesignResult = {
  chemistry: lfp,
  series_cells_ns: 125,
  parallel_strings_np: 2,
  total_cells: 250,
  cell_capacity_ah: 100,
  cell_energy_wh: 320,
  cell_mass_kg: 2.0,
  cell_volume_l: 0.914,
  cell_peak_power_w: 1600,
  nominal_voltage_v: 400.0,
  pack_capacity_ah: 200.0,
  gross_energy_kwh: 80.0,
  usable_energy_kwh: 68.0,
  peak_power_kw: 400.0,
  max_continuous_discharge_c_rate: 3.0,
  dod: 0.85,
  cells_mass_kg: 500.0,
  pack_mass_kg: 769.23,
  mass_overhead_kg: 269.23,
  mass_packing_factor: 0.65,
  cells_volume_l: 228.57,
  pack_volume_l: 457.14,
  volume_overhead_l: 228.57,
  volume_packing_factor: 0.5,
  pack_specific_energy_wh_kg: 104.0,
  pack_energy_density_wh_l: 175.0,
  cell_cost_total_usd: 6000.0,
  pack_cost_total_usd: 8571.43,
  cost_overhead_usd: 2571.43,
  cost_packing_factor: 0.7,
  cycle_life_at_dod: 3294,
  levelized_cost_per_kwh_cycle: 0.0383,
  thermal_safety: "ALTA",
  thermal_guidelines: [
    "Alta estabilidade térmica: arrefecimento a ar forçado é suficiente.",
  ],
};

const mockComparisonResult: BatteryComparisonResult = {
  target_voltage: 400,
  target_energy_kwh: 50,
  target_power_kw: 120,
  dod: 0.85,
  items: [
    {
      chemistry_slug: "lfp",
      chemistry_name: lfp.name,
      pack_mass_kg: 769.23,
      pack_volume_l: 457.14,
      pack_cost_usd: 8571.43,
      cycle_life: 3294,
      levelized_cost_per_kwh_cycle: 0.0383,
      pack_specific_energy_wh_kg: 104.0,
      pack_energy_density_wh_l: 175.0,
      thermal_safety: "ALTA",
      series_cells_ns: 125,
      parallel_strings_np: 2,
      total_cells: 250,
      usable_energy_kwh: 68.0,
    },
    {
      chemistry_slug: "nmc-811",
      chemistry_name: nmc.name,
      pack_mass_kg: 439.56,
      pack_volume_l: 228.57,
      pack_cost_usd: 12000.0,
      cycle_life: 1412,
      levelized_cost_per_kwh_cycle: 0.1248,
      pack_specific_energy_wh_kg: 182.0,
      pack_energy_density_wh_l: 350.0,
      thermal_safety: "MODERADA",
      series_cells_ns: 109,
      parallel_strings_np: 4,
      total_cells: 436,
      usable_energy_kwh: 70.0,
    },
  ],
  lightest_slug: "nmc-811",
  most_compact_slug: "nmc-811",
  lowest_upfront_cost_slug: "lfp",
  most_durable_slug: "lfp",
  lowest_levelized_cost_slug: "lfp",
  safest_slug: "lfp",
  technical_summary:
    "Para 50 kWh e 120 kW: LFP oferece o menor custo nivelado, enquanto NMC-811 oferece a menor massa total.",
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/baterias",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockRagone: RagoneResult = {
  points: [
    {
      slug: "lfp",
      name: "LFP (fosfato de ferro-lítio)",
      specific_energy: 160,
      specific_power: 1500,
      citation: "Linden's Handbook of Batteries (4ª ed.)",
      source: "Literatura de baterias (compilação)",
    },
  ],
  x_axis: {
    key: "specific_energy",
    label: "Energia específica da célula",
    unit: "Wh/kg",
    scale: "log",
    min_value: 80,
    max_value: 320,
  },
  y_axis: {
    key: "specific_power",
    label: "Potência específica da célula (base não declarada)",
    unit: "W/kg",
    scale: "log",
    min_value: 750,
    max_value: 3000,
  },
  iso_time: [],
  excluded: [],
  power_basis_note: "Base da potência não declarada.",
};

vi.mock("react-plotly.js", () => ({
  default: () => <div data-testid="plotly-mock" />,
}));

const getDefaults = vi.fn(async () => (await import("@/lib/defaults.fixture")).defaultsFixture);
const designBatteryPack = vi.hoisted(() => vi.fn());
const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  getDefaults: () => getDefaults(),
  getBatteryRagone: () => Promise.resolve(mockRagone),
  listBatteryChemistries: () => Promise.resolve(mockChemistries),
  listBatteryArchetypes: () => Promise.resolve(mockArchetypes),
  designBatteryPack: (payload: unknown) => designBatteryPack(payload),
  compareBatteries: () => Promise.resolve(mockComparisonResult),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: BateriasPage } = await import("./page");

describe("BateriasPage (dimensionamento de bateria)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    designBatteryPack.mockImplementation(() => Promise.resolve(mockDesignResult));
    // The brief and the tab live in the URL (D-212): each test starts clean.
    window.history.replaceState(null, "", "/app/baterias");
  });

  it("guarda o requisito e a aba na URL, e um link reabre o mesmo pack", async () => {
    const user = userEvent.setup();
    const { unmount } = render(wrap(<BateriasPage />));

    const energy = await screen.findByShadowRole("spinbutton", { name: `${t.targetEnergy} (kWh)` });
    await user.clear(energy);
    await user.type(energy, "75");
    await user.click(await screen.findByShadowRole("tab", { name: t.tabCompare }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("energia")).toBe("75");
    expect(params.get("aba")).toBe("compare");
    // Typing a requirement by hand leaves the preset.
    expect(params.get("arquetipo")).toBe("custom");

    unmount();
    render(wrap(<BateriasPage />));
    expect(await screen.findByShadowRole("spinbutton", { name: `${t.targetEnergy} (kWh)` })).toHaveValue(75);
    expect(await screen.findByShadowRole("tab", { name: t.tabCompare })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("separa parâmetros e resultado em duas regiões nomeadas e passa no axe", async () => {
    const { container } = render(wrap(<BateriasPage />));
    expect(await screen.findByRole("region", { name: ptBR.ui.paramsPanel })).toBeDefined();
    expect(screen.getByRole("region", { name: ptBR.ui.resultPanel })).toBeDefined();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("renderiza cabeçalho, requisitos e as duas abas", async () => {
    render(wrap(<BateriasPage />));

    expect(await screen.findByRole("heading", { name: t.title })).toBeDefined();
    expect(screen.getByText(t.subtitle)).toBeDefined();
    expect(
      screen.getByRole("heading", { name: t.archetypesTitle }),
    ).toBeDefined();

    expect(await screen.findByShadowRole("tab", { name: t.tabDesign })).toBeDefined();
    expect(await screen.findByShadowRole("tab", { name: t.tabCompare })).toBeDefined();
  });

  it("a aba Ragone desenha o gráfico com a tabela de origem, sem depender dos requisitos", async () => {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));

    await user.click(await screen.findByShadowRole("tab", { name: t.tabRagone }));

    expect(await screen.findByRole("heading", { name: new RegExp(t.ragone.title) })).toBeDefined();
    expect(screen.getByText("Base da potência não declarada.")).toBeDefined();
    expect(screen.getByTestId("plotly-mock")).toBeDefined();
  });

  it("exibe a arquitetura Ns × Np e os balanços do pack dimensionado", async () => {
    render(wrap(<BateriasPage />));

    await waitFor(() => {
      expect(screen.getByText("125")).toBeDefined();
    });

    expect(screen.getByText(t.seriesLabel)).toBeDefined();
    expect(screen.getByText(t.parallelLabel)).toBeDefined();
    expect(screen.getByText(t.totalCellsLabel)).toBeDefined();

    expect(screen.getByRole("heading", { name: t.massBreakdown })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: t.volumeBreakdown }),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: t.costBreakdown })).toBeDefined();
    expect(screen.getByRole("heading", { name: t.thermalTitle })).toBeDefined();
  });

  it("as três premissas de empacotamento ficam visíveis e editáveis", async () => {
    // O fator mássico, o volumétrico e o de custo dividem a massa, o volume e o
    // investimento do pack. Escondê-los deixaria três números mexendo na
    // resposta sem que ninguém os visse — é a regra de premissa do D-65.
    render(wrap(<BateriasPage />));

    expect(
      await screen.findByShadowLabelText(t.massPackingFactor),
    ).toBeDefined();
    expect(screen.getByShadowLabelText(t.volumePackingFactor)).toBeDefined();
    expect(screen.getByShadowLabelText(t.costPackingFactor)).toBeDefined();
    // D-86: folded, but every value stays on screen in the summary.
    const summary = screen.getByText(t.premisesSummary(t.typicalCell, "0,7", "0,6", "0,75"));
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);
  });

  it("diz o que falta quando um requisito está vazio, e abre a premissa que bloqueia", async () => {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));

    const massPacking = await screen.findByShadowLabelText(t.massPackingFactor);
    await user.clear(massPacking);
    await user.type(massPacking, "1.5");

    expect(
      await screen.findByText(t.blocked.fraction(t.massPackingFactor)),
    ).toBeDefined();
    const summary = screen.getByText(t.premisesSummary(t.typicalCell, "1,5", "0,6", "0,75"));
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(true);
  });

  it("declara de onde vieram os números da química e em que moeda", async () => {
    // Energia específica, vida em ciclos e custo por kWh são dado medido, não
    // argumento: o princípio 1 exige que a tela diga a origem. E dinheiro não
    // está em sistema de unidades nenhum (D-65) — a moeda é dita em palavras.
    render(wrap(<BateriasPage />));

    expect(await screen.findByText(t.citationLabel)).toBeDefined();
    expect(screen.getByText(lfp.citation!)).toBeDefined();
    expect(screen.getByText(t.sourceLabel)).toBeDefined();
    expect(screen.getByText(lfp.source!)).toBeDefined();
    expect(screen.getAllByText(t.currencyNote).length).toBeGreaterThan(0);
  });

  it("o custo nivelado sai com vírgula decimal, não com ponto", async () => {
    // D-30: `toFixed` sempre escreve ponto, e a tabela acabaria com "3.900" de
    // milhar ao lado de "0.0383" de decimal — o mesmo glifo com dois sentidos.
    render(wrap(<BateriasPage />));

    await waitFor(() => {
      expect(screen.getAllByText(/US\$ 0,0383/).length).toBeGreaterThan(0);
    });
  });

  it("navega para a aba de trade-offs e mostra o pódio e a tabela", async () => {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));

    const compareTab = await screen.findByShadowRole("tab", {
      name: t.tabCompare,
    });
    await user.click(compareTab);

    await waitFor(() => {
      expect(screen.getByText(t.lightestBadge)).toBeDefined();
    });
    expect(screen.getByText(t.cheapestBadge)).toBeDefined();
    expect(screen.getByText(t.safestBadge)).toBeDefined();

    // O pódio nomeia o vencedor de cada faceta, e as facetas discordam: a mais
    // leve não é a de menor custo inicial. É essa discordância que a comparação
    // existe para mostrar.
    expect(screen.getAllByText(nmc.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(lfp.name).length).toBeGreaterThan(0);

    expect(
      screen.getByText(mockComparisonResult.technical_summary),
    ).toBeDefined();

    expect(
      screen.getByRole("columnheader", { name: t.tableColChem }),
    ).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: t.tableColMass }),
    ).toBeDefined();
  });

  it("abre com o arquétipo e os fatores de empacotamento que o servidor mandar (D-216)", async () => {
    // O front já carregou 0,65 / 0,50 / 0,70 enquanto o schema validava com
    // 0,70 / 0,60 / 0,75: a cópia divergiu e ninguém viu. Agora não há cópia.
    const { defaultsFixture } = await import("@/lib/defaults.fixture");
    getDefaults.mockResolvedValueOnce({
      ...defaultsFixture,
      baterias: {
        ...defaultsFixture.baterias,
        energy_kwh: 33,
        mass_packing_factor: 0.8,
        volume_packing_factor: 0.55,
        cost_packing_factor: 0.9,
      },
    });
    render(wrap(<BateriasPage />));

    expect(await screen.findByShadowRole("spinbutton", { name: `${t.targetEnergy} (kWh)` })).toHaveValue(33);
    expect(screen.getByText(t.premisesSummary(t.typicalCell, "0,8", "0,55", "0,9"))).toBeDefined();
    // The archetype the server names is a real option, so the select shows it.
    expect(
      await screen.findByShadowRole("combobox", { name: t.archetypesTitle }),
    ).toHaveValue("ve_urbano");
    // Server defaults leave the address clean.
    expect(new URLSearchParams(window.location.search).has("emp_massa")).toBe(false);
  });

  it("espera os padrões do servidor: com falha, mostra o erro e deixa tentar de novo", async () => {
    getDefaults.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));

    const alert = await screen.findByRole("alert");
    await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.retry }));

    expect(await screen.findByRole("heading", { name: t.archetypesTitle })).toBeDefined();
    expect(alert).toBeDefined();
  });

  it("a aba Ragone destaca a química escolhida e a nomeia em texto", async () => {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));

    await user.click(await screen.findByShadowRole("tab", { name: t.tabRagone }));

    expect(await screen.findByText(t.ragone.highlightNote("LFP (fosfato de ferro-lítio)"))).toBeDefined();
  });

  it("nomeia a arquitetura Ns × Np e as regiões de resultado para leitores de tela", async () => {
    render(wrap(<BateriasPage />));

    expect(
      await screen.findByRole("group", { name: t.architectureAria(125, 2, 250) }),
    ).toBeDefined();
    expect(screen.getByRole("region", { name: t.designResultAria })).toBeDefined();
  });

  it("marca a química escolhida na tabela de comparação com aria-current", async () => {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));
    await user.click(await screen.findByShadowRole("tab", { name: t.tabCompare }));

    const row = (await screen.findAllByRole("row")).find((r) => r.getAttribute("aria-current") === "true");
    expect(row).toBeDefined();
    expect(row!.textContent).toContain(lfp.name);
    expect(screen.getByRole("region", { name: t.compareResultAria })).toBeDefined();
  });
});

describe("BateriasPage — Sugestão da IA (D-230)", () => {
  installWideViewport();
  const answer: SuggestionsOut = {
    tool: "baterias",
    summary: "Duas ideias para o pacote.",
    suggestions: [
      {
        title: "Experimente NMC-811",
        body: "Com os mesmos requisitos, dá o pacote mais leve.",
        actions: [
          { type: "set_param", label: "química: NMC-811", name: "chemistry_slug", value: "nmc-811" },
          { type: "set_param", label: "química: inventada", name: "chemistry_slug", value: "ferro-ar" },
        ],
      },
      {
        title: "Volte o empacotamento ao padrão",
        body: "O valor de partida é 0,65.",
        actions: [
          { type: "set_param", label: "fator de empacotamento (massa): 0,65", name: "mass_packing_factor", value: 0.65 },
          { type: "set_param", label: "potência alvo: 90", name: "target_power_kw", value: 90 },
          { type: "set_param", label: "campo sem tela", name: "cell_capacity_ah", value: 3 },
          { type: "open_route", label: "Ver os cuidados térmicos", path: "/app/baterias" },
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

  beforeEach(() => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
    window.history.replaceState(null, "", "/app/baterias");
  });

  async function ask() {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));
    await screen.findByShadowRole("spinbutton", { name: `${t.targetEnergy} (kWh)` });
    await waitFor(() => expect(designBatteryPack).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Experimente NMC-811");
    return user;
  }

  it("só consulta ao clicar, com o pedido de dimensionamento que a tela mostra", async () => {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));
    await screen.findByShadowRole("spinbutton", { name: `${t.targetEnergy} (kWh)` });
    await waitFor(() => expect(designBatteryPack).toHaveBeenCalled());
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Experimente NMC-811");
    expect(suggest.fn).toHaveBeenCalledTimes(1);
    expect(suggest.fn).toHaveBeenCalledWith("baterias", { request: designBatteryPack.mock.calls[0]![0] });
    expect(screen.getByRole("link", { name: "Ver os cuidados térmicos" })).toHaveAttribute(
      "href",
      "/app/baterias",
    );
  });

  it("trocar a química muda o select e o endereço; o que não existe não é botão", async () => {
    const user = await ask();
    expect(screen.queryByRole("button", { name: "química: inventada" })).toBeNull();
    expect(screen.queryByRole("button", { name: "campo sem tela" })).toBeNull();
    // Nothing applied by the answer arriving.
    expect(new URLSearchParams(window.location.search).has("quimica")).toBe(false);

    await user.click(screen.getByRole("button", { name: "química: NMC-811" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("quimica")).toBe("nmc-811"));
    const select = screen.getByShadowRole("combobox", { name: t.chemistryTitle });
    expect(select).toHaveValue("nmc-811");
    await waitFor(() => expect(select).toHaveAttribute("data-ai-changed", "true"));
    // Like a hand edit, it leaves the preset.
    expect(new URLSearchParams(window.location.search).get("arquetipo")).toBe("custom");
    await waitFor(() =>
      expect(designBatteryPack.mock.calls.at(-1)![0]).toMatchObject({ chemistry_slug: "nmc-811" }),
    );
  });

  it("um fator de empacotamento sugerido abre as premissas e escreve o valor", async () => {
    const user = await ask();
    const summary = screen.getByText(t.premisesSummary(t.typicalCell, "0,7", "0,6", "0,75"));
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByRole("button", { name: "fator de empacotamento (massa): 0,65" }));
    await waitFor(() => expect(details.open).toBe(true));
    expect(new URLSearchParams(window.location.search).get("emp_massa")).toBe("0.65");
    expect(screen.getByShadowLabelText(t.massPackingFactor)).toHaveValue(0.65);
  });

  it("um requisito sugerido muda o campo e a potência no pedido", async () => {
    const user = await ask();
    await user.click(screen.getByRole("button", { name: "potência alvo: 90" }));
    await waitFor(() =>
      expect(designBatteryPack.mock.calls.at(-1)![0]).toMatchObject({ target_power_kw: 90 }),
    );
    expect(screen.getByShadowRole("spinbutton", { name: `${t.targetPower} (kW)` })).toHaveValue(90);
  });

  it("não tem violação de acessibilidade com o painel aberto", async () => {
    const user = userEvent.setup();
    const { container } = render(wrap(<BateriasPage />));
    await screen.findByShadowRole("spinbutton", { name: `${t.targetEnergy} (kWh)` });
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Experimente NMC-811");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});
