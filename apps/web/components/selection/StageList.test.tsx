import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
// MWC controls (Button, Checkbox) live inside a shadow root, invisible to
// plain @testing-library/react queries — same note as ConstraintEditor.test.tsx.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import {
  StageList,
  type StageState,
  countStageConstraints,
  emptyLimitStage,
  emptyTreeStage,
  isSingleLimitStage,
  toStagePayload,
} from "./StageList";
import { emptyConstraint, nextEditorId } from "./ConstraintEditor";
import { ptBR } from "@/lib/i18n";
import type { MaterialClass, PropertyDefinition } from "@/lib/types";

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

/** Controlled wrapper, the way `page.tsx` drives the list. */
function Harness({
  initial,
  onStages,
}: {
  initial: StageState[];
  onStages?: (stages: StageState[]) => void;
}) {
  const [stages, setStages] = useState<StageState[]>(initial);
  return (
    <StageList
      stages={stages}
      properties={[density]}
      classes={classes}
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
