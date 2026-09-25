/**
 * Which section each route belongs to.
 *
 * Hue does not live here: it lives in app/globals.css, in the
 * [data-section="…"] blocks. This module only answers "which section is this route?",
 * and is the single source of truth — the rail, page header, and
 * SectionTheme read from here, so there's no way they can disagree with each other.
 *
 * `hue` is informational (appears in the style guide and in no runtime decision);
 * the effective color always comes from CSS.
 */

export type SectionId =
  | "inicio"
  | "selecao"
  | "mapas"
  | "comparar"
  | "dimensionar"
  | "custo"
  | "eco"
  | "baterias"
  | "catalogo"
  | "processos"
  | "sintetizar"
  | "meus-registros"
  | "painel"
  | "importar"
  | "classes"
  | "propriedades"
  | "cadernos";

export interface SectionMeta {
  id: SectionId;
  /** What the section is called for the reader. */
  label: string;
  /** Root route of the section. `/` only matches itself; the others also control what's below. */
  route: string;
  /** Hue angle in oklch, for documentation. */
  hue: number;
}

/**
 * D-73 extended this from 6 routes to the 16 real ones in
 * components/layout/AppSidebar.tsx (Início + the 15 nav items across its
 * three groups). `admin/classes` and `admin/propriedades` get their own
 * hues rather than sharing "painel"'s — they're a distinct area of the app
 * (taxonomy administration), not a sub-page of the dashboard.
 */
export const SECTIONS = [
  { id: "inicio", label: "Início", route: "/", hue: 262 },
  { id: "selecao", label: "Seleção", route: "/app/selecao", hue: 300 },
  // D-92: hue 285 reads as ~245° in sRGB, 18° from the nearest section.
  { id: "cadernos", label: "Cadernos", route: "/app/cadernos", hue: 285 },
  { id: "mapas", label: "Mapas", route: "/app/mapas", hue: 185 },
  { id: "comparar", label: "Comparar", route: "/app/comparar", hue: 350 },
  { id: "dimensionar", label: "Dimensionar", route: "/app/dimensionar", hue: 110 },
  { id: "custo", label: "Custo", route: "/app/custo", hue: 80 },
  { id: "eco", label: "Eco", route: "/app/eco", hue: 140 },
  { id: "baterias", label: "Baterias", route: "/app/baterias", hue: 130 },
  { id: "catalogo", label: "Catálogo", route: "/app/catalogo", hue: 225 },
  { id: "processos", label: "Processos", route: "/app/processos", hue: 250 },
  { id: "sintetizar", label: "Sintetizar", route: "/app/sintetizar", hue: 270 },
  { id: "meus-registros", label: "Meus registros", route: "/app/meus-registros", hue: 320 },
  { id: "painel", label: "Painel", route: "/app/painel", hue: 40 },
  { id: "importar", label: "Importar", route: "/app/importar", hue: 150 },
  { id: "classes", label: "Classes", route: "/app/admin/classes", hue: 330 },
  { id: "propriedades", label: "Propriedades", route: "/app/admin/propriedades", hue: 20 },
] as const;

/**
 * The section of a pathname. Routes outside the map — /admin/*, /entrar — fall into
 * the initial section on purpose: a screen without its own hue is better than a
 * screen that invents one.
 */
export function sectionForPath(pathname: string): SectionId {
  const match = SECTIONS.find(
    (s) => s.route !== "/" && (pathname === s.route || pathname.startsWith(`${s.route}/`)),
  );
  return match?.id ?? "inicio";
}

export function sectionMeta(id: SectionId): SectionMeta {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}
