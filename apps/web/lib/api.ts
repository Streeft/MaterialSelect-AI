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
  CommitResult,
  Comparison,
  ComparisonRequest,
  CostRequest,
  CostResult,
  CurrentUser,
  DashboardOverview,
  EcoAuditRequest,
  EcoAuditResult,
  Explanation,
  Interpretation,
  ImportJobOut,
  ImportMapping,
  ImportTemplate,
  IndexResult,
  LoadCase,
  MaterialClass,
  MaterialClassIn,
  MaterialCreate,
  MaterialDetail,
  MaterialListItem,
  MaterialUpdate,
  MyRecords,
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

function withUnits(path: string, choices?: Record<string, string>): string {
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

export type ExportFormat = "csv" | "xlsx" | "html" | "docx";

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
 * AI layer is on — an interpretive narrative. HTML-only, and always opens
 * inline, like the printable report it is built alongside.
 */
export function studyLaudoUrl(studyId: number, responsible?: string): string {
  const trimmed = responsible?.trim();
  const query = trimmed
    ? `?${new URLSearchParams({ responsavel: trimmed })}`
    : "";
  return `${API_URL}/api/exports/estudos/${studyId}/laudo.html${query}`;
}

// --- My Records (P1-4) ------------------------------------------------------

/**
 * Favourites, recents and own records in one request.
 *
 * One call and not three because the page shows them together: separate
 * requests would let one list render against a catalogue the others never saw.
 */
export function getMyRecords(): Promise<MyRecords> {
  return request<MyRecords>(`/api/my-records`);
}

/**
 * Star a record. `PUT`, because starring is idempotent — a second click on a
 * lit star means what the first one meant. Returns the whole space, so the
 * caller never has to re-fetch to stay consistent with it.
 */
export function addFavorite(
  universe: Universe,
  recordId: number,
): Promise<MyRecords> {
  return request<MyRecords>(
    `/api/my-records/favorites/${universe}/${recordId}`,
    {
      method: "PUT",
    },
  );
}

export function removeFavorite(
  universe: Universe,
  recordId: number,
): Promise<MyRecords> {
  return request<MyRecords>(
    `/api/my-records/favorites/${universe}/${recordId}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Note that the reader just opened a record.
 *
 * Declared by the client rather than recorded inside the datasheet's own GET:
 * a read that writes is un-cacheable and non-idempotent, and an export
 * re-reading a record would quietly reorder the list.
 */
export function touchRecent(
  universe: Universe,
  recordId: number,
): Promise<void> {
  return request<void>(`/api/my-records/recents/${universe}/${recordId}`, {
    method: "POST",
  });
}

/**
 * Rank the catalogue by distance from one material (P2).
 *
 * A POST because the basis is a body, not an identity: "similar in these five
 * respects" is a different question from "similar in these two", and a list of
 * slugs in a query string would make the two share a cache entry.
 */
export function findSimilar(
  materialId: number,
  body: SimilarRequest,
): Promise<Similar> {
  return request<Similar>(`/api/materials/${materialId}/similares`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Engineering Solver & Performance Index Finder (P2) ---------------------

/**
 * The load-case catalogue: the Finder's own listing.
 *
 * A GET, because browsing cases by facet is a question about the catalogue and
 * nothing about the reader — so it caches, and two people asking get one answer.
 */
export function listLoadCases(): Promise<LoadCase[]> {
  return request<LoadCase[]>("/api/solver/casos");
}

export function getLoadCase(key: string): Promise<LoadCase> {
  return request<LoadCase>(`/api/solver/casos/${encodeURIComponent(key)}`);
}

/**
 * Dimension every visible material against one brief.
 *
 * A POST like `findSimilar`, and for the same reason: the brief is a body of
 * design numbers, and putting them in a query string would make two different
 * questions share a cache entry.
 */
export function solveBrief(body: SolveRequest): Promise<SolveResult> {
  return request<SolveResult>("/api/solver/resolver", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Part Cost Estimator (P3) -----------------------------------------------

/**
 * Price one part across every process that can make it.
 *
 * A POST like `solveBrief`: the brief is a body of design and shop numbers, and
 * a query string would make two different questions share a cache entry.
 */
export function estimatePartCost(body: CostRequest): Promise<CostResult> {
  return request<CostResult>("/api/custo/estimar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Eco Audit (P3) ---------------------------------------------------------

export function listTransportModes(): Promise<TransportMode[]> {
  return request<TransportMode[]>("/api/eco/modais");
}

/**
 * A POST like the solver's and the estimator's: the brief is a body of design
 * numbers, and a query string would make two different questions share a cache
 * entry.
 */
export function runEcoAudit(body: EcoAuditRequest): Promise<EcoAuditResult> {
  return request<EcoAuditResult>("/api/eco/auditar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Synthesizer (P3) -------------------------------------------------------

export function listSynthesisKinds(): Promise<SynthesisKindInfo[]> {
  return request<SynthesisKindInfo[]>("/api/sintetizar/tipos");
}

/** O que a receita produziria, sem gravar nada. */
export function previewSynthesis(
  body: SynthesisRequest,
): Promise<SynthesisPreview> {
  return request<SynthesisPreview>("/api/sintetizar/previa", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSynthesis(
  body: SynthesisRequest,
): Promise<SynthesisResult> {
  return request<SynthesisResult>("/api/sintetizar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Battery Designer (P4 / Módulo S) ---------------------------------------

export function listBatteryChemistries(): Promise<BatteryChemistry[]> {
  return request<BatteryChemistry[]>("/api/baterias/quimicas");
}

export function getBatteryChemistry(slug: string): Promise<BatteryChemistry> {
  return request<BatteryChemistry>(
    `/api/baterias/quimicas/${encodeURIComponent(slug)}`,
  );
}

export function listBatteryArchetypes(): Promise<ApplicationArchetype[]> {
  return request<ApplicationArchetype[]>("/api/baterias/arquetipos");
}

export function designBatteryPack(
  body: PackDesignRequest,
): Promise<PackDesignResult> {
  return request<PackDesignResult>("/api/baterias/dimensionar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function compareBatteries(
  body: BatteryComparisonRequest,
): Promise<BatteryComparisonResult> {
  return request<BatteryComparisonResult>("/api/baterias/comparar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
