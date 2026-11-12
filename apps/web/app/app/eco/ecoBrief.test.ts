import { describe, expect, it } from "vitest";
import { defaultsFixture } from "@/lib/defaults.fixture";
import { encodeUrlJson, readUrlState, writeUrlState } from "@/lib/urlState";
import {
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
