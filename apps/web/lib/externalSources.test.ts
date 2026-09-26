// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addExternalSource,
  addUrlSource,
  addYoutubeSource,
  getSourceCapabilities,
  searchSources,
} from "./api";
import { ptBR } from "./i18n";

/** External sources (D-97): the client calls and the strings the screens read. */

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i] as unknown as [
      string,
      RequestInit | undefined,
    ];
    return {
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("chamadas das fontes externas", () => {
  it("lê as capacidades por GET, fora de um caderno", async () => {
    const call = stubFetch({});
    await getSourceCapabilities();
    expect(call().url).toMatch(/\/api\/notebooks\/source-capabilities$/);
    expect(call().method).toBe("GET");
  });

  it("acrescenta um site por POST com só o endereço", async () => {
    const call = stubFetch({});
    await addUrlSource(7, "https://exemplo.org/a");
    expect(call().url).toMatch(/\/api\/notebooks\/7\/sources\/url$/);
    expect(call().method).toBe("POST");
    expect(call().body).toEqual({ url: "https://exemplo.org/a" });
  });

  it("não envia transcrição vazia de um vídeo", async () => {
    const call = stubFetch({
      source: null,
      needs_transcript: true,
      video_title: null,
      reason: null,
    });
    const out = await addYoutubeSource(7, {
      url: "https://youtu.be/abc",
      transcript: "",
    });
    expect(out.needs_transcript).toBe(true);
    expect(call().url).toMatch(/\/api\/notebooks\/7\/sources\/youtube$/);
    expect(call().body).toEqual({ url: "https://youtu.be/abc" });
  });

  it("envia a transcrição colada", async () => {
    const call = stubFetch({
      source: null,
      needs_transcript: false,
      video_title: null,
      reason: null,
    });
    await addYoutubeSource(7, {
      url: "https://youtu.be/abc",
      transcript: "olá",
    });
    expect(call().body).toEqual({
      url: "https://youtu.be/abc",
      transcript: "olá",
    });
  });

  it("pesquisa e acrescenta por POST, com provedor e chave", async () => {
    const call = stubFetch({
      results: [],
      notice: null,
      search_entry_point_html: null,
    });
    await searchSources(3, { provider: "wikipedia", query: "aço" });
    expect(call().url).toMatch(/\/api\/notebooks\/3\/search$/);
    expect(call().method).toBe("POST");
    expect(call().body).toEqual({ provider: "wikipedia", query: "aço" });
    await addExternalSource(3, { provider: "openalex", key: "W123" });
    expect(call(1).url).toMatch(/\/api\/notebooks\/3\/sources\/external$/);
    expect(call(1).body).toEqual({ provider: "openalex", key: "W123" });
  });
});

describe("textos das fontes externas", () => {
  const t = ptBR.notebooks;

  it("nomeia os quatro tipos novos de fonte", () => {
    expect(t.sourceKinds.site).toBe("Site");
    expect(t.sourceKinds.youtube).toBe("YouTube");
    expect(t.sourceKinds.artigo).toBe("Artigo");
    expect(t.sourceKinds.wikipedia).toBe("Wikipédia");
  });

  it("nomeia cada provedor de busca e escreve as ausências", () => {
    for (const provider of ["openalex", "wikipedia", "web"]) {
      expect(t.search.providers[provider]).toBeTruthy();
      expect(t.search.queryPlaceholder[provider]).toBeTruthy();
    }
    expect(t.search.add(2)).toBe("Adicionar 2");
    expect(t.search.usage(3, 30)).toBe("3 de 30 buscas hoje");
    expect(t.search.empty("aço")).toBe("Nada encontrado para “aço”.");
  });

  it("repete, no aviso da busca na web, os termos do aviso de privacidade do D-93", () => {
    const python = readFileSync(
      fileURLToPath(
        new URL("../../api/app/services/notebook_service.py", import.meta.url),
      ),
      "utf8",
    );
    const block = /^PRIVACY_NOTICE = \(([\s\S]*?)\)$/m.exec(python)?.[1] ?? "";
    const notice = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => m[1])
      .join("");
    const terms = notice.slice(notice.indexOf("pode usar"));
    expect(terms).toContain("revisores");
    expect(t.search.webPrivacy).toContain(terms);
    expect(t.search.webPrivacy).toMatch(/sigiloso/);
  });
});
