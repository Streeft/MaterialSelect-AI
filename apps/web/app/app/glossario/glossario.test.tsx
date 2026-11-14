import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { suggestText } from "@/lib/i18n-suggest";
import type { GlossaryEntry, PropertyDefinition, SuggestionsOut } from "@/lib/types";

const t = ptBR.glossary;

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/glossario",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const densidade: GlossaryEntry = {
  slug: "densidade",
  summary: "Massa por unidade de volume.",
  definition: "Razão entre massa e volume.",
  how_measured: null,
  reference: "Norma de exemplo",
  license: "Texto autoral do projeto MaterialSelect AI.",
  review_status: "rascunho",
  lang: "pt-BR",
};

const props = [
  { slug: "densidade", name: "Densidade" },
  { slug: "durabilidade-demo", name: "Durabilidade em água doce" },
] as unknown as PropertyDefinition[];

const api = {
  glossary: (): Promise<GlossaryEntry[]> => Promise.resolve([densidade]),
  properties: (): Promise<PropertyDefinition[]> => Promise.resolve(props),
};

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  listGlossary: () => api.glossary(),
  listProperties: () => api.properties(),
}));

const { default: GlossaryPage } = await import("./page");

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  api.glossary = () => Promise.resolve([densidade]);
  api.properties = () => Promise.resolve(props);
});

describe("página do glossário (D-130b)", () => {
  it("mostra o carregamento", () => {
    api.glossary = () => new Promise(() => {});
    render(wrap(<GlossaryPage />));
    expect(screen.getAllByShadowText(t.loading).length).toBeGreaterThan(0);
  });

  it("mostra o erro escrito", async () => {
    api.glossary = () => Promise.reject(new Error("falhou"));
    render(wrap(<GlossaryPage />));
    expect(await screen.findByShadowText(t.error)).toBeInTheDocument();
  });

  it("mostra o vazio escrito", async () => {
    api.glossary = () => Promise.resolve([]);
    api.properties = () => Promise.resolve([]);
    render(wrap(<GlossaryPage />));
    expect(await screen.findByShadowText(t.empty)).toBeInTheDocument();
  });

  // D-209: the glossary is a wiki — an index, and the entry opened beside it.
  it("abre o verbete ao lado com fonte, licença e revisão escritas, e escreve a ausência no índice", async () => {
    window.history.replaceState(null, "", "/app/glossario");
    render(wrap(<GlossaryPage />));
    const open = await screen.findByShadowRole("button", { name: t.openEntry("Densidade") });
    expect(screen.getByShadowText(densidade.summary)).toBeInTheDocument();
    // The property without an entry is in the index, its absence written.
    expect(screen.getByShadowText(t.missing)).toBeInTheDocument();

    await userEvent.click(open);
    const peek = screen.getByShadowRole("dialog", { name: "Densidade" });
    expect(window.location.hash).toBe("#densidade");
    for (const text of [densidade.definition, densidade.license, "Norma de exemplo", t.howMeasuredMissing, t.reviewDraft]) {
      expect(within(peek).getByShadowText(text)).toBeInTheDocument();
    }
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByShadowRole("dialog")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("abre direto o verbete do endereço, como as dicas do app apontam", async () => {
    window.history.replaceState(null, "", "/app/glossario#densidade");
    render(wrap(<GlossaryPage />));
    expect(await screen.findByShadowRole("dialog", { name: "Densidade" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/app/glossario");
  });

  it("filtra por nome, sem acento, e pelo estado, e escreve quando nada corresponde", async () => {
    window.history.replaceState(null, "", "/app/glossario");
    render(wrap(<GlossaryPage />));
    await screen.findByShadowRole("button", { name: t.openEntry("Densidade") });
    const box = screen.getByShadowRole("searchbox", { name: t.filter });
    await userEvent.type(box, "agua");
    // O filtro espera uma pausa na digitação (D-219) — e o texto já está no endereço.
    await waitFor(() =>
      expect(screen.queryByShadowRole("button", { name: t.openEntry("Densidade") })).not.toBeInTheDocument(),
    );
    expect(window.location.search).toContain("busca=agua");
    expect(screen.getByShadowRole("button", { name: t.openEntry("Durabilidade em água doce") })).toBeInTheDocument();
    await userEvent.clear(box);

    await userEvent.click(screen.getByShadowRole("button", { name: /^Estado: / }));
    await userEvent.click(await screen.findByShadowRole("button", { name: t.stateMissing }));
    expect(screen.queryByShadowRole("button", { name: t.openEntry("Densidade") })).not.toBeInTheDocument();

    await userEvent.type(box, "zzz");
    expect(await screen.findByShadowText(t.noMatch("zzz"))).toBeInTheDocument();
    window.history.replaceState(null, "", "/app/glossario");
  });

  it("do verbete leva ao Mapa (eixo) e à Seleção (restrição) com a propriedade", async () => {
    window.history.replaceState(null, "", "/app/glossario#densidade");
    render(wrap(<GlossaryPage />));
    const dialog = await screen.findByShadowRole("dialog", { name: "Densidade" });

    const axis = within(dialog).getByShadowRole("link", { name: t.useAsAxis });
    expect(axis.getAttribute("href")).toMatch(/^\/app\/mapas\?estado=/);
    const { decodeMapState } = await import("@/app/app/mapas/url-state");
    const state = decodeMapState(new URL(axis.getAttribute("href")!, "http://x").searchParams.get("estado")!);
    expect(state?.xAxis?.property).toBe("densidade");

    expect(within(dialog).getByShadowRole("link", { name: t.useAsConstraint })).toHaveAttribute(
      "href",
      "/app/selecao?etapa=restricoes&restricao=densidade",
    );
    window.history.replaceState(null, "", "/app/glossario");
  });

  it("lê o estado do filtro do endereço", async () => {
    window.history.replaceState(null, "", "/app/glossario?estado=ausente");
    render(wrap(<GlossaryPage />));
    await screen.findByShadowRole("button", { name: t.openEntry("Durabilidade em água doce") });
    // "ausente" vem do endereço: Densidade tem verbete, então fica de fora.
    expect(screen.queryByShadowRole("button", { name: t.openEntry("Densidade") })).not.toBeInTheDocument();
    window.history.replaceState(null, "", "/app/glossario");
  });
});

describe("glossário — Sugestão da IA (D-229)", () => {
  it("só consulta ao clicar; “Buscar” põe o termo na caixa e no endereço; a rota é um link", async () => {
    window.history.replaceState(null, "", "/app/glossario");
    const answer: SuggestionsOut = {
      tool: "glossario",
      summary: "Termos relacionados.",
      suggestions: [
        {
          title: "Veja a durabilidade",
          body: "Complementa a densidade.",
          actions: [
            { type: "search", label: "Buscar durabilidade", q: "durabilidade" },
            { type: "open_route", label: "Ver as famílias", path: "/app/glossario/familias" },
          ],
        },
      ],
      rejected: [],
      degraded: false,
      cached: false,
      notice: null,
      provider: "mock",
      simulated: true,
      disclaimer: "",
    };
    suggest.fn.mockResolvedValue(answer);
    render(wrap(<GlossaryPage />));
    await screen.findByShadowRole("button", { name: t.openEntry("Densidade") });
    expect(suggest.fn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: suggestText.button }));
    await userEvent.click(await screen.findByRole("button", { name: "Buscar durabilidade" }));
    expect(suggest.fn).toHaveBeenCalledWith("glossario", { q: "", slug: null });
    await waitFor(() => expect(window.location.search).toContain("busca=durabilidade"));
    expect(screen.getByShadowRole("searchbox", { name: t.filter })).toHaveValue("durabilidade");
    await userEvent.click(screen.getByRole("button", { name: suggestText.button }));
    expect(await screen.findByRole("link", { name: "Ver as famílias" })).toHaveAttribute(
      "href",
      "/app/glossario/familias",
    );
    window.history.replaceState(null, "", "/app/glossario");
  });
});
