import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wizardText } from "@/lib/i18n-selection-wizard";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { RunDiff, SavedRun } from "@/lib/types";

const api = vi.hoisted(() => ({
  listStudyRuns: vi.fn(),
  keepStudyRun: vi.fn(),
  deleteStudyRun: vi.fn(),
  compareStudyRuns: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...api,
}));

const { RunHistory, versionName } = await import("./RunHistory");
const { SnackbarProvider } = await import("@/components/ui/Snackbar");

const w = wizardText.history;

function run(id: number, label: string | null, final = 3): SavedRun {
  return {
    id,
    study_id: 7,
    label,
    universe: "material",
    initial_count: 5,
    final_count: final,
    winner_names: ["Liga A"],
    created_at: `2026-11-1${id}T12:00:00Z`,
  };
}

const DIFF: RunDiff = {
  rows: [
    { record_id: 1, name: "Liga A", rank_before: 1, rank_after: 1, change: "same", positions: 0 },
    { record_id: 2, name: "Liga B", rank_before: 2, rank_after: null, change: "left", positions: null },
  ],
  entered: 0,
  left: 1,
  moved: 0,
  unchanged: 1,
  winners_before: ["Liga A"],
  winners_after: ["Liga A"],
  winner_changed: false,
};

function mount(onKept = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <RunHistory studyId={7} studyName="Haste" onKept={onKept} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { ...view, onKept };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe("RunHistory (D-245)", () => {
  it("diz que não há execução guardada e guarda a atual com o nome dado", async () => {
    const user = userEvent.setup();
    api.listStudyRuns.mockResolvedValue([]);
    const result = { final_count: 3 };
    api.keepStudyRun.mockResolvedValue({ run: run(1, "antes"), result });
    const { onKept, container } = mount();

    expect(await screen.findByText(w.empty)).toBeInTheDocument();
    await user.type(screen.getByLabelText(w.labelField), "antes");
    await user.click(screen.getByRole("button", { name: w.keep }));

    expect(api.keepStudyRun).toHaveBeenCalledWith(7, "antes");
    expect(onKept).toHaveBeenCalledWith(result);
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("lista as versões e compara as duas mais novas pelo servidor", async () => {
    api.listStudyRuns.mockResolvedValue([run(2, null, 2), run(1, "antes")]);
    api.compareStudyRuns.mockResolvedValue(DIFF);
    const { container } = mount();

    const table = await screen.findByRole("region", { name: w.listLabel });
    expect(within(table).getByText("antes")).toBeInTheDocument();
    expect(within(table).getByText(versionName(run(2, null)))).toBeInTheDocument();
    expect(within(table).getByText(w.candidates("2", "5"))).toBeInTheDocument();

    // Default pair: the older as "Antes", the newer as "Depois".
    expect(await screen.findByText(wizardText.runs.change.left)).toBeInTheDocument();
    expect(api.compareStudyRuns).toHaveBeenCalledWith(7, 1, 2);
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("com uma só versão pede outra antes de comparar", async () => {
    api.listStudyRuns.mockResolvedValue([run(1, "única")]);
    mount();
    expect(await screen.findByText(w.needTwo)).toBeInTheDocument();
    expect(api.compareStudyRuns).not.toHaveBeenCalled();
  });

  it("a mesma versão dos dois lados não é comparada", async () => {
    const user = userEvent.setup();
    api.listStudyRuns.mockResolvedValue([run(2, "b"), run(1, "a")]);
    api.compareStudyRuns.mockResolvedValue(DIFF);
    mount();
    const before = await screen.findByLabelText(w.before);
    await user.selectOptions(before, "2");
    expect(screen.getByText(w.sameRun)).toBeInTheDocument();
  });
});
