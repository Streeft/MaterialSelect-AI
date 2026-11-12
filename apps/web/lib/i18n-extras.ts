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
  // D-216: the waterfall (contribution by phase, cumulative), SimaPro-style.
  waterfall: {
    energyTitle: "Contribuição por fase em energia (cascata)",
    carbonTitle: "Contribuição por fase em carbono (cascata)",
    description:
      "Cada degrau é uma fase do ciclo de vida e começa onde a anterior terminou; a última coluna é o total. Fase sem dado aparece tracejada, no nível anterior, com o motivo escrito: nunca como zero.",
    figureLabel: (quantity: string) => `Cascata de ${quantity} por fase do ciclo de vida`,
    quantityEnergy: "energia",
    quantityCarbon: "carbono",
    columnPhase: "Fase",
    columnContribution: "Contribuição",
    columnRunning: "Acumulado",
    columnReason: "Motivo",
    absent: "sem dado",
    credit: "crédito",
    totalLabel: "Total",
    stepAria: (label: string, value: string, running: string) =>
      `${label}: contribuição de ${value}; acumulado ${running}`,
    absentAria: (label: string, reason: string) => `${label}: sem dado. ${reason}`,
    tipContribution: "Contribuição",
    tipRunning: "Acumulado",
    noTotal: "Sem total: ao menos uma fase não pôde ser calculada.",
    scenarioSummary: (name: string, material: string) => `Cascata do cenário ${name} — ${material}`,
  },
  premises: {
    title: "Premissas desta conta",
    hint: "O que entrou na conta além do produto: são entradas editáveis, não dados de nenhum material.",
    useModel: "Modelo de uso",
    transport: "Transporte total",
    life: "Vida em serviço",
    power: "Potência em serviço",
    duty: "Ciclo de trabalho",
    travel: "Distância percorrida",
    intensity: "Intensidade de uso",
    carbonPerEnergy: "Carbono por energia",
    yearsUnit: "anos",
  },
  restoreDefaults: "Restaurar padrões do servidor",
  scenarioLegend: (name: string) => `Cenário ${name}`,
} as const;

export const selectionExtras = {
  stageDragHandle: (n: number) => `Arrastar estágio ${n} para reordenar`,
} as const;
