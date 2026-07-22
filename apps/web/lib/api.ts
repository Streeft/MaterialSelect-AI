// Typed client for the MaterialSelect AI backend.
// Base URL comes from NEXT_PUBLIC_API_URL (default: http://localhost:8000).

import type {
  ChartData,
  MaterialClass,
  MaterialClassIn,
  MaterialCreate,
  MaterialDetail,
  MaterialListItem,
  MaterialUpdate,
  PropertyDefinition,
  PropertyDefinitionIn,
  PropertyValueIn,
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
