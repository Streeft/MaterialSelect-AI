import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
// Ver a nota em components/layout/layout.test.tsx: papéis do MWC (as abas, o
// select) vivem dentro de um shadow root, invisíveis para as consultas normais.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type {
  ApplicationArchetype,
  BatteryChemistry,
  BatteryComparisonResult,
  PackDesignResult,
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
    slug: "ve-urbano",
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

vi.mock("@/lib/api", () => ({
  listBatteryChemistries: () => Promise.resolve(mockChemistries),
  listBatteryArchetypes: () => Promise.resolve(mockArchetypes),
  designBatteryPack: () => Promise.resolve(mockDesignResult),
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
    const summary = screen.getByText(t.premisesSummary(t.typicalCell, "0,65", "0,5", "0,7"));
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
    const summary = screen.getByText(t.premisesSummary(t.typicalCell, "1,5", "0,5", "0,7"));
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
});
