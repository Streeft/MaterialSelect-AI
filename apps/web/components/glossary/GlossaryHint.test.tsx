import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { GlossaryEntry } from "@/lib/types";

const t = ptBR.glossary;

const modulo: GlossaryEntry = {
  slug: "modulo_young",
  summary: "Rigidez elástica sob tração ou compressão.",
  definition: "Inclinação do trecho linear da curva tensão-deformação.",
  how_measured: null,
  reference: null,
  license: "Texto autoral do projeto MaterialSelect AI.",
  review_status: "rascunho",
  lang: "pt-BR",
};

const listGlossary = vi.fn(() => Promise.resolve([modulo]));
vi.mock("@/lib/api", () => ({ listGlossary: () => listGlossary() }));

const { GlossaryHint } = await import("./GlossaryHint");

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("GlossaryHint (D-130)", () => {
  it("não chama a API enquanto fechado", () => {
    listGlossary.mockClear();
    render(wrap(<GlossaryHint slug="modulo_young" name="Módulo de Young" />));
    expect(listGlossary).not.toHaveBeenCalled();
  });

  it("tem nome acessível, mostra resumo, revisão escrita e link, e passa no axe", async () => {
    const { container } = render(wrap(<GlossaryHint slug="modulo_young" name="Módulo de Young" />));
    const trigger = screen.getByShadowRole("button", { name: t.hintLabel("Módulo de Young") });
    await userEvent.click(trigger);

    expect(await screen.findByShadowText(modulo.summary)).toBeInTheDocument();
    expect(screen.getByShadowText(`${t.review}: ${t.reviewDraft}`)).toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: t.seeInGlossary })).toHaveAttribute(
      "href",
      "/app/glossario#modulo_young",
    );
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
    expect(container).toBeTruthy();
  });

  it("devolve o foco ao gatilho com Esc", async () => {
    render(wrap(<GlossaryHint slug="modulo_young" name="Módulo de Young" />));
    const trigger = screen.getByShadowRole("button", { name: t.hintLabel("Módulo de Young") });
    await userEvent.click(trigger);
    await screen.findByShadowText(modulo.summary);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByShadowRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("escreve a ausência quando o slug não tem verbete", async () => {
    render(wrap(<GlossaryHint slug="durabilidade-demo" name="Durabilidade" />));
    await userEvent.click(screen.getByShadowRole("button", { name: t.hintLabel("Durabilidade") }));
    expect(await screen.findByShadowText(t.missing)).toBeInTheDocument();
    expect(screen.queryByShadowRole("link", { name: t.seeInGlossary })).not.toBeInTheDocument();
  });
});
