import { describe, expect, it } from "vitest";
import { makeComponent, makeConstraint, makePlan } from "@/lib/testing/planFixtures";
import {
  compareHref,
  confirmationRequest,
  isInterpretable,
  originKind,
  pendingSuggestions,
  runRequestFor,
  scenarioId,
  studyDetailFromPlan,
  withRerun,
} from "./plan";

describe("origem de cada número (D-224)", () => {
  it("separates the three origins and the index", () => {
    expect(originKind("usuario")).toBe("usuario");
    expect(originKind("cenario:frio-extremo")).toBe("cenario");
    expect(originKind("sugestao_ia")).toBe("sugestao_ia");
    expect(originKind("indice")).toBe("indice");
    expect(scenarioId("cenario:frio-extremo")).toBe("frio-extremo");
    expect(scenarioId("usuario")).toBeNull();
  });

  it("lists the suggestions still waiting for the person", () => {
    expect(pendingSuggestions(makeComponent()).map((c) => c.origin)).toEqual(["sugestao_ia"]);
    const confirmed = makeComponent({
      constraints: [makeConstraint({ origin: "sugestao_ia", applied: true })],
    });
    expect(pendingSuggestions(confirmed)).toEqual([]);
  });
});

describe("rodar de novo com as escolhas", () => {
  it("sends an AI suggestion as not confirmed until the person ticks it", () => {
    const request = runRequestFor(makeComponent());
    expect(request.constraints?.map((c) => [c.origin, c.confirmed])).toEqual([
      ["usuario", undefined],
      ["cenario:calor-moderado", undefined],
      ["sugestao_ia", false],
    ]);
    expect(request.index_slug).toBe("viga-leve-rigidez");
  });

  it("confirms exactly the suggestion that was toggled and keeps the others as they were", () => {
    const component = makeComponent({
      constraints: [
        makeConstraint({ origin: "sugestao_ia", applied: true, property: "a" }),
        makeConstraint({ origin: "sugestao_ia", applied: false, property: "b" }),
        makeConstraint({ origin: "sugestao_ia", applied: false, property: "c" }),
      ],
    });
    const request = runRequestFor(component, { index: 1, confirmed: true });
    expect(request.constraints?.map((c) => c.confirmed)).toEqual([true, true, false]);
    // Taking one back leaves the confirmed one that was not touched.
    const back = runRequestFor(component, { index: 0, confirmed: false });
    expect(back.constraints?.map((c) => c.confirmed)).toEqual([false, false, false]);
  });

  it("asks for the whole plan, toggling only the named part", () => {
    const plan = makePlan();
    const request = confirmationRequest(plan, "c2", 2, true);
    expect(request.components).toHaveLength(3);
    expect(request.components.map((c) => c.constraints?.[2]?.confirmed)).toEqual([false, true, false]);
  });

  it("keeps the reading of the text and takes the run from the server", () => {
    const plan = makePlan();
    const rerun = makeComponent({ key: "c2", name: "Camada isolante", constraints: [] });
    const next = withRerun(plan, [rerun]);
    expect(next.summary).toBe(plan.summary);
    expect(next.components.map((c) => c.key)).toEqual(["c1", "c2", "c3"]);
    expect(next.components[1]?.constraints).toEqual([]);
    expect(next.components[0]).toBe(plan.components[0]);
  });
});

describe("comparar e abrir", () => {
  it("compares the materials in rank order, and only when there are at least two", () => {
    expect(compareHref(makeComponent())).toBe("/app/comparar?materiais=11-13");
    const one = makeComponent();
    one.result = { ...one.result!, materials: one.result!.materials.slice(0, 1) };
    expect(compareHref(one)).toBeNull();
    expect(compareHref(makeComponent({ result: null }))).toBeNull();
  });

  it("turns the plan's study into what the wizard opens, with the applied limits only", () => {
    const detail = studyDetailFromPlan(makeComponent().study);
    expect(detail.name).toBe("Camada externa");
    expect(detail.stages).toHaveLength(1);
    expect(detail.stages[0]?.root_group?.constraints).toHaveLength(2);
    expect(detail.index?.goal).toBe("maximize");
  });

  it("interprets only a text that is long enough", () => {
    expect(isInterpretable("viga leve")).toBe(false);
    expect(isInterpretable("   viga leve e rígida   ")).toBe(true);
  });
});
