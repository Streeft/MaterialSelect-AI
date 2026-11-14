import { describe, expect, it } from "vitest";
import { defaultsFixture } from "@/lib/defaults.fixture";
import { encodeUrlJson, readUrlState, writeUrlState } from "@/lib/urlState";
import {
  aiParamPatch,
  blankComponent,
  buildAuditBrief,
  buildUse,
  compareBlocked,
  defaultPremises,
  ecoUrlSpec,
  effectiveComponents,
  effectiveLegs,
  individualBlocked,
  type ComponentDraft,
} from "./ecoBrief";

const eco = defaultsFixture.eco;
const spec = ecoUrlSpec(eco);

describe("ecoBrief: o estado na URL", () => {
  it("preenche cada lacuna com o padrão do servidor, sem número copiado aqui", () => {
    const brief = readUrlState(spec, "");
    expect(brief.view).toBe("individual");
    expect(brief.distance).toBe(String(eco.transport_distance_km));
    expect(brief.travel).toBe(String(eco.mobile.distance_km));
    expect(brief.useModel).toBe(eco.use_model);
    // Another server default changes the screen with no edit here.
    const other = ecoUrlSpec({ ...eco, transport_distance_km: 42 });
    expect(readUrlState(other, "").distance).toBe("42");
  });

  it("uma lista malformada ou de forma errada volta ao padrão, nunca é consertada", () => {
    const bad = encodeUrlJson([{ name: "x", material: 3 }]);
    expect(readUrlState(spec, `?componentes=${bad}`).components).toEqual([]);
    expect(readUrlState(spec, "?componentes=@@@").components).toEqual([]);
    expect(readUrlState(spec, `?a=${encodeUrlJson({ material: "1" })}`).a.mass).toBe("1");
    expect(readUrlState(spec, "?modo=outro").view).toBe("individual");
  });

  it("um valor igual ao padrão sai do endereço", () => {
    expect(writeUrlState(spec, "?material=7", { life: String(eco.mobile.life_years) })).toBe(
      "?material=7",
    );
    expect(writeUrlState(spec, "", { life: "25" })).toBe("?vida=25");
  });

  it("a lista de componentes ida e volta pela URL", () => {
    const component: ComponentDraft = { ...blankComponent(eco), material: "7", mass: "2.5" };
    const search = writeUrlState(spec, "", { components: [component, component] });
    expect(readUrlState(spec, search).components).toEqual([component, component]);
  });
});

describe("ecoBrief: o que a tela manda", () => {
  it("o link do dimensionamento (?material=&massa=) semeia a primeira linha", () => {
    const brief = readUrlState(spec, "?material=7&massa=2");
    const [first, ...rest] = effectiveComponents(brief, eco);
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ material: "7", mass: "2", quantity: "1" });
    expect(effectiveLegs(brief, eco)).toEqual([
      { mode: "", distance: String(eco.transport_distance_km) },
    ]);
  });

  it("manda só os campos do modelo de uso escolhido", () => {
    const premises = defaultPremises(eco);
    expect(buildUse({ ...premises, useModel: "movel" })).not.toHaveProperty("power_watts");
    expect(buildUse({ ...premises, useModel: "estatico" })).not.toHaveProperty("distance_km");
  });

  it("nunca manda as duas formas do briefing", () => {
    const body = buildAuditBrief(
      [{ ...blankComponent(eco), material: "7", process: "1", mass: "2" }],
      [{ mode: "aereo", distance: "10" }],
      defaultPremises(eco),
    );
    expect(body).not.toHaveProperty("material_id");
    expect(body.components).toHaveLength(1);
  });

  it("diz o que falta, na ordem em que o leitor preenche", () => {
    const premises = defaultPremises(eco);
    const filled = { ...blankComponent(eco), material: "7", process: "1", mass: "2" };
    const leg = { mode: "aereo", distance: "10" };
    expect(individualBlocked([filled], [leg], premises)).toBeNull();
    expect(individualBlocked([{ ...filled, mass: "" }], [leg], premises)?.reason).toMatch(/massa/i);
    expect(individualBlocked([filled], [leg], { ...premises, life: "0" })?.inPremises).toBe(true);
    const scenario = { material: "7", process: "1", mass: "1", recycled: "0", endOfLife: "reciclagem" as const };
    const transport = { mode: "aereo", distance: "10" };
    expect(compareBlocked(scenario, scenario, transport, premises)).toBeNull();
    expect(compareBlocked(scenario, { ...scenario, process: "" }, transport, premises)?.reason).toMatch(
      /^Material B/,
    );
  });
});

describe("ecoBrief: o que uma sugestão da IA pode mudar (D-230b)", () => {
  const brief = readUrlState(spec, "?material=7&massa=2");

  it("escreve o parâmetro em todos os componentes e trechos, sem deixar linha para trás", () => {
    const two = {
      ...brief,
      components: [
        { ...blankComponent(eco), material: "7", mass: "2" },
        { ...blankComponent(eco), material: "8", mass: "3", recycled: "0.4" },
      ],
    };
    const recycled = aiParamPatch(two, eco, "recycled_fraction", 0.25);
    expect(recycled?.components?.map((c) => c.recycled)).toEqual(["0.25", "0.25"]);
    // What the patch did not name stays as typed.
    expect(recycled?.components?.map((c) => c.mass)).toEqual(["2", "3"]);
    expect(aiParamPatch(two, eco, "end_of_life", "aterro")?.components?.map((c) => c.endOfLife)).toEqual([
      "aterro",
      "aterro",
    ]);
    expect(aiParamPatch(brief, eco, "transport_distance_km", 800)?.legs).toEqual([
      { mode: "", distance: "800" },
    ]);
  });

  it("recusa um campo que a tela não tem e um valor que o campo não aceita", () => {
    expect(aiParamPatch(brief, eco, "constructor", 1)).toBeNull();
    expect(aiParamPatch(brief, eco, "material_a.part_mass", 3)).toBeNull();
    expect(aiParamPatch(brief, eco, "recycled_fraction", 1.5)).toBeNull();
    expect(aiParamPatch(brief, eco, "recycled_fraction", "0.3")).toBeNull();
    expect(aiParamPatch(brief, eco, "end_of_life", "magia")).toBeNull();
    expect(aiParamPatch(brief, eco, "end_of_life", 1)).toBeNull();
    expect(aiParamPatch(brief, eco, "transport_distance_km", -1)).toBeNull();
    expect(aiParamPatch(brief, eco, "transport_distance_km", Number.NaN)).toBeNull();
  });
});

describe("ecoBrief: a massa da peça e a comparação A × B (D-234)", () => {
  const single = readUrlState(spec, "?material=7&massa=2");
  const compare = readUrlState(spec, "?modo=compare");

  it("a massa da peça é a massa unitária de um produto de UM componente", () => {
    expect(aiParamPatch(single, eco, "part_mass", 3)?.components?.map((c) => c.mass)).toEqual(["3"]);
    const two = {
      ...single,
      components: [
        { ...blankComponent(eco), material: "7", mass: "2" },
        { ...blankComponent(eco), material: "8", mass: "3" },
      ],
    };
    // Two parts have no single mass: nothing is written, no line is left behind.
    expect(aiParamPatch(two, eco, "part_mass", 3)).toBeNull();
  });

  it("recusa uma massa que a calculadora não aceita", () => {
    for (const bad of [0, -1, 1_000_001, Number.NaN, Number.POSITIVE_INFINITY, "3"]) {
      expect(aiParamPatch(single, eco, "part_mass", bad)).toBeNull();
      expect(aiParamPatch(compare, eco, "material_b.part_mass", bad)).toBeNull();
    }
  });

  it("na comparação, cada lado escreve só o seu cenário", () => {
    expect(aiParamPatch(compare, eco, "material_b.part_mass", 2.5)).toEqual({
      b: { ...compare.b, mass: "2.5" },
    });
    expect(aiParamPatch(compare, eco, "material_a.recycled_fraction", 0.4)).toEqual({
      a: { ...compare.a, recycled: "0.4" },
    });
    expect(aiParamPatch(compare, eco, "material_b.end_of_life", "aterro")).toEqual({
      b: { ...compare.b, endOfLife: "aterro" },
    });
    expect(aiParamPatch(compare, eco, "transport_distance_km", 800)).toEqual({ distance: "800" });
  });

  it("os nomes do produto não valem na comparação, nem os da comparação no produto", () => {
    expect(aiParamPatch(compare, eco, "part_mass", 3)).toBeNull();
    expect(aiParamPatch(compare, eco, "recycled_fraction", 0.3)).toBeNull();
    expect(aiParamPatch(single, eco, "material_a.part_mass", 3)).toBeNull();
    expect(aiParamPatch(compare, eco, "material_c.part_mass", 3)).toBeNull();
    expect(aiParamPatch(compare, eco, "material_a.recycled_fraction", 1.5)).toBeNull();
    expect(aiParamPatch(compare, eco, "material_a.end_of_life", "magia")).toBeNull();
  });
});
