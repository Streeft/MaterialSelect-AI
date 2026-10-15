import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { GlossaryEntry, PropertyDefinition } from "@/lib/types";

const t = ptBR.glossary;

vi.mock("next/navigation", () => ({ usePathname: () => "/app/glossario" }));

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

vi.mock("@/lib/api", () => ({
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

describe("página do glossário (D-130)", () => {
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

  it("mostra o verbete com fonte, licença e revisão escritas, e a ausência escrita", async () => {
    render(wrap(<GlossaryPage />));
    expect(await screen.findByShadowRole("heading", { name: /Densidade/ })).toBeInTheDocument();
    expect(screen.getByShadowText(densidade.definition)).toBeInTheDocument();
    expect(screen.getByShadowText(densidade.license)).toBeInTheDocument();
    expect(screen.getByShadowText("Norma de exemplo")).toBeInTheDocument();
    expect(screen.getByShadowText(t.howMeasuredMissing)).toBeInTheDocument();
    expect(screen.getAllByShadowText(t.reviewDraft).length).toBeGreaterThan(0);
    expect(await screen.findByShadowText(t.missingHint)).toBeInTheDocument();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("filtra por nome, sem acento, e escreve quando nada corresponde", async () => {
    render(wrap(<GlossaryPage />));
    await screen.findByShadowRole("heading", { name: /Densidade/ });
    const box = screen.getByShadowRole("searchbox", { name: t.filter });
    await userEvent.type(box, "agua");
    expect(screen.queryByShadowRole("heading", { name: /^Densidade/ })).not.toBeInTheDocument();
    expect(screen.getByShadowRole("heading", { name: /Durabilidade/ })).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "zzz");
    expect(screen.getByShadowText(t.noMatch("zzz"))).toBeInTheDocument();
  });
});
