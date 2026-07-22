// Typed client for the MaterialSelect AI backend.
// Base URL comes from NEXT_PUBLIC_API_URL (default: http://localhost:8000).

import type { ChartData, MaterialDetail, MaterialListItem } from "./types";

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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(`Falha na requisição ${path}`, res.status);
  }
  return (await res.json()) as T;
}

export function listMaterials(search?: string): Promise<MaterialListItem[]> {
  const query = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return getJson<MaterialListItem[]>(`/api/materials${query}`);
}

export function getMaterial(id: number): Promise<MaterialDetail> {
  return getJson<MaterialDetail>(`/api/materials/${id}`);
}

export function getChart(x: string, y: string): Promise<ChartData> {
  return getJson<ChartData>(
    `/api/materials/chart?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`,
  );
}
