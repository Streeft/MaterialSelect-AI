import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type {
  ApplicationArchetype,
  BatteryChemistry,
  BatteryComparisonRequest,
  BatteryComparisonResult,
  PackDesignRequest,
  PackDesignResult,
} from "@/lib/types";

const t = ptBR.battery;

const mockChemistries: BatteryChemistry[] = [
  {
    slug: "lfp",
    name: "LFP (Fosfato de Ferro-Lítio)",
    specific_energy_wh_kg: 160,
    energy_density_wh_l: 350,
    specific_power_w_kg: 2000,
    cell_nominal_voltage_v: 3.2,
    nominal_cell_capacity_ah: 100,
    c_rate_continuous: 3.0,
    c_rate_peak: 5.0,
    roundtrip_efficiency_pct: 95.0,
    cycle_life_80_dod: 3500,
    calendar_life_years: 15,
    cell_cost_usd_kwh: 75.0,
    thermal_runaway_temp_c: 270,
    temp_range_min_c: -20,
    temp_range_max_c: 60,
    thermal_safety: "excellent",
    self_discharge_pct_month: 2.0,
    description: "Excelente estabilidade térmica e vida útil excepcional.",
  },
  {
    slug: "nmc-811",
    name: "NMC-811 (Alto Níquel)",
    specific_energy_wh_kg: 280,
    energy_density_wh_l: 700,
    specific_power_w_kg: 2200,
    cell_nominal_voltage_v: 3.7,
    nominal_cell_capacity_ah: 60,
    c_rate_continuous: 3.0,
    c_rate_peak: 6.0,
    roundtrip_efficiency_pct: 94.0,
    cycle_life_80_dod: 1500,
    calendar_life_years: 10,
    cell_cost_usd_kwh: 105.0,
    thermal_runaway_temp_c: 190,
    temp_range_min_c: -20,
    temp_range_max_c: 55,
    thermal_safety: "moderate",
    self_discharge_pct_month: 3.0,
    description: "Altíssima densidade energética.",
  },
];

const mockArchetypes: ApplicationArchetype[] = [
  {
    slug: "ve-urbano",
    name: "Veículo Elétrico Urbano",
    description: "Automóvel de passeio para ciclo misto urbano/rodoviário.",
    target_voltage_v: 400,
    target_energy_kwh: 50,
    target_power_kw: 120,
    dod: 0.85,
    mass_packing_factor: 0.65,
    volume_packing_factor: 0.50,
    cost_packing_factor: 0.70,
    default_chemistry_slug: "lfp",
  },
  {
    slug: "drone-uav",
    name: "VANT / Drone Comercial",
    description: "Aeronave não-tripulada que exige máxima densidade energética.",
    target_voltage_v: 24,
    target_energy_kwh: 0.75,
    target_power_kw: 3.5,
    dod: 0.80,
    mass_packing_factor: 0.78,
    volume_packing_factor: 0.65,
    cost_packing_factor: 0.75,
    default_chemistry_slug: "nmc-811",
  },
];

const mockDesignResult: PackDesignResult = {
  chemistry: mockChemistries[0]!,
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
  volume_packing_factor: 0.50,
  pack_specific_energy_wh_kg: 104.0,
  pack_energy_density_wh_l: 175.0,
  cell_cost_total_usd: 6000.0,
  pack_cost_total_usd: 8571.43,
  cost_overhead_usd: 2571.43,
  cost_packing_factor: 0.70,
  cycle_life_at_dod: 3294,
  levelized_cost_per_kwh_cycle: 0.0383,
  thermal_safety: "excellent",
  thermal_guidelines: [
    "Alta estabilidade intrínseca contra fuga térmica (270 °C).",
    "Arrefecimento a ar forçado ou placas líquidas de baixa vazão é suficiente.",
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
      chemistry_name: "LFP (Fosfato de Ferro-Lítio)",
      pack_mass_kg: 769.23,
      pack_volume_l: 457.14,
      pack_cost_usd: 8571.43,
      cycle_life: 3294,
      levelized_cost_per_kwh_cycle: 0.0383,
      pack_specific_energy_wh_kg: 104.0,
      pack_energy_density_wh_l: 175.0,
      thermal_safety: "excellent",
      series_cells_ns: 125,
      parallel_strings_np: 2,
      total_cells: 250,
      usable_energy_kwh: 68.0,
    },
    {
      chemistry_slug: "nmc-811",
      chemistry_name: "NMC-811 (Alto Níquel)",
      pack_mass_kg: 439.56,
      pack_volume_l: 228.57,
      pack_cost_usd: 12000.0,
      cycle_life: 1412,
      levelized_cost_per_kwh_cycle: 0.1248,
      pack_specific_energy_wh_kg: 182.0,
      pack_energy_density_wh_l: 350.0,
      thermal_safety: "moderate",
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
    "Para 50.0 kWh e 120.0 kW: LFP oferece o menor custo nivelado e máxima segurança, enquanto NMC-811 oferece a menor massa total.",
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/baterias",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  listBatteryChemistries: () => Promise.resolve(mockChemistries),
  listBatteryArchetypes: () => Promise.resolve(mockArchetypes),
  designBatteryPack: (body: PackDesignRequest) => Promise.resolve(mockDesignResult),
  compareBatteries: (body: BatteryComparisonRequest) => Promise.resolve(mockComparisonResult),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: BateriasPage } = await import("./page");

describe("BateriasPage (Battery Designer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza cabeçalho e controles principais de dimensionamento", async () => {
    render(wrap(<BateriasPage />));

    // Page title and subtitle
    expect(await screen.findByRole("heading", { name: t.title })).toBeDefined();
    expect(screen.getByText(t.subtitle)).toBeDefined();

    // Archetype and requirements section
    expect(screen.getByRole("heading", { name: t.archetypesTitle })).toBeDefined();

    // Tabs are present
    expect(screen.getByRole("tab", { name: t.tabDesign })).toBeDefined();
    expect(screen.getByRole("tab", { name: t.tabCompare })).toBeDefined();
  });

  it("exibe arquitetura Ns x Np e métricas do pack dimensionado", async () => {
    render(wrap(<BateriasPage />));

    // Wait for the design result to render
    await waitFor(() => {
      expect(screen.getByText("125")).toBeDefined();
    });

    // Ns, Np and Total cells
    expect(screen.getByText(t.seriesLabel)).toBeDefined();
    expect(screen.getByText(t.parallelLabel)).toBeDefined();
    expect(screen.getByText(t.totalCellsLabel)).toBeDefined();

    // Mass and volume breakdown sections
    expect(screen.getByRole("heading", { name: t.massBreakdown })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Volume e Densidade Energética" })).toBeDefined();

    // Economic and thermal sections
    expect(screen.getByRole("heading", { name: t.costBreakdown })).toBeDefined();
    expect(screen.getByRole("heading", { name: t.thermalTitle })).toBeDefined();
  });

  it("permite navegar para a aba de trade-offs de químicas e exibe comparativo", async () => {
    const user = userEvent.setup();
    render(wrap(<BateriasPage />));

    const compareTab = await screen.findByRole("tab", { name: t.tabCompare });
    await user.click(compareTab);

    // Dominance highlights
    await waitFor(() => {
      expect(screen.getByText(t.lightestBadge)).toBeDefined();
    });
    expect(screen.getByText(t.cheapestBadge)).toBeDefined();
    expect(screen.getByText(t.safestBadge)).toBeDefined();

    // Technical summary alert
    expect(screen.getByText(mockComparisonResult.technical_summary)).toBeDefined();

    // Comparative table headers
    expect(screen.getByRole("columnheader", { name: t.tableColChem })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: t.tableColNsNp })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: t.tableColMass })).toBeDefined();
  });
});
