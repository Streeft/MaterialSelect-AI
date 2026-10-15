/**
 * Perfis de profundidade L1/L2/L3 (D-127) — a visão, do lado do leitor.
 *
 * O nível é **apresentação**: decide quantas linhas da ficha e quantas opções
 * de um seletor o leitor vê, e nada mais. Quem declara o nível de cada grandeza
 * é o backend (`min_level`, de `app/domain/depth_profile.py`); a seleção, o
 * ranking e as exportações não recebem este parâmetro. Uma grandeza fora do
 * nível não é ausente (D-24): continua gravada e entra no cálculo, e a tela diz
 * por escrito quantas está mostrando de quantas existem.
 *
 * Vive na URL (`?nivel=1`), como a unidade de leitura (D-70): o projeto não tem
 * preferência de usuário no servidor, e um link tem de reproduzir a mesma tela.
 * Sem parâmetro, o nível é 3 — tudo, o comportamento de antes.
 */
export const DEPTH_PARAM = "nivel";

export type DepthLevel = 1 | 2 | 3;

export const DEPTH_LEVELS: readonly DepthLevel[] = [1, 2, 3];

/** O nível de quem não escolheu nada: todos. */
export const DEFAULT_DEPTH_LEVEL: DepthLevel = 3;

/** Lê o parâmetro; ausente ou inválido cai no padrão (todos), nunca esconde. */
export function parseDepthLevel(raw: string | null | undefined): DepthLevel {
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  return DEFAULT_DEPTH_LEVEL;
}

/** O nível declarado de uma grandeza; sem declaração, visível em todos. */
export function minLevelOf(item: { min_level?: number | null }): number {
  return typeof item.min_level === "number" ? item.min_level : 1;
}

export function isVisibleAt(item: { min_level?: number | null }, level: DepthLevel): boolean {
  return minLevelOf(item) <= level;
}

/**
 * Filtra as opções de um seletor pelo nível, **sem tirar o que já está
 * escolhido**: um eixo aberto por um link no Nível 3 não pode trocar sozinho de
 * grandeza porque o leitor passou para o Nível 1.
 */
export function optionsAtLevel<T extends { slug: string; min_level?: number | null }>(
  options: readonly T[],
  level: DepthLevel,
  keep: readonly (string | null | undefined)[] = [],
): T[] {
  return options.filter((o) => isVisibleAt(o, level) || keep.includes(o.slug));
}

/** Os grupos da ficha recortados pelo nível, com a contagem que a tela escreve. */
export function groupsAtLevel<
  G extends { properties: readonly P[] },
  P extends { min_level?: number | null },
>(groups: readonly G[], level: DepthLevel): { groups: G[]; shown: number; total: number } {
  let shown = 0;
  let total = 0;
  const kept: G[] = [];
  for (const g of groups) {
    const visible = g.properties.filter((p) => isVisibleAt(p, level));
    total += g.properties.length;
    shown += visible.length;
    if (visible.length > 0) kept.push({ ...g, properties: visible });
  }
  return { groups: kept, shown, total };
}

/** A URL atual com outro nível; o nível padrão sai da URL em vez de ficar `?nivel=3`. */
export function hrefWithDepth(search: string, level: DepthLevel): string {
  const params = new URLSearchParams(search);
  if (level === DEFAULT_DEPTH_LEVEL) params.delete(DEPTH_PARAM);
  else params.set(DEPTH_PARAM, String(level));
  const query = params.toString();
  return query ? `?${query}` : "?";
}
