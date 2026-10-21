/**
 * Texts of the depth level on the selectors outside the maps (D-162): the
 * stage criteria, the comparator and Find Similar. Kept apart from `i18n.ts` so
 * the parallel lanes that edit that file do not collide with this one.
 */
export const depthSelectorsText = {
  /** "O Nível 1 oferece 12 de 40 grandezas como critério de estágio." */
  count: (level: number, shown: number, total: number, where: string) =>
    `O Nível ${level} oferece ${shown} de ${total} grandezas ${where}.`,
  whereStages: "nos critérios dos estágios",
  whereCompare: "como coluna da comparação",
  whereSimilar: "como base da busca",
} as const;
