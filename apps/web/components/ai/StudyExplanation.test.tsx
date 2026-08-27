import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { StudyExplanation } from "./StudyExplanation";
import { ptBR } from "@/lib/i18n";
import type { AIStatus, Explanation } from "@/lib/types";

const getAIStatus = vi.fn<() => Promise<AIStatus>>();
const explainStudy = vi.fn<(studyId: number) => Promise<Explanation>>();
vi.mock("@/lib/api", () => ({
  getAIStatus: () => getAIStatus(),
  explainStudy: (studyId: number) => explainStudy(studyId),
  ApiError: class ApiError extends Error {},
}));

function makeExplanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    study_id: 1,
    study_name: "Painel de fuselagem",
    summary: "Resumo do estudo.",
    paragraphs: ["Primeiro parágrafo."],
    caveats: [],
    sources: [],
    provider: "mock",
    simulated: true,
    disclaimer: "Texto gerado por IA; confira antes de decidir.",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("StudyExplanation", () => {
  it("lists each cited source with its title and page range", async () => {
    getAIStatus.mockResolvedValue({
      enabled: true,
      provider: "openai-compat",
      simulated: false,
      disclaimer: "x",
    });
    explainStudy.mockResolvedValue(
      makeExplanation({
        sources: [
          { document_title: "Materials Selection in Mechanical Design", page_start: 42, page_end: 43 },
          { document_title: "ASM Handbook", page_start: null, page_end: null },
        ],
      }),
    );

    render(<StudyExplanation studyId={1} />, { wrapper });
    await userEvent.click(await screen.findByShadowRole("button", { name: ptBR.ai.explain }));

    await waitFor(() => expect(explainStudy).toHaveBeenCalledWith(1));
    expect(await screen.findByText(ptBR.ai.sourcesConsulted + ":")).toBeInTheDocument();
    expect(
      screen.getByText("Materials Selection in Mechanical Design (p. 42-43)"),
    ).toBeInTheDocument();
    expect(screen.getByText("ASM Handbook")).toBeInTheDocument();
  });

  it("does not render a sources section when none were cited", async () => {
    getAIStatus.mockResolvedValue({
      enabled: true,
      provider: "mock",
      simulated: true,
      disclaimer: "x",
    });
    explainStudy.mockResolvedValue(makeExplanation({ sources: [] }));

    render(<StudyExplanation studyId={1} />, { wrapper });
    await userEvent.click(await screen.findByShadowRole("button", { name: ptBR.ai.explain }));

    await waitFor(() => expect(explainStudy).toHaveBeenCalledWith(1));
    // The explanation itself rendered (summary is proof the mutation resolved)...
    expect(await screen.findByText("Resumo do estudo.")).toBeInTheDocument();
    // ...but the heading for sources must not appear when there are none.
    expect(screen.queryByText(ptBR.ai.sourcesConsulted + ":")).not.toBeInTheDocument();
  });
});
