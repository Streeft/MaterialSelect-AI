import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDefaults,
  listClasses,
  listGlossary,
  listMaterials,
  listProcesses,
  listProperties,
} from "@/lib/api";

function stubFetch() {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function cacheOf(fetchMock: ReturnType<typeof stubFetch>): RequestCache | undefined {
  return fetchMock.mock.calls[0]?.[1]?.cache;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listas com ETag revalidam no servidor (D-223)", () => {
  it.each([
    ["propriedades", () => listProperties()],
    ["classes", () => listClasses()],
    ["processos", () => listProcesses()],
    ["glossário", () => listGlossary()],
    ["padrões", () => getDefaults()],
  ])("%s pedem com cache no-cache", async (_name, call) => {
    const fetchMock = stubFetch();
    await call();
    expect(cacheOf(fetchMock)).toBe("no-cache");
  });

  it("o resto continua sem cache do navegador", async () => {
    const fetchMock = stubFetch();
    await listMaterials();
    expect(cacheOf(fetchMock)).toBe("no-store");
  });
});
