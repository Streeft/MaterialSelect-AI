import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  createQueryClient,
  shouldRetry,
  STATIC_LIST_KEYS,
  STATIC_LIST_STALE_MS,
} from "@/lib/queryClient";

describe("retry (D-223)", () => {
  it("não repete um erro 4xx: a resposta não muda na segunda vez", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldRetry(0, new ApiError("x", status))).toBe(false);
    }
  });

  it("repete uma vez um 5xx ou uma falha de rede", () => {
    expect(shouldRetry(0, new ApiError("x", 503))).toBe(true);
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(1, new ApiError("x", 503))).toBe(false);
    expect(shouldRetry(1, new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("listas que só mudam com deploy ou curadoria (D-223)", () => {
  it("ficam frescas por mais tempo que o padrão", () => {
    const client = createQueryClient();
    const fallback = client.getDefaultOptions().queries?.staleTime;
    expect(fallback).toBe(30_000);
    expect(STATIC_LIST_STALE_MS).toBeGreaterThan(30_000);
    for (const key of STATIC_LIST_KEYS) {
      expect(client.getQueryDefaults([key]).staleTime).toBe(STATIC_LIST_STALE_MS);
    }
  });

  it("cobre propriedades, classes, processos, glossário e padrões", () => {
    expect(STATIC_LIST_KEYS).toEqual(
      expect.arrayContaining(["properties", "classes", "processes", "glossary", "padroes"]),
    );
  });

  it("não alonga uma chave que não está na lista", () => {
    const client = createQueryClient();
    expect(client.getQueryDefaults(["materials"]).staleTime).toBeUndefined();
  });
});
