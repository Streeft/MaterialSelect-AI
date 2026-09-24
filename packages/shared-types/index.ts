// Shared API contract types for MaterialSelect AI.
//
// Canonical (D-16/M4): apps/web imports this workspace package directly
// (`@materialselect/shared-types`, transpiled via next.config.mjs) instead of
// mirroring it — a manual copy used to drift silently until the typechecker
// caught it (see the M4 entry in docs/TODO.md for the field it missed).
// Mirrors the backend Pydantic schemas in apps/api/app/schemas.

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
  /**
   * A mesma medida, lida na unidade do leitor (D-70).
   *
   * **Acrescentada, nunca substituta.** Os campos acima guardam o que a fonte
   * disse e como aquilo virou canônico; estes guardam como o leitor pediu para
   * ler. `display_unit` é a unidade em que os `display_*` estão — pode ser a
   * canônica, e aí os dois conjuntos coincidem.
   */
  display_unit: string | null;
  display_value: number | null;
  display_min: number | null;
  display_max: number | null;
  display_typical: number | null;
  display_uncertainty: number | null;
}

export interface PropertyGroup {
  category: PropertyCategory;
  properties: PropertyValueOut[];
}

/** A material's values counted by provenance. `missing` is absence, not a quality. */
export interface DataQualitySummary {
  medido: number;
  importado: number;
  estimado: number;
  missing: number;
}

export interface MaterialListItem {
  id: number;
  name: string;
  class_name: string;
  class_slug: string;
  subclass: string | null;
  is_demo: boolean;
  /**
   * P1-4: whether this material is a record of the signed-in person's own,
   * rather than part of the shared catalogue. A boolean and not an owner id:
   * a reader only ever sees shared rows and their own, so "has an owner" and
   * "is mine" are the same fact — and the boolean identifies nobody.
   */
  is_own_record: boolean;
  keywords: string[];
  quality: DataQualitySummary;
}

export interface MaterialDetail {
  id: number;
  name: string;
  class_id: number;
  class_name: string;
  class_slug: string;
  subclass: string | null;
  description: string | null;
  is_demo: boolean;
  is_active: boolean;
  /** Same flag, same reason, as on `MaterialListItem`. */
  is_own_record: boolean;
  keywords: string[];
  property_groups: PropertyGroup[];
  /**
   * The processes this material can be made with (P0-2) — the datasheet half of
   * the material↔process join. Always present; an empty array means no process
   * is linked, which the sheet writes out rather than rendering as a dash.
   */
  processes: Process[];
}

/** A node of the process taxonomy — the process-side twin of `MaterialClass`. */
export interface ProcessClass {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  description: string | null;
  /** Processes filed *directly* here, so an empty folder reads as empty. */
  process_count: number;
}

/**
 * What *shape* of value a process attribute holds (P0-4).
 *
 * Load-bearing, not descriptive: the engine compares an `ENVELOPE` by reach
 * (a process that shapes 0,1–10 kg meets "≥ 5 kg") and an `ESCALAR` by its own
 * value, and a `DISCRETO` attribute answers set membership instead. It is what
 * decides which editor to draw and which operators can apply, before any value
 * exists.
 */
export type ProcessAttributeKind = "ESCALAR" | "ENVELOPE" | "DISCRETO";

/** One process attribute definition (P0-4) — the catalogue a limit stage over
 * processes selects on. */
export interface ProcessAttribute {
  id: number;
  name: string;
  slug: string;
  symbol: string | null;
  description: string | null;
  kind: ProcessAttributeKind;
  physical_dimension: string;
  /** Null exactly when `kind` is `DISCRETO` — a label has no unit. */
  canonical_unit: string | null;
  accepted_units: string[];
  /** The closed vocabulary of a discrete attribute; empty otherwise. */
  allowed_labels: string[];
  better_direction: BetterDirection;
}

/** One attribute value of one process, with its provenance (P0-4). */
export interface ProcessAttributeValue {
  attribute_id: number;
  attribute_name: string;
  attribute_slug: string;
  kind: ProcessAttributeKind;
  value_scalar: number | null;
  value_min: number | null;
  value_max: number | null;
  value_typical: number | null;
  labels: string[];
  original_unit: string | null;
  normalized_value: number | null;
  normalized_min: number | null;
  normalized_max: number | null;
  canonical_unit: string | null;
  conversion_method: string | null;
  uncertainty: number | null;
  measurement_condition: string | null;
  notes: string | null;
  source_label: string | null;
  data_quality: DataQuality;
  /** The fourth state of data quality (D-24): render a written label, never 0. */
  is_missing: boolean;
  /**
   * A mesma medida, lida na unidade do leitor (D-70).
   *
   * **Acrescentada, nunca substituta.** Os campos acima guardam o que a fonte
   * disse e como aquilo virou canônico; estes guardam como o leitor pediu para
   * ler. `display_unit` é a unidade em que os `display_*` estão — pode ser a
   * canônica, e aí os dois conjuntos coincidem.
   */
  display_unit: string | null;
  display_value: number | null;
  display_min: number | null;
  display_max: number | null;
  display_typical: number | null;
  display_uncertainty: number | null;
}

/**
 * A taxonomy folder named just enough to link to it — one breadcrumb step (P1-4).
 *
 * The same shape in both universes, because a breadcrumb asks the same thing of
 * each: what is this folder called, and what is its slug.
 */
export interface ClassRef {
  id: number;
  name: string;
  slug: string;
}

/**
 * The prose a family record carries (P1-4).
 *
 * `null` means **nobody wrote it** — a different state from an empty string,
 * which would read as "this family has no applications". The screen renders the
 * first as a written absence (D-24) and must never collapse the two.
 */
export interface FamilyProse {
  applications: string | null;
  characteristics: string | null;
}

/** One material family read as a record rather than a label (P1-4). */
export interface MaterialClassDetail extends MaterialClass, FamilyProse {
  /** Root→parent, this folder **excluded**: the page is not a link to itself. */
  ancestors: ClassRef[];
  /** Direct subfolders only — grandchildren belong to the child's own page. */
  children: MaterialClass[];
  /**
   * This folder and everything below it. What tells a pure branch
   * (`material_count` 0 by design) from an empty one, and so what gives the
   * reader a reason to open it.
   */
  descendant_material_count: number;
}

/** One process family read as a record (P1-4) — D-57's symmetry, field for field. */
export interface ProcessClassDetail extends ProcessClass, FamilyProse {
  ancestors: ClassRef[];
  children: ProcessClass[];
  descendant_process_count: number;
  /**
   * The active processes filed directly here. Carried on the record because —
   * unlike materials, which the catalogue lists through its own endpoint —
   * nothing else lists the processes of one folder.
   */
  processes: Process[];
}

/** A manufacturing process in the catalogue (P0-2). */
export interface Process {
  id: number;
  name: string;
  slug: string;
  class_id: number;
  class_name: string;
  class_slug: string;
  description: string | null;
  is_demo: boolean;
  /** How many catalogued materials this process applies to. */
  material_count: number;
}

export interface MaterialClass {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  description: string | null;
  /**
   * Materials filed **directly** here, so an empty branch reads as empty
   * instead of borrowing its children's contents. The subtree total is
   * `MaterialClassDetail.descendant_material_count`.
   */
  material_count: number;
}

/** One process with its attributes and their provenance — the datasheet (P0-4). */
export interface ProcessDetail extends Process {
  attributes: ProcessAttributeValue[];
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
  /**
   * A unidade em que esta grandeza **se lê** (D-70). `null` quer dizer "lê-se
   * como está guardada", que é resposta e não configuração faltando.
   *
   * É por propriedade e não por dimensão porque o dado obriga: módulo,
   * escoamento e tração compartilham dimensão e se leem em GPa, MPa e MPa.
   */
  display_unit: string | null;
  is_interval: boolean;
  better_direction: BetterDirection;
  allows_log_scale: boolean;
  value_count: number;
}

// --- Write payloads (mirror the backend Pydantic input schemas) -----------

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
  /**
   * P1-4. Declared, never inferred from who is typing: the same person adds to
   * the shared catalogue and keeps records of their own, and only they know
   * which one a given form was. Optional, and absent means the shared
   * catalogue — what every caller meant before My Records existed.
   */
  is_own_record?: boolean;
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

export type ImportStatus =
  | "PENDENTE"
  | "VALIDADO"
  | "IMPORTADO"
  | "CANCELADO"
  | "REVERTIDO";

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

// --- Deterministic selection ----------------------------------------------

export type ConstraintOperator =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "outside"
  | "exists"
  | "not_exists"
  | "in_class"
  | "not_in_class"
  | "text_contains"
  // P0-4: set membership over a discrete process attribute's closed vocabulary.
  // Never applicable to a material property — none of them is discrete — which
  // is why the editor offers these two only in a process study.
  | "has_any_label"
  | "has_no_label";

export type Goal = "maximize" | "minimize";
export type CriterionDirection = "max" | "min";
export type NormalizationMethod = "minmax" | "vector";
// `normalization` stays meaningful only when method == "weighted_sum": TOPSIS
// and PROMETHEE each fix their own normalization internally (see
// apps/api/app/schemas/selection.py's RankingIn docstring).
export type MethodLiteral = "weighted_sum" | "topsis" | "promethee";
export type Combinator = "AND" | "OR";

export interface ConstraintIn {
  operator: ConstraintOperator;
  label?: string | null;
  property_slug?: string | null;
  value?: number | null;
  value_min?: number | null;
  value_max?: number | null;
  unit?: string | null;
  class_slugs?: string[];
  text?: string | null;
  /** The labels a `has_any_label` / `has_no_label` constraint names (P0-4). A
   * field of its own and not `class_slugs`: a class slug and an attribute label
   * are different namespaces. */
  labels?: string[];
}

/**
 * One node of a nested AND/OR constraint tree (M6) — mirrors the backend's
 * `ConstraintGroupIn` (`apps/api/app/schemas/selection.py`) field-for-field,
 * self-referencing via `groups`. Optional everywhere it plugs into
 * `RunRequest`/`StudyIn`: its absence (`root_group` undefined/null)
 * preserves the flat `constraints`/`combinator` shape those already had.
 */
export interface ConstraintGroupIn {
  operator: Combinator;
  constraints: ConstraintIn[];
  groups: ConstraintGroupIn[];
}

/**
 * A stage's kind: a constraint tree, a folder selection over the material
 * taxonomy, (P0-2) a selection over the process universe — the join's other
 * direction — or (P1-2) a region of one plane.
 */
export type StageKind = "limit" | "tree" | "process" | "material" | "chart";

/**
 * One axis of a chart stage (P1-2) — mirrors the backend's `ChartAxisIn`.
 *
 * Exactly one of `property_slug` and `expression`: the two are different
 * namespaces that happen to overlap (`densidade` is a valid expression as well
 * as a slug), so which one was meant cannot be inferred from the string. The
 * backend refuses both and neither.
 *
 * `min_value`/`max_value` are in **data coordinates and canonical units** — the
 * numbers read off an axis the chart already draws that way. There is no unit
 * field, unlike a constraint's threshold, which the reader types in a unit of
 * their choosing. Either may be null: a box open on one side is a real thing to
 * draw, and null is "no bound" where `0` would be one.
 */
export interface ChartAxisIn {
  property_slug?: string | null;
  expression?: string | null;
  min_value?: number | null;
  max_value?: number | null;
}

/**
 * The plane a chart stage selects on (P1-2) — mirrors `ChartStageIn`.
 *
 * The box and the index line may each be absent; a stage with neither still
 * selects, and means "must be plottable here". `index_expression` and
 * `index_level` come as a pair — a level with no index has nothing to be a
 * level of, and an index with no level is a line with no position.
 */
export interface ChartStageIn {
  x: ChartAxisIn;
  y: ChartAxisIn;
  index_expression?: string | null;
  index_goal?: Goal;
  index_level?: number | null;
}

/**
 * One stage of the selection pipeline (P0-1) — mirrors the backend's `StageIn`
 * (`apps/api/app/schemas/selection.py`).
 *
 * A stage is one kind of question. Sending a tree stage with constraints, or a
 * limit stage with class slugs, is **rejected** by the backend rather than
 * ignored, so do not populate both halves.
 */
export interface StageIn {
  kind: StageKind;
  label?: string | null;
  enabled: boolean;
  // kind === "limit"
  combinator?: Combinator;
  constraints?: ConstraintIn[];
  root_group?: ConstraintGroupIn | null;
  // kind === "tree"
  class_slugs?: string[];
  // kind === "process" (P0-2). Any-of: the stage keeps the materials some
  // selected process applies to. "This *and* that" is two stages.
  process_slugs?: string[];
  process_class_slugs?: string[];
  // kind === "material" (P0-3): folders of the material taxonomy, in a process
  // study. Folders only — a Material has no slug to name a leaf by.
  material_class_slugs?: string[];
  // kind === "chart" (P1-2): the plane, the box and the line.
  chart?: ChartStageIn | null;
  /** Shared by every folder-selecting stage: a folder means what is under it. */
  include_descendants?: boolean;
}

/** A persisted stage, read back whole — `root_group` carries the real tree. */
export interface StageOut {
  position: number;
  kind: StageKind;
  label: string | null;
  enabled: boolean;
  root_group: ConstraintGroupIn | null;
  class_slugs: string[];
  process_slugs: string[];
  process_class_slugs: string[];
  material_class_slugs: string[];
  chart: ChartStageIn | null;
  include_descendants: boolean;
}

/** What one stage of the pipeline did, in a run's result. */
export interface StageResult {
  position: number;
  kind: StageKind;
  label: string | null;
  enabled: boolean;
  /** What the stage admits on its own, over the whole catalogue. */
  passed: number;
  /** The running count after this stage — unchanged when it is disabled. */
  remaining: number;
  steps: FunnelStep[];
}

export interface IndexIn {
  name?: string | null;
  expression: string;
  goal: Goal;
}

export interface CriterionIn {
  key: string;
  label?: string | null;
  direction?: CriterionDirection | null;
  weight: number;
}

export interface RankingIn {
  normalization: NormalizationMethod;
  method: MethodLiteral;
  criteria: CriterionIn[];
  run_sensitivity?: boolean;
}

/** A pairwise comparison matrix (Saaty's 1-9 scale) to derive weights from. */
export interface AhpWeightsIn {
  criteria: string[];
  matrix: number[][];
}

export interface AhpWeightsOut {
  weights: Record<string, number>;
  lambda_max: number;
  consistency_index: number;
  consistency_ratio: number;
}

export interface RunRequest {
  universe?: SelectionUniverse;
  // M6: an explicit nested tree (`root_group`) overrides these two entirely
  // — see `ConstraintGroupIn`'s docstring. Kept optional so a caller that
  // builds a tree does not also have to invent a flat pair to satisfy the
  // type; the backend defaults both to `"AND"`/`[]` when omitted.
  combinator?: Combinator;
  constraints?: ConstraintIn[];
  root_group?: ConstraintGroupIn | null;
  // P0-1: an explicit pipeline overrides the three fields above entirely.
  // Sending it together with any of them is rejected by the backend.
  stages?: StageIn[] | null;
  index?: IndexIn | null;
  ranking?: RankingIn | null;
}

export interface FunnelStep {
  label: string;
  operator: string;
  passed: number;
  remaining: number;
}

/**
 * One surviving record of the pipeline.
 *
 * `record_id`, not `material_id`, since P0-3: in a process study this row *is*
 * a process. A field named for one universe while carrying the other's id is
 * the same class of lie the funnel's `in_tree` was. The ranking types below
 * keep their material-specific names on purpose — a process study cannot rank
 * yet, so they provably never describe a process.
 */
export interface Candidate {
  record_id: number;
  name: string;
  class_name: string;
  index_value: number | null;
  score: number | null;
  rank: number | null;
}

/** Which universe a study returns (P0-3). */
export type SelectionUniverse = "material" | "process";

export interface IndexValue {
  /**
   * `record_id`, not `material_id`, since P0-4: a process study can be ranked and
   * indexed now, so this is a process's id there. Named after materials it would
   * invite a reader to resolve it against them — the mistake `Candidate.record_id`
   * was renamed to prevent in P0-3.
   */
  record_id: number;
  name: string;
  class_name: string;
  value: number | null;
  undefined_reason: string | null;
}

export interface IndexResult {
  name: string | null;
  expression: string;
  goal: string;
  dimension: string;
  variables: string[];
  values: IndexValue[];
  defined_count: number;
  undefined_count: number;
}

export interface Contribution {
  key: string;
  label: string;
  raw: number;
  normalized: number;
  weight: number;
  contribution: number;
}

export interface RankedMaterial {
  /** The ranked record's id — a material's or a process's. See `IndexValue`. */
  record_id: number;
  name: string;
  score: number;
  rank: number;
  contributions: Contribution[];
}

export interface ExcludedMaterial {
  record_id: number;
  name: string;
  /** Stable identifiers. Show `missing_labels` to a person. */
  missing_keys: string[];
  missing_labels: string[];
}

export interface SensitivityScenario {
  description: string;
  weights: Record<string, number>;
  top_record_id: number | null;
  top_record_name: string | null;
  changed: boolean;
}

export interface RankingResult {
  normalization: string;
  method: string;
  criteria: string[];
  ranked: RankedMaterial[];
  excluded: ExcludedMaterial[];
  sensitivity: SensitivityScenario[];
}

export interface RunResult {
  universe: SelectionUniverse;
  initial_count: number;
  combinator: string;
  final_count: number;
  funnel: FunnelStep[];
  candidates: Candidate[];
  /** P0-1: the pipeline, stage by stage. One entry for a single-stage study. */
  stages: StageResult[];
  index: IndexResult | null;
  ranking: RankingResult | null;
}

export interface PerformanceIndex {
  id: number;
  name: string;
  slug: string;
  expression: string;
  goal: Goal;
  description: string | null;
  assumptions: Record<string, string> | null;
  dimension: string | null;
  is_demo: boolean;
}

export interface StudySummary {
  universe: SelectionUniverse;
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  constraint_count: number;
  criterion_count: number;
  stage_count: number;
}

export interface StudyDetail {
  universe: SelectionUniverse;
  id: number;
  name: string;
  description: string | null;
  function_text: string | null;
  objective_text: string | null;
  free_variables: string[];
  combinator: Combinator;
  constraints: ConstraintIn[];
  /** P0-1: the study's real structure. `constraints` above stays the flat list. */
  stages: StageOut[];
  index: IndexIn | null;
  normalization: NormalizationMethod;
  method: MethodLiteral;
  criteria: CriterionIn[];
  created_at: string;
}

export interface StudyIn {
  universe?: SelectionUniverse;
  name: string;
  description?: string | null;
  function_text?: string | null;
  objective_text?: string | null;
  free_variables: string[];
  // M6: see RunRequest.root_group — same override/optionality rule.
  combinator?: Combinator;
  constraints?: ConstraintIn[];
  root_group?: ConstraintGroupIn | null;
  // P0-1: see RunRequest.stages — same override/exclusivity rule.
  stages?: StageIn[] | null;
  index?: IndexIn | null;
  normalization: NormalizationMethod;
  method: MethodLiteral;
  criteria: CriterionIn[];
}

// --- Visualisation: property maps and comparison (Fase 5) ------------------
// Every number below is computed by the backend in canonical units — including
// the index-line slope and endpoints. The client only draws what it receives.

export type ChartScale = "linear" | "log";

/** A pair of data coordinates, as returned by the API (`[x, y]`). */
export type CoordinatePair = number[];

/** A Chart Stage region: one optional limit per side, in data coordinates.
 *  `null` is "no limit on this side", never `0` (D-60). */
export interface MapBox {
  x_min: number | null;
  x_max: number | null;
  y_min: number | null;
  y_max: number | null;
}

/** Convert a region between the map's reading units and canonical units (D-81).
 *  `x`/`y` name the property on each axis; `null` is an index axis. */
export interface MapBoxRequest {
  universe?: "material" | "process";
  x: string | null;
  y: string | null;
  box: MapBox;
  to: "canonical" | "display";
}

export interface MapBoxOut {
  box: MapBox;
  x_unit: string | null;
  y_unit: string | null;
}

export interface PropertyMapRequest {
  universe?: SelectionUniverse;
  /** Exactly one of `x`/`x_index` must be set — same for `y`/`y_index`. */
  x?: string | null;
  y?: string | null;
  x_index?: IndexIn | null;
  y_index?: IndexIn | null;
  scale: ChartScale;
  envelope_shape?: "hull" | "ellipse";
  class_slugs?: string[];
  material_ids?: number[] | null;
  process_ids?: number[] | null;
  highlight_material_ids?: number[];
  highlight_process_ids?: number[];
  include_envelopes?: boolean;
  /** Incompatible with `x_index`/`y_index`: only two property axes can carry a third, overlaid index. */
  index?: IndexIn | null;
  index_levels?: number[];
  index_level_material_ids?: number[];
  index_level_process_ids?: number[];
}

export interface MapAxis {
  is_index: boolean;
  /** Set only when `is_index` is false. */
  property_slug: string | null;
  property_name: string;
  /** Set only when `is_index` is true. */
  expression: string | null;
  symbol: string | null;
  unit: string;
  category: PropertyCategory | null;
  better_direction: BetterDirection;
  allows_log_scale: boolean;
  min_value: number | null;
  max_value: number | null;
}

export interface MapPoint {
  material_id: number;
  record_id?: number;
  material_name: string;
  class_name: string;
  class_slug: string;
  is_demo: boolean;
  x: number;
  y: number;
  /** Interval bounds, already converted to the axis' canonical unit. */
  x_min: number | null;
  x_max: number | null;
  y_min: number | null;
  y_max: number | null;
  /** Converted as a difference, so ±5 °C stays ±5 K. */
  x_uncertainty: number | null;
  y_uncertainty: number | null;
  x_is_interval: boolean;
  y_is_interval: boolean;
  /** Null exactly when that axis is an index: a computed index has no single
   * provenance of its own to badge. */
  x_quality: DataQuality | null;
  y_quality: DataQuality | null;
  index_value: number | null;
  index_undefined_reason: string | null;
}

export interface ClassEnvelope {
  class_slug: string;
  class_name: string;
  point_count: number;
  /** Convex hull vertices; 1 or 2 entries in degenerate cases. */
  polygon: CoordinatePair[];
}

export interface ExcludedPoint {
  material_id: number;
  record_id?: number;
  name: string;
  reason: string;
}

export interface IndexLevel {
  value: number;
  material_id: number | null;
  material_name: string | null;
  points: CoordinatePair[];
  superior_material_ids: number[];
}

export interface IndexOverlay {
  name: string | null;
  expression: string;
  goal: string;
  dimension: string;
  /** False when the index has no straight-line contour on these two axes. */
  available: boolean;
  unavailable_reason: string | null;
  orientation: "oblique" | "vertical" | null;
  slope: number | null;
  levels: IndexLevel[];
  defined_count: number;
  undefined_count: number;
}

export interface PropertyMap {
  scale: ChartScale;
  x_axis: MapAxis;
  y_axis: MapAxis;
  points: MapPoint[];
  envelopes: ClassEnvelope[];
  envelopes_alt: ClassEnvelope[];
  excluded: ExcludedPoint[];
  index: IndexOverlay | null;
  considered_count: number;
  plotted_count: number;
  notes: string[];
}

export interface ComparisonRequest {
  material_ids: number[];
  property_slugs: string[];
  normalization: NormalizationMethod;
  /**
   * P2: the record everything else is measured against. A parameter of the
   * question, never server state — "compared against X" is something a reader
   * asks, so it travels in the request and in the shareable URL. It must be one
   * of `material_ids`: a reference outside the table would make every
   * percentage uncheckable.
   */
  reference_id?: number | null;
}

/**
 * Why a percentage difference is, or is not, a number (P2).
 *
 * Six states rather than a nullable float, because every absence here has a
 * different reason and the reader needs the one that applies: a blank where the
 * reference has no value and a blank where the unit has no true zero look
 * identical and mean nothing alike (D-24).
 */
export type DifferenceState =
  | "calculada"
  | "referencia"
  | "sem_referencia"
  | "valor_ausente"
  | "referencia_ausente"
  | "referencia_zero"
  | "escala_sem_zero";

export interface CompareAxis {
  property_slug: string;
  property_name: string;
  symbol: string | null;
  unit: string;
  category: PropertyCategory;
  better_direction: BetterDirection;
  allows_log_scale: boolean;
  min_value: number | null;
  max_value: number | null;
  present_count: number;
  missing_material_ids: number[];
}

export interface CompareCell {
  property_slug: string;
  is_missing: boolean;
  value: number | null;
  /** Null whenever the value is missing — a gap, never a zero. */
  normalized: number | null;
  value_min: number | null;
  value_max: number | null;
  original_value: number | null;
  original_unit: string | null;
  conversion_method: string | null;
  uncertainty: number | null;
  data_quality: DataQuality | null;
  source_label: string | null;
  measurement_condition: string | null;
  /**
   * P2. Null whenever `difference_state` is anything but "calculada".
   *
   * **Sempre canônica, nunca na unidade de leitura** (D-70): uma razão só
   * significa algo em escala de razão, e trocar a unidade de leitura não move
   * esta coluna.
   */
  difference_pct: number | null;
  difference_state: DifferenceState;
  /** A mesma medida, lida na unidade do leitor (D-70). */
  display_unit: string | null;
  display_value: number | null;
  display_min: number | null;
  display_max: number | null;
  display_uncertainty: number | null;
}

export interface CompareMaterial {
  material_id: number;
  name: string;
  class_name: string;
  class_slug: string;
  is_demo: boolean;
  cells: CompareCell[];
  complete: boolean;
}

export interface Comparison {
  normalization: string;
  properties: CompareAxis[];
  materials: CompareMaterial[];
  notes: string[];
}

// --- Optional AI layer (Fase 6) --------------------------------------------
// Everything below is a *proposal*. The API never applies any of it, and no
// numeric property value ever appears here — see app/ai/guardrails.py.

export interface AIStatus {
  enabled: boolean;
  provider: string;
  simulated: boolean;
  disclaimer: string;
}

export interface SuggestedConstraint {
  constraint: ConstraintIn;
  /** The fragment of the user's own text this reading came from. */
  evidence: string;
  rationale: string;
}

export interface SuggestedIndex {
  slug: string;
  name: string;
  expression: string;
  goal: Goal;
  rationale: string;
}

export interface SuggestedProperty {
  slug: string;
  name: string;
  rationale: string;
}

export interface SuggestedChart {
  x: string;
  y: string;
  scale: ChartScale;
  rationale: string;
}

export interface Interpretation {
  statement: string;
  function_text: string | null;
  objective_text: string | null;
  free_variables: string[];
  constraints: SuggestedConstraint[];
  properties: SuggestedProperty[];
  indices: SuggestedIndex[];
  chart: SuggestedChart | null;
  open_questions: string[];
  /** Suggestions the guardrails refused, with the reason. */
  rejected: string[];
  provider: string;
  simulated: boolean;
  disclaimer: string;
}

export interface CitedSource {
  document_title: string;
  page_start: number | null;
  page_end: number | null;
}

export interface Explanation {
  study_id: number;
  study_name: string;
  summary: string;
  paragraphs: string[];
  caveats: string[];
  sources: CitedSource[];
  provider: string;
  simulated: boolean;
  disclaimer: string;
}

// --- Dashboard ---------------------------------------------------------
//
// The panel's vocabulary is three-valued where `DataQuality` above is not:
// a (material, property) slot is filled, declared missing, or never recorded.
// `QualityBucket` carries the last two states that `DataQuality` alone cannot
// name — see apps/api/app/schemas/dashboard.py for why they stay apart.

export type QualityBucket = DataQuality | "AUSENTE" | "NAO_REGISTRADO";

export interface Coverage {
  filled: number;
  declared_missing: number;
  not_recorded: number;
  slots: number;
  /** `null`, never `0`: an empty set of slots has no percentage to report. */
  filled_pct: number | null;
}

export interface ClassCoverage {
  slug: string;
  name: string;
  materials: number;
  coverage: Coverage;
}

export interface PropertyCoverage {
  slug: string;
  name: string;
  category: PropertyCategory;
  canonical_unit: string | null;
  coverage: Coverage;
}

export interface QualitySlice {
  bucket: QualityBucket;
  count: number;
  share_pct: number | null;
}

export interface DashboardOverview {
  materials: number;
  demo_materials: number;
  classes: number;
  properties: number;
  coverage: Coverage;
  by_quality: QualitySlice[];
  by_class: ClassCoverage[];
  by_property: PropertyCoverage[];
  gaps: PropertyCoverage[];
}

/** The five numbers of a box are computed in the backend (ADR 0004); the
 *  browser never receives the sample to quantile itself. */
export interface DistributionBox {
  class_slug: string;
  class_name: string;
  count: number;
  minimum: number;
  q1: number;
  median: number;
  q3: number;
  maximum: number;
}

export interface PropertyDistribution {
  property_slug: string;
  property_name: string;
  category: PropertyCategory;
  canonical_unit: string | null;
  /**
   * A unidade em que os números das caixas estão (D-70). O rótulo do eixo tem
   * de nomear esta, não a canônica.
   */
  display_unit: string | null;
  allows_log_scale: boolean;
  boxes: DistributionBox[];
  classes_without_data: string[];
}

// --- Auth (login com Google) ------------------------------------------------

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  avatar_url: string | null;
  project_id: number;
}

// --- Billing (assinatura Stripe) --------------------------------------------

export interface BillingStatus {
  active: boolean;
  status: string | null;
  current_period_end: string | null;
}

export interface CheckoutSession {
  url: string;
}

export interface PortalSession {
  url: string;
}

// --- Saved charts (map configurations) ----------------------------------------

export interface SavedChartIn {
  name: string;
  configuration: Record<string, unknown>;
}

export interface SavedChart {
  id: number;
  name: string;
  configuration: Record<string, unknown>;
  created_at: string;
}

export interface SavedChartListItem {
  id: number;
  name: string;
  created_at: string;
}

// --- My Records (P1-4) -----------------------------------------------------

/** The two universes a bookmark can point into — the engine's own word (D-58). */
export type Universe = "material" | "process";

/**
 * One bookmarked record, carrying the record itself rather than its id.
 *
 * `universe` is explicit rather than inferred from which of the two record
 * fields is null: inference works and is one silent assumption away from
 * breaking the day a third universe arrives.
 */
export interface Bookmark {
  universe: Universe;
  /** When it was starred, or when it was last opened. */
  at: string;
  material: MaterialListItem | null;
  process: Process | null;
}

/** Everything the user's own space shows, in one request. */
export interface MyRecords {
  favorites: Bookmark[];
  recents: Bookmark[];
  own_records: MaterialListItem[];
}

// --- Find Similar (P2) ------------------------------------------------------

/**
 * Which properties "similar" means, and how many neighbours to return.
 *
 * `property_slugs` has no default on the server, deliberately: defaulting to
 * "every property the reference happens to have" would let the catalogue's
 * recording habits choose the question without the reader seeing it chosen. The
 * interface proposes a basis; the request states one.
 */
export interface SimilarRequest {
  property_slugs: string[];
  limit?: number;
}

export interface Neighbour {
  record_id: number;
  name: string;
  class_name: string;
  class_slug: string;
  is_demo: boolean;
  is_own_record: boolean;
  /**
   * Dimensionless, and comparable only *within one answer*: the scaling comes
   * from that pool's own spread, so 0.4 here and 0.4 in another run are not the
   * same statement.
   */
  distance: number;
  rank: number;
  /** Per-property squared contribution, so a position can be explained. */
  contributions: Record<string, number>;
}

/** A record that could not be placed on the basis, and what it lacked. */
export interface SimilarExcluded {
  record_id: number;
  name: string;
  missing_slugs: string[];
  missing_labels: string[];
}

export interface Similar {
  reference_id: number;
  reference_name: string;
  basis: string[];
  basis_labels: string[];
  neighbours: Neighbour[];
  excluded: SimilarExcluded[];
  /** Basis properties every record agreed on: they separated nobody. */
  degenerate: string[];
  degenerate_labels: string[];
  /** Basis properties measured linearly despite asking for log space. */
  linear_fallback: string[];
  linear_fallback_labels: string[];
}

// --- Engineering Solver & Performance Index Finder (P2) ---------------------

/** One number the designer supplies. Never a material property. */
export interface DesignVariable {
  key: string;
  label: string;
  /** Canonical unit the value must already be in. */
  unit: string;
  help_text: string;
}

/**
 * A named end condition that fills one design variable.
 *
 * A choice and not a hidden constant: the beam deflection constant and the
 * Euler end-fixity factor are what make two otherwise identical briefs give
 * different answers, so the reader has to see which one ran.
 */
export interface SupportCondition {
  key: string;
  label: string;
  variable_key: string;
  value: number;
  note: string | null;
}

/**
 * One standard load case: the derivation, and the index it yields.
 *
 * This is both halves of the item. Read by facet (`function_label`,
 * `constraint_label`, `objective_label`) it is the Performance Index Finder;
 * filled in with numbers it is the Engineering Solver's brief. `index_expression`
 * is joined from the index catalogue at read time and never authored alongside
 * the case, so the formula on screen is the one that runs.
 */
export interface LoadCase {
  key: string;
  label: string;
  summary: string;
  function_label: string;
  constraint_label: string;
  objective_label: string;
  free_variable_label: string;
  fixed_labels: string[];
  derivation: string[];
  reference: string;
  index_slug: string;
  index_name: string | null;
  index_expression: string | null;
  index_goal: string | null;
  /**
   * The same derivation read against cost (D-65): ρ·Cm in place of ρ in the
   * material grouping. Carried beside the mass index, not in place of it — a
   * case answers two objectives and the reader chooses which one runs.
   */
  cost_index_slug: string;
  cost_index_name: string | null;
  cost_index_expression: string | null;
  cost_objective_label: string;
  objective_unit: string;
  free_unit: string;
  variables: DesignVariable[];
  supports: SupportCondition[];
}

/** Which of a case's two indices to run. Defaults to the mass on the server. */
export type SolverObjective = "massa" | "custo";

export interface SolveRequest {
  case_key: string;
  /** One value per design variable, in that variable's canonical unit. */
  inputs: Record<string, number>;
  objective?: SolverObjective;
  limit?: number;
}

export interface SolvedRecord {
  record_id: number;
  name: string;
  class_name: string;
  class_slug: string;
  is_demo: boolean;
  is_own_record: boolean;
  rank: number;
  index_value: number;
  /** The objective — a mass, or a material cost — in `objective_unit`. */
  objective_value: number;
  /** The free variable — section area or plate thickness — in `free_unit`. */
  free_value: number;
}

/** A material that could not be dimensioned, and what it lacked. */
export interface SolverExcluded {
  record_id: number;
  name: string;
  missing_slugs: string[];
  missing_labels: string[];
  reason: string;
}

export interface SolveResult {
  case: LoadCase;
  inputs: Record<string, number>;
  /**
   * Which objective ran, and the index that answered it — on the result rather
   * than read off the case, because a case carries two indices and showing the
   * other one would make the screen disagree with the number under it.
   */
  objective: SolverObjective;
  objective_label: string;
  index_slug: string;
  index_name: string | null;
  index_expression: string | null;
  /**
   * Pure geometry and load: the same number for every material in the run,
   * which is what makes the ordering the index's ordering. Returned so the
   * reader can check a mass by hand — mass = structural factor / index.
   */
  structural_factor: number;
  free_structural_factor: number;
  objective_unit: string;
  free_unit: string;
  /**
   * Derived by Pint from the canonical units, never declared by hand — and on a
   * cost run *not* the answer's unit: `custo_massa` is dimensionless, so the
   * dimension comes out as a mass and `objective_note` says why.
   */
  objective_dimension: string;
  free_dimension: string;
  objective_note: string | null;
  solved: SolvedRecord[];
  excluded: SolverExcluded[];
}

// --- Part Cost Estimator (P3) -----------------------------------------------

export interface CostRequest {
  material_id: number;
  /** Finished part mass, kg — from the Solver, or measured. */
  part_mass: number;
  batch_size: number;
  write_off_years?: number;
  load_factor?: number;
}

/**
 * One estimate, decomposed.
 *
 * The sum is `total`; the parts are the point. Each behaves differently with
 * the batch: `material` is a floor no batch can get under, `tooling` falls as
 * 1/n, and the two time terms do not move with n at all.
 */
export interface CostTerms {
  material: number;
  tooling: number;
  overhead: number;
  capital: number;
  total: number;
  /** The share a larger batch could still remove — the tooling term. */
  batch_sensitive: number;
}

export interface CostedProcess {
  process_id: number;
  process_slug: string;
  process_name: string;
  class_name: string;
  rank: number;
  terms: CostTerms;
}

/** A process that could not be priced, and what it lacked. */
export interface UncostedProcess {
  process_id: number;
  process_slug: string;
  process_name: string;
  missing_slugs: string[];
  missing_labels: string[];
  reason: string;
}

export interface CostResult {
  material_id: number;
  material_name: string;
  part_mass: number;
  batch_size: number;
  write_off_years: number;
  load_factor: number;
  material_cost_per_mass: number;
  /**
   * What the answer is denominated in. Money is not a physical quantity and the
   * catalogue never recorded a currency, so the screen says this instead of
   * printing a symbol nobody declared.
   */
  monetary_unit_note: string;
  costed: CostedProcess[];
  uncosted: UncostedProcess[];
}

// --- Eco Audit (P3) ----------------------------------------------------------

/** One way of moving a finished part. A closed, seeded vocabulary. */
export interface TransportMode {
  slug: string;
  name: string;
  description: string | null;
  /**
   * MJ and kg CO₂ per tonne-kilometre. `null` means nobody catalogued it — a
   * state, never a zero, and the audit says so in the transport phase.
   */
  energy_intensity: number | null;
  carbon_intensity: number | null;
  is_demo: boolean;
}

/**
 * Which of the two service models runs, and its own numbers.
 *
 * They are not variants of one model: in `estatico` the part's mass does not
 * appear at all, so lightweighting saves nothing in the use phase; in `movel`
 * it is a linear factor. Sending a field belonging to the other model is
 * refused by the API, never ignored.
 */
export type UseModel = "estatico" | "movel";

export interface EcoUseIn {
  model: UseModel;
  power_watts?: number | null;
  duty_cycle?: number | null;
  distance_km?: number | null;
  mobile_intensity?: number | null;
  life_years?: number | null;
  carbon_per_energy?: number | null;
}

export type EndOfLifeRoute = "reciclagem" | "aterro" | "incineracao";

export interface EcoAuditRequest {
  material_id: number;
  /** Required: an eco audit of a part is an audit of *making* the part. */
  process_id: number;
  part_mass: number;
  recycled_fraction?: number;
  transport_mode: string;
  transport_distance_km?: number;
  use: EcoUseIn;
  end_of_life?: EndOfLifeRoute;
}

/**
 * One phase of the life, with energy and carbon answered independently.
 *
 * They read different catalogued data, so a phase can be known in megajoules
 * and unknown in kilograms of CO₂ — which is why each carries its own absence
 * and its own written reason (D-24).
 */
export interface EcoPhase {
  phase: string;
  label: string;
  energy: number | null;
  carbon: number | null;
  detail: string;
  energy_missing: string[];
  carbon_missing: string[];
  energy_reason: string | null;
  carbon_reason: string | null;
}

/** The heaviest phase of one quantity, or the reason nobody can name one. */
export interface EcoDominance {
  phase: string | null;
  label: string | null;
  share: number | null;
  refusal: string | null;
}

export interface EcoAuditResult {
  material_id: number;
  material_name: string;
  process_id: number;
  process_name: string;
  transport_mode: TransportMode;
  transport_distance_km: number;
  /** What the part weighs, and what had to be bought to make it. */
  mass_in_part: number;
  mass_bought: number;
  scrap_fraction: number;
  recycled_fraction: number;
  use_model: UseModel;
  end_of_life: EndOfLifeRoute;
  phases: EcoPhase[];
  /** `null` when any phase is absent: a total over four of five is a subtotal. */
  total_energy: number | null;
  total_carbon: number | null;
  energy_dominance: EcoDominance;
  carbon_dominance: EcoDominance;
  energy_unit: string;
  carbon_unit: string;
  carbon_unit_note: string;
  recycling_credit_note: string;
}

// --- Synthesizer (P3) --------------------------------------------------------

/** Os três tipos de síntese. */
export type SynthesisKind = "composito" | "espuma" | "painel";

/**
 * Uma lei de mistura ou de escala.
 *
 * `basis` é o quanto se pode confiar no número que ela produz: `exato` é
 * conservação de massa ou definição, `limites` é um par que depende de algo que
 * o catálogo não registra (a direção), `empirico` é ajuste experimental.
 */
export interface SynthesisRule {
  key: string;
  label: string;
  formula: string;
  basis: "exato" | "limites" | "empirico";
  basis_label: string;
}

export interface SynthesisKindInfo {
  kind: SynthesisKind;
  label: string;
  note: string;
  /** Slug da propriedade → a lei que roda nela. */
  rules: Record<string, SynthesisRule>;
  /**
   * Slug → por que este tipo **não** sintetiza aquela propriedade. Um "não sei"
   * com motivo é resposta; um silêncio não é.
   */
  without_rule: Record<string, string>;
}

export interface SynthesisRequest {
  kind: SynthesisKind;
  name: string;
  class_id: number;
  description?: string | null;
  /** Num painel, é a **face**. */
  parent_a_id: number;
  /** Num compósito e num painel (o **núcleo**). Numa espuma é recusado. */
  parent_b_id?: number | null;
  volume_fraction?: number | null;
  relative_density?: number | null;
  /**
   * Espessura de cada face e do núcleo, na mesma unidade. Qual unidade é não
  * importa: toda regra do painel lê só a razão entre as duas. Mandar estes
  * campos noutro tipo é recusado, nunca ignorado.
   */
  face_thickness?: number | null;
  core_thickness?: number | null;
}

export interface SynthesizedValue {
  slug: string;
  name: string;
  canonical_unit: string | null;
  /** Escalar, ou `null` quando a regra devolveu um par de limites. */
  value: number | null;
  value_min: number | null;
  value_max: number | null;
  rule: SynthesisRule;
  /** A pior qualidade entre os valores dos pais que a regra leu. */
  quality: string;
}

export interface SynthesisSkipped {
  slug: string;
  name: string;
  reason: string;
}

export interface SynthesisPreview {
  kind: SynthesisKind;
  kind_label: string;
  kind_note: string;
  parents: string[];
  parameters: Record<string, number>;
  values: SynthesizedValue[];
  skipped: SynthesisSkipped[];
}

export interface SynthesisResult extends SynthesisPreview {
  material_id: number;
  material_name: string;
}

// --- Battery Designer (P4 / Módulo S) ----------------------------------------

export type ThermalSafetyLevel =
  | "BAIXA"
  | "MODERADA"
  | "MEDIA"
  | "ALTA"
  | "MUITO_ALTA";

export interface BatteryChemistry {
  slug: string;
  name: string;
  formula: string;
  nominal_voltage: number;
  specific_energy: number;
  energy_density: number;
  specific_power: number;
  cycle_efficiency: number;
  cycle_life: number;
  cell_cost_per_kwh: number;
  thermal_safety: ThermalSafetyLevel;
  thermal_runaway_temp_c: number;
  operating_temp_min_c: number;
  operating_temp_max_c: number;
  max_continuous_c_rate: number;
  peak_c_rate: number;
  description: string;
  advantages: string[];
  limitations: string[];
  typical_applications: string[];
  /** A citação específica desta química, como o catálogo a guarda. */
  citation: string | null;
  /** O rótulo da fonte que registra o conjunto e a sua licença (M1). */
  source: string | null;
}

export interface ApplicationArchetype {
  slug: string;
  name: string;
  description: string;
  target_voltage: number;
  target_energy_kwh: number;
  target_power_kw: number;
  target_dod: number;
  recommended_chemistries: string[];
  default_cell_capacity_ah: number;
}

export interface PackDesignRequest {
  chemistry_slug: string;
  target_voltage_v: number;
  target_energy_kwh: number;
  target_power_kw: number;
  dod?: number;
  cell_capacity_ah?: number | null;
  mass_packing_factor?: number;
  volume_packing_factor?: number;
  cost_packing_factor?: number;
}

export interface PackDesignResult {
  chemistry: BatteryChemistry;
  series_cells_ns: number;
  parallel_strings_np: number;
  total_cells: number;
  cell_capacity_ah: number;
  cell_energy_wh: number;
  cell_mass_kg: number;
  cell_volume_l: number;
  cell_peak_power_w: number;
  nominal_voltage_v: number;
  pack_capacity_ah: number;
  gross_energy_kwh: number;
  usable_energy_kwh: number;
  peak_power_kw: number;
  max_continuous_discharge_c_rate: number;
  dod: number;
  cells_mass_kg: number;
  pack_mass_kg: number;
  mass_overhead_kg: number;
  mass_packing_factor: number;
  cells_volume_l: number;
  pack_volume_l: number;
  volume_overhead_l: number;
  volume_packing_factor: number;
  pack_specific_energy_wh_kg: number;
  pack_energy_density_wh_l: number;
  cell_cost_total_usd: number;
  pack_cost_total_usd: number;
  cost_overhead_usd: number;
  cost_packing_factor: number;
  cycle_life_at_dod: number;
  levelized_cost_per_kwh_cycle: number;
  thermal_safety: ThermalSafetyLevel;
  thermal_guidelines: string[];
}

export interface BatteryComparisonRequest {
  target_voltage_v: number;
  target_energy_kwh: number;
  target_power_kw: number;
  dod?: number;
  cell_capacity_ah?: number | null;
  mass_packing_factor?: number;
  volume_packing_factor?: number;
  cost_packing_factor?: number;
}

export interface ChemistryComparisonItem {
  chemistry_slug: string;
  chemistry_name: string;
  pack_mass_kg: number;
  pack_volume_l: number;
  pack_cost_usd: number;
  cycle_life: number;
  levelized_cost_per_kwh_cycle: number;
  pack_specific_energy_wh_kg: number;
  pack_energy_density_wh_l: number;
  thermal_safety: ThermalSafetyLevel;
  series_cells_ns: number;
  parallel_strings_np: number;
  total_cells: number;
  usable_energy_kwh: number;
}

export interface BatteryComparisonResult {
  target_voltage: number;
  target_energy_kwh: number;
  target_power_kw: number;
  dod: number;
  items: ChemistryComparisonItem[];
  lightest_slug: string;
  most_compact_slug: string;
  lowest_upfront_cost_slug: string;
  most_durable_slug: string;
  lowest_levelized_cost_slug: string;
  safest_slug: string;
  technical_summary: string;
}
