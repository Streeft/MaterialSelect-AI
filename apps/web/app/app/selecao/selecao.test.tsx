import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type {
  PerformanceIndex,
  ProcessAttribute,
  PropertyDefinition,
  RunRequest,
  RunResult,
  WeightBudget,
  WeightsPreview,
  WeightsPreviewRequest,
} from "@/lib/types";

const t = ptBR.selection;

const runSelection = vi.fn<(payload: RunRequest) => Promise<RunResult>>();
const listProcessAttributes = vi.fn<() => Promise<ProcessAttribute[]>>();
const previewWeights = vi.fn<(payload: WeightsPreviewRequest) => Promise<WeightsPreview>>();

/** A budget that closes: every row sound, `can_run` true — the backend's answer
 * to any well-formed set of criteria, unless a test says otherwise. */
function closedPreview(payload: WeightsPreviewRequest, budget: Partial<WeightBudget> = {}): WeightsPreview {
  return {
    budget: {
      limit: 1,
      tolerance: 0.001,
      total: 1,
      remaining: 0,
      excess: 0,
      status: "complete",
      rows: payload.criteria.map((c, position) => ({
        position,
        key: c.key || null,
        weight: c.weight,
        share: null,
        share_percent: null,
        issue: c.weight === null ? "missing_weight" : null,
      })),
      suggestion: null,
      can_run: true,
      ...budget,
    },
    method: payload.method,
    top: [],
    initial_count: 12,
    candidate_count: 12,
    ranked_count: 0,
    constraints_applied: false,
    renormalized: false,
    unavailable_reason: "no_criteria",
    unavailable_message: "Escolha um critério.",
  };
}
let propertiesMock: PropertyDefinition[] = [];
const listPerformanceIndices = vi.fn<() => Promise<PerformanceIndex[]>>();

const density: PropertyDefinition = {
  display_unit: null,
  id: 1,
  name: "Densidade",
  slug: "densidade",
  symbol: "ρ",
  description: null,
  category: "FISICA",
  physical_dimension: "[mass] / [length] ** 3",
  canonical_unit: "kg/m**3",
  accepted_units: ["kg/m**3"],
  is_interval: false,
  better_direction: "LOWER",
  allows_log_scale: true,
  value_count: 10,
};

// The wizard is the screen, not the network. Everything the page asks the API
// for is stubbed; only `runSelection` carries a story, because the candidate
// counter and the results step are what this file is about. It forwards its
// payload (unlike a bare stub) so the method-selector tests below can assert
// on what the wizard actually built.
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  runSelection: (payload: RunRequest) => runSelection(payload),
  previewWeights: (payload: WeightsPreviewRequest) => previewWeights(payload),
  listProperties: () => Promise.resolve(propertiesMock),
  listClasses: () => Promise.resolve([]),
  listProcesses: () => Promise.resolve([]),
  listProcessClasses: () => Promise.resolve([]),
  listProcessAttributes: () => listProcessAttributes(),
  listPerformanceIndices: () => listPerformanceIndices(),
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
// PageHeader reads its section from the current route (Task 1) — the mock
// needs a real pathname so `sectionForPath` doesn't crash on `null`.
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  usePathname: () => "/app/selecao",
}));

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    universe: "material",
    initial_count: 12,
    combinator: "AND",
    final_count: 5,
    funnel: [],
    stages: [],
    candidates: [],
    index: null,
    ranking: null,
    ...overrides,
  };
}

/** A step of the Stepper itself — the action bar may carry a button with the
 * same name (its "next" action), so the query is scoped to the steps nav. */
function stepButton(label: string) {
  const nav = screen.getByRole("navigation", { name: ptBR.ui.steps });
  return within(nav).getByRole("button", { name: new RegExp(label, "i") });
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
  previewWeights.mockReset();
  previewWeights.mockImplementation(async (payload) => closedPreview(payload));
  listProcessAttributes.mockResolvedValue([]);
  propertiesMock = [density];
  listPerformanceIndices.mockResolvedValue([]);
  for (const key of [...searchParams.keys()]) searchParams.delete(key);
  window.history.replaceState(null, "", "/app/selecao");
});

/** Run, once the weight check has answered (D-87): the button waits for it. */
async function clickRun(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByShadowRole("button", { name: t.run })).toBeEnabled());
  await user.click(screen.getByShadowRole("button", { name: t.run }));
}

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
    await clickRun(user);

    // The winner card is the first thing the results screen renders (D-85);
    // this run has no objective, so it says honestly that nobody won.
    await waitFor(() =>
      expect(screen.getByShadowRole("heading", { name: t.winnerNoneTitle })).toBeInTheDocument(),
    );
    expect(
      screen.getByShadowRole("button", { name: new RegExp(t.stepResults, "i") }),
    ).not.toBeDisabled();
  });

  it("says why the study cannot be saved instead of showing a dead button", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    await user.click(screen.getByShadowRole("button", { name: new RegExp(t.stepObjective, "i") }));
    await clickRun(user);

    await waitFor(() =>
      expect(screen.getByShadowRole("button", { name: t.saveStudy })).toBeDisabled(),
    );
    expect(screen.getByText(t.saveNeedsName)).toBeInTheDocument();
  });
});

describe("navegação guiada (D-85)", () => {
  it("names the next step, goes back with Voltar, and offers the home page from step 1", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    expect(screen.getByShadowRole("link", { name: t.backToHome })).toHaveAttribute("href", "/app");
    await user.click(screen.getByShadowRole("button", { name: t.nextStep(t.stepConstraints) }));
    expect(stepButton(t.stepConstraints)).toHaveAttribute("aria-current", "step");
    expect(window.location.search).toContain("etapa=restricoes");

    await user.click(screen.getByShadowRole("button", { name: t.back }));
    expect(stepButton(t.stepFunction)).toHaveAttribute("aria-current", "step");
  });

  it("follows the browser's Back button to the previous step", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    await user.click(screen.getByShadowRole("button", { name: t.nextStep(t.stepConstraints) }));
    expect(stepButton(t.stepConstraints)).toHaveAttribute("aria-current", "step");

    window.history.pushState(null, "", "/app/selecao?etapa=funcao");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() =>
      expect(stepButton(t.stepFunction)).toHaveAttribute("aria-current", "step"),
    );
  });

  it("summarizes what each step holds under its name", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));
    await user.type(screen.getByShadowRole("textbox", { name: t.studyName }), "Viga de bicicleta");
    expect(stepButton(t.stepFunction)).toHaveTextContent("Viga de bicicleta");
  });
});

describe("opções avançadas (D-85)", () => {
  it("keeps a non-default method visible with the section closed", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));
    await user.click(stepButton(t.stepObjective));
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));

    const details = screen.getByText(ptBR.ui.advancedOptions).closest("details")!;
    expect(details.open).toBe(false);
    await user.click(screen.getByText(ptBR.ui.advancedOptions));
    await user.click(screen.getByShadowRole("button", { name: t.methodTopsis }));
    await user.click(screen.getByText(ptBR.ui.advancedOptions));
    expect(details.open).toBe(false);
    expect(screen.getByText(t.methodInUse(t.methodTopsis))).toBeInTheDocument();
  });

  it("starts the constraints step with one row and no stage chrome", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));
    await user.click(stepButton(t.stepConstraints));

    expect(screen.queryByShadowRole("textbox", { name: ptBR.selection.stageLabel })).not.toBeInTheDocument();
    expect(screen.queryByShadowRole("button", { name: `+ ${t.stageAddTree}` })).not.toBeVisible();
  });
});

describe("objetivo em blocos (D-85)", () => {
  it("locks criteria until the index is confirmed, then folds the index with Alterar", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));
    await user.click(stepButton(t.stepObjective));

    expect(screen.getByText(t.indexLockedReason)).toBeInTheDocument();
    expect(screen.queryByShadowRole("button", { name: t.addCriterion })).not.toBeInTheDocument();

    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    expect(screen.getByText(t.noIndexChosen)).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: t.addCriterion })).toBeInTheDocument();

    await user.click(screen.getByShadowRole("button", { name: ptBR.ui.change }));
    expect(screen.getByShadowRole("button", { name: t.continueToCriteria })).toBeInTheDocument();
  });
});

describe("critério sem repetição (D-85)", () => {
  it("does not offer a key another row already uses", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));
    await user.click(stepButton(t.stepObjective));
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));
    await user.type(screen.getByRole("combobox", { name: t.criterion }), density.name);
    await user.keyboard("{Enter}");

    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));
    const [, second] = screen.getAllByRole("combobox", { name: t.criterion });
    await user.click(second!);
    expect(screen.getByText(ptBR.ui.comboboxNoMatch(""))).toBeInTheDocument();
  });
});

describe("método de ranking", () => {
  it("hides normalization for TOPSIS/PROMETHEE, an option that has no effect on either", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    await user.click(screen.getByShadowRole("button", { name: new RegExp(t.stepObjective, "i") }));
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    await user.click(screen.getByText(ptBR.ui.advancedOptions));
    expect(screen.getByShadowRole("combobox", { name: t.normalization })).toBeInTheDocument();

    await user.click(screen.getByShadowRole("button", { name: t.methodTopsis }));
    expect(screen.queryByShadowRole("combobox", { name: t.normalization })).not.toBeInTheDocument();
    expect(screen.getByText(t.methodHint)).toBeInTheDocument();

    await user.click(screen.getByShadowRole("button", { name: t.methodWeightedSum }));
    expect(screen.getByShadowRole("combobox", { name: t.normalization })).toBeInTheDocument();
  });

  it("sends the chosen method on the run request", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    await user.click(screen.getByShadowRole("button", { name: new RegExp(t.stepObjective, "i") }));
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));
    await user.type(screen.getByRole("combobox", { name: t.criterion }), density.name);
    await user.keyboard("{Enter}");
    await user.click(screen.getByText(ptBR.ui.advancedOptions));
    await user.click(screen.getByShadowRole("button", { name: t.methodPromethee }));
    await clickRun(user);

    await waitFor(() => expect(runSelection).toHaveBeenCalled());
    expect(runSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        ranking: expect.objectContaining({
          method: "promethee",
          criteria: [expect.objectContaining({ key: density.slug })],
        }),
      }),
    );
  });
});

// --- D-84: a process study ranks by its numeric attributes -------------------

function attribute(overrides: Partial<ProcessAttribute>): ProcessAttribute {
  return {
    id: 1,
    name: "Lote econômico",
    slug: "lote-economico",
    symbol: null,
    description: null,
    kind: "ESCALAR",
    variable: "lote_economico",
    physical_dimension: "dimensionless",
    canonical_unit: "dimensionless",
    accepted_units: ["dimensionless"],
    allowed_labels: [],
    better_direction: "LOWER",
    ...overrides,
  };
}

const beamIndex: PerformanceIndex = {
  id: 1,
  name: "Viga leve e rígida",
  slug: "viga-leve-rigidez",
  expression: "modulo_young ** 0.5 / densidade",
  goal: "maximize",
  description: null,
  assumptions: null,
  dimension: null,
  is_demo: true,
};

describe("estudo de processos", () => {
  it("offers the numeric process attributes as criteria, never a discrete one", async () => {
    const user = userEvent.setup();
    searchParams.set("universo", "process");
    listProcessAttributes.mockResolvedValue([
      attribute({}),
      attribute({ id: 2, name: "Faixa de massa", slug: "faixa-massa", kind: "ENVELOPE", variable: "faixa_massa" }),
      attribute({
        id: 3,
        name: "Forma",
        slug: "forma",
        kind: "DISCRETO",
        variable: "forma",
        canonical_unit: null,
        accepted_units: [],
        allowed_labels: ["Oco 3D"],
      }),
    ]);
    listPerformanceIndices.mockResolvedValue([beamIndex]);
    render(wrap(<SelectionPage />));

    await user.click(stepButton(t.stepObjective));
    // The objective step is there — not the old "cannot rank" notice.
    expect(screen.getAllByText(t.processIndexNote).length).toBeGreaterThan(0);
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));

    await waitFor(() => expect(listProcessAttributes).toHaveBeenCalled());
    await user.click(screen.getByRole("combobox", { name: t.criterion }));
    const list = await screen.findByRole("listbox");
    await waitFor(() =>
      expect(within(list).getByRole("option", { name: "Lote econômico" })).toBeInTheDocument(),
    );
    expect(within(list).getByRole("option", { name: "Faixa de massa" })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: "Forma" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: density.name })).not.toBeInTheDocument();

    // Catalogue indices are written over material properties: not offered.
    expect(screen.queryByText(beamIndex.name)).not.toBeInTheDocument();
  });

  it("sends a process-attribute criterion on the run", async () => {
    const user = userEvent.setup();
    searchParams.set("universo", "process");
    listProcessAttributes.mockResolvedValue([attribute({})]);
    render(wrap(<SelectionPage />));

    await user.click(stepButton(t.stepObjective));
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));
    await waitFor(() => expect(listProcessAttributes).toHaveBeenCalled());
    await user.type(screen.getByRole("combobox", { name: t.criterion }), "lote");
    await user.keyboard("{Enter}");
    await clickRun(user);

    await waitFor(() =>
      expect(runSelection).toHaveBeenCalledWith(
        expect.objectContaining({
          universe: "process",
          ranking: expect.objectContaining({
            criteria: [expect.objectContaining({ key: "lote-economico" })],
          }),
        }),
      ),
    );
  });

  it("clears the objective when the universe changes, since its keys would be refused", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));

    await user.click(stepButton(t.stepObjective));
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));
    expect(screen.getByRole("combobox", { name: t.criterion })).toBeInTheDocument();

    // The universe lives in step 1's advanced options since D-85.
    await user.click(stepButton(t.stepFunction));
    await user.click(screen.getByText(ptBR.ui.advancedOptions));
    await user.click(screen.getByShadowRole("button", { name: t.universeProcess }));
    await user.click(stepButton(t.stepObjective));

    expect(screen.queryByRole("combobox", { name: t.criterion })).not.toBeInTheDocument();
  });
});

describe("exemplo em um clique (D-85)", () => {
  const prop = (slug: string, name: string): PropertyDefinition => ({ ...density, slug, name });

  it("loads the bicycle beam, and Desfazer puts back what was there", async () => {
    const user = userEvent.setup();
    propertiesMock = [
      density,
      prop("modulo_young", "Módulo de Young"),
      prop("limite_escoamento", "Limite de escoamento"),
      prop("temp_max_servico", "Temperatura máxima de serviço"),
    ];
    listPerformanceIndices.mockResolvedValue([beamIndex]);
    render(wrap(<SelectionPage />));

    const nameField = screen.getByShadowRole("textbox", { name: t.studyName });
    await user.type(nameField, "Meu estudo");
    await waitFor(() => expect(listPerformanceIndices).toHaveBeenCalled());
    await user.click(screen.getByShadowRole("button", { name: t.loadExample }));

    expect(screen.getByText(t.exampleLoaded)).toBeInTheDocument();
    expect(nameField).toHaveValue("Viga leve de bicicleta (exemplo)");
    expect(stepButton(t.stepObjective)).toHaveTextContent(beamIndex.name);
    expect(stepButton(t.stepConstraints)).toHaveTextContent("3 restrições");

    await user.click(screen.getByShadowRole("button", { name: t.exampleUndo }));
    expect(nameField).toHaveValue("Meu estudo");
    expect(stepButton(t.stepConstraints)).not.toHaveTextContent("3 restrições");
  });

  it("refuses to load half an example, naming what the catalogue lacks", async () => {
    const user = userEvent.setup();
    render(wrap(<SelectionPage />));
    await waitFor(() => expect(listPerformanceIndices).toHaveBeenCalled());
    await user.click(screen.getByShadowRole("button", { name: t.loadExample }));

    expect(screen.getByText(/O exemplo não pôde ser carregado/)).toHaveTextContent("viga-leve-rigidez");
    expect(screen.getByShadowRole("textbox", { name: t.studyName })).toHaveValue("");
  });
});

// --- D-87: the weights close at 1 before a run --------------------------------

describe("pesos com limite 1", () => {
  async function twoCriteria(user: ReturnType<typeof userEvent.setup>) {
    propertiesMock = [density, { ...density, id: 2, name: "Módulo de Young", slug: "modulo_young" }];
    render(wrap(<SelectionPage />));
    await user.click(screen.getByShadowRole("button", { name: new RegExp(t.stepObjective, "i") }));
    await user.click(screen.getByShadowRole("button", { name: t.continueToCriteria }));
    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));
    await user.type(screen.getAllByRole("combobox", { name: t.criterion })[0]!, "Densidade");
    await user.keyboard("{Enter}");
    await user.click(screen.getByShadowRole("button", { name: t.addCriterion }));
    await user.type(screen.getAllByRole("combobox", { name: t.criterion })[1]!, "Módulo");
    await user.keyboard("{Enter}");
  }

  it("starts the second criterion blank, so the total does not silently reach 2", async () => {
    const user = userEvent.setup();
    await twoCriteria(user);
    const weights = screen.getAllByShadowLabelText(t.weight) as HTMLInputElement[];
    expect(weights.map((w) => w.value)).toEqual(["1", ""]);
    // Debounced: the latest call is the one that carries both rows.
    await waitFor(() =>
      expect(previewWeights.mock.calls.at(-1)?.[0].criteria.map((c) => c.weight)).toEqual([
        1,
        null,
      ]),
    );
  });

  it("blocks Run with the reason, and the suggestion closes the total", async () => {
    previewWeights.mockImplementation(async (payload) =>
      payload.criteria.some((c) => c.weight === null)
        ? closedPreview(payload, {
            status: "incomplete",
            can_run: false,
            suggestion: { kind: "split_equally", weights: [0.5, 0.5] },
          })
        : closedPreview(payload),
    );
    const user = userEvent.setup();
    await twoCriteria(user);

    await screen.findByText(t.weights.issues.missing_weight, { selector: "#executar-motivo" });
    expect(screen.getByShadowRole("button", { name: t.run })).toBeDisabled();

    await user.click(await screen.findByShadowRole("button", { name: t.weights.suggest.split_equally }));
    const weights = screen.getAllByShadowLabelText(t.weight) as HTMLInputElement[];
    expect(weights.map((w) => w.value)).toEqual(["0,5", "0,5"]);

    await clickRun(user);
    await waitFor(() => expect(runSelection).toHaveBeenCalled());
    const ranking = runSelection.mock.calls.at(-1)![0].ranking;
    expect(ranking?.criteria.map((c) => c.weight)).toEqual([0.5, 0.5]);
  });

  it("undoes a suggestion", async () => {
    previewWeights.mockImplementation(async (payload) =>
      closedPreview(payload, {
        status: "incomplete",
        can_run: false,
        suggestion: { kind: "split_equally", weights: [0.5, 0.5] },
      }),
    );
    const user = userEvent.setup();
    await twoCriteria(user);
    await user.click(await screen.findByShadowRole("button", { name: t.weights.suggest.split_equally }));
    await user.click(screen.getByShadowRole("button", { name: t.weights.undo }));
    const weights = screen.getAllByShadowLabelText(t.weight) as HTMLInputElement[];
    expect(weights.map((w) => w.value)).toEqual(["1", ""]);
  });

  it("names a weight that is not a number", async () => {
    const user = userEvent.setup();
    await twoCriteria(user);
    const second = (screen.getAllByShadowLabelText(t.weight) as HTMLInputElement[])[1]!;
    await user.type(second, "abc");
    expect(await screen.findByText(t.weights.invalidNumber)).toBeInTheDocument();
  });

  it("fails open when the check cannot be made", async () => {
    previewWeights.mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    await twoCriteria(user);
    await clickRun(user);
    await waitFor(() => expect(runSelection).toHaveBeenCalled());
    expect(screen.queryByText(t.weights.checking)).toBeNull();
  });
});
