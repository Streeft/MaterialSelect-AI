import { describe, expect, it } from "vitest";
import { usedPropertySlugs, emptyLimitStage, type StageState } from "@/components/selection/StageList";
import { optionsAtLevel } from "./depth";
import { depthSelectorsText } from "./i18n-depth-selectors";

describe("usedPropertySlugs (D-162)", () => {
  it("junta as propriedades de limites aninhados e dos eixos de gráfico", () => {
    const limit = emptyLimitStage() as Extract<StageState, { kind: "limit" }>;
    limit.group.constraints.push({
      id: "c1",
      operator: "lte",
      property_slug: "densidade",
      value: "1",
      value_min: "",
      value_max: "",
      unit: "",
      class_slugs: [],
      text: "",
      labels: [],
    });
    limit.group.groups.push({
      id: "g2",
      operator: "OR",
      groups: [],
      constraints: [{ ...limit.group.constraints[0]!, id: "c2", property_slug: "coef_poisson" }],
    });
    const chart: StageState = {
      id: "s2",
      kind: "chart",
      label: "",
      enabled: true,
      x: { mode: "property", propertySlug: "modulo_young", expression: "", min: "", max: "" },
      y: { mode: "expression", propertySlug: "ignorada", expression: "a/b", min: "", max: "" },
      indexExpression: "",
      indexGoal: "maximize",
      indexLevel: "",
    };
    expect(usedPropertySlugs([limit, chart]).sort()).toEqual([
      "coef_poisson",
      "densidade",
      "modulo_young",
    ]);
  });

  it("o que já está escolhido continua oferecido no Nível 1", () => {
    const options = [
      { slug: "densidade", min_level: 1 },
      { slug: "coef_poisson", min_level: 2 },
      { slug: "outra", min_level: 3 },
    ];
    expect(optionsAtLevel(options, 1, ["coef_poisson"]).map((o) => o.slug)).toEqual([
      "densidade",
      "coef_poisson",
    ]);
  });
});

describe("depthSelectorsText (D-162)", () => {
  it("diz quantas grandezas o nível oferece e onde", () => {
    expect(depthSelectorsText.count(1, 12, 40, depthSelectorsText.whereCompare)).toBe(
      "O Nível 1 oferece 12 de 40 grandezas como coluna da comparação.",
    );
  });
});
