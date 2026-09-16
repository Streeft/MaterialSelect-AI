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
  | "catalogo"
  | "painel"
  | "importar";

export interface SectionMeta {
  id: SectionId;
  /** What the section is called for the reader. */
  label: string;
  /** Root route of the section. `/` only matches itself; the others also control what's below. */
  route: string;
  /** Hue angle in oklch, for documentation. */
  hue: number;
}

export const SECTIONS = [
  { id: "inicio", label: "Início", route: "/", hue: 262 },
  { id: "selecao", label: "Seleção", route: "/app/selecao", hue: 300 },
  { id: "mapas", label: "Mapas", route: "/app/mapas", hue: 185 },
  { id: "comparar", label: "Comparar", route: "/app/comparar", hue: 350 },
  { id: "catalogo", label: "Catálogo", route: "/app/catalogo", hue: 225 },
  { id: "painel", label: "Painel", route: "/app/painel", hue: 40 },
  { id: "importar", label: "Importar", route: "/app/importar", hue: 150 },
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
