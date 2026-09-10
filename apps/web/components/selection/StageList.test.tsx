import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
// MWC controls (Button, Checkbox) live inside a shadow root, invisible to
// plain @testing-library/react queries — same note as ConstraintEditor.test.tsx.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import {
  StageList,
  type StageState,
  countStageConstraints,
  emptyLimitStage,
  emptyMaterialStage,
  emptyProcessStage,
  emptyTreeStage,
  isSingleLimitStage,
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
  return (
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
    expect(screen.getByShadowText(t.stageRemove)).toBeDisabled();
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
