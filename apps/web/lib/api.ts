// Typed client for the MaterialSelect AI backend.
// Base URL comes from NEXT_PUBLIC_API_URL (default: http://localhost:8000).

import type {
  AhpWeightsIn,
  AhpWeightsOut,
  AIStatus,
  ApplicationArchetype,
  BatteryChemistry,
  BatteryComparisonRequest,
  BatteryComparisonResult,
  BillingStatus,
  ChartData,
  CheckoutSession,
  CatalogRelease,
  CommitResult,
  Comparison,
  ComparisonRequest,
  CostRequest,
  CostResult,
  CurrentUser,
  Curve,
  CurveScale,
  DashboardOverview,
  EcoAuditRequest,
  EndOfLifeRouteInfo,
  EcoAuditResult,
  EcoComparisonRequest,
  EcoComparisonResult,
  Explanation,
  Interpretation,
  MaterialEquivalences,
  ReleaseDiff,
  ReleaseDiffItem,
  ReleaseRecordStatus,
  ReleaseUniverse,
  ImportJobOut,
  ImportMapping,
  ImportTemplate,
  IndexResult,
  LoadCase,
  MaterialClass,
  MaterialClassIn,
  MaterialCurves,
  MaterialCreate,
  MaterialDetail,
  MaterialListItem,
  MaterialSearch,
  MaterialUpdate,
  CompositionEntryIn,
  CurveIn,
  CurveKindSpec,
  CurveSummary,
  DesignationIn,
  MyRecords,
  Notebook,
  NotebookChat,
  NotebookMessage,
  NotebookNote,
  NotebookSearch,
  NotebookSearchRequest,
  NotebookSource,
  NotebookSourceCapabilities,
  NotebookSourceDetail,
  NotebookSummary,
  NotebookUpdate,
  NotebookExternalSourceRequest,
  NotebookYoutubeResult,
  NotebookYoutubeSourceRequest,
  StudioArtifact,
  StudioCatalog,
  StudioExport,
  StudioList,
  StudioRequest,
  PerformanceIndex,
  PortalSession,
  MaterialClassDetail,
  PackDesignRequest,
  PackDesignResult,
  Process,
  ProcessAttribute,
  ProcessClass,
  ProcessClassDetail,
  ProcessDetail,
  PropertyDefinition,
  PropertyDefinitionIn,
  PropertyDistribution,
  PropertyMap,
  MapBoxOut,
  MapBoxRequest,
  PropertyMapRequest,
  PropertyValueIn,
  RunRequest,
  RunResult,
  SavedChart,
  SavedChartIn,
  SavedChartListItem,
  Similar,
  SimilarRequest,
  SolveRequest,
  SolveResult,
  SynthesisKindInfo,
  SynthesisPreview,
  SynthesisRequest,
  SynthesisResult,
  StudyDetail,
  StudyIn,
  StudySummary,
  TransportMode,
  Universe,
  UploadResult,
  ValidationReport,
  WeightsPreview,
  WeightsPreviewRequest,
} from "./types";

/**
 * Where the API lives, from the browser's point of view.
 *
 * An **empty string is a meaningful value**, not a missing one: it makes every
 * call below relative (`/api/materiais`), which is what the same-origin proxy
 * deployment needs — `next.config.mjs` rewrites `/api/*` to the real API, so
 * the browser only ever talks to the frontend's own origin and the session
 * cookie stays first-party. See docs/13-deploy.md.
 *
 * Hence `??` and not `||`: the latter would treat "" as absent and fall back to
 * localhost, sending the deployed frontend at the developer's own machine.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The readable part of a FastAPI error body: a string `detail` as is, or — for
 * a 422 — each validation entry as `field: message`. Without the second form
 * every validation failure reached the screen as "Falha na requisição /path",
 * which names the URL and hides the one field that was wrong.
 */
export function readErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return null;
  const lines = detail
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const { loc, msg } = entry as { loc?: unknown; msg?: unknown };
      if (typeof msg !== "string") return null;
      const field = Array.isArray(loc)
        ? loc.filter((part) => part !== "body").join(".")
        : "";
      return field ? `${field}: ${msg}` : msg;
    })
    .filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.join("; ") : null;
}

/** Extract a human-readable error message from a failed response body. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const detail = readErrorDetail(body.detail);
    if (detail) return detail;
  } catch {
    // non-JSON body; use the fallback
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(
      await errorMessage(res, `Falha na requisição ${path}`),
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Auth -------------------------------------------------------------------

export function getCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>(`/api/auth/me`);
}

export function logout(): Promise<void> {
  return request<void>(`/api/auth/logout`, { method: "POST" });
}

/** For a plain `<a href>` — a full-page redirect into Google, not a fetch. */
export function googleLoginUrl(): string {
  return `${API_URL}/api/auth/google/login`;
}

// --- Materials ------------------------------------------------------------

export function listMaterials(search?: string): Promise<MaterialListItem[]> {
  const query =
    search && search.trim()
      ? `?search=${encodeURIComponent(search.trim())}`
      : "";
  return request<MaterialListItem[]>(`/api/materials${query}`);
}

/**
 * The catalogue search with what it knows besides the rows (D-55, D-105).
 *
 * Same matching as `listMaterials`; this one also carries, when the query asks
 * about composition (`comp:`), the rule that ran and how many materials were
 * left out for lack of data — the catalogue screen states both.
 */
export function searchMaterials(query?: string): Promise<MaterialSearch> {
  const q = query && query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return request<MaterialSearch>(`/api/materials/busca${q}`);
}

/**
 * Serializa a escolha de unidade de leitura para a URL (D-70).
 *
 * O formato é o que o backend lê em `parse_choices`: `slug:unidade`, separados
 * por vírgula. Um mapa vazio devolve `""` e a requisição sai sem o parâmetro —
 * que é "leia pela convenção de cada grandeza".
 */
export function unitChoicesParam(choices: Record<string, string>): string {
  const pairs = Object.entries(choices).filter(([, unit]) => Boolean(unit));
  if (pairs.length === 0) return "";
  return pairs.map(([slug, unit]) => `${slug}:${unit}`).join(",");
}

export function withUnits(path: string, choices?: Record<string, string>): string {
  const value = unitChoicesParam(choices ?? {});
  if (!value) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}unidades=${encodeURIComponent(value)}`;
}

export function getMaterial(
  id: number,
  unitChoices?: Record<string, string>,
): Promise<MaterialDetail> {
  return request<MaterialDetail>(
    withUnits(`/api/materials/${id}`, unitChoices),
  );
}

// --- Declared equivalences (D-115) ------------------------------------------

/** What a source declares equivalent to this material's designations. */
export function listMaterialEquivalences(materialId: number): Promise<MaterialEquivalences> {
  return request<MaterialEquivalences>(`/api/materials/${materialId}/equivalencias`);
}

// --- Material curves (D-106) -----------------------------------------------

/** The material's curves, with a count for every kind — zero included. */
export function listMaterialCurves(materialId: number): Promise<MaterialCurves> {
  return request<MaterialCurves>(`/api/materials/${materialId}/curvas`);
}

/** The reader's choices for one curve: units per axis and scale, all optional. */
export interface CurveReading {
  x?: string;
  y?: string;
  /** Unit the family parameter is read in (TM4-e). */
  parameter?: string;
  scale?: CurveScale;
}

function curveQuery(reading: CurveReading): string {
  const params = new URLSearchParams();
  if (reading.x) params.set("unidade_x", reading.x);
  if (reading.y) params.set("unidade_y", reading.y);
  if (reading.parameter) params.set("unidade_parametro", reading.parameter);
  if (reading.scale) params.set("escala", reading.scale);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * One curve, ready to draw (ADR 0004): points, band and domain already in the
 * reading units. A unit or scale the axis refuses comes back as a 400 whose
 * `detail` names what is admitted.
 */
export function getMaterialCurve(
  materialId: number,
  curveId: number,
  reading: CurveReading = {},
): Promise<Curve> {
  return request<Curve>(
    `/api/materials/${materialId}/curvas/${curveId}${curveQuery(reading)}`,
  );
}

/** The curve's points as a file, in the same reading units as the figure. */
export function curveExportUrl(
  materialId: number,
  curveId: number,
  format: "csv" | "xlsx",
  reading: Pick<CurveReading, "x" | "y"> = {},
): string {
  return `${API_URL}/api/exports/materiais/${materialId}/curvas/${curveId}.${format}${curveQuery({ x: reading.x, y: reading.y })}`;
}

// --- Changes between catalogue releases (D-108) -----------------------------

/** Every release of the official catalogue, grouped by lineage, in write order. */
export function listCatalogReleases(): Promise<CatalogRelease[]> {
  return request<CatalogRelease[]>(`/api/catalogo/releases`);
}

/** What the reader asks of one comparison; every field but the pair is optional. */
export interface ReleaseDiffQuery {
  tipo?: ReleaseRecordStatus;
  classe?: string;
  universo?: ReleaseUniverse;
  pagina?: number;
  porPagina?: number;
}

function releaseDiffQuery(query: ReleaseDiffQuery, withPage: boolean): string {
  const params = new URLSearchParams();
  if (query.tipo) params.set("tipo", query.tipo);
  if (query.classe) params.set("classe", query.classe);
  if (query.universo) params.set("universo", query.universo);
  if (withPage && query.pagina && query.pagina > 1) params.set("pagina", String(query.pagina));
  if (withPage && query.porPagina) params.set("por_pagina", String(query.porPagina));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * The diff from `base` to `target`, derived by the backend (ADR 0004: the client
 * never compares or converts). Releases are addressed by slug.
 */
export function getReleaseDiff(
  base: string,
  target: string,
  query: ReleaseDiffQuery = {},
): Promise<ReleaseDiff> {
  return request<ReleaseDiff>(
    `/api/catalogo/releases/${encodeURIComponent(base)}/diff/${encodeURIComponent(target)}${releaseDiffQuery(query, true)}`,
  );
}

/** One record of the diff by its external identity — never by name. */
export function getReleaseDiffRecord(
  base: string,
  target: string,
  table: string,
  id: string,
): Promise<ReleaseDiffItem> {
  const params = new URLSearchParams({ tabela: table, id });
  return request<ReleaseDiffItem>(
    `/api/catalogo/releases/${encodeURIComponent(base)}/diff/${encodeURIComponent(target)}/registro?${params.toString()}`,
  );
}

/** The comparison as a file: the filter applies, the page does not. */
export function releaseDiffExportUrl(
  base: string,
  target: string,
  format: "csv" | "xlsx",
  query: Pick<ReleaseDiffQuery, "tipo" | "classe" | "universo"> = {},
): string {
  return `${API_URL}/api/exports/catalogo/releases/${encodeURIComponent(base)}/diff/${encodeURIComponent(target)}.${format}${releaseDiffQuery(query, false)}`;
}

export function getChart(x: string, y: string): Promise<ChartData> {
  return request<ChartData>(
    `/api/materials/chart?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`,
  );
}

export function createMaterial(
  payload: MaterialCreate,
): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Duplicate one of the caller's own records as an editable copy (D-122). */
export function duplicateMaterial(id: number): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials/${id}/duplicar`, {
    method: "POST",
  });
}

export function updateMaterial(
  id: number,
  payload: MaterialUpdate,
): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function replaceMaterialValues(
  id: number,
  values: PropertyValueIn[],
): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials/${id}/values`, {
    method: "PUT",
    body: JSON.stringify(values),
  });
}

export function replaceMaterialComposition(
  id: number,
  entries: CompositionEntryIn[],
): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials/${id}/composicao`, {
    method: "PUT",
    body: JSON.stringify({ entries }),
  });
}

export function replaceMaterialDesignations(
  id: number,
  designations: DesignationIn[],
): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials/${id}/designacoes`, {
    method: "PUT",
    body: JSON.stringify({ designations }),
  });
}

export function listCurveKinds(): Promise<CurveKindSpec[]> {
  return request<CurveKindSpec[]>(`/api/materials/curvas-tipos`);
}

export function createMaterialCurve(materialId: number, payload: CurveIn): Promise<CurveSummary> {
  return request<CurveSummary>(`/api/materials/${materialId}/curvas`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function replaceMaterialCurve(
  materialId: number,
  curveId: number,
  payload: CurveIn,
): Promise<CurveSummary> {
  return request<CurveSummary>(`/api/materials/${materialId}/curvas/${curveId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteMaterialCurve(materialId: number, curveId: number): Promise<void> {
  return request<void>(`/api/materials/${materialId}/curvas/${curveId}`, { method: "DELETE" });
}

export function deactivateMaterial(id: number): Promise<void> {
  return request<void>(`/api/materials/${id}`, { method: "DELETE" });
}

// --- Classes --------------------------------------------------------------

export function listClasses(): Promise<MaterialClass[]> {
  return request<MaterialClass[]>(`/api/classes`);
}

export function createClass(payload: MaterialClassIn): Promise<MaterialClass> {
  return request<MaterialClass>(`/api/classes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateClass(
  id: number,
  payload: MaterialClassIn,
): Promise<MaterialClass> {
  return request<MaterialClass>(`/api/classes/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteClass(id: number): Promise<void> {
  return request<void>(`/api/classes/${id}`, { method: "DELETE" });
}

// --- Processes (P0-2) -----------------------------------------------------

export function listProcesses(): Promise<Process[]> {
  return request<Process[]>(`/api/processes`);
}

export function listProcessClasses(): Promise<ProcessClass[]> {
  return request<ProcessClass[]>(`/api/processes/classes`);
}

/**
 * The process attribute catalogue (P0-4) — what a limit stage over processes can
 * select on, and which shape of value each attribute holds.
 *
 * A call of its own and not part of `listProperties`: the two catalogues are
 * separate tables precisely so a material property picker cannot reach "faixa de
 * massa" and offer a process capability as a material property.
 */
export function listProcessAttributes(): Promise<ProcessAttribute[]> {
  return request<ProcessAttribute[]>(`/api/processes/attributes`);
}

/** One process with its attributes and their provenance — the datasheet (P1-4). */
export function getProcess(slug: string): Promise<ProcessDetail> {
  return request<ProcessDetail>(`/api/processes/${encodeURIComponent(slug)}`);
}

/** One process family as a record: prose, breadcrumb, subfolders, processes (P1-4). */
export function getProcessClass(slug: string): Promise<ProcessClassDetail> {
  return request<ProcessClassDetail>(
    `/api/processes/classes/${encodeURIComponent(slug)}`,
  );
}

/** One material family as a record: prose, breadcrumb, subfolders (P1-4). */
export function getClass(slug: string): Promise<MaterialClassDetail> {
  return request<MaterialClassDetail>(
    `/api/classes/${encodeURIComponent(slug)}`,
  );
}

// --- Properties -----------------------------------------------------------

export function listProperties(): Promise<PropertyDefinition[]> {
  return request<PropertyDefinition[]>(`/api/properties`);
}

export function createProperty(
  payload: PropertyDefinitionIn,
): Promise<PropertyDefinition> {
  return request<PropertyDefinition>(`/api/properties`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProperty(
  id: number,
  payload: PropertyDefinitionIn,
): Promise<PropertyDefinition> {
  return request<PropertyDefinition>(`/api/properties/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteProperty(id: number): Promise<void> {
  return request<void>(`/api/properties/${id}`, { method: "DELETE" });
}

// --- Imports ----------------------------------------------------------------

export async function uploadImportFile(file: File): Promise<UploadResult> {
  // FormData: the browser sets the multipart Content-Type (with boundary)
  // itself, so this request must NOT go through the JSON `request` helper.
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/imports/upload`, {
    method: "POST",
    body: form,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(
      await errorMessage(res, "Falha no envio do arquivo"),
      res.status,
    );
  }
  return (await res.json()) as UploadResult;
}

export function previewImportSheet(
  jobId: number,
  sheetName: string,
): Promise<UploadResult> {
  return request<UploadResult>(`/api/imports/${jobId}/preview`, {
    method: "POST",
    body: JSON.stringify({ sheet_name: sheetName }),
  });
}

export function validateImport(
  jobId: number,
  mapping: ImportMapping,
): Promise<ValidationReport> {
  return request<ValidationReport>(`/api/imports/${jobId}/validate`, {
    method: "POST",
    body: JSON.stringify({ mapping }),
  });
}

export function commitImport(jobId: number): Promise<CommitResult> {
  return request<CommitResult>(`/api/imports/${jobId}/commit`, {
    method: "POST",
  });
}

export function cancelImport(jobId: number): Promise<ImportJobOut> {
  return request<ImportJobOut>(`/api/imports/${jobId}/cancel`, {
    method: "POST",
  });
}

export function rollbackImport(jobId: number): Promise<ImportJobOut> {
  return request<ImportJobOut>(`/api/imports/${jobId}/rollback`, {
    method: "POST",
  });
}

export function listImports(): Promise<ImportJobOut[]> {
  return request<ImportJobOut[]>(`/api/imports`);
}

export function listImportTemplates(): Promise<ImportTemplate[]> {
  return request<ImportTemplate[]>(`/api/import-templates`);
}

export function createImportTemplate(
  name: string,
  mapping: ImportMapping,
): Promise<ImportTemplate> {
  return request<ImportTemplate>(`/api/import-templates`, {
    method: "POST",
    body: JSON.stringify({ name, mapping }),
  });
}

// --- Selection --------------------------------------------------------------

export function runSelection(payload: RunRequest): Promise<RunResult> {
  return request<RunResult>(`/api/selection/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** The weight budget of the criteria as typed, plus the top-N they rank (D-87). */
export function previewWeights(payload: WeightsPreviewRequest): Promise<WeightsPreview> {
  return request<WeightsPreview>(`/api/selection/weights-preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deriveAhpWeights(
  payload: AhpWeightsIn,
): Promise<AhpWeightsOut> {
  return request<AhpWeightsOut>(`/api/selection/ahp-weights`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function evaluateIndex(
  expression: string,
  goal: "maximize" | "minimize",
): Promise<IndexResult> {
  return request<IndexResult>(`/api/selection/index`, {
    method: "POST",
    body: JSON.stringify({ expression, goal }),
  });
}

export function listPerformanceIndices(): Promise<PerformanceIndex[]> {
  return request<PerformanceIndex[]>(`/api/performance-indices`);
}

export function listStudies(): Promise<StudySummary[]> {
  return request<StudySummary[]>(`/api/selection/studies`);
}

export function getStudy(id: number): Promise<StudyDetail> {
  return request<StudyDetail>(`/api/selection/studies/${id}`);
}

export function createStudy(payload: StudyIn): Promise<StudyDetail> {
  return request<StudyDetail>(`/api/selection/studies`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Create a study from the text of an exported study file (D-122). The text is
 * sent as the request body, untouched: the file is untrusted input and it is the
 * server that bounds, parses and validates it — nothing in it is evaluated here.
 */
export function importStudyFile(text: string): Promise<StudyDetail> {
  return request<StudyDetail>(`/api/selection/studies/import`, {
    method: "POST",
    body: text,
  });
}

/** The versioned JSON file of one saved study (D-122), an attachment. */
export function studyFileUrl(studyId: number): string {
  return `${API_URL}/api/selection/studies/${studyId}/export`;
}

export function deleteStudy(id: number): Promise<void> {
  return request<void>(`/api/selection/studies/${id}`, { method: "DELETE" });
}

export function runStudy(id: number): Promise<RunResult> {
  return request<RunResult>(`/api/selection/studies/${id}/run`, {
    method: "POST",
  });
}

// --- Saved charts -----------------------------------------------------------

export function listSavedCharts(): Promise<SavedChartListItem[]> {
  return request<SavedChartListItem[]>(`/api/saved-charts`);
}

export function getSavedChart(id: number): Promise<SavedChart> {
  return request<SavedChart>(`/api/saved-charts/${id}`);
}

export function createSavedChart(payload: SavedChartIn): Promise<SavedChart> {
  return request<SavedChart>(`/api/saved-charts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteSavedChart(id: number): Promise<void> {
  return request<void>(`/api/saved-charts/${id}`, { method: "DELETE" });
}

// --- Visualisation ----------------------------------------------------------

export function getPropertyMap(
  payload: PropertyMapRequest,
): Promise<PropertyMap> {
  return request<PropertyMap>(`/api/charts/property-map`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Move a Chart Stage region between the map's reading units and canonical
 * units (D-81). The map draws in g/cm³ and GPa (D-70); the stage stores and
 * compares in kg/m³ and Pa (D-60). The conversion is the backend's — the same
 * rule the map is drawn with — and never a factor applied here.
 */
export function convertMapBox(
  payload: MapBoxRequest,
  unitChoices?: Record<string, string>,
): Promise<MapBoxOut> {
  return request<MapBoxOut>(withUnits(`/api/charts/map-box`, unitChoices), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getComparison(payload: ComparisonRequest): Promise<Comparison> {
  return request<Comparison>(`/api/charts/compare`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Dashboard ---------------------------------------------------------------

export function getDashboardOverview(): Promise<DashboardOverview> {
  return request<DashboardOverview>(`/api/dashboard/overview`);
}

export function getDashboardDistribution(
  propertySlug: string,
): Promise<PropertyDistribution> {
  return request<PropertyDistribution>(
    `/api/dashboard/distribution/${encodeURIComponent(propertySlug)}`,
  );
}

// --- Optional AI layer ------------------------------------------------------

export function getAIStatus(): Promise<AIStatus> {
  return request<AIStatus>(`/api/ai/status`);
}

export function interpretStatement(statement: string): Promise<Interpretation> {
  return request<Interpretation>(`/api/ai/interpret`, {
    method: "POST",
    body: JSON.stringify({ statement }),
  });
}

export function explainStudy(studyId: number): Promise<Explanation> {
  return request<Explanation>(`/api/ai/explain`, {
    method: "POST",
    body: JSON.stringify({ study_id: studyId }),
  });
}

// --- Billing (assinatura Stripe) ---------------------------------------------

export function getBillingStatus(): Promise<BillingStatus> {
  return request<BillingStatus>(`/api/billing/status`);
}

export function createCheckoutSession(): Promise<CheckoutSession> {
  return request<CheckoutSession>(`/api/billing/checkout`, { method: "POST" });
}

export function createPortalSession(): Promise<PortalSession> {
  return request<PortalSession>(`/api/billing/portal`, { method: "POST" });
}

// --- Exports ----------------------------------------------------------------
// Downloads are plain links rather than fetch calls: the browser then handles
// the Content-Disposition filename and the save dialog natively.
//
// "html" is not a download: the API serves it inline so the browser renders it
// and the user prints it to PDF. That is deliberately how the project gets a
// PDF without taking on a PDF-generation dependency.

export type ExportFormat = "csv" | "xlsx" | "html" | "docx" | "pptx";

/** True when the format opens in the browser instead of downloading. */
export function opensInBrowser(format: ExportFormat): boolean {
  return format === "html";
}

export function catalogueExportUrl(format: ExportFormat): string {
  return `${API_URL}/api/exports/catalogo.${format}`;
}

export function studyExportUrl(studyId: number, format: ExportFormat): string {
  return `${API_URL}/api/exports/estudos/${studyId}.${format}`;
}

/**
 * The engineering report (laudo): a document distinct from the selection
 * report, combining a ranking figure, the same audit tables, and — when the
 * AI layer is on — an interpretive narrative. HTML opens inline; DOCX and
 * PPTX download as native files.
 */
export function studyLaudoUrl(
  studyId: number,
  responsible?: string,
  format: "html" | "docx" | "pptx" = "html",
): string {
  const trimmed = responsible?.trim();
  const query = trimmed
    ? `?${new URLSearchParams({ responsavel: trimmed })}`
    : "";
  return `${API_URL}/api/exports/estudos/${studyId}/laudo.${format}${query}`;
}

/**
 * Ficha técnica detalhada do material em PDF/HTML, CSV ou XLSX (D-124).
 * HTML abre inline com CSS @media print para impressão em PDF pelo navegador.
 */
export function materialExportUrl(
  materialId: number,
  format: "html" | "csv" | "xlsx",
  unitChoices?: Record<string, string>,
): string {
  return `${API_URL}${withUnits(`/api/exports/materiais/${materialId}.${format}`, unitChoices)}`;
}

// --- CAE material card (D-104) ---------------------------------------------

export type CaeFormat = "mapdl" | "abaqus" | "nastran" | "lsdyna" | "matml";
export type CaeUnitSystem = "m-kg-s" | "mm-t-s" | "in-lbf-s";

export function caeExportUrl(
  materialId: number,
  format: CaeFormat,
  units: CaeUnitSystem,
): string {
  const query = new URLSearchParams({ formato: format, unidades: units });
  return `${API_URL}/api/exports/materiais/${materialId}/cae?${query}`;
}

/**
 * Downloads a material card for a given solver in a chosen unit system.
 *
 * This goes through `fetch` because a refusal (422 — material lacks the required
 * properties) needs to be read and displayed in the dialog: a plain navigation
 * would render the error page or open a download containing the JSON error.
 */
export async function downloadCaeCard(
  materialId: number,
  format: CaeFormat,
  units: CaeUnitSystem,
): Promise<{ blob: Blob; filename: string }> {
  const url = caeExportUrl(materialId, format, units);
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const fallback = `Falha ao exportar cartão CAE (${res.status})`;
    throw new ApiError(await errorMessage(res, fallback), res.status);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `material-${materialId}-${format}.txt`;
  const blob = await res.blob();
  return { blob, filename };
}

// --- Battery pack designer & comparison (D-69) ------------------------------

export function listBatteryChemistries(): Promise<BatteryChemistry[]> {
  return request<BatteryChemistry[]>(`/api/battery/chemistries`);
}

export function listBatteryArchetypes(): Promise<ApplicationArchetype[]> {
  return request<ApplicationArchetype[]>(`/api/battery/archetypes`);
}

export function designBatteryPack(payload: PackDesignRequest): Promise<PackDesignResult> {
  return request<PackDesignResult>(`/api/battery/pack-design`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function compareBatteryChemistries(
  payload: BatteryComparisonRequest,
): Promise<BatteryComparisonResult> {
  return request<BatteryComparisonResult>(`/api/battery/compare-chemistries`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Eco audit (D-54, D-121) ------------------------------------------------

export function listTransportModes(): Promise<TransportMode[]> {
  return request<TransportMode[]>(`/api/eco/transports`);
}

export function listEndOfLifeRoutes(materialId: number): Promise<EndOfLifeRouteInfo[]> {
  return request<EndOfLifeRouteInfo[]>(`/api/eco/materials/${materialId}/end-of-life`);
}

export function auditEco(payload: EcoAuditRequest): Promise<EcoAuditResult> {
  return request<EcoAuditResult>(`/api/eco/audit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function compareEco(payload: EcoComparisonRequest): Promise<EcoComparisonResult> {
  return request<EcoComparisonResult>(`/api/eco/compare`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Structural section sizing (D-52) ---------------------------------------

export function listLoadCases(): Promise<LoadCase[]> {
  return request<LoadCase[]>(`/api/solver/cases`);
}

export function solveLoadCase(payload: SolveRequest): Promise<SolveResult> {
  return request<SolveResult>(`/api/solver/solve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Cost modeling (D-53) ---------------------------------------------------

export function estimateCost(payload: CostRequest): Promise<CostResult> {
  return request<CostResult>(`/api/cost/estimate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Material synthesis (D-56) ----------------------------------------------

export function listSynthesisKinds(): Promise<SynthesisKindInfo[]> {
  return request<SynthesisKindInfo[]>(`/api/synthesis/kinds`);
}

export function previewSynthesis(payload: SynthesisRequest): Promise<SynthesisPreview> {
  return request<SynthesisPreview>(`/api/synthesis/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function commitSynthesis(payload: SynthesisRequest): Promise<SynthesisResult> {
  return request<SynthesisResult>(`/api/synthesis/commit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Similar materials (D-57) -----------------------------------------------

export function findSimilarMaterials(
  id: number,
  payload: SimilarRequest,
): Promise<Similar> {
  return request<Similar>(`/api/materials/${id}/similar`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- User records space (P1-4, D-62) ----------------------------------------

export function listMyRecords(universe?: Universe): Promise<MyRecords> {
  const query = universe ? `?universo=${encodeURIComponent(universe)}` : "";
  return request<MyRecords>(`/api/meus-registros${query}`);
}

// --- Cadernos de estudo (D-92) ----------------------------------------------

const nb = (id: number) => `/api/notebooks/${id}`;

export function listNotebooks(): Promise<NotebookSummary[]> {
  return request<NotebookSummary[]>("/api/notebooks");
}

export function createNotebook(title?: string): Promise<Notebook> {
  return request<Notebook>("/api/notebooks", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}

export function getNotebook(id: number): Promise<Notebook> {
  return request<Notebook>(nb(id));
}

export function updateNotebook(id: number, patch: NotebookUpdate): Promise<Notebook> {
  return request<Notebook>(nb(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteNotebook(id: number): Promise<void> {
  return request<void>(nb(id), { method: "DELETE" });
}

export async function uploadNotebookSource(id: number, file: File): Promise<NotebookSource> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}${nb(id)}/sources`, {
    method: "POST",
    body: form,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(
      await errorMessage(res, "Falha no envio da fonte"),
      res.status,
    );
  }
  return (await res.json()) as NotebookSource;
}

export function addNotebookSourceText(
  id: number,
  body: { title: string; text: string },
): Promise<NotebookSource> {
  return request<NotebookSource>(`${nb(id)}/sources/text`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addNotebookSourceUrl(
  id: number,
  body: { url: string },
): Promise<NotebookSource> {
  return request<NotebookSource>(`${nb(id)}/sources/url`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addNotebookSourceCatalog(
  id: number,
  body: { universe: Universe; record_id: number },
): Promise<NotebookSource> {
  return request<NotebookSource>(`${nb(id)}/sources/catalog`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addNotebookSourceStudy(
  id: number,
  body: { study_id: number },
): Promise<NotebookSource> {
  return request<NotebookSource>(`${nb(id)}/sources/study`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getNotebookSource(id: number, sourceId: number): Promise<NotebookSourceDetail> {
  return request<NotebookSourceDetail>(`${nb(id)}/sources/${sourceId}`);
}

export function updateNotebookSource(
  id: number,
  sourceId: number,
  patch: { selected?: boolean; title?: string },
): Promise<NotebookSource> {
  return request<NotebookSource>(`${nb(id)}/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function selectAllNotebookSources(
  id: number,
  selected: boolean,
): Promise<NotebookSource[]> {
  return request<NotebookSource[]>(`${nb(id)}/sources/selection`, {
    method: "PUT",
    body: JSON.stringify({ selected }),
  });
}

export function deleteNotebookSource(id: number, sourceId: number): Promise<void> {
  return request<void>(`${nb(id)}/sources/${sourceId}`, { method: "DELETE" });
}

export function listNotebookMessages(id: number): Promise<NotebookMessage[]> {
  return request<NotebookMessage[]>(`${nb(id)}/messages`);
}

export function clearNotebookMessages(id: number): Promise<void> {
  return request<void>(`${nb(id)}/messages`, { method: "DELETE" });
}

export function askNotebook(id: number, question: string): Promise<NotebookChat> {
  return request<NotebookChat>(`${nb(id)}/chat`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export function summarizeNotebook(id: number): Promise<Notebook> {
  return request<Notebook>(`${nb(id)}/summary`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function addNotebookNote(
  id: number,
  note: { title?: string; body?: string },
): Promise<NotebookNote> {
  return request<NotebookNote>(`${nb(id)}/notes`, {
    method: "POST",
    body: JSON.stringify(note),
  });
}

export function updateNotebookNote(
  id: number,
  noteId: number,
  patch: { title?: string; body?: string },
): Promise<NotebookNote> {
  return request<NotebookNote>(`${nb(id)}/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteNotebookNote(id: number, noteId: number): Promise<void> {
  return request<void>(`${nb(id)}/notes/${noteId}`, { method: "DELETE" });
}

// --- Fontes externas do caderno (D-93) -----------------------------------------

export function getSourceCapabilities(): Promise<NotebookSourceCapabilities> {
  return request<NotebookSourceCapabilities>("/api/notebooks/sources-capabilities");
}

export function addNotebookSourceYoutube(
  id: number,
  body: NotebookYoutubeSourceRequest,
): Promise<NotebookSource> {
  return request<NotebookSource>(`${nb(id)}/sources/youtube`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function searchYoutubeVideos(query: string): Promise<NotebookYoutubeResult[]> {
  const q = encodeURIComponent(query);
  return request<NotebookYoutubeResult[]>(`/api/notebooks/sources/youtube/search?q=${q}`);
}

export function searchExternalSources(
  id: number,
  body: NotebookSearchRequest,
): Promise<NotebookSearch> {
  return request<NotebookSearch>(`${nb(id)}/sources/search`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** One search result, added by its `key`. */
export function addExternalSource(
  id: number,
  body: NotebookExternalSourceRequest,
): Promise<NotebookSource> {
  return request<NotebookSource>(`${nb(id)}/sources/external`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Estúdio (D-94) ------------------------------------------------------------

export function getStudioCatalog(): Promise<StudioCatalog> {
  return request<StudioCatalog>("/api/notebooks/studio-catalog");
}

export function listStudio(id: number): Promise<StudioList> {
  return request<StudioList>(`${nb(id)}/studio`);
}

/** Starts a generation: answers at once with the artifact `gerando`. */
export function createStudioArtifact(id: number, body: StudioRequest): Promise<StudioArtifact> {
  return request<StudioArtifact>(`${nb(id)}/studio`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getStudioArtifact(id: number, artifactId: number): Promise<StudioArtifact> {
  return request<StudioArtifact>(`${nb(id)}/studio/${artifactId}`);
}

export function renameStudioArtifact(
  id: number,
  artifactId: number,
  title: string,
): Promise<StudioArtifact> {
  return request<StudioArtifact>(`${nb(id)}/studio/${artifactId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteStudioArtifact(id: number, artifactId: number): Promise<void> {
  return request<void>(`${nb(id)}/studio/${artifactId}`, { method: "DELETE" });
}

export function saveStudioArtifactAsNote(id: number, artifactId: number): Promise<NotebookNote> {
  return request<NotebookNote>(`${nb(id)}/studio/${artifactId}/note`, { method: "POST" });
}

/** A plain link: the browser honours the API's `Content-Disposition`. */
export function studioExportUrl(id: number, artifactId: number, format: StudioExport): string {
  return `${API_URL}${nb(id)}/studio/${artifactId}/export.${format}`;
}
