import type {
  DefaultsResult,
  EcoAuditRequest,
  EcoComparisonRequest,
  EcoUseIn,
  EndOfLifeRoute,
  UseModel,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  enumCodec,
  jsonCodec,
  textCodec,
  type UrlParam,
  type UrlSpec,
} from "@/lib/urlState";

const t = ptBR.eco;

/**
 * Everything the Eco screen asks the reader, in one shape and in the URL
 * (D-216): the product (components and legs), the two scenarios of a
 * comparison, and the premises. A link carries the whole question, so a
 * colleague opens the same audit — or the same A × B — and a reload does not
 * throw away what was typed.
 *
 * The starting numbers are not written here: they come from the server
 * (`GET /api/padroes`) when the spec is built, so this file keeps no copy.
 */

/** One line of the bill of materials, as typed (strings: the inputs own them). */
export interface ComponentDraft {
  name: string;
  /** `""` means the first material the catalogue lists (derived, never written). */
  material: string;
  /** `""` means the first process that makes the material. */
  process: string;
  mass: string;
  quantity: string;
  recycled: string;
  endOfLife: EndOfLifeRoute;
}

export interface LegDraft {
  /** `""` means the first transport mode of the catalogue. */
  mode: string;
  distance: string;
}

/**
 * One alternative of a comparison. The same shape as a component minus the
 * name and quantity: a scenario is one part, made of one material.
 */
export interface ScenarioDraft {
  material: string;
  process: string;
  mass: string;
  recycled: string;
  endOfLife: EndOfLifeRoute;
}

export type EcoView = "individual" | "compare";

export interface EcoBrief {
  view: EcoView;
  /** Empty means "one blank component, seeded from `material` and `massa`". */
  components: ComponentDraft[];
  /** Empty means "one leg with the default distance". */
  legs: LegDraft[];
  a: ScenarioDraft;
  b: ScenarioDraft;
  /** Transport of a comparison: one mode and one distance for both scenarios. */
  mode: string;
  distance: string;
  useModel: UseModel;
  life: string;
  power: string;
  duty: string;
  travel: string;
  intensity: string;
  carbonPerEnergy: string;
  /** The solver's deep link (`?material=&massa=`) seeds the first component. */
  seedMaterial: string;
  seedMass: string;
}

/** The premises alone, as the panel edits them. */
export type Premises = Pick<
  EcoBrief,
  "useModel" | "life" | "power" | "duty" | "travel" | "intensity" | "carbonPerEnergy"
>;

export const END_OF_LIFE_ROUTES: readonly EndOfLifeRoute[] = [
  "aterro",
  "incineracao",
  "subciclagem",
  "reciclagem",
  "remanufatura",
  "reuso",
  "nenhum",
];

const USE_MODELS: readonly UseModel[] = ["estatico", "movel"];

// --- Shape checks for what comes back from the URL --------------------------
// A value read from an address is untrusted input: kept only with the right
// shape, never repaired (the same rule as every `useUrlState` field).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === "string" && value.length <= 200;
const isRoute = (value: unknown): value is EndOfLifeRoute =>
  typeof value === "string" && (END_OF_LIFE_ROUTES as readonly string[]).includes(value);

function isComponentDraft(value: unknown): value is ComponentDraft {
  return (
    isRecord(value) &&
    isText(value.name) &&
    isText(value.material) &&
    isText(value.process) &&
    isText(value.mass) &&
    isText(value.quantity) &&
    isText(value.recycled) &&
    isRoute(value.endOfLife)
  );
}

function isLegDraft(value: unknown): value is LegDraft {
  return isRecord(value) && isText(value.mode) && isText(value.distance);
}

function isScenarioDraft(value: unknown): value is ScenarioDraft {
  return (
    isRecord(value) &&
    isText(value.material) &&
    isText(value.process) &&
    isText(value.mass) &&
    isText(value.recycled) &&
    isRoute(value.endOfLife)
  );
}

const MAX_COMPONENTS = 50;
const MAX_LEGS = 20;

const isComponentList = (value: unknown): value is ComponentDraft[] =>
  Array.isArray(value) && value.length <= MAX_COMPONENTS && value.every(isComponentDraft);
const isLegList = (value: unknown): value is LegDraft[] =>
  Array.isArray(value) && value.length <= MAX_LEGS && value.every(isLegDraft);

// --- The spec -----------------------------------------------------------------

/** A blank scenario: nothing chosen yet, the premises at the server's defaults. */
export function blankScenario(defaults: DefaultsResult["eco"]): ScenarioDraft {
  return {
    material: "",
    process: "",
    mass: "1",
    recycled: String(defaults.recycled_fraction),
    endOfLife: defaults.end_of_life,
  };
}

export function blankComponent(defaults: DefaultsResult["eco"]): ComponentDraft {
  return {
    name: "",
    material: "",
    process: "",
    mass: "",
    quantity: "1",
    recycled: String(defaults.recycled_fraction),
    endOfLife: defaults.end_of_life,
  };
}

export function blankLeg(distance: string): LegDraft {
  return { mode: "", distance };
}

/** What the premises are at the server's defaults, as the inputs hold them. */
export function defaultPremises(defaults: DefaultsResult["eco"]): Premises {
  // One `life` and one `carbonPerEnergy` input serve both models, so the
  // default read is the one of the model the screen opens on.
  const own = defaults.use_model === "estatico" ? defaults.static : defaults.mobile;
  return {
    useModel: defaults.use_model,
    life: String(own.life_years),
    power: String(defaults.static.power_watts),
    duty: String(defaults.static.duty_cycle),
    travel: String(defaults.mobile.distance_km),
    intensity: String(defaults.mobile.mobile_intensity),
    carbonPerEnergy: String(own.carbon_per_energy),
  };
}

function text(param: string, defaultValue: string): UrlParam<string> {
  return { param, codec: textCodec, defaultValue };
}

/** The Eco screen's URL, with the server's defaults filling every gap. */
export function ecoUrlSpec(defaults: DefaultsResult["eco"]): UrlSpec<EcoBrief> {
  const premises = defaultPremises(defaults);
  return {
    view: {
      param: "modo",
      codec: enumCodec<EcoView>(["individual", "compare"]),
      defaultValue: "individual",
    },
    components: { param: "componentes", codec: jsonCodec(isComponentList), defaultValue: [] },
    legs: { param: "trechos", codec: jsonCodec(isLegList), defaultValue: [] },
    a: { param: "a", codec: jsonCodec(isScenarioDraft), defaultValue: blankScenario(defaults) },
    b: { param: "b", codec: jsonCodec(isScenarioDraft), defaultValue: blankScenario(defaults) },
    mode: text("modal", ""),
    distance: text("distancia", String(defaults.transport_distance_km)),
    useModel: {
      param: "uso",
      codec: enumCodec<UseModel>(USE_MODELS),
      defaultValue: premises.useModel,
    },
    life: text("vida", premises.life),
    power: text("potencia", premises.power),
    duty: text("ciclo", premises.duty),
    travel: text("percurso", premises.travel),
    intensity: text("intensidade", premises.intensity),
    carbonPerEnergy: text("carbono", premises.carbonPerEnergy),
    seedMaterial: text("material", ""),
    seedMass: text("massa", ""),
  };
}

// --- Resolved lists (defaults applied, what is sent is what is shown) ---------

export function effectiveComponents(
  brief: EcoBrief,
  defaults: DefaultsResult["eco"],
): ComponentDraft[] {
  if (brief.components.length > 0) return brief.components;
  return [{ ...blankComponent(defaults), material: brief.seedMaterial, mass: brief.seedMass }];
}

export function effectiveLegs(brief: EcoBrief, defaults: DefaultsResult["eco"]): LegDraft[] {
  if (brief.legs.length > 0) return brief.legs;
  return [blankLeg(String(defaults.transport_distance_km))];
}

// --- The briefs ---------------------------------------------------------------

export function buildUse(premises: Premises): EcoUseIn {
  return premises.useModel === "estatico"
    ? {
        model: "estatico",
        power_watts: Number(premises.power),
        duty_cycle: Number(premises.duty),
        life_years: Number(premises.life),
        carbon_per_energy: Number(premises.carbonPerEnergy),
      }
    : {
        model: "movel",
        distance_km: Number(premises.travel),
        mobile_intensity: Number(premises.intensity),
        life_years: Number(premises.life),
        carbon_per_energy: Number(premises.carbonPerEnergy),
      };
}

export function buildAuditBrief(
  components: ComponentDraft[],
  legs: LegDraft[],
  premises: Premises,
): EcoAuditRequest {
  return {
    components: components.map((c) => ({
      name: c.name.trim() === "" ? null : c.name.trim(),
      material_id: Number(c.material),
      process_id: Number(c.process),
      unit_mass: Number(c.mass),
      quantity: Number(c.quantity),
      recycled_fraction: Number(c.recycled),
      end_of_life: c.endOfLife,
    })),
    transport_legs: legs.map((leg) => ({ mode: leg.mode, distance_km: Number(leg.distance) })),
    use: buildUse(premises),
  };
}

export function buildComparisonBrief(
  a: ScenarioDraft,
  b: ScenarioDraft,
  transport: { mode: string; distance: string },
  premises: Premises,
): EcoComparisonRequest {
  const side = (s: ScenarioDraft) => ({
    material_id: Number(s.material),
    process_id: Number(s.process),
    part_mass: Number(s.mass),
    recycled_fraction: Number(s.recycled),
    end_of_life: s.endOfLife,
  });
  return {
    material_a: side(a),
    material_b: side(b),
    transport_mode: transport.mode,
    transport_distance_km: Number(transport.distance),
    use: buildUse(premises),
  };
}

// --- What an AI suggestion may change (D-230) -----------------------------------

/**
 * The patch of the brief that a `set_param` of the server's audit request
 * stands for, or `null` when this screen has no such field or the value is not
 * one the field takes. The audit's names are the request's: a product is a list,
 * so a parameter that every component (or every leg) has is written on all of
 * them — a suggestion to go back to the default fraction does not leave one line
 * behind. Never invents a value: the number or route is the server's.
 */
export function aiParamPatch(
  brief: EcoBrief,
  defaults: DefaultsResult["eco"],
  name: string,
  value: number | string,
): Partial<EcoBrief> | null {
  const number = typeof value === "number" && Number.isFinite(value) ? value : null;
  switch (name) {
    case "recycled_fraction":
      if (number === null || number < 0 || number > 1) return null;
      return {
        components: effectiveComponents(brief, defaults).map((c) => ({ ...c, recycled: String(number) })),
      };
    case "end_of_life":
      if (!isRoute(value)) return null;
      return {
        components: effectiveComponents(brief, defaults).map((c) => ({ ...c, endOfLife: value })),
      };
    case "transport_distance_km":
      if (number === null || number < 0) return null;
      return {
        legs: effectiveLegs(brief, defaults).map((leg) => ({ ...leg, distance: String(number) })),
      };
    default:
      return null;
  }
}

// --- Why the run button is disabled (D-86) ------------------------------------

export interface Blocked {
  reason: string;
  /** The reason lives in the premises panel, so the screen points there. */
  inPremises: boolean;
}

const positive = (raw: string) => {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) && value > 0;
};
const nonNegative = (raw: string) => {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) && value >= 0;
};
const fraction = (raw: string) => {
  const value = Number(raw);
  return raw.trim() !== "" && value >= 0 && value <= 1;
};

/** The first unmet requirement of the premises, in words; input validation only. */
export function premisesBlocked(p: Premises): Blocked | null {
  const required: [string, string][] =
    p.useModel === "estatico"
      ? [
          [p.life, t.lifeLabel],
          [p.power, t.powerLabel],
        ]
      : [
          [p.life, t.lifeLabel],
          [p.travel, t.travelLabel],
          [p.intensity, t.intensityLabel],
        ];
  for (const [raw, label] of required) {
    if (!positive(raw)) return { reason: t.blocked.positive(label), inPremises: true };
  }
  if (p.useModel === "estatico" && (!positive(p.duty) || Number(p.duty) > 1))
    return { reason: t.blocked.duty, inPremises: true };
  if (!positive(p.carbonPerEnergy))
    return { reason: t.blocked.positive(t.carbonPerEnergyLabel), inPremises: true };
  return null;
}

export function individualBlocked(
  components: ComponentDraft[],
  legs: LegDraft[],
  premises: Premises,
): Blocked | null {
  for (const [index, leg] of legs.entries()) {
    if (leg.mode === "")
      return { reason: t.blocked.leg(index + 1, t.blocked.mode), inPremises: false };
    if (!nonNegative(leg.distance))
      return {
        reason: t.blocked.leg(index + 1, t.blocked.positive(t.transportDistanceLabel)),
        inPremises: false,
      };
  }
  const fromPremises = premisesBlocked(premises);
  if (fromPremises) return fromPremises;

  const single = components.length === 1;
  for (const [index, c] of components.entries()) {
    const say = (reason: string): Blocked => ({
      reason: single ? reason : t.blocked.component(index + 1, reason),
      inPremises: false,
    });
    if (c.material === "" || c.process === "") return say(t.blocked.process);
    if (!positive(c.mass)) return say(t.blocked.mass);
    const quantity = Number(c.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return say(t.blocked.quantity);
    if (!fraction(c.recycled)) return say(t.blocked.recycled);
  }
  return null;
}

export function compareBlocked(
  a: ScenarioDraft,
  b: ScenarioDraft,
  transport: { mode: string; distance: string },
  premises: Premises,
): Blocked | null {
  if (transport.mode === "") return { reason: t.blocked.mode, inPremises: false };
  if (!positive(transport.distance))
    return { reason: t.blocked.positive(t.transportDistanceLabel), inPremises: false };
  const fromPremises = premisesBlocked(premises);
  if (fromPremises) return fromPremises;
  for (const [name, scenario] of [
    [t.materialA, a],
    [t.materialB, b],
  ] as const) {
    if (scenario.material === "" || scenario.process === "")
      return { reason: `${name}: ${t.blocked.process}`, inPremises: false };
    if (!positive(scenario.mass))
      return { reason: `${name}: ${t.blocked.mass}`, inPremises: false };
    if (!fraction(scenario.recycled))
      return { reason: `${name}: ${t.blocked.recycled}`, inPremises: false };
  }
  return null;
}
