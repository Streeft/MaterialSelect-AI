import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
// MWC control roles (the segmented-button toggles, the Add buttons) live
// inside a shadow root, invisible to plain @testing-library/react queries —
// see the same note in app/selecao/selecao.test.tsx.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import {
  ConstraintEditor,
  emptyConstraint,
  emptyGroup,
  fromConstraintPayload,
  nextEditorId,
  selectableFor,
  toConstraintPayload,
  type ConstraintGroupState,
} from "./ConstraintEditor";
import { ptBR } from "@/lib/i18n";
import type { ProcessAttribute, PropertyDefinition, SelectionUniverse } from "@/lib/types";

const t = ptBR.selection;

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

/** A controlled wrapper, the way `page.tsx` actually drives the editor —
 * `onRoot` mirrors every update out to the test so assertions can read the
 * tree `ConstraintEditor` itself never exposes directly. */
function Harness({
  initial,
  onRoot,
  properties = [density],
  universe = "material",
}: {
  initial: ConstraintGroupState;
  onRoot?: (root: ConstraintGroupState) => void;
  properties?: Parameters<typeof ConstraintEditor>[0]["properties"];
  universe?: SelectionUniverse;
}) {
  const [root, setRoot] = useState(initial);
  return (
    <ConstraintEditor
      root={root}
      properties={properties}
      classes={[]}
      universe={universe}
      onChange={(next) => {
        setRoot(next);
        onRoot?.(next);
      }}
    />
  );
}

// --- P0-4: process attributes -------------------------------------------------

const massRange: ProcessAttribute = {
  id: 1,
  name: "Faixa de massa",
  slug: "faixa-massa",
  symbol: "m",
  description: null,
  kind: "ENVELOPE",
  physical_dimension: "[mass]",
  canonical_unit: "kg",
  accepted_units: ["kg", "g"],
  allowed_labels: [],
  better_direction: "NEUTRAL",
};

const shape: ProcessAttribute = {
  id: 2,
  name: "Forma",
  slug: "forma",
  symbol: null,
  description: null,
  kind: "DISCRETO",
  physical_dimension: "",
  canonical_unit: null,
  accepted_units: [],
  allowed_labels: ["Maciço 3D", "Oco 3D"],
  better_direction: "NEUTRAL",
};

describe("ConstraintEditor — grupos aninhados (M6)", () => {
  it("adding a nested group renders it indented under its parent", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial={emptyGroup("root")} />);

    // Before: only the root's own "Adicionar grupo" exists. `find*` (not
    // `get*`) because @material/web's custom elements finish their first
    // Lit render a microtask after React's own — see AhpMatrixInput.test.tsx.
    const before = await screen.findAllByShadowRole("button", { name: t.addGroup });
    expect(before).toHaveLength(1);
    expect(container.querySelector(".border-edge-control")).not.toBeInTheDocument();

    const [addGroupButton] = before;
    if (!addGroupButton) throw new Error("botão «Adicionar grupo» não encontrado");
    await user.click(addGroupButton);

    // After: a second "Adicionar grupo" appears (the new group's own), and
    // its boundary — the border D-34 calls information, not decoration —
    // sits inside the `<ol>` this file indents one level under its parent.
    await waitFor(async () =>
      expect(await screen.findAllByShadowRole("button", { name: t.addGroup })).toHaveLength(2),
    );
    const box = container.querySelector(".border-edge-control");
    expect(box).toBeInTheDocument();
    expect(box?.parentElement?.parentElement).toHaveClass("pl-4");
  });

  it("toggling a group's operator updates the payload's operator for that node, not a sibling's", async () => {
    const user = userEvent.setup();
    const initial: ConstraintGroupState = {
      id: "root",
      operator: "OR",
      constraints: [],
      groups: [
        { id: "g1", operator: "AND", constraints: [emptyConstraint("g1-c1")], groups: [] },
        { id: "g2", operator: "AND", constraints: [emptyConstraint("g2-c1")], groups: [] },
      ],
    };
    let latest: ConstraintGroupState | null = null;
    const { container } = render(
      <Harness initial={initial} onRoot={(r) => (latest = r)} />,
    );

    const boxes = container.querySelectorAll(".border-edge-control");
    expect(boxes).toHaveLength(2);
    const secondGroup = boxes[1];
    if (!(secondGroup instanceof HTMLElement)) throw new Error("segundo grupo não encontrado");

    // `find*`, not `get*`: @material/web's custom elements finish their
    // first Lit render a microtask after React's own.
    const orButton = await within(secondGroup).findByShadowRole("button", { name: t.operatorOr });
    await user.click(orButton);

    expect(latest).not.toBeNull();
    const result = latest as unknown as ConstraintGroupState;
    expect(result.groups[0]?.operator).toBe("AND");
    expect(result.groups[1]?.operator).toBe("OR");
  });

  it("a row minted outside the editor (e.g. page.tsx's loadStudy) never collides with a row the editor's own Add button mints, because both share one id source", async () => {
    const user = userEvent.setup();

    // Mirrors what `page.tsx`'s `loadStudy` builds when reopening a saved
    // study: a tree whose ids come straight from `nextEditorId` — the same
    // function `ConstraintEditor`'s own "Adicionar restrição" button uses
    // internally. Before the fix, `page.tsx` kept a second, independently
    // seeded `row-N` counter of its own, so this loaded tree's row ids and
    // whatever the editor minted next could (and did) collide.
    const loaded: ConstraintGroupState = {
      id: nextEditorId("group"),
      operator: "AND",
      constraints: [
        emptyConstraint(nextEditorId("row")),
        emptyConstraint(nextEditorId("row")),
        emptyConstraint(nextEditorId("row")),
      ],
      groups: [],
    };
    const loadedIds = loaded.constraints.map((r) => r.id);

    let latest: ConstraintGroupState | null = null;
    render(<Harness initial={loaded} onRoot={(r) => (latest = r)} />);

    const addConstraint = await screen.findByShadowRole("button", { name: t.addConstraint });
    await user.click(addConstraint);

    expect(latest).not.toBeNull();
    const result = latest as unknown as ConstraintGroupState;
    expect(result.constraints).toHaveLength(4);

    // The whole point of the fix: every id in the tree is still distinct —
    // the row the editor just added did not silently reuse one of the ids
    // the "loaded" study already had.
    const allIds = result.constraints.map((r) => r.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    const newRow = result.constraints.find((r) => !loadedIds.includes(r.id));
    expect(newRow).toBeDefined();
    expect(loadedIds).not.toContain(newRow?.id);
  });

  it("toConstraintPayload() matches the expected ConstraintGroupIn shape for a two-level-nested tree", () => {
    const tree: ConstraintGroupState = {
      id: "root",
      operator: "OR",
      constraints: [
        { ...emptyConstraint("r1"), operator: "lte", property_slug: "densidade", value: "3,5" },
      ],
      groups: [
        {
          id: "g1",
          operator: "AND",
          constraints: [
            { ...emptyConstraint("g1-1"), operator: "gte", property_slug: "densidade", value: "1" },
            { ...emptyConstraint("g1-2"), operator: "exists", property_slug: "densidade" },
          ],
          groups: [
            {
              id: "g1a",
              operator: "OR",
              constraints: [
                { ...emptyConstraint("g1a-1"), operator: "text_contains", text: "aço" },
              ],
              groups: [],
            },
          ],
        },
      ],
    };

    expect(toConstraintPayload(tree)).toEqual({
      operator: "OR",
      constraints: [{ operator: "lte", property_slug: "densidade", value: 3.5, unit: null }],
      groups: [
        {
          operator: "AND",
          constraints: [
            { operator: "gte", property_slug: "densidade", value: 1, unit: null },
            { operator: "exists", property_slug: "densidade" },
          ],
          groups: [
            {
              operator: "OR",
              constraints: [{ operator: "text_contains", text: "aço" }],
              groups: [],
            },
          ],
        },
      ],
    });
  });

  it("skips a constraint that is not filled in enough to send, at any depth, without dropping its siblings", () => {
    const tree: ConstraintGroupState = {
      id: "root",
      operator: "AND",
      constraints: [],
      groups: [
        {
          id: "g1",
          operator: "OR",
          // No property chosen — this one is not sendable and must be skipped.
          constraints: [{ ...emptyConstraint("g1-1"), operator: "gte", value: "1" }],
          groups: [],
        },
      ],
    };

    expect(toConstraintPayload(tree)).toEqual({
      operator: "AND",
      constraints: [],
      groups: [{ operator: "OR", constraints: [], groups: [] }],
    });
  });
});

describe("restrição sobre atributo de processo (P0-4)", () => {
  // The MWC selects are not driven here, the way no other suite in this app
  // drives them: `md-outlined-select` is a custom element whose shadow root
  // carries the label twice (`md-outlined-field` and `md-menu` both), so a
  // label query is ambiguous and `userEvent.selectOptions` does not apply to it
  // at all. What is asserted instead is what the row *offers* — the options it
  // renders, which are light-DOM children — and the two pure rules that decide
  // what reaches the backend.

  function rowWith(patch: Partial<ReturnType<typeof emptyConstraint>>): ConstraintGroupState {
    return {
      ...emptyGroup(nextEditorId("group")),
      constraints: [{ ...emptyConstraint(nextEditorId("row")), ...patch }],
    };
  }

  /**
   * The options a row renders, by the words a reader sees.
   *
   * Their `value` is set as a *property* on the upgraded `md-select-option`, not
   * as an attribute, so `getAttribute("value")` comes back empty for every one
   * of them — reading the text is both correct and closer to what is offered.
   */
  function optionTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("md-select-option")).map(
      (o) => o.textContent?.trim() ?? "",
    );
  }

  it("offers the two set-membership operators only in a process study", () => {
    const process = render(
      <Harness initial={rowWith({})} properties={[massRange, shape]} universe="process" />,
    );
    expect(optionTexts(process.container)).toContain(t.operators.has_any_label);
    expect(optionTexts(process.container)).toContain(t.operators.has_no_label);
    process.unmount();

    // No material property is discrete, so in a material study these two could
    // only ever be picked and then refused — an option that cannot work is the
    // same defect as a missing one.
    const material = render(<Harness initial={rowWith({})} />);
    expect(optionTexts(material.container)).not.toContain(t.operators.has_any_label);
  });

  it("offers the chosen operator's attributes, by name, in the row", () => {
    // The rendered picker and `selectableFor` have to agree: the rule below is
    // only worth testing if it is the rule the row actually uses.
    const { container } = render(
      <Harness initial={rowWith({})} properties={[massRange, shape]} universe="process" />,
    );
    expect(optionTexts(container)).toContain(massRange.name);
    expect(optionTexts(container)).not.toContain(shape.name);
  });

  it("offers only the attributes the chosen operator can compare", () => {
    expect(selectableFor("gte", [massRange, shape]).map((a) => a.slug)).toEqual(["faixa-massa"]);
    expect(selectableFor("has_any_label", [massRange, shape]).map((a) => a.slug)).toEqual([
      "forma",
    ]);
    // Presence is a question every shape of value can answer.
    expect(selectableFor("exists", [massRange, shape]).map((a) => a.slug)).toEqual([
      "faixa-massa",
      "forma",
    ]);
  });

  it("a material property is never filtered out as discrete", () => {
    // `PropertyDefinition` has no `kind` at all, so the guard must read its
    // absence as "not discrete" rather than as a missing answer.
    expect(selectableFor("gte", [density]).map((a) => a.slug)).toEqual(["densidade"]);
    expect(selectableFor("has_any_label", [density])).toEqual([]);
  });

  it("lists the chosen attribute's own vocabulary, and nothing else", () => {
    const { container } = render(
      <Harness
        initial={rowWith({ operator: "has_any_label", property_slug: "forma" })}
        properties={[massRange, shape]}
        universe="process"
      />,
    );
    const picker = container.querySelector("select[multiple]");
    expect(picker).toBeTruthy();
    expect(Array.from(picker!.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Maciço 3D",
      "Oco 3D",
    ]);
  });

  it("sends attribute and labels together, and nothing until both are there", () => {
    // Half a criterion is not a criterion: the attribute says which vocabulary,
    // the labels say which of it, and the backend refuses either alone.
    expect(
      toConstraintPayload(rowWith({ operator: "has_any_label", property_slug: "forma" }))
        .constraints,
    ).toEqual([]);
    expect(
      toConstraintPayload(rowWith({ operator: "has_any_label", labels: ["Oco 3D"] })).constraints,
    ).toEqual([]);
    expect(
      toConstraintPayload(
        rowWith({ operator: "has_any_label", property_slug: "forma", labels: ["Oco 3D"] }),
      ).constraints,
    ).toEqual([{ operator: "has_any_label", property_slug: "forma", labels: ["Oco 3D"] }]);
  });

  it("reopens a saved discrete constraint with its labels", () => {
    const reopened = fromConstraintPayload({
      operator: "AND",
      constraints: [
        { operator: "has_no_label", property_slug: "forma", labels: ["Maciço 3D"] },
      ],
      groups: [],
    });
    expect(reopened.constraints[0]?.labels).toEqual(["Maciço 3D"]);
    expect(toConstraintPayload(reopened).constraints).toEqual([
      { operator: "has_no_label", property_slug: "forma", labels: ["Maciço 3D"] },
    ]);
  });
});
