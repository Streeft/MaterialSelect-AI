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

// --- Import wizard --------------------------------------------------------

export type ImportStatus = "PENDENTE" | "VALIDADO" | "IMPORTADO" | "CANCELADO" | "REVERTIDO";

export type ColumnRole = "value" | "min" | "max" | "typical";

export interface ColumnMapping {
  column: string;
  property_slug: string;
  role: ColumnRole;
  unit?: string | null;
}

export interface ImportMapping {
  name_column: string;
  class_column?: string | null;
  default_class_id?: number | null;
  subclass_column?: string | null;
  description_column?: string | null;
  keywords_column?: string | null;
  source_label?: string | null;
  columns: ColumnMapping[];
}

export interface ColumnSuggestion {
  column: string;
  suggested_target: string | null;
  suggested_property_slug: string | null;
  suggested_role: ColumnRole;
  suggested_unit: string | null;
}

export interface UploadResult {
  job_id: number;
  filename: string;
  file_format: string;
  sheet_names: string[];
  sheet_name: string | null;
  headers: string[];
  sample_rows: (string | null)[][];
  row_count: number;
  suggestions: ColumnSuggestion[];
}

export interface RowIssue {
  column: string | null;
  message: string;
}

export interface RowReport {
  row_number: number;
  name: string | null;
  status: "ok" | "error" | "duplicate";
  issues: RowIssue[];
  warnings: string[];
}

export interface ValidationReport {
  job_id: number;
  status: ImportStatus;
  row_count: number;
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  rows: RowReport[];
}

export interface CommitResult {
  job_id: number;
  status: ImportStatus;
  imported_count: number;
  skipped_count: number;
}

export interface ImportJobOut {
  id: number;
  filename: string;
  file_format: string;
  sheet_name: string | null;
  status: ImportStatus;
  row_count: number;
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  imported_count: number;
  created_at: string;
  committed_at: string | null;
}

export interface ImportTemplate {
  id: number;
  name: string;
  description: string | null;
  mapping: ImportMapping;
  created_at: string;
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
