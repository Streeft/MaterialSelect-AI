import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { RunDiff, RunDiffRequest, StudyTemplate } from "@/lib/types";
import { wizardText } from "@/lib/i18n-selection-wizard";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { rankedRun } from "@/lib/testing/selectionRuns";
import { WizardProgress } from "@/app/app/selecao/steps/WizardProgress";

const diffRuns = vi.fn<(payload: RunDiffRequest) => Promise<RunDiff>>();
vi.mock("@/lib/api", () => ({
  diffRuns: (payload: RunDiffRequest) => diffRuns(payload),
  describeExpression: () => Promise.reject(new Error("sem descrição nos testes")),
}));

const { CandidateExplorer } = await import("./CandidateExplorer");
const { RunComparison } = await import("./RunComparison");
const { TemplatePicker } = await import("./TemplatePicker");

const w = wizardText;

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

async function expectAccessible() {
  const violations = await findA11yViolations(document.body);
  expect(violations, describeViolations(violations)).toEqual([]);
}

const template = (overrides: Partial<StudyTemplate> = {}): StudyTemplate => ({
  slug: "mola-leve",
  name: "Mola leve",
  summary: "Mola que armazena o máximo de energia elástica por unidade de massa.",
  function_text: "Mola",
  objective_text: "Minimizar a massa",
  design_constraint: "Não escoar",
  free_variables: ["dimensões da mola"],
  universe: "material",
  stages: [],
  index: { name: "Mola leve (σy²/Eρ)", expression: "limite_escoamento ** 2 / (modulo_young * densidade)", goal: "maximize" },
  index_slug: null,
  criteria: [{ key: "__index__", weight: 1, direction: null }],
  reference: "Ashby",
  available: true,
  missing_properties: [],
  ...overrides,
});

describe("barra de progresso (D-210)", () => {
  const items = [
    { id: "function" as const, label: "Função", done: true },
    { id: "objective" as const, label: "Objetivo", done: false },
    { id: "constraints" as const, label: "Limites", done: false },
  ];

  it("counts the steps that are ready and takes the reader to the next one", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<WizardProgress items={items} current="function" runStep="constraints" onSelect={onSelect} />);
    expect(screen.getByText(w.progress.count(1, 3))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: w.progress.next("Objetivo") }));
    expect(onSelect).toHaveBeenCalledWith("objective");
    await expectAccessible();
  });

  it("has clickable segments for the pointer, out of the tab order", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <WizardProgress items={items} current="function" runStep="constraints" onSelect={onSelect} />,
    );
    const segments = container.querySelectorAll<HTMLButtonElement>("[aria-hidden='true'] button");
    expect(segments).toHaveLength(3);
    for (const s of segments) expect(s.tabIndex).toBe(-1);
    await user.click(segments[2]!);
    expect(onSelect).toHaveBeenCalledWith("constraints");
  });

  it("offers Run once every step is done", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <WizardProgress
        items={items.map((i) => ({ ...i, done: true }))}
        current="function"
        runStep="constraints"
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole("button", { name: w.progress.goRun }));
    expect(onSelect).toHaveBeenCalledWith("constraints");
  });
});

describe("modelos prontos (D-210)", () => {
  it("applies a template with one click", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(wrap(<TemplatePicker templates={[template()]} loading={false} failed={false} onApply={onApply} />));
    await user.click(screen.getByRole("button", { name: w.templates.useAria("Mola leve") }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ slug: "mola-leve" }));
    expect(screen.getByText("Não escoar")).toBeInTheDocument();
    await expectAccessible();
  });

  it("says what the catalogue lacks instead of offering half a study", () => {
    render(
      wrap(
        <TemplatePicker
          templates={[template({ available: false, missing_properties: ["condutividade_termica"] })]}
          loading={false}
          failed={false}
          onApply={vi.fn()}
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: /Usar este modelo/ })).toBeNull();
    expect(screen.getByText(w.templates.missing("condutividade_termica"))).toBeInTheDocument();
  });

  it("has loading and error states", () => {
    const { rerender } = render(
      wrap(<TemplatePicker templates={undefined} loading failed={false} onApply={vi.fn()} />),
    );
    expect(screen.getByText(w.templates.loading)).toBeInTheDocument();
    rerender(wrap(<TemplatePicker templates={undefined} loading={false} failed onApply={vi.fn()} />));
    expect(screen.getByText(w.templates.loadError)).toBeInTheDocument();
  });
});

describe("explicação por material e ações (D-210)", () => {
  it("explains a material on request, from the run's own answer", async () => {
    const user = userEvent.setup();
    render(<CandidateExplorer result={rankedRun()} />);
    const toggle = screen.getByRole("button", { name: w.explain.toggle("Alumínio") });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(w.explain.winner)).toBeInTheDocument();
    await expectAccessible();
  });

  it("opens the ticked materials on the map and compares them, in the run's order", async () => {
    const user = userEvent.setup();
    render(<CandidateExplorer result={rankedRun()} />);
    // Nothing ticked: both actions say what they need.
    expect(screen.getByRole("button", { name: w.explain.openMap })).toBeDisabled();
    expect(screen.getByRole("button", { name: w.explain.compareSelected })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: w.explain.selectAria("Madeira") }));
    await user.click(screen.getByRole("checkbox", { name: w.explain.selectAria("Alumínio") }));
    expect(screen.getByRole("link", { name: w.explain.openMap })).toHaveAttribute(
      "href",
      "/app/mapas?materiais=1,3&destaque=1",
    );
    expect(screen.getByRole("link", { name: w.explain.compareSelected })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=1,3",
    );
    await expectAccessible();
  });

  it("offers no map for a process study", () => {
    render(<CandidateExplorer result={rankedRun({ universe: "process" })} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(w.explain.processNoMap)).toBeInTheDocument();
  });

  it("says there is nothing to explain when no candidate passed", () => {
    render(<CandidateExplorer result={rankedRun({ candidates: [], final_count: 0 })} />);
    expect(screen.getByText(w.explain.empty)).toBeInTheDocument();
  });
});

describe("execução anterior × atual (D-210)", () => {
  it("sends both rankings to the backend and lays out what changed", async () => {
    diffRuns.mockResolvedValue({
      rows: [
        { record_id: 2, name: "Aço", rank_before: 2, rank_after: 1, change: "up", positions: 1 },
        { record_id: 1, name: "Alumínio", rank_before: 1, rank_after: 2, change: "down", positions: -1 },
        { record_id: 3, name: "Madeira", rank_before: null, rank_after: null, change: "unranked", positions: null },
      ],
      entered: 0,
      left: 0,
      moved: 2,
      unchanged: 1,
      winners_before: ["Alumínio"],
      winners_after: ["Aço"],
      winner_changed: true,
    });
    const user = userEvent.setup();
    const before = rankedRun();
    render(wrap(<RunComparison previous={before} current={rankedRun()} runKey={1} />));

    expect(await screen.findByText(w.runs.winnerChanged("Alumínio", "Aço"))).toBeInTheDocument();
    expect(diffRuns.mock.calls[0]![0].before).toEqual([
      { record_id: 1, name: "Alumínio", rank: 1 },
      { record_id: 2, name: "Aço", rank: 2 },
      { record_id: 3, name: "Madeira", rank: null },
    ]);
    const table = screen.getByRole("table");
    expect(within(table).getByText(w.runs.change.up(1))).toBeInTheDocument();
    expect(within(table).getByText(w.runs.change.down(1))).toBeInTheDocument();
    // "Só o que mudou" is on: the unranked row waits for the box to be cleared.
    expect(within(table).queryByText("Madeira")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: w.runs.onlyChanges }));
    expect(within(screen.getByRole("table")).getByText("Madeira")).toBeInTheDocument();
    await expectAccessible();
  });

  it("says so when the comparison fails", async () => {
    diffRuns.mockRejectedValue(new Error("rede"));
    render(wrap(<RunComparison previous={rankedRun()} current={rankedRun()} runKey={2} />));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
