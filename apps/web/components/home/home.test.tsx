import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SavedStudies } from "./SavedStudies";
import { ptBR } from "@/lib/i18n";
import type { StudySummary } from "@/lib/types";

const listStudies = vi.fn<() => Promise<StudySummary[]>>();
vi.mock("@/lib/api", () => ({ listStudies: () => listStudies() }));

function makeStudy(overrides: Partial<StudySummary> = {}): StudySummary {
  return {
    id: 7,
    name: "Painel de fuselagem",
    description: null,
    created_at: "2026-03-14T10:00:00Z",
    constraint_count: 3,
    criterion_count: 1,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  // No retries: a test that waits out three backoffs is a test nobody runs.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("SavedStudies", () => {
  it("offers each saved study as a link that reopens it", async () => {
    listStudies.mockResolvedValue([makeStudy()]);
    render(<SavedStudies />, { wrapper });

    const resume = await screen.findByShadowRole("link", { name: ptBR.home.resume });
    expect(resume).toHaveAttribute("href", "/app/selecao?estudo=7");
    expect(screen.getByText("Painel de fuselagem")).toBeInTheDocument();
  });

  it("agrees with the number it is counting", async () => {
    listStudies.mockResolvedValue([makeStudy({ constraint_count: 1, criterion_count: 2 })]);
    render(<SavedStudies />, { wrapper });

    expect(await screen.findByText(`1 ${ptBR.home.constraintOne}`)).toBeInTheDocument();
    expect(screen.getByText(`2 ${ptBR.home.criterionMany}`)).toBeInTheDocument();
  });

  it("says there is nothing saved instead of showing an empty list", async () => {
    listStudies.mockResolvedValue([]);
    render(<SavedStudies />, { wrapper });

    expect(await screen.findByText(ptBR.home.savedEmpty)).toBeInTheDocument();
    expect(screen.getByText(ptBR.home.savedEmptyHint)).toBeInTheDocument();
  });

  it("says the list failed rather than pretending it is empty", async () => {
    listStudies.mockRejectedValue(new Error("boom"));
    render(<SavedStudies />, { wrapper });

    expect(await screen.findByText(ptBR.home.savedError)).toBeInTheDocument();
    expect(screen.queryByText(ptBR.home.savedEmpty)).not.toBeInTheDocument();
  });
});
