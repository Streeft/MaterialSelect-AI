import type { DefaultsResult } from "@/lib/types";

/**
 * What `GET /api/padroes` answers, for the screens' tests. The numbers repeat
 * the backend constants on purpose: a test that opens a screen needs *some*
 * defaults, and the real contract is pinned by `test_defaults_api.py`.
 */
export const defaultsFixture: DefaultsResult = {
  custo: {
    batch_size: 1000,
    write_off_years: 5,
    load_factor: 0.5,
    note: "Premissas iniciais do estimador.",
  },
  eco: {
    use_model: "movel",
    recycled_fraction: 0,
    end_of_life: "reciclagem",
    transport_distance_km: 1500,
    static: { power_watts: 60, duty_cycle: 0.25, life_years: 10, carbon_per_energy: 0.07 },
    mobile: {
      distance_km: 200000,
      mobile_intensity: 0.0025,
      life_years: 10,
      carbon_per_energy: 0.07,
    },
    note: "Premissas iniciais da auditoria.",
  },
  baterias: {
    archetype_slug: "ve_urbano",
    chemistry_slug: "lfp",
    voltage_v: 400,
    energy_kwh: 48,
    power_kw: 100,
    dod: 0.85,
    cell_capacity_ah: null,
    mass_packing_factor: 0.7,
    volume_packing_factor: 0.6,
    cost_packing_factor: 0.75,
    note: "Premissas de oficina, editáveis.",
  },
  dimensionar: { objective: "massa", limit: 10 },
};
