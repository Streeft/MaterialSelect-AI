import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { RunResult } from "@/lib/types";

const t = ptBR.selection;

const runSelection = vi.fn<() => Promise<RunResult>>();

// The wizard is the screen, not the network. Everything the page asks the API
// for is stubbed; only `runSelection` carries a story, because the candidate
// counter and the results step are what this file is about.
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  runSelection: () => runSelection(),
  listProperties: () => Promise.resolve([]),
  listClasses: () => Promise.resolve([]),
  listPerformanceIndices: () => Promise.resolve([]),
  listStudies: () => Promise.resolve([]),
  getStudy: () => Promise.resolve(null),
  createStudy: () => Promise.resolve(null),
  deleteStudy: () => Promise.resolve(),
  runStudy: () => Promise.resolve(null),
  evaluateIndex: () => Promise.resolve({ dimension: "dimensionless" }),
  getAIStatus: () => Promise.resolve({ enabled: false, simulated: false }),
  interpretStatement: () => Promise.resolve(null),
  explainStudy: () => Promise.resolve(null),
  opensInBrowser: () => true,
  studyExportUrl: () => "#",
  studyLaudoUrl: () => "#",
}));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    initial_count: 12,
    combinator: "AND",
    final_count: 5,
    funnel: [],
    candidates: [],
    index: null,
    ranking: null,
    ...overrides,
  };
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

// Imported after the mocks so the page picks them up.
const { default: SelectionPage } = await import("./page");

beforeEach(() => {
  runSelection.mockReset();
  runSelection.mockResolvedValue(result());
});

describe("assistente de seleção", () => {
  it("keeps the candidate count on screen after leaving the constraints step", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    // The count is the one number the whole method turns on. It used to exist
    // only next to the constraint editor and vanish the moment anyone moved on.
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());

    await user.click(screen.getByShadowRole("button", { name: new RegExp(t.stepObjective, "i") }));
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(`${t.of} 12`)).toBeInTheDocument();
  });

  it("refuses the results step, in words, until a selection has been run", async () => {
    render(wrap(<SelectionPage />));

    const results = await screen.findByShadowRole("button", {
      name: new RegExp(t.stepResults, "i"),
    });
    expect(results).toBeDisabled();
    expect(results).toHaveTextContent(t.blockedResults);
  });

  it("opens the results step once the run answers, and stops refusing it", async () => {
    const user = userEvent.setup();
    runSelection.mockResolvedValue(result({ final_count: 2 }));
    render(wrap(<SelectionPage />));

    await user.click(screen.getByShadowRole("button", { name: new RegExp(t.stepObjective, "i") }));
    await user.click(screen.getByShadowRole("button", { name: t.run }));

    // The funnel block is the first thing the results screen renders.
    await waitFor(() => expect(screen.getByShadowRole("heading", { name: t.funnel })).toBeInTheDocument());
    expect(
      screen.getByShadowRole("button", { name: new RegExp(t.stepResults, "i") }),
    ).not.toBeDisabled();
  });

  it("says why the study cannot be saved instead of showing a dead button", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    await user.click(screen.getByShadowRole("button", { name: new RegExp(t.stepObjective, "i") }));
    await user.click(screen.getByShadowRole("button", { name: t.run }));

    await waitFor(() =>
      expect(screen.getByShadowRole("button", { name: t.saveStudy })).toBeDisabled(),
    );
    expect(screen.getByText(t.saveNeedsName)).toBeInTheDocument();
  });
});
