// Typed client for the MaterialSelect AI backend.
// Base URL comes from NEXT_PUBLIC_API_URL (default: http://localhost:8000).

import type {
  AIStatus,
  ChartData,
  CommitResult,
  Comparison,
  ComparisonRequest,
  Explanation,
  Interpretation,
  ImportJobOut,
  ImportMapping,
  ImportTemplate,
  IndexResult,
  MaterialClass,
  MaterialClassIn,
  MaterialCreate,
  MaterialDetail,
  MaterialListItem,
  MaterialUpdate,
  PerformanceIndex,
  PropertyDefinition,
  PropertyDefinitionIn,
  PropertyMap,
  PropertyMapRequest,
  PropertyValueIn,
  RunRequest,
  RunResult,
  StudyDetail,
  StudyIn,
  StudySummary,
  UploadResult,
  ValidationReport,
} from "./types";

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

/** Extract a human-readable error message from a failed response body. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // non-JSON body; use the fallback
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(await errorMessage(res, `Falha na requisição ${path}`), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Materials ------------------------------------------------------------

export function listMaterials(search?: string): Promise<MaterialListItem[]> {
  const query = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return request<MaterialListItem[]>(`/api/materials${query}`);
}

export function getMaterial(id: number): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials/${id}`);
}

export function getChart(x: string, y: string): Promise<ChartData> {
  return request<ChartData>(
    `/api/materials/chart?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`,
  );
}

export function createMaterial(payload: MaterialCreate): Promise<MaterialDetail> {
  return request<MaterialDetail>(`/api/materials`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMaterial(id: number, payload: MaterialUpdate): Promise<MaterialDetail> {
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

export function updateClass(id: number, payload: MaterialClassIn): Promise<MaterialClass> {
  return request<MaterialClass>(`/api/classes/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteClass(id: number): Promise<void> {
  return request<void>(`/api/classes/${id}`, { method: "DELETE" });
}

// --- Properties -----------------------------------------------------------

export function listProperties(): Promise<PropertyDefinition[]> {
  return request<PropertyDefinition[]>(`/api/properties`);
}

export function createProperty(payload: PropertyDefinitionIn): Promise<PropertyDefinition> {
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
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(await errorMessage(res, "Falha no envio do arquivo"), res.status);
  }
  return (await res.json()) as UploadResult;
}

export function previewImportSheet(jobId: number, sheetName: string): Promise<UploadResult> {
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
  return request<CommitResult>(`/api/imports/${jobId}/commit`, { method: "POST" });
}

export function cancelImport(jobId: number): Promise<ImportJobOut> {
  return request<ImportJobOut>(`/api/imports/${jobId}/cancel`, { method: "POST" });
}

export function rollbackImport(jobId: number): Promise<ImportJobOut> {
  return request<ImportJobOut>(`/api/imports/${jobId}/rollback`, { method: "POST" });
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

export function evaluateIndex(expression: string, goal: "maximize" | "minimize"): Promise<IndexResult> {
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
  return request<RunResult>(`/api/selection/studies/${id}/run`, { method: "POST" });
}

// --- Visualisation ----------------------------------------------------------

export function getPropertyMap(payload: PropertyMapRequest): Promise<PropertyMap> {
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

// --- Exports ----------------------------------------------------------------
// Downloads are plain links rather than fetch calls: the browser then handles
// the Content-Disposition filename and the save dialog natively.

export type ExportFormat = "csv" | "xlsx";

export function catalogueExportUrl(format: ExportFormat): string {
  return `${API_URL}/api/exports/catalogo.${format}`;
}

export function studyExportUrl(studyId: number, format: ExportFormat): string {
  return `${API_URL}/api/exports/estudos/${studyId}.${format}`;
}
