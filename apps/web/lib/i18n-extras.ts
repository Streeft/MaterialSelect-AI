/**
 * Extra i18n strings for incremental features (PhaseBars and Stage Drag Reorder)
 * keeping apps/web/lib/i18n.ts lean and protected from merge conflicts.
 */
export const ecoPhaseI18n = {
  energyChartTitle: "Demanda de energia por fase do ciclo de vida",
  carbonChartTitle: "Pegada de carbono por fase do ciclo de vida",
  energyChartCompareTitle: "Comparativo de energia por fase",
  carbonChartCompareTitle: "Comparativo de pegada de carbono por fase",
  notCalculated: "Não calculada",
  creditBadge: "crédito",
  impactLabel: "Impacto",
  materialA: "Material A",
  materialB: "Material B",
} as const;

export const selectionExtras = {
  stageDragHandle: (n: number) => `Arrastar estágio ${n} para reordenar`,
} as const;
