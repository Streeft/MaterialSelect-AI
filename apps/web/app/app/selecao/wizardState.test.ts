import { describe, expect, it } from "vitest";
import type { StudyDetail, StudyTemplate } from "@/lib/types";
import { makeComponent } from "@/lib/testing/planFixtures";
import {
  initialWizardState,
  snapshotOf,
  stateFromPlanComponent,
  stateFromStudy,
  stateFromTemplate,
  wizardReducer,
  type WizardState,
} from "./wizardState";

const params = (entries: Record<string, string> = {}) => new URLSearchParams(entries);

function start(entries: Record<string, string> = {}): WizardState {
  return initialWizardState(params(entries));
}

const beamTemplate: StudyTemplate = {
  slug: "viga-leve-rigida",
  name: "Viga leve e rígida",
  summary: "Viga em flexão com rigidez especificada: o mínimo de massa.",
  function_text: "Viga em flexão",
  objective_text: "Minimizar a massa",
  design_constraint: "Rigidez à flexão especificada; comprimento fixo",
  free_variables: ["área da seção"],
  universe: "material",
  stages: [
    {
      kind: "limit",
      enabled: true,
      root_group: {
        operator: "AND",
        constraints: [
          { operator: "exists", property_slug: "modulo_young" },
          { operator: "exists", property_slug: "densidade" },
        ],
        groups: [],
      },
    },
  ],
  index: { name: "Viga leve limitada por rigidez", expression: "sqrt(modulo_young) / densidade", goal: "maximize" },
  index_slug: "viga-leve-rigidez",
  criteria: [{ key: "__index__", weight: 1, direction: null }],
  reference: "Ashby",
  available: true,
  missing_properties: [],
};

describe("estado do assistente (D-210)", () => {
  it("starts empty, with the function the home's composer wrote", () => {
    const state = initialWizardState(params(), "Viga do quadro");
    expect(state.functionText).toBe("Viga do quadro");
    expect(state.stages).toHaveLength(1);
    expect(state.stages[0]?.kind).toBe("limit");
    expect(state.criteria).toEqual([]);
    expect(state.indexMode).toBe("none");
  });

  it("opens the first limit on the property named by ?restricao= (D-219) and ignores a malformed one", () => {
    const stage = start({ restricao: "modulo_young" }).stages[0];
    expect(stage?.kind).toBe("limit");
    if (stage?.kind === "limit") {
      expect(stage.group.constraints[0]).toMatchObject({ property_slug: "modulo_young", value: "" });
    }
    const bad = start({ restricao: "x;drop table" }).stages[0];
    if (bad?.kind === "limit") expect(bad.group.constraints[0]?.property_slug).toBe("");
  });

  it("opens with a chart stage on the map's deep link, and on processes with ?universo=", () => {
    const chart = start({ novo_estagio: "chart", x_prop: "densidade", y_expr: "modulo_young" });
    const stage = chart.stages[0];
    expect(stage?.kind).toBe("chart");
    if (stage?.kind === "chart") {
      expect(stage.x).toMatchObject({ mode: "property", propertySlug: "densidade" });
      expect(stage.y).toMatchObject({ mode: "expression", expression: "modulo_young" });
    }
    expect(start({ universo: "process" })).toMatchObject({ universe: "process", advFunction: true });
  });

  it("starts the pipeline and the objective over when the universe changes", () => {
    let state = wizardReducer(start(), { type: "indexMode", mode: "custom" });
    state = wizardReducer(state, { type: "customExpression", expression: "densidade" });
    state = wizardReducer(state, {
      type: "criteria",
      criteria: [{ id: "c1", key: "densidade", direction: "", weight: "1" }],
    });
    const next = wizardReducer(state, { type: "universe", universe: "process" });
    expect(next.criteria).toEqual([]);
    expect(next.indexMode).toBe("none");
    expect(next.customExpression).toBe("");
    // The same universe is no change at all.
    expect(wizardReducer(state, { type: "universe", universe: "material" })).toBe(state);
  });

  it("clears the validation message whenever the index changes", () => {
    let state = wizardReducer(start(), { type: "validation", message: "Expressão válida." });
    state = wizardReducer(state, { type: "customExpression", expression: "x" });
    expect(state.validation).toBeNull();
  });

  it("accepts functional updates, so a stable callback can edit the rows", () => {
    let state = wizardReducer(start(), {
      type: "criteria",
      criteria: [{ id: "c1", key: "densidade", direction: "", weight: "" }],
    });
    state = wizardReducer(state, {
      type: "criteria",
      criteria: (rows) => rows.map((r) => ({ ...r, weight: "0,5" })),
    });
    expect(state.criteria[0]?.weight).toBe("0,5");
  });

  it("applies a plan part (D-225): function, objective, index and applied limits, appended to the first limit stage", () => {
    const component = makeComponent();
    const state = wizardReducer(start(), { type: "plan", component });
    expect(state.functionText).toBe("Camada externa de roupa de esqui");
    expect(state.objectiveText).toBe("Mínima massa com resistência ao frio");
    expect(state.indexMode).toBe("viga-leve-rigidez");
    expect(state.indexGoal).toBe("maximize");
    expect(state.criteria.map((c) => c.key)).toEqual(["__index__"]);
    const stage = state.stages[0];
    // The blank row the new study opened with is dropped, the plan's limits stay.
    expect(stage?.kind === "limit" && stage.group.constraints.map((c) => c.property_slug)).toEqual([
      "temperatura_servico_min",
      "temperatura_servico_max",
    ]);
  });

  it("never applies an AI suggestion the person did not confirm, and does not repeat a limit", () => {
    const component = makeComponent();
    const once = wizardReducer(start(), { type: "plan", component });
    const twice = wizardReducer(once, { type: "plan", component });
    const stage = twice.stages[0];
    const slugs = stage?.kind === "limit" ? stage.group.constraints.map((c) => c.property_slug) : [];
    expect(slugs).not.toContain("densidade");
    expect(slugs).toHaveLength(2);
  });

  it("keeps what the reader already wrote when the part brings no text of its own", () => {
    const written = wizardReducer(start(), { type: "text", field: "functionText", value: "Minha função" });
    const state = wizardReducer(written, {
      type: "plan",
      component: makeComponent({ function_text: "", objective_text: "" }),
    });
    expect(state.functionText).toBe("Minha função");
  });

  it("opens a plan part as a whole study for the draft the home writes", () => {
    const state = stateFromPlanComponent(start(), makeComponent());
    expect(state.name).toBe("Camada externa");
    expect(state.indexMode).toBe("viga-leve-rigidez");
    expect(state.customExpression).toBe("");
    expect(state.indexConfirmed).toBe(true);
    const stage = state.stages[0];
    expect(stage?.kind === "limit" && stage.group.constraints).toHaveLength(2);
  });

  it("restores a snapshot and reopens the advanced options that hide what is in use", () => {
    const base = start();
    const snapshot = { ...snapshotOf(base), universe: "process" as const, name: "Antes" };
    const state = wizardReducer(wizardReducer(base, { type: "text", field: "name", value: "Depois" }), {
      type: "restore",
      snapshot,
    });
    expect(state.name).toBe("Antes");
    expect(state.advFunction).toBe(true);
  });

  it("keeps the draft's fields exactly — the snapshot is the draft format (D-139)", () => {
    expect(Object.keys(snapshotOf(start()))).toEqual([
      "name",
      "functionText",
      "objectiveText",
      "freeVariables",
      "universe",
      "stages",
      "indexMode",
      "customExpression",
      "indexGoal",
      "indexConfirmed",
      "criteria",
      "method",
      "normalization",
      "useAhp",
    ]);
  });
});

describe("modelos prontos no estado (D-210)", () => {
  it("uses the catalogue index when the catalogue has the slug", () => {
    const state = stateFromTemplate(start(), beamTemplate, ["viga-leve-rigidez"]);
    expect(state.indexMode).toBe("viga-leve-rigidez");
    expect(state.customExpression).toBe("");
    expect(state.indexConfirmed).toBe(true);
    expect(state.name).toBe("Viga leve e rígida");
    expect(state.objectiveText).toBe("Minimizar a massa (Rigidez à flexão especificada; comprimento fixo)");
    expect(state.freeVariables).toBe("área da seção");
    expect(state.criteria.map((c) => [c.key, c.weight])).toEqual([["__index__", "1"]]);
  });

  it("falls back to the same expression as a custom index when the catalogue lacks it", () => {
    const state = stateFromTemplate(start(), beamTemplate, []);
    expect(state.indexMode).toBe("custom");
    expect(state.customExpression).toBe("sqrt(modulo_young) / densidade");
  });

  it("brings limits without any number: the data the index reads must exist", () => {
    const state = stateFromTemplate(start(), beamTemplate, []);
    const stage = state.stages[0];
    expect(stage?.kind).toBe("limit");
    if (stage?.kind === "limit") {
      expect(stage.group.constraints.map((c) => [c.operator, c.property_slug, c.value])).toEqual([
        ["exists", "modulo_young", ""],
        ["exists", "densidade", ""],
      ]);
    }
  });
});

describe("estudo salvo no estado", () => {
  it("reopens a saved study's index as a custom expression, confirmed", () => {
    const study = {
      id: 3,
      name: "Estudo",
      description: null,
      function_text: "Viga",
      objective_text: null,
      free_variables: ["a", "b"],
      universe: "material",
      combinator: "AND",
      constraints: [],
      root_group: null,
      stages: [],
      index: { name: "I", expression: "densidade", goal: "minimize" },
      normalization: "vector",
      method: "topsis",
      criteria: [{ key: "densidade", weight: 1, direction: "min" }],
      notes: "nota",
      created_at: "2026-11-12T00:00:00Z",
    } as unknown as StudyDetail;
    const state = stateFromStudy(start(), study);
    expect(state).toMatchObject({
      name: "Estudo",
      freeVariables: "a, b",
      studyNotes: "nota",
      indexMode: "custom",
      customExpression: "densidade",
      indexGoal: "minimize",
      method: "topsis",
      advObjective: true,
    });
    expect(state.criteria[0]).toMatchObject({ key: "densidade", direction: "min", weight: "1" });
    expect(state.stages).toHaveLength(1);
  });
});
