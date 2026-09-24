import { describe, expect, it } from "vitest";
import { emptyGroup, nextEditorId } from "@/components/selection/ConstraintEditor";
import { emptyLimitStage, emptyTreeStage } from "@/components/selection/StageList";
import {
  constraintsUseAdvanced,
  functionUsesAdvanced,
  initialLimitStage,
  objectiveUsesAdvanced,
} from "./advanced";

describe("opções avançadas em uso (D-85)", () => {
  it("a single plain limit stage needs nothing advanced", () => {
    expect(constraintsUseAdvanced([initialLimitStage()])).toBe(false);
    expect(constraintsUseAdvanced([emptyLimitStage()])).toBe(false);
  });

  it("anything a collapsed section would hide opens it", () => {
    expect(constraintsUseAdvanced([emptyLimitStage(), emptyLimitStage()])).toBe(true);
    expect(constraintsUseAdvanced([emptyTreeStage()])).toBe(true);
    expect(constraintsUseAdvanced([{ ...emptyLimitStage(), label: "Rigidez" }])).toBe(true);
    expect(constraintsUseAdvanced([{ ...emptyLimitStage(), enabled: false }])).toBe(true);

    const stage = emptyLimitStage();
    if (stage.kind !== "limit") throw new Error("expected a limit stage");
    expect(
      constraintsUseAdvanced([{ ...stage, group: { ...stage.group, operator: "OR" } }]),
    ).toBe(true);
    expect(
      constraintsUseAdvanced([
        { ...stage, group: { ...stage.group, groups: [emptyGroup(nextEditorId("group"))] } },
      ]),
    ).toBe(true);
  });

  it("the objective opens for a non-default method, normalization or AHP", () => {
    const base = { method: "weighted_sum", normalization: "minmax", useAhp: false } as const;
    expect(objectiveUsesAdvanced(base)).toBe(false);
    expect(objectiveUsesAdvanced({ ...base, method: "topsis" })).toBe(true);
    expect(objectiveUsesAdvanced({ ...base, normalization: "vector" })).toBe(true);
    expect(objectiveUsesAdvanced({ ...base, useAhp: true })).toBe(true);
  });

  it("the process universe is advanced; materials are the default", () => {
    expect(functionUsesAdvanced("process")).toBe(true);
    expect(functionUsesAdvanced("material")).toBe(false);
  });

  it("a study starts with one row ready to fill", () => {
    const stage = initialLimitStage();
    expect(stage.kind === "limit" && stage.group.constraints).toHaveLength(1);
  });
});
