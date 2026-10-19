import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
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
const densidade: GlossaryEntry = { ...modulo, slug: "densidade", summary: "Massa por volume." };

const listGlossary = vi.fn((): Promise<GlossaryEntry[]> => Promise.resolve([modulo, densidade]));
vi.mock("@/lib/api", () => ({ listGlossary: () => listGlossary() }));

const { PropertyHint } = await import("./PropertyHint");

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("PropertyHint (GL-b, D-130)", () => {
  it("mostra a dica com nome acessível quando há verbete, e passa no axe", async () => {
    render(wrap(<PropertyHint slug="modulo_young" name="Módulo de Young" />));
    const trigger = await screen.findByShadowRole("button", {
      name: t.hintLabel("Módulo de Young"),
    });
    await userEvent.click(trigger);
    expect(await screen.findByShadowText(modulo.summary)).toBeInTheDocument();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("devolve o foco ao gatilho com Esc", async () => {
    render(wrap(<PropertyHint slug="modulo_young" name="Módulo de Young" />));
    const trigger = await screen.findByShadowRole("button", {
      name: t.hintLabel("Módulo de Young"),
    });
    await userEvent.click(trigger);
    await screen.findByShadowText(modulo.summary);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("não desenha nada, nem 'sem verbete', quando o slug não tem verbete", async () => {
    listGlossary.mockClear();
    const { container } = render(wrap(<PropertyHint slug="durabilidade-demo" name="Durabilidade" />));
    await waitFor(() => expect(listGlossary).toHaveBeenCalled());
    expect(screen.queryByShadowRole("button")).not.toBeInTheDocument();
    expect(screen.queryByShadowText(t.missing)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("não desenha nada quando o glossário falha", async () => {
    listGlossary.mockClear();
    listGlossary.mockImplementationOnce(() => Promise.reject(new Error("falhou")));
    const { container } = render(wrap(<PropertyHint slug="modulo_young" name="Módulo de Young" />));
    await waitFor(() => expect(listGlossary).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByShadowText(t.hintError)).not.toBeInTheDocument();
  });

  it("várias dicas na mesma tela fazem uma só requisição", async () => {
    listGlossary.mockClear();
    render(
      wrap(
        <>
          <PropertyHint slug="modulo_young" name="Módulo de Young" />
          <PropertyHint slug="densidade" name="Densidade" />
          <PropertyHint slug="densidade" name="Densidade" />
        </>,
      ),
    );
    expect(await screen.findAllByShadowRole("button")).toHaveLength(3);
    expect(listGlossary).toHaveBeenCalledTimes(1);
  });
});
