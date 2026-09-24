import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
// MWC controls (Button, Checkbox) live inside a shadow root, invisible to
// plain @testing-library/react queries — same note as ConstraintEditor.test.tsx.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-plotly.js", () => ({ default: () => null }));

// The map, reduced to what the Chart Stage hands it and takes back from it:
// the region it is told to draw, and a region "drawn" by the reader.
vi.mock("@/components/charts/AshbyMap", () => ({
  AshbyMap: ({
    selectionBox,
    onSelectBox,
  }: {
    selectionBox?: unknown;
    onSelectBox?: (box: unknown) => void;
  }) => (
    <div>
      <output data-testid="drawn-region">{JSON.stringify(selectionBox ?? null)}</output>
      <button
        type="button"
        onClick={() => onSelectBox?.({ xMin: 2, xMax: 3, yMin: null, yMax: 80 })}
      >
        desenhar caixa
      </button>
    </div>
  ),
}));

// A stand-in for the backend's D-81 conversion. It answers with fixed numbers
// on purpose: the component must pass them through, never compute them.
const convertMapBox = vi.hoisted(() =>
  vi.fn(async (payload: { to: "canonical" | "display" }) =>
    payload.to === "display"
      ? {
          box: { x_min: 2, x_max: 8, y_min: null, y_max: null },
          x_unit: "g/cm**3",
          y_unit: "g/cm**3",
        }
      : {
          box: { x_min: 2000, x_max: 3000, y_min: null, y_max: 80000 },
          x_unit: "kg/m**3",
          y_unit: "kg/m**3",
        },
  ),
);

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    convertMapBox: (...args: [{ to: "canonical" | "display" }]) => convertMapBox(...args),
    getPropertyMap: vi.fn().mockResolvedValue({
      scale: "log",
      x_axis: {
        is_index: false,
        property_slug: "densidade",
        property_name: "Densidade",
        expression: null,
        symbol: "ρ",
        unit: "kg/m**3",
        category: "FISICA",
        better_direction: "LOWER",
        allows_log_scale: true,
        min_value: null,
        max_value: null,
      },
      y_axis: {
        is_index: false,
        property_slug: "modulo-young",
        property_name: "Módulo de Young",
        expression: null,
        symbol: "E",
        unit: "GPa",
        category: "MECANICA",
        better_direction: "HIGHER",
        allows_log_scale: true,
        min_value: null,
        max_value: null,
      },
      points: [],
      envelopes: [],
      envelopes_alt: [],
      excluded: [],
      index: null,
      considered_count: 0,
      plotted_count: 0,
      notes: [],
    }),
  };
});

import {
  StageList,
  type StageState,
  countStageConstraints,
  boundToField,
  chartAxisFromPayload,
  emptyChartStage,
  emptyLimitStage,
  emptyMaterialStage,
  emptyProcessStage,
  emptyTreeStage,
  isSingleLimitStage,
  toBound,
  toChartPayload,
  toStagePayload,
} from "./StageList";
import { emptyConstraint, nextEditorId } from "./ConstraintEditor";
import { ptBR } from "@/lib/i18n";
import type { MaterialClass, Process, ProcessClass, PropertyDefinition } from "@/lib/types";

const t = ptBR.selection;

/**
 * The `md-icon-button` host for one of the reorder controls.
 *
 * Queried by `title`, which `IconButton` sets alongside `aria-label`: under
 * jsdom, @material/web's aria-delegation mixin moves `aria-label` off the host
 * to `data-aria-label` and re-applies it inside the shadow root, so neither
 * `getByShadowRole` by name nor `getByShadowLabelText` reaches it — while
 * `disabled` does land on the host. The title is the one attribute visible from
 * the light DOM, and it is a real tooltip besides.
 */
function reorderButton(label: string): HTMLElement {
  return screen.getByTitle(label);
}

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

const classes: MaterialClass[] = [
  { id: 1, name: "Metais", slug: "metais", description: null, parent_id: null, material_count: 2 },
  {
    id: 2,
    name: "Polímeros",
    slug: "polimeros",
    description: null,
    parent_id: null,
    material_count: 1,
  },
];

const processClasses: ProcessClass[] = [
  {
    id: 1,
    name: "Conformação",
    slug: "conformacao",
    parent_id: null,
    description: null,
    process_count: 0,
  },
  { id: 2, name: "União", slug: "uniao", parent_id: null, description: null, process_count: 1 },
];

const processes: Process[] = [
  {
    id: 1,
    name: "Solda MIG",
    slug: "solda-mig",
    class_id: 2,
    class_name: "União",
    class_slug: "uniao",
    description: null,
    is_demo: true,
    material_count: 3,
  },
];

/** Controlled wrapper, the way `page.tsx` drives the list. */
function Harness({
  initial,
  onStages,
  universe = "material",
}: {
  initial: StageState[];
  onStages?: (stages: StageState[]) => void;
  universe?: "material" | "process";
}) {
  const [stages, setStages] = useState<StageState[]>(initial);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StageList
        stages={stages}
        properties={[density]}
        classes={classes}
        processes={processes}
        processClasses={processClasses}
        universe={universe}
        onChange={(next) => {
          setStages(next);
          onStages?.(next);
        }}
      />
    </QueryClientProvider>
  );
}

describe("toStagePayload", () => {
  it("sends only the fields the stage's kind uses", () => {
    const tree = { ...emptyTreeStage(), classSlugs: ["metais"], label: "  Só metais  " };
    const payload = toStagePayload(tree);
    expect(payload.kind).toBe("tree");
    expect(payload.class_slugs).toEqual(["metais"]);
    expect(payload.include_descendants).toBe(true);
    // The backend rejects a tree stage carrying constraints, so the payload
    // must not invent an empty tree for it.
    expect(payload.root_group).toBeUndefined();
    expect(payload.constraints).toBeUndefined();
  });

  it("treats a blank label as not named, never as an empty string", () => {
    expect(toStagePayload({ ...emptyLimitStage(), label: "   " }).label).toBeNull();
    expect(toStagePayload({ ...emptyLimitStage(), label: " Leves " }).label).toBe("Leves");
  });

  it("carries a limit stage's tree, not its class slugs", () => {
    const payload = toStagePayload(emptyLimitStage());
    expect(payload.kind).toBe("limit");
    expect(payload.root_group).toEqual({ operator: "AND", constraints: [], groups: [] });
    expect(payload.class_slugs).toBeUndefined();
  });
});

describe("countStageConstraints", () => {
  it("counts across stages and ignores tree stages", () => {
    const limit = emptyLimitStage();
    if (limit.kind !== "limit") throw new Error("unreachable");
    limit.group.constraints = [
      { ...emptyConstraint(nextEditorId("row")), property_slug: "densidade", value: "2800" },
    ];
    expect(countStageConstraints([limit, emptyTreeStage()])).toBe(1);
  });
});

describe("isSingleLimitStage", () => {
  it("is true only for the plain starting pipeline", () => {
    expect(isSingleLimitStage([emptyLimitStage()])).toBe(true);
    expect(isSingleLimitStage([emptyTreeStage()])).toBe(false);
    expect(isSingleLimitStage([emptyLimitStage(), emptyLimitStage()])).toBe(false);
    expect(isSingleLimitStage([])).toBe(false);
  });
});

describe("StageList", () => {
  it("adds a tree stage and a limit stage", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    render(<Harness initial={[emptyLimitStage()]} onStages={(s) => (last = s)} />);

    await user.click(screen.getByShadowText(new RegExp(t.stageAddTree)));
    expect(last.map((s) => s.kind)).toEqual(["limit", "tree"]);

    await user.click(screen.getByShadowText(new RegExp(t.stageAddLimit)));
    expect(last.map((s) => s.kind)).toEqual(["limit", "tree", "limit"]);
  });

  it("moves a stage and keeps the other one intact", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    const tree = { ...emptyTreeStage(), label: "Classes" };
    render(<Harness initial={[emptyLimitStage(), tree]} onStages={(s) => (last = s)} />);

    await user.click(reorderButton(t.stageMoveUp(2)));
    expect(last.map((s) => s.kind)).toEqual(["tree", "limit"]);
    expect(last[0]?.label).toBe("Classes");
  });

  it("cannot move the first stage up or the last stage down", () => {
    render(<Harness initial={[emptyLimitStage(), emptyTreeStage()]} />);
    expect(reorderButton(t.stageMoveUp(1))).toHaveAttribute("disabled");
    expect(reorderButton(t.stageMoveDown(2))).toHaveAttribute("disabled");
    // And the ones that should work are not disabled.
    expect(reorderButton(t.stageMoveDown(1))).not.toHaveAttribute("disabled");
    expect(reorderButton(t.stageMoveUp(2))).not.toHaveAttribute("disabled");
  });

  it("refuses to remove the last remaining stage", () => {
    render(<Harness initial={[emptyLimitStage()]} />);
    // D-76: `Button` now renders MSDS's `Button` — a plain `<button>` whose
    // visible text sits in an inner `<span class="msds-btn-label">`, not the
    // `@material/web` shadow-DOM text node `getByShadowText` used to resolve
    // directly. `toBeDisabled()` only recognizes the element it's called on,
    // and a `<span>` never carries `disabled` — so this now asks for the
    // `<button>` itself by its accessible name instead of the text node
    // inside it.
    expect(screen.getByRole("button", { name: t.stageRemove })).toBeDisabled();
  });

  it("removes a stage when there is more than one", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    render(<Harness initial={[emptyLimitStage(), emptyTreeStage()]} onStages={(s) => (last = s)} />);

    const buttons = screen.getAllByShadowText(t.stageRemove);
    await user.click(buttons[1] as HTMLElement);
    expect(last.map((s) => s.kind)).toEqual(["limit"]);
  });

  it("disabling a stage keeps it in the pipeline", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    render(<Harness initial={[emptyLimitStage()]} onStages={(s) => (last = s)} />);

    await user.click(screen.getByShadowLabelText(t.stageEnabled));
    expect(last).toHaveLength(1);
    expect(last[0]?.enabled).toBe(false);
  });

  it("says so when a tree stage has no class chosen", () => {
    render(<Harness initial={[emptyTreeStage()]} />);
    // Absence is written, never an empty control the reader has to interpret.
    expect(screen.getByText(t.stageNoClasses)).toBeInTheDocument();
  });

  it("names an unnamed stage by its position and kind", () => {
    render(<Harness initial={[emptyLimitStage(), emptyTreeStage()]} />);
    expect(screen.getByText(t.stageNumber(1, "limit"))).toBeInTheDocument();
    expect(screen.getByText(t.stageNumber(2, "tree"))).toBeInTheDocument();
  });
});


// --- The process stage (P0-2) ------------------------------------------------

describe("toStagePayload for a process stage", () => {
  it("sends only the process fields, never the other kinds'", () => {
    const stage = emptyProcessStage();
    if (stage.kind !== "process") throw new Error("unreachable");
    stage.processSlugs = ["solda-mig"];
    stage.processClassSlugs = ["uniao"];

    const payload = toStagePayload(stage);
    expect(payload.kind).toBe("process");
    expect(payload.process_slugs).toEqual(["solda-mig"]);
    expect(payload.process_class_slugs).toEqual(["uniao"]);
    expect(payload.include_descendants).toBe(true);
    // The backend rejects a process stage carrying either of these, so the
    // payload must not invent them.
    expect(payload.root_group).toBeUndefined();
    expect(payload.constraints).toBeUndefined();
    expect(payload.class_slugs).toBeUndefined();
  });

  it("is not counted as carrying constraints", () => {
    expect(countStageConstraints([emptyProcessStage()])).toBe(0);
  });

  it("is not the plain starting pipeline", () => {
    expect(isSingleLimitStage([emptyProcessStage()])).toBe(false);
  });
});

describe("StageList with a process stage", () => {
  it("adds one and keeps the stages before it", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    render(<Harness initial={[emptyLimitStage()]} onStages={(s) => (last = s)} />);

    await user.click(screen.getByShadowText(new RegExp(t.stageAddProcess)));
    expect(last.map((s) => s.kind)).toEqual(["limit", "process"]);
  });

  it("names it by position and kind when unnamed, and badges its type", () => {
    render(<Harness initial={[emptyProcessStage()]} />);
    expect(screen.getByText(t.stageNumber(1, "process"))).toBeInTheDocument();
    expect(screen.getByText(t.stageKindProcess)).toBeInTheDocument();
  });

  it("says so when nothing is chosen, and warns about absence once something is", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[emptyProcessStage()]} />);

    // Absence written out, never an empty control the reader has to interpret.
    expect(screen.getByText(t.stageNoProcesses)).toBeInTheDocument();
    expect(screen.queryByText(t.stageProcessWarning)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("listbox", { name: t.stageProcesses }), [
      "solda-mig",
    ]);
    expect(screen.queryByText(t.stageNoProcesses)).not.toBeInTheDocument();
    // And once it narrows, it says what a material with no process gets.
    expect(screen.getByText(t.stageProcessWarning)).toBeInTheDocument();
  });

  it("offers both namespaces separately — families and processes", () => {
    render(<Harness initial={[emptyProcessStage()]} />);
    expect(screen.getByRole("listbox", { name: t.stageProcessClasses })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: t.stageProcesses })).toBeInTheDocument();
  });

  it("mixes with the other two kinds in one pipeline", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    render(<Harness initial={[emptyLimitStage()]} onStages={(s) => (last = s)} />);

    await user.click(screen.getByShadowText(new RegExp(t.stageAddTree)));
    await user.click(screen.getByShadowText(new RegExp(t.stageAddProcess)));
    expect(last.map((s) => s.kind)).toEqual(["limit", "tree", "process"]);
    expect(last.map((s) => toStagePayload(s).kind)).toEqual(["limit", "tree", "process"]);
  });
});


// --- The process universe as the result (P0-3) --------------------------------

describe("toStagePayload for a material stage", () => {
  it("sends folders only, and none of the other kinds' fields", () => {
    const stage = emptyMaterialStage();
    if (stage.kind !== "material") throw new Error("unreachable");
    stage.materialClassSlugs = ["metais"];

    const payload = toStagePayload(stage);
    expect(payload.kind).toBe("material");
    expect(payload.material_class_slugs).toEqual(["metais"]);
    expect(payload.include_descendants).toBe(true);
    expect(payload.class_slugs).toBeUndefined();
    expect(payload.process_slugs).toBeUndefined();
    expect(payload.root_group).toBeUndefined();
  });
});

describe("StageList in a process study", () => {
  it("offers the material stage and not the process one", () => {
    render(<Harness initial={[emptyLimitStage()]} universe="process" />);

    // Offering the other universe's stage would be a button whose only
    // outcome is the backend's refusal.
    expect(screen.getByShadowText(new RegExp(t.stageAddMaterial))).toBeInTheDocument();
    expect(screen.queryByShadowText(new RegExp(t.stageAddProcess))).not.toBeInTheDocument();
  });

  it("offers the process stage and not the material one in a material study", () => {
    render(<Harness initial={[emptyLimitStage()]} universe="material" />);

    expect(screen.getByShadowText(new RegExp(t.stageAddProcess))).toBeInTheDocument();
    expect(screen.queryByShadowText(new RegExp(t.stageAddMaterial))).not.toBeInTheDocument();
  });

  it("lists process families in a tree stage, not material classes", () => {
    // A tree stage walks the study's *own* universe — this is the assertion
    // that would have caught listing the wrong taxonomy.
    render(<Harness initial={[emptyTreeStage()]} universe="process" />);

    const picker = screen.getByRole("listbox", { name: t.stageProcessClasses });
    expect(within(picker).getByRole("option", { name: "União" })).toBeInTheDocument();
    expect(within(picker).queryByRole("option", { name: "Metais" })).not.toBeInTheDocument();
  });

  it("lists material classes in a tree stage of a material study", () => {
    render(<Harness initial={[emptyTreeStage()]} universe="material" />);

    const picker = screen.getByRole("listbox", { name: t.stageClasses });
    expect(within(picker).getByRole("option", { name: "Metais" })).toBeInTheDocument();
  });

  it("writes the absence out when no material folder is chosen", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[emptyMaterialStage()]} universe="process" />);

    expect(screen.getByText(t.stageNoMaterialClasses)).toBeInTheDocument();
    expect(screen.queryByText(t.stageMaterialWarning)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("listbox", { name: t.stageMaterialClasses }), [
      "metais",
    ]);
    expect(screen.queryByText(t.stageNoMaterialClasses)).not.toBeInTheDocument();
    expect(screen.getByText(t.stageMaterialWarning)).toBeInTheDocument();
  });

  it("names an unnamed material stage by position and kind", () => {
    render(<Harness initial={[emptyMaterialStage()]} universe="process" />);
    expect(screen.getByText(t.stageNumber(1, "material"))).toBeInTheDocument();
    expect(screen.getByText(t.stageKindMaterial)).toBeInTheDocument();
  });
});


// --- The chart stage (P1-2) ---------------------------------------------------

/** A chart stage with its plane chosen, so a test can vary one thing at a time. */
function chartStage(over: Partial<Extract<StageState, { kind: "chart" }>> = {}) {
  const stage = emptyChartStage();
  if (stage.kind !== "chart") throw new Error("unreachable");
  return {
    ...stage,
    x: { ...stage.x, propertySlug: "densidade" },
    y: { ...stage.y, propertySlug: "densidade" },
    ...over,
  };
}

describe("toChartPayload", () => {
  it("sends a blank bound as null and never as zero", () => {
    // The whole reason the state holds strings: `Number("")` is 0, and 0 is a
    // bound. A box that quietly acquired a floor at zero would narrow a
    // selection the reader never narrowed.
    const payload = toChartPayload(chartStage({ x: { ...chartStage().x, min: "0", max: "" } }));

    expect(payload.x.min_value).toBe(0);
    expect(payload.x.max_value).toBeNull();
  });

  it("aceita vírgula como separador decimal em limites digitados", () => {
    const payload = toChartPayload(
      chartStage({ x: { ...chartStage().x, min: "1000,5", max: "8000,25" } }),
    );

    expect(payload.x.min_value).toBe(1000.5);
    expect(payload.x.max_value).toBe(8000.25);
  });

  it("sends the property when the axis is a property, and nothing else", () => {
    const payload = toChartPayload(
      chartStage({
        x: { mode: "property", propertySlug: "densidade", expression: "sqrt(E)/rho", min: "", max: "" },
      }),
    );

    // The expression the reader typed before switching back is kept in the
    // editor but not sent: the backend refuses an axis naming both.
    expect(payload.x.property_slug).toBe("densidade");
    expect(payload.x.expression).toBeNull();
  });

  it("sends the expression when the axis is an index, and nothing else", () => {
    const payload = toChartPayload(
      chartStage({
        x: { mode: "expression", propertySlug: "densidade", expression: " sqrt(E)/rho ", min: "", max: "" },
      }),
    );

    expect(payload.x.expression).toBe("sqrt(E)/rho");
    expect(payload.x.property_slug).toBeNull();
  });

  it("drops a half-written line rather than sending it broken", () => {
    // A level with no expression is not a level of anything, and an expression
    // with no level is a line with no position. The backend refuses both, so
    // the screen must not build either.
    const noLevel = toChartPayload(chartStage({ indexExpression: "sqrt(E)/rho" }));
    expect(noLevel.index_expression).toBeNull();
    expect(noLevel.index_level).toBeNull();

    const noExpression = toChartPayload(chartStage({ indexLevel: "100" }));
    expect(noExpression.index_expression).toBeNull();
    expect(noExpression.index_level).toBeNull();
  });

  it("sends the line when it has both halves", () => {
    const payload = toChartPayload(
      chartStage({ indexExpression: "sqrt(E)/rho", indexLevel: "0.003", indexGoal: "minimize" }),
    );

    expect(payload.index_expression).toBe("sqrt(E)/rho");
    expect(payload.index_level).toBe(0.003);
    expect(payload.index_goal).toBe("minimize");
  });

  it("sends a bound that is not a number as null, never as NaN", () => {
    // NaN compares false against everything, so it would reject the whole
    // catalogue without a word — and the schema refuses it anyway.
    const payload = toChartPayload(chartStage({ x: { ...chartStage().x, min: "abc" } }));

    expect(payload.x.min_value).toBeNull();
  });
});

describe("reopening a saved chart stage", () => {
  it("brings an absent bound back as an empty field, never as zero", () => {
    // The one place the nullable column's whole point could be lost: a study
    // reopened with a floor of 0 would narrow where it never narrowed.
    expect(boundToField(null)).toBe("");
    expect(boundToField(undefined)).toBe("");
    expect(boundToField(0)).toBe("0");
    expect(boundToField(2800)).toBe("2800");
  });

  it("reopens a property axis in property mode and an index axis in index mode", () => {
    expect(chartAxisFromPayload({ property_slug: "densidade", max_value: 2800 })).toEqual({
      mode: "property",
      propertySlug: "densidade",
      expression: "",
      min: "",
      max: "2800",
    });
    expect(chartAxisFromPayload({ expression: "sqrt(E)/rho", min_value: 100 })).toEqual({
      mode: "expression",
      propertySlug: "",
      expression: "sqrt(E)/rho",
      min: "100",
      max: "",
    });
  });

  it("round-trips a plane through the payload and back unchanged", () => {
    const before = chartStage({
      x: { mode: "property", propertySlug: "densidade", expression: "", min: "", max: "2800" },
      y: { mode: "expression", propertySlug: "", expression: "sqrt(E)/rho", min: "100", max: "" },
    });
    const payload = toChartPayload(before);

    expect(chartAxisFromPayload(payload.x)).toEqual(before.x);
    expect(chartAxisFromPayload(payload.y)).toEqual(before.y);
  });
});

describe("toStagePayload for a chart stage", () => {
  it("sends the plane and none of the other kinds' fields", () => {
    const payload = toStagePayload(chartStage());

    expect(payload.kind).toBe("chart");
    expect(payload.chart?.x.property_slug).toBe("densidade");
    expect(payload.root_group).toBeUndefined();
    expect(payload.class_slugs).toBeUndefined();
    expect(payload.process_slugs).toBeUndefined();
  });

  it("is not counted as carrying constraints", () => {
    expect(countStageConstraints([emptyChartStage()])).toBe(0);
  });

  it("is not the plain starting pipeline", () => {
    expect(isSingleLimitStage([emptyChartStage()])).toBe(false);
  });
});

describe("StageList with a chart stage", () => {
  it("adds one in either universe — a plane is a plane", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    const { unmount } = render(
      <Harness initial={[emptyLimitStage()]} onStages={(s) => (last = s)} />,
    );
    await user.click(screen.getByShadowText(new RegExp(t.stageAddChart)));
    expect(last.map((s) => s.kind)).toEqual(["limit", "chart"]);
    unmount();

    render(<Harness initial={[emptyLimitStage()]} universe="process" onStages={(s) => (last = s)} />);
    await user.click(screen.getByShadowText(new RegExp(t.stageAddChart)));
    expect(last.map((s) => s.kind)).toEqual(["limit", "chart"]);
  });

  it("names it by position and kind when unnamed, and badges its type", () => {
    render(<Harness initial={[emptyChartStage()]} />);
    expect(screen.getByText(t.stageNumber(1, "chart"))).toBeInTheDocument();
    expect(screen.getByText(t.stageKindChart)).toBeInTheDocument();
  });

  it("says so while the plane is incomplete", () => {
    render(<Harness initial={[emptyChartStage()]} />);
    // Absence written out, never an empty control the reader has to interpret.
    expect(screen.getByText(t.stageChartNoAxes)).toBeInTheDocument();
  });

  it("says that a plane with no box and no line still selects", () => {
    render(<Harness initial={[chartStage()]} />);
    // "Must be plottable here" is a criterion, and a screen that showed nothing
    // would read as a stage that asks nothing.
    expect(screen.getByText(t.stageChartPlottableOnly)).toBeInTheDocument();
  });

  it("states the plottability rule once the stage narrows", () => {
    render(<Harness initial={[chartStage({ x: { ...chartStage().x, min: "1000" } })]} />);

    // The one rule this stage has that no other stage has: a record with no
    // coordinate is out even where the box bounds nothing.
    expect(screen.getByText(t.stageChartWarning)).toBeInTheDocument();
    expect(screen.queryByText(t.stageChartPlottableOnly)).not.toBeInTheDocument();
  });

  it("warns about an inverted box before the run, not after", () => {
    render(
      <Harness initial={[chartStage({ x: { ...chartStage().x, min: "8000", max: "1000" } })]} />,
    );

    // It would return nothing and look like an answer.
    expect(screen.getByText(t.stageChartInvertedBox("X"))).toBeInTheDocument();
  });

  it("names the canonical unit of the chosen axis instead of offering a unit picker", () => {
    render(<Harness initial={[chartStage()]} />);

    // The numbers are read off an axis already drawn in canonical units, so a
    // picker would offer a conversion nothing performs.
    expect(screen.getAllByText(t.stageChartBoundsHint("kg/m³")).length).toBeGreaterThan(0);
  });

  it("falls back to a unitless hint while no axis is chosen", () => {
    render(<Harness initial={[emptyChartStage()]} />);

    expect(screen.getAllByText(t.stageChartBoundsHintPlain).length).toBe(2);
  });

  it("offers the study's own attributes on the plane", () => {
    const { container } = render(<Harness initial={[emptyChartStage()]} />);

    // D-77: SelectOption is a plain native <option> now.
    const options = Array.from(container.querySelectorAll("option")).map(
      (o) => o.textContent?.trim() ?? "",
    );
    expect(options).toContain("Densidade");
  });

  it("limpa os limites da caixa ao clicar em 'Limpar caixa'", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    render(
      <Harness
        initial={[
          chartStage({
            x: { ...chartStage().x, min: "1000", max: "8000" },
            y: { ...chartStage().y, min: "10", max: "200" },
          }),
        ]}
        onStages={(s) => (last = s)}
      />,
    );

    const clearBtn = screen.getByShadowText(t.stageChartClearBox);
    await user.click(clearBtn);

    const updated = last[0];
    if (updated?.kind !== "chart") throw new Error("unreachable");
    expect(updated.x.min).toBe("");
    expect(updated.x.max).toBe("");
    expect(updated.y.min).toBe("");
    expect(updated.y.max).toBe("");

    const payload = toChartPayload(updated);
    expect(payload.x.min_value).toBeNull();
    expect(payload.x.max_value).toBeNull();
  });

  it("oferece alternar o mapa interativo no estágio de gráfico", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[chartStage()]} />);

    const toggleBtn = screen.getByShadowText(t.stageChartShowMap);
    expect(toggleBtn).toBeInTheDocument();
    await user.click(toggleBtn);
    expect(screen.getByShadowText(t.stageChartHideMap)).toBeInTheDocument();
    expect(screen.getByText(t.stageChartInteractiveHint)).toBeInTheDocument();
  });

  it("desenha a região guardada em unidade canônica na unidade do mapa (D-81)", async () => {
    // O estágio guarda kg/m³; o mapa desenha em g/cm³. A caixa que chega ao mapa
    // é a que o backend converteu — 2000–8000 kg/m³ desenhados como 2–8.
    const user = userEvent.setup();
    convertMapBox.mockClear();
    render(
      <Harness
        initial={[chartStage({ x: { ...chartStage().x, min: "2000", max: "8000" } })]}
      />,
    );

    await user.click(screen.getByShadowText(t.stageChartShowMap));

    await vi.waitFor(() =>
      expect(screen.getByTestId("drawn-region").textContent).toBe(
        JSON.stringify({ xMin: 2, xMax: 8, yMin: null, yMax: null }),
      ),
    );
    expect(convertMapBox).toHaveBeenCalledWith(
      expect.objectContaining({
        x: "densidade",
        to: "display",
        box: { x_min: 2000, x_max: 8000, y_min: null, y_max: null },
      }),
    );
  });

  it("guarda a caixa desenhada no mapa em unidade canônica (D-81)", async () => {
    // Desenhada em g/cm³ (2–3), a caixa chega aos campos do estágio em kg/m³
    // (2000–3000) — nunca como "2 kg/m³".
    const user = userEvent.setup();
    convertMapBox.mockClear();
    let last: StageState[] = [];
    render(<Harness initial={[chartStage()]} onStages={(s) => (last = s)} />);

    await user.click(screen.getByShadowText(t.stageChartShowMap));
    await user.click(await screen.findByRole("button", { name: "desenhar caixa" }));

    await vi.waitFor(() => {
      const updated = last[0];
      if (updated?.kind !== "chart") throw new Error("unreachable");
      expect(updated.x.min).toBe("2000");
    });
    const updated = last[0];
    if (updated?.kind !== "chart") throw new Error("unreachable");
    expect(updated.x.max).toBe("3000");
    // Lado aberto continua aberto: nenhum limite não é limite zero (D-60).
    expect(updated.y.min).toBe("");
    expect(updated.y.max).toBe("80000");
    expect(convertMapBox).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "canonical",
        box: { x_min: 2, x_max: 3, y_min: null, y_max: 80 },
      }),
    );
  });

  it("permite abrir o mapa interativo também no universo de processos", () => {
    render(<Harness initial={[chartStage()]} universe="process" />);
    expect(screen.getByShadowText(t.stageChartShowMap)).toBeInTheDocument();
    expect(screen.queryByText(t.stageChartProcessNoMap)).not.toBeInTheDocument();
  });
});
