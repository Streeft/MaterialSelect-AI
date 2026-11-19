import type { ChartScale, DashboardDemoFilter, DashboardFilters, DashboardSection } from "@/lib/types";

/**
 * The rich panel's state in the URL (D-193): the tab, the four global filters
 * (the subclass one repeatable since D-250: `?subclasse=A&subclasse=B`),
 * the property being read and the scale of its distribution (D-212). In the URL rather than in component state so a
 * view can be linked, bookmarked and reopened — the same reason D-63 keeps the
 * reading unit there.
 */
export interface DashboardViewState {
  tab: DashboardSection;
  filters: DashboardFilters;
  property: string | null;
  /** The distribution's axis. "linear" is the default and stays out of the URL. */
  scale: ChartScale;
}

export const DASHBOARD_TABS: readonly DashboardSection[] = [
  "visao",
  "propriedades",
  "processos",
  "qualidade",
  "atividade",
];

const DEMO: readonly DashboardDemoFilter[] = ["todos", "demo", "reais"];

interface ParamReader {
  get(name: string): string | null;
  getAll(name: string): string[];
}

/** D-250: the subclasses of a view, each once, blanks dropped, in the order picked. */
export function uniqueSubclasses(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** D-250: the subclass list with `name` added, or taken out if it was there. */
export function toggleSubclass(names: readonly string[], name: string): string[] {
  return names.includes(name) ? names.filter((n) => n !== name) : [...names, name];
}

export function readDashboardState(params: ParamReader): DashboardViewState {
  const tab = params.get("aba");
  const nivel = Number(params.get("nivel"));
  const demo = params.get("demo");
  return {
    tab: DASHBOARD_TABS.includes(tab as DashboardSection) ? (tab as DashboardSection) : "visao",
    filters: {
      classe: params.get("classe") || null,
      subclasses: uniqueSubclasses(params.getAll("subclasse")),
      nivel: nivel === 1 || nivel === 2 ? nivel : 3,
      demo: DEMO.includes(demo as DashboardDemoFilter) ? (demo as DashboardDemoFilter) : "todos",
    },
    property: params.get("prop") || null,
    scale: params.get("escala") === "log" ? "log" : "linear",
  };
}

/** The query string of a view, leaving every default out. */
export function dashboardSearch(state: DashboardViewState): string {
  const params = new URLSearchParams();
  if (state.tab !== "visao") params.set("aba", state.tab);
  if (state.filters.classe) params.set("classe", state.filters.classe);
  // D-250: one `subclasse` per subclass — the same shape the API reads.
  for (const name of state.filters.subclasses ?? []) params.append("subclasse", name);
  if (state.filters.nivel && state.filters.nivel !== 3) params.set("nivel", String(state.filters.nivel));
  if (state.filters.demo && state.filters.demo !== "todos") params.set("demo", state.filters.demo);
  if (state.property) params.set("prop", state.property);
  if (state.scale === "log") params.set("escala", "log");
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** How many of the four filters differ from their default. */
export function activeFilterCount(filters: DashboardFilters): number {
  return (
    (filters.classe ? 1 : 0) +
    ((filters.subclasses?.length ?? 0) > 0 ? 1 : 0) +
    (filters.nivel && filters.nivel !== 3 ? 1 : 0) +
    (filters.demo && filters.demo !== "todos" ? 1 : 0)
  );
}

/** The catalogue, filtered the way a click on the panel asked (D-193). */
export function catalogueHref(classSlug: string | null, subclass?: string | null): string {
  const params = new URLSearchParams();
  if (classSlug) params.set("classe", classSlug);
  if (subclass) params.set("subclasse", subclass);
  const text = params.toString();
  return `/app/catalogo${text ? `?${text}` : ""}`;
}

/** The Ashby map with two properties on its axes. */
export function mapHref(x: string, y: string, materialIds: readonly number[] = []): string {
  const params = new URLSearchParams({ x, y });
  if (materialIds.length > 0) params.set("materiais", materialIds.join(","));
  return `/app/mapas?${params.toString()}`;
}

/** The comparator, opened on these materials. */
export function compareHref(materialIds: readonly number[]): string {
  return `/app/comparar?materiais=${materialIds.join(",")}`;
}
