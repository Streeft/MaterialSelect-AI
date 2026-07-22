// Shared API contract types for MaterialSelect AI.
// These mirror the backend Pydantic schemas in apps/api/app/schemas.
// Kept framework-agnostic so both the web app and future clients can import them.

export type PropertyCategory =
  | "FISICA"
  | "MECANICA"
  | "TERMICA"
  | "ELETRICA"
  | "AMBIENTAL"
  | "ECONOMICA";

export type DataQuality = "MEDIDO" | "IMPORTADO" | "ESTIMADO";

export type BetterDirection = "HIGHER" | "LOWER" | "NEUTRAL";

export type ValueKind = "scalar" | "interval" | "missing";

export interface PropertyValueOut {
  property_slug: string;
  property_name: string;
  symbol: string | null;
  category: PropertyCategory;
  is_missing: boolean;
  is_interval: boolean;
  value_scalar: number | null;
  value_min: number | null;
  value_max: number | null;
  value_typical: number | null;
  original_unit: string | null;
  normalized_value: number | null;
  canonical_unit: string | null;
  conversion_method: string | null;
  uncertainty: number | null;
  measurement_condition: string | null;
  notes: string | null;
  data_quality: DataQuality;
  source_label: string | null;
}

export interface PropertyGroup {
  category: PropertyCategory;
  properties: PropertyValueOut[];
}

export interface MaterialListItem {
  id: number;
  name: string;
  class_name: string;
  subclass: string | null;
  is_demo: boolean;
  keywords: string[];
}

export interface MaterialDetail {
  id: number;
  name: string;
  class_id: number;
  class_name: string;
  subclass: string | null;
  description: string | null;
  is_demo: boolean;
  is_active: boolean;
  keywords: string[];
  property_groups: PropertyGroup[];
}

export interface MaterialClass {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  description: string | null;
  material_count: number;
}

export interface PropertyDefinition {
  id: number;
  name: string;
  slug: string;
  symbol: string | null;
  description: string | null;
  category: PropertyCategory;
  physical_dimension: string;
  canonical_unit: string;
  accepted_units: string[];
  is_interval: boolean;
  better_direction: BetterDirection;
  allows_log_scale: boolean;
  value_count: number;
}

export interface PropertyValueIn {
  property_slug: string;
  kind: ValueKind;
  value?: number | null;
  value_min?: number | null;
  value_max?: number | null;
  value_typical?: number | null;
  unit?: string | null;
  uncertainty?: number | null;
  measurement_condition?: string | null;
  notes?: string | null;
  source_label?: string | null;
  data_quality: DataQuality;
}

export interface MaterialCreate {
  name: string;
  class_id: number;
  subclass?: string | null;
  description?: string | null;
  keywords: string[];
  is_demo: boolean;
  values: PropertyValueIn[];
}

export interface MaterialUpdate {
  name?: string;
  class_id?: number;
  subclass?: string | null;
  description?: string | null;
  keywords?: string[];
  is_active?: boolean;
}

export interface MaterialClassIn {
  name: string;
  slug?: string | null;
  parent_id?: number | null;
  description?: string | null;
}

export interface PropertyDefinitionIn {
  name: string;
  slug?: string | null;
  symbol?: string | null;
  description?: string | null;
  category: PropertyCategory;
  physical_dimension: string;
  canonical_unit: string;
  accepted_units: string[];
  is_interval: boolean;
  better_direction: BetterDirection;
  allows_log_scale: boolean;
}

export interface ChartPoint {
  material_id: number;
  material_name: string;
  class_name: string;
  x: number;
  y: number;
}

export interface ChartData {
  x_property_slug: string;
  x_property_name: string;
  x_unit: string;
  y_property_slug: string;
  y_property_name: string;
  y_unit: string;
  points: ChartPoint[];
  excluded_material_ids: number[];
}
