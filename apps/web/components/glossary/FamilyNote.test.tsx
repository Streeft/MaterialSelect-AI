import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { FamilyNoteEntry } from "@/lib/types";

const t = ptBR.familyNotes;

const metais: FamilyNoteEntry = {
  slug: "metais",
  summary: "Materiais de ligação metálica, quase sempre usados como ligas.",
  body: ["Átomos num arranjo cristalino.", "Elétrons livres conduzem calor."],
  when_to_use: ["Peças que carregam carga."],
  watch_out: ["Corrosão em contato com eletrólito."],
  reference: null,
  license: "Texto autoral do projeto MaterialSelect AI.",
  review_status: "rascunho",
  lang: "pt-BR",
};

const api = {
  notes: vi.fn((): Promise<FamilyNoteEntry[]> => Promise.resolve([metais])),
};
vi.mock("@/lib/api", () => ({ listFamilyNotes: () => api.notes() }));

const { FamilyNote } = await import("./FamilyNote");

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  api.notes.mockReset();
  api.notes.mockImplementation(() => Promise.resolve([metais]));
});

describe("FamilyNote (D-151)", () => {
  it("mostra o carregamento escrito", () => {
    api.notes.mockImplementation(() => new Promise(() => {}));
    render(wrap(<FamilyNote slug="metais" name="Metais" />));
    expect(screen.getByShadowText(t.inlineLoading)).toBeInTheDocument();
  });

  it("mostra o erro escrito e tenta de novo", async () => {
    api.notes.mockImplementationOnce(() => Promise.reject(new Error("falhou")));
    render(wrap(<FamilyNote slug="metais" name="Metais" />));
    expect(await screen.findByShadowText(t.inlineError)).toBeInTheDocument();
    await userEvent.click(screen.getByShadowRole("button", { name: t.retry }));
    expect(await screen.findByShadowText(t.about("Metais"))).toBeInTheDocument();
    expect(api.notes).toHaveBeenCalledTimes(2);
  });

  it("escreve 'Sem nota para esta família' quando a classe não tem nota", async () => {
    render(wrap(<FamilyNote slug="madeiras" name="Madeiras" />));
    expect(await screen.findByShadowText(`${t.missing}.`)).toBeInTheDocument();
    expect(screen.queryByShadowText(t.about("Madeiras"))).not.toBeInTheDocument();
  });

  it("dobra a nota, escreve o estado de revisão e abre com o conteúdo inteiro", async () => {
    render(wrap(<FamilyNote slug="metais" name="Metais" />));
    const summary = await screen.findByShadowText(t.about("Metais"));
    // Review state in words on the folded line, never only a color.
    expect(screen.getAllByShadowText(ptBR.glossary.reviewDraft).length).toBeGreaterThan(0);
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    await userEvent.click(summary);
    expect(details!.open).toBe(true);
    expect(screen.getByShadowText(metais.summary)).toBeInTheDocument();
    expect(screen.getByShadowText(metais.body[1]!)).toBeInTheDocument();
    expect(screen.getByShadowRole("list", { name: t.whenToUse })).toBeInTheDocument();
    expect(screen.getByShadowRole("list", { name: t.watchOut })).toBeInTheDocument();
    expect(screen.getByShadowText(t.referenceMissing)).toBeInTheDocument();
    expect(screen.getByShadowText(metais.license)).toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: t.seeAll })).toHaveAttribute(
      "href",
      "/app/glossario/familias#metais",
    );
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("faz uma requisição só, com várias notas na tela", async () => {
    render(
      wrap(
        <>
          <FamilyNote slug="metais" name="Metais" />
          <FamilyNote slug="polimeros" name="Polímeros" />
        </>,
      ),
    );
    await screen.findByShadowText(t.about("Metais"));
    expect(api.notes).toHaveBeenCalledTimes(1);
  });
});
