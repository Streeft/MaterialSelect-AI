/**
 * A qual seção cada rota pertence.
 *
 * O matiz não vive aqui: vive em app/globals.css, nos blocos
 * [data-section="…"]. Este módulo só responde "que seção é esta rota?", e é a
 * única fonte dessa resposta — o rail, o cabeçalho de página e o
 * SectionTheme leem daqui, então não há como um deles discordar dos outros.
 *
 * `hue` é informativo (aparece no guia de estilo e em nenhuma decisão de
 * runtime); a cor efetiva sempre sai do CSS.
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
  /** Como a seção se chama para o leitor. */
  label: string;
  /** Rota raiz da seção. `/` só casa consigo mesma; as outras também mandam no que estiver abaixo. */
  route: string;
  /** Ângulo de matiz em oklch, para documentação. */
  hue: number;
}

export const SECTIONS: readonly SectionMeta[] = [
  { id: "inicio", label: "Início", route: "/", hue: 262 },
  { id: "selecao", label: "Seleção", route: "/selecao", hue: 300 },
  { id: "mapas", label: "Mapas", route: "/mapas", hue: 185 },
  { id: "comparar", label: "Comparar", route: "/comparar", hue: 350 },
  { id: "catalogo", label: "Catálogo", route: "/catalogo", hue: 225 },
  { id: "painel", label: "Painel", route: "/painel", hue: 40 },
  { id: "importar", label: "Importar", route: "/importar", hue: 150 },
] as const;

/**
 * A seção de um pathname. Rotas fora do mapa — /admin/*, /entrar — caem na
 * seção inicial de propósito: uma tela sem matiz próprio é melhor do que uma
 * tela que inventa um.
 */
export function sectionForPath(pathname: string): SectionId {
  const match = SECTIONS.find(
    (s) => s.route !== "/" && (pathname === s.route || pathname.startsWith(`${s.route}/`)),
  );
  return match?.id ?? "inicio";
}

export function sectionMeta(id: SectionId): SectionMeta {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]!;
}
