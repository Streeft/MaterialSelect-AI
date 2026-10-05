// Re-exports MaterialSelect AI's shared API contract types.
//
// packages/shared-types/index.ts is canonical (D-16/M4) — this barrel exists
// only so the rest of the app keeps importing "@/lib/types" instead of every
// call site switching to the workspace package name.
export * from "@materialselect/shared-types";

import type { EcoAuditResult, EcoUseIn, EndOfLifeRoute } from "@materialselect/shared-types";

export interface EcoMaterialInput {
  material_id: number;
  process_id: number;
  part_mass: number;
  recycled_fraction: number;
  end_of_life: EndOfLifeRoute;
}

export interface EcoComparisonRequest {
  material_a: EcoMaterialInput;
  material_b: EcoMaterialInput;
  transport_mode: string;
  transport_distance_km: number;
  use: EcoUseIn;
}

export interface EcoComparisonResult {
  material_a: EcoAuditResult;
  material_b: EcoAuditResult;
  delta_energy: number | null;
  delta_energy_percent: number | null;
  delta_carbon: number | null;
  delta_carbon_percent: number | null;
  winner_energy: "material_a" | "material_b" | "tie" | null;
  winner_carbon: "material_a" | "material_b" | "tie" | null;
}
