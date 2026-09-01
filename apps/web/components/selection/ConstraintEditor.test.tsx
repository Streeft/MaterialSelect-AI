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
  toConstraintPayload,
  type ConstraintGroupState,
} from "./ConstraintEditor";
import { ptBR } from "@/lib/i18n";
import type { PropertyDefinition } from "@/lib/types";

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
}: {
  initial: ConstraintGroupState;
  onRoot?: (root: ConstraintGroupState) => void;
}) {
  const [root, setRoot] = useState(initial);
  return (
    <ConstraintEditor
      root={root}
      properties={[density]}
      classes={[]}
      onChange={(next) => {
        setRoot(next);
        onRoot?.(next);
      }}
    />
  );
}

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
