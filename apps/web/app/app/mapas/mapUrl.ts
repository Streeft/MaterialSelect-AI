import type { BoxSelection } from "@/components/charts/AshbyMap";
import { encodeIdList, parseIdList } from "@/lib/idList";
import { jsonCodec, type UrlCodec, type UrlSpec } from "@/lib/urlState";
import { decodeMapState, encodeMapState, type MapUrlState } from "./url-state";

/**
 * What of the map lives in the address as the reader works (D-213), through
 * the shared `useUrlState` (D-212): the whole map (`estado`, the same encoding
 * the "Compartilhar" link always used), the selection — a box drawn on the map
 * (`caixa`) or a set of records picked by lasso or by keyboard (`sel`) — the
 * movable index line (`linha`, the level M), and the map's restriction to a
 * set of records (`materiais`/`processos`, the parameter a study already
 * hands over). A reload, the Back button or a pasted link bring all of it back.
 */
export interface MapLiveUrl {
  state: MapUrlState | null;
  selection: number[];
  box: BoxSelection | null;
  line: number | null;
  restrictMaterials: number[];
  restrictProcesses: number[];
}

const idListCodec: UrlCodec<number[]> = {
  parse: (raw) => parseIdList(raw),
  serialize: (value) => encodeIdList(value),
};

const levelCodec: UrlCodec<number | null> = {
  parse: (raw) => {
    const value = Number(raw);
    return raw.trim() !== "" && Number.isFinite(value) ? value : undefined;
  },
  serialize: (value) => (value === null ? "" : String(value)),
};

const isBound = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));

/** A box read back from a link: four bounds, each a finite number or `null` (open side). */
export function isBoxSelection(value: unknown): value is BoxSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const box = value as Record<string, unknown>;
  return (
    isBound(box.xMin) &&
    isBound(box.xMax) &&
    isBound(box.yMin) &&
    isBound(box.yMax) &&
    [box.xMin, box.xMax, box.yMin, box.yMax].some((bound) => bound !== null)
  );
}

const boxCodec = jsonCodec(isBoxSelection) as unknown as UrlCodec<BoxSelection | null>;

const stateCodec: UrlCodec<MapUrlState | null> = {
  parse: (raw) => (decodeMapState(raw) as MapUrlState | null) ?? undefined,
  serialize: (value) => (value === null ? "" : encodeMapState(value)),
};

export const MAP_LIVE_URL: UrlSpec<MapLiveUrl> = {
  state: { param: "estado", codec: stateCodec, defaultValue: null },
  selection: { param: "sel", codec: idListCodec, defaultValue: [] },
  box: { param: "caixa", codec: boxCodec, defaultValue: null },
  line: { param: "linha", codec: levelCodec, defaultValue: null },
  restrictMaterials: { param: "materiais", codec: idListCodec, defaultValue: [] },
  restrictProcesses: { param: "processos", codec: idListCodec, defaultValue: [] },
};

/** The map a reader lands on with no link — kept out of the address (a clean URL). */
export const DEFAULT_MAP_STATE: MapUrlState = {
  universe: "material",
  xAxis: { mode: "property", property: "densidade", indexSlug: "", customExpression: "", goal: "maximize" },
  yAxis: { mode: "property", property: "modulo_young", indexSlug: "", customExpression: "", goal: "maximize" },
  scale: "log",
  envelopeShape: "ellipse",
  selectedClasses: [],
  showEnvelopes: true,
  showIntervals: true,
  showLabels: false,
  indexMode: "none",
  customExpression: "",
  indexGoal: "maximize",
  levelMaterialIds: [],
  numericLevels: [],
};

/** Whether `state` is the landing map, field by field (key order does not matter). */
export function isDefaultMapState(state: MapUrlState): boolean {
  const canon = (s: MapUrlState) =>
    JSON.stringify(s, Object.keys(s).sort().concat(["mode", "property", "indexSlug", "customExpression", "goal"]));
  return canon(state) === canon(DEFAULT_MAP_STATE);
}

/**
 * The records a selection holds: the box's, counted by the page over the
 * points it plots, or the explicit set. A box wins — it is what is drawn.
 */
export function selectedIdsOf(
  box: BoxSelection | null,
  explicit: number[],
  inBox: number[],
): number[] {
  return box ? inBox : explicit;
}

/**
 * D-219: the map with `slug` on the X axis, everything else as the default map
 * opens. What the glossary's "Usar como eixo" links to; the property is the only
 * thing it names, so the map itself decides what to plot of it.
 */
export function mapHrefForAxis(slug: string): string {
  const state: MapUrlState = {
    ...DEFAULT_MAP_STATE,
    xAxis: { ...DEFAULT_MAP_STATE.xAxis, property: slug },
  };
  return `/app/mapas?estado=${encodeMapState(state)}`;
}

/**
 * D-229: the map with `x` and `y` on the axes, restricted to `materialIds` when
 * given — what an AI suggestion on Comparar ("veja os comparados num mapa")
 * opens. Everything else is as the default map opens.
 */
export function mapHrefForAxes(x: string, y: string, materialIds: number[] = []): string {
  const state: MapUrlState = {
    ...DEFAULT_MAP_STATE,
    xAxis: { ...DEFAULT_MAP_STATE.xAxis, property: x },
    yAxis: { ...DEFAULT_MAP_STATE.yAxis, property: y },
  };
  const params = new URLSearchParams({ estado: encodeMapState(state) });
  if (materialIds.length > 0) params.set("materiais", encodeIdList(materialIds));
  return `/app/mapas?${params.toString().replace(/%2C/g, ",")}`;
}
